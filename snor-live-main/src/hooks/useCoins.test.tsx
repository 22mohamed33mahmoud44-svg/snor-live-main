import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCoins } from './useCoins'
import { supabase } from '../supabase'

vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(), onAuthStateChange: vi.fn() },
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

type ChangeHandler = (payload: { new: unknown }) => void
type SubscribeCallback = (status: string) => void

const getUser = vi.mocked(supabase.auth.getUser)
const onAuthStateChange = vi.mocked(supabase.auth.onAuthStateChange)
const from = vi.mocked(supabase.from)
const channel = vi.mocked(supabase.channel)
const removeChannel = vi.mocked(supabase.removeChannel)

let changeHandler: ChangeHandler
let subscribeCallback: SubscribeCallback
let authCallback: (event: string, session: unknown) => void
let authUnsubscribe: ReturnType<typeof vi.fn>
let maybeSingle: ReturnType<typeof vi.fn>
let channelHandle: object

const setupSupabase = (coins: unknown = 42, error: unknown = null) => {
  maybeSingle = vi.fn().mockResolvedValue({ data: { coins }, error })
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle }) }),
  } as never)

  channelHandle = {}
  const handle = {
    on: (_event: string, _filter: unknown, handler: ChangeHandler) => {
      changeHandler = handler
      return handle
    },
    subscribe: (cb: SubscribeCallback) => {
      subscribeCallback = cb
      return channelHandle
    },
  }
  channel.mockReturnValue(handle as never)

  authUnsubscribe = vi.fn()
  onAuthStateChange.mockImplementation((cb) => {
    authCallback = cb as typeof authCallback
    return { data: { subscription: { unsubscribe: authUnsubscribe } } } as never
  })
}

const withUser = (id: string | null) =>
  getUser.mockResolvedValue({ data: { user: id ? { id } : null } } as never)

describe('useCoins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the balance for the signed-in user', async () => {
    setupSupabase(42)
    withUser('user-1')

    const { result } = renderHook(() => useCoins())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.coins).toBe(42)
    expect(from).toHaveBeenCalledWith('users_coins')
    expect(channel).toHaveBeenCalledWith('coins-realtime-user-1')
  })

  it('reports a zero balance and skips subscribing without a user', async () => {
    setupSupabase()
    withUser(null)

    const { result } = renderHook(() => useCoins())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.coins).toBe(0)
    expect(channel).not.toHaveBeenCalled()
  })

  it('refetches the balance once the realtime channel is subscribed', async () => {
    setupSupabase(10)
    withUser('user-1')

    const { result } = renderHook(() => useCoins())
    await waitFor(() => expect(result.current.loading).toBe(false))

    maybeSingle.mockResolvedValue({ data: { coins: 77 }, error: null })
    await act(async () => {
      subscribeCallback('SUBSCRIBED')
    })

    expect(result.current.coins).toBe(77)
  })

  it('applies realtime numeric updates and ignores malformed payloads', async () => {
    setupSupabase(10)
    withUser('user-1')

    const { result } = renderHook(() => useCoins())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => changeHandler({ new: { coins: 99 } }))
    expect(result.current.coins).toBe(99)

    act(() => changeHandler({ new: { coins: 'many' } }))
    act(() => changeHandler({ new: null }))
    expect(result.current.coins).toBe(99)
  })

  it('keeps the previous balance when the query errors', async () => {
    setupSupabase(10)
    withUser('user-1')

    const { result } = renderHook(() => useCoins())
    await waitFor(() => expect(result.current.loading).toBe(false))

    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.coins).toBe(10)
  })

  it('resets and unsubscribes on sign-out', async () => {
    setupSupabase(10)
    withUser('user-1')

    const { result } = renderHook(() => useCoins())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => authCallback('SIGNED_OUT', null))

    expect(result.current.coins).toBe(0)
    expect(removeChannel).toHaveBeenCalledWith(channelHandle)

    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.coins).toBe(0)
  })

  it('tears down the channel and auth listener on unmount', async () => {
    setupSupabase(10)
    withUser('user-1')

    const { result, unmount } = renderHook(() => useCoins())
    await waitFor(() => expect(result.current.loading).toBe(false))

    unmount()

    expect(removeChannel).toHaveBeenCalledWith(channelHandle)
    expect(authUnsubscribe).toHaveBeenCalled()
  })
})
