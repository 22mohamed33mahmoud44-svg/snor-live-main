import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { SettingsProvider, useSettings, type UserSettings } from './SettingsContext'
import { supabase } from '../supabase'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

const from = vi.mocked(supabase.from)

const defaultSettings: UserSettings = {
  notif: true,
  sound: true,
  liveNotif: false,
  discover: true,
  hideOnline: false,
  dark: true,
  neon: true,
}

let single: ReturnType<typeof vi.fn>
let update: ReturnType<typeof vi.fn>
let updateEq: ReturnType<typeof vi.fn>

const setupSupabase = () => {
  single = vi.fn().mockResolvedValue({ data: null, error: null })
  updateEq = vi.fn().mockResolvedValue({ error: null })
  update = vi.fn().mockReturnValue({ eq: updateEq })
  from.mockReturnValue({
    select: () => ({ eq: () => ({ single }) }),
    update,
  } as never)
}

const wrapper = (userId?: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <SettingsProvider userId={userId}>{children}</SettingsProvider>
  )

const stored = () => JSON.parse(localStorage.getItem('user_app_settings') ?? 'null')

describe('SettingsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.clear()
    document.documentElement.className = ''
    setupSupabase()
  })

  it('starts from the default settings when nothing is cached', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: wrapper() })

    expect(result.current.settings).toEqual(defaultSettings)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(from).not.toHaveBeenCalled()
  })

  it('hydrates from localStorage', async () => {
    localStorage.setItem('user_app_settings', JSON.stringify({ ...defaultSettings, dark: false }))

    const { result } = renderHook(() => useSettings(), { wrapper: wrapper() })

    expect(result.current.settings.dark).toBe(false)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('falls back to defaults when the cached value is corrupt', async () => {
    localStorage.setItem('user_app_settings', '{not json')

    const { result } = renderHook(() => useSettings(), { wrapper: wrapper() })

    expect(result.current.settings).toEqual(defaultSettings)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('merges remote settings over the defaults and caches them', async () => {
    single.mockResolvedValue({ data: { settings: { neon: false } }, error: null })

    const { result } = renderHook(() => useSettings(), { wrapper: wrapper('user-1') })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.settings).toEqual({ ...defaultSettings, neon: false })
    expect(stored()).toEqual({ ...defaultSettings, neon: false })
    expect(from).toHaveBeenCalledWith('profiles')
  })

  it.each([
    ['the query errors', () => single.mockResolvedValue({ data: null, error: { message: 'boom' } })],
    ['the query rejects', () => single.mockRejectedValue(new Error('offline'))],
  ])('keeps local settings when %s', async (_label, arrange) => {
    arrange()

    const { result } = renderHook(() => useSettings(), { wrapper: wrapper('user-1') })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.settings).toEqual(defaultSettings)
  })

  it('applies dark and neon classes to the document root', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const root = document.documentElement
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('neon-active')).toBe(true)

    await act(async () => {
      await result.current.updateSetting('dark', false)
    })
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)

    await act(async () => {
      await result.current.updateSetting('neon', false)
    })
    expect(root.classList.contains('neon-active')).toBe(false)
  })

  it('updates state and cache without syncing when there is no user', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.updateSetting('sound', false)
    })

    expect(result.current.settings.sound).toBe(false)
    expect(stored()).toEqual({ ...defaultSettings, sound: false })
    expect(update).not.toHaveBeenCalled()
  })

  it('syncs the full settings object to the signed-in profile', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: wrapper('user-1') })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.updateSetting('hideOnline', true)
    })

    expect(update).toHaveBeenCalledWith({ settings: { ...defaultSettings, hideOnline: true } })
    expect(updateEq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('keeps the optimistic update when the remote sync fails', async () => {
    update.mockImplementation(() => { throw new Error('offline') })

    const { result } = renderHook(() => useSettings(), { wrapper: wrapper('user-1') })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.updateSetting('notif', false)
    })

    expect(result.current.settings.notif).toBe(false)
    expect(stored()).toEqual({ ...defaultSettings, notif: false })
  })
})

describe('useSettings', () => {
  it('throws outside of a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useSettings()
      return null
    }

    expect(() => render(<Consumer />)).toThrow('useSettings must be used within a SettingsProvider')
  })

  it('renders provider children', async () => {
    from.mockReturnValue({ select: () => ({ eq: () => ({ single: vi.fn() }) }) } as never)

    render(
      <SettingsProvider>
        <span>child</span>
      </SettingsProvider>,
    )

    expect(await screen.findByText('child')).toBeTruthy()
  })
})
