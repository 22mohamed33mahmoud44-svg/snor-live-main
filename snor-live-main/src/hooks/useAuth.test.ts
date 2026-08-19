import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAuth, type OnboardingData } from './useAuth'
import { supabase } from '../supabase'

vi.mock('../supabase', () => ({
  supabase: {
    auth: { onAuthStateChange: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}))

const onAuthStateChange = vi.mocked(supabase.auth.onAuthStateChange)
const getSession = vi.mocked(supabase.auth.getSession)
const signOut = vi.mocked(supabase.auth.signOut)
const from = vi.mocked(supabase.from)
const storageFrom = vi.mocked(supabase.storage.from)

const PROFILE_ERROR = 'تعذر التحقق من ملفك الشخصي. حاول مرة أخرى.'
const SAVE_ERROR = 'تعذر حفظ بيانات ملفك الشخصي. حاول مرة أخرى.'
const AVATAR_ERROR = 'تعذر رفع صورة الملف الشخصي. يمكنك المحاولة مرة أخرى.'
const SESSION_ERROR = 'تعذر استعادة جلسة تسجيل الدخول. حاول تحديث الصفحة.'

let authCallback: (event: string, session: unknown) => void
let authUnsubscribe: ReturnType<typeof vi.fn>
let maybeSingle: ReturnType<typeof vi.fn>
let upsert: ReturnType<typeof vi.fn>

const onboarding: OnboardingData = {
  birthdate: '1998-04-02',
  gender: 'female',
  lookingFor: 'male',
  profileImage: null,
}

const setupAuth = () => {
  authUnsubscribe = vi.fn()
  onAuthStateChange.mockImplementation((cb) => {
    authCallback = cb as typeof authCallback
    return { data: { subscription: { unsubscribe: authUnsubscribe } } } as never
  })

  maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null })
  upsert = vi.fn().mockResolvedValue({ error: null })
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    upsert,
  } as never)
}

const withSession = (userId: string | null, error: unknown = null) =>
  getSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
    error,
  } as never)

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setupAuth()
  })

  it('restores an existing session and checks the profile once', async () => {
    withSession('user-1')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.profileChecked).toBe(true))
    expect(result.current.user).toEqual({ id: 'user-1' })
    expect(result.current.showOnboarding).toBe(false)
    expect(maybeSingle).toHaveBeenCalledTimes(1)

    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'user-1' } })
    })
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('requests onboarding when the profile row is missing', async () => {
    withSession('user-1')
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.showOnboarding).toBe(true))
    expect(result.current.profileError).toBeNull()
  })

  it('surfaces an error when the profile query fails', async () => {
    withSession('user-1')
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.profileError).toBe(PROFILE_ERROR))
    expect(result.current.showOnboarding).toBe(false)
  })

  it('surfaces an error when the profile query throws', async () => {
    withSession('user-1')
    maybeSingle.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.profileError).toBe(PROFILE_ERROR))
    expect(result.current.profileChecked).toBe(true)
  })

  it('marks the check complete with no session', async () => {
    withSession(null)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.profileChecked).toBe(true))
    expect(result.current.user).toBeNull()
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('reports a failed session restore', async () => {
    withSession(null, { message: 'expired' })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.profileError).toBe(SESSION_ERROR))
    expect(result.current.profileChecked).toBe(true)
  })

  it('reports a rejected session restore', async () => {
    getSession.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.profileError).toBe(SESSION_ERROR))
  })

  it('clears state when the auth listener reports a signed-out session', async () => {
    withSession('user-1')

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      authCallback('SIGNED_OUT', null)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.profileChecked).toBe(true)
    expect(result.current.showOnboarding).toBe(false)
  })

  it('saves onboarding data without an avatar', async () => {
    withSession(null)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.profileChecked).toBe(true))

    await act(async () => {
      await result.current.handleOnboardingComplete(onboarding, 'user-1')
    })

    expect(upsert).toHaveBeenCalledWith({
      id: 'user-1',
      gender: 'female',
      birthdate: '1998-04-02',
      looking_for: 'male',
      avatar_url: null,
    })
    expect(result.current.profileError).toBeNull()
    expect(result.current.showOnboarding).toBe(false)
  })

  it('uploads the avatar under a user-scoped path and stores its public url', async () => {
    withSession(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => ({ type: 'image/jpeg', size: 1024 }),
    } as unknown as Response))
    const upload = vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null })
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/avatar.jpg' } })
    storageFrom.mockReturnValue({ upload, getPublicUrl } as never)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.profileChecked).toBe(true))

    await act(async () => {
      await result.current.handleOnboardingComplete(
        { ...onboarding, profileImage: 'blob:image' },
        'user-1',
      )
    })

    expect(storageFrom).toHaveBeenCalledWith('avatars')
    expect(upload.mock.calls[0][0]).toMatch(/^user-1\/avatar-\d+\.jpg$/)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: 'https://cdn/avatar.jpg' }))
    vi.unstubAllGlobals()
  })

  it.each([
    ['the image cannot be fetched', { ok: false, status: 404 }],
    ['the file is not an image', { ok: true, blob: async () => ({ type: 'text/plain', size: 10 }) }],
    ['the image is larger than 5MB', { ok: true, blob: async () => ({ type: 'image/png', size: 6 * 1024 * 1024 }) }],
  ])('rejects the avatar when %s', async (_label, response) => {
    withSession(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response as unknown as Response))

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.profileChecked).toBe(true))

    await act(async () => {
      await result.current.handleOnboardingComplete(
        { ...onboarding, profileImage: 'blob:image' },
        'user-1',
      )
    })

    expect(result.current.profileError).toBe(AVATAR_ERROR)
    expect(upsert).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('reports an avatar upload failure', async () => {
    withSession(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => ({ type: 'image/jpeg', size: 1024 }),
    } as unknown as Response))
    storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
      getPublicUrl: vi.fn(),
    } as never)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.profileChecked).toBe(true))

    await act(async () => {
      await result.current.handleOnboardingComplete(
        { ...onboarding, profileImage: 'blob:image' },
        'user-1',
      )
    })

    expect(result.current.profileError).toBe(AVATAR_ERROR)
    expect(upsert).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it.each([
    ['returns an error', async () => ({ error: { message: 'denied' } })],
    ['throws', async () => { throw new Error('offline') }],
  ])('reports a profile save failure when upsert %s', async (_label, impl) => {
    withSession(null)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.profileChecked).toBe(true))
    upsert.mockImplementation(impl)

    await act(async () => {
      await result.current.handleOnboardingComplete(onboarding, 'user-1')
    })

    expect(result.current.profileError).toBe(SAVE_ERROR)
  })

  it('clears state on logout', async () => {
    withSession('user-1')
    signOut.mockResolvedValue({ error: null } as never)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.profileChecked).toBe(false)
    expect(result.current.profileError).toBeNull()
  })

  it('keeps the user signed in when logout fails', async () => {
    withSession('user-1')
    signOut.mockResolvedValue({ error: { message: 'network' } } as never)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toEqual({ id: 'user-1' })
    expect(result.current.profileError).toBe('تعذر تسجيل الخروج. حاول مرة أخرى.')
  })

  it('unsubscribes from auth changes on unmount', async () => {
    withSession(null)

    const { unmount } = renderHook(() => useAuth())
    await waitFor(() => expect(getSession).toHaveBeenCalled())

    unmount()

    expect(authUnsubscribe).toHaveBeenCalled()
  })

  it('ignores a profile check result that lost the race', async () => {
    withSession('user-1')
    let resolveFirst: (value: { data: unknown; error: unknown }) => void = () => {}
    maybeSingle
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(1))

    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'user-2' } })
    })
    await waitFor(() => expect(result.current.showOnboarding).toBe(true))

    await act(async () => {
      resolveFirst({ data: { id: 'user-1' }, error: null })
    })

    expect(result.current.showOnboarding).toBe(true)
  })
})
