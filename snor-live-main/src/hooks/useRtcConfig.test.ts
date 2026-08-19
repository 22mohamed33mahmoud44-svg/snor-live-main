import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useRtcConfig } from './useRtcConfig'
import { STUN_SERVERS } from '../constants/iceServers'
import { supabase } from '../supabase'

vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}))

const getSession = vi.mocked(supabase.auth.getSession)

const withSession = () =>
  getSession.mockResolvedValue({
    data: { session: { access_token: 'token-123' } },
    error: null,
  } as never)

describe('useRtcConfig', () => {
  beforeEach(() => {
    getSession.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('starts with STUN-only config', async () => {
    withSession()
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    const { result } = renderHook(() => useRtcConfig())

    expect(result.current.rtcConfig).toEqual({ iceServers: STUN_SERVERS })
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('appends TURN servers fetched from the edge function', async () => {
    withSession()
    const turn = [{ urls: 'turn:turn.example.com', username: 'u', credential: 'c' }]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ iceServers: turn }),
    } as Response)

    const { result } = renderHook(() => useRtcConfig())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rtcConfig).toEqual({ iceServers: [...STUN_SERVERS, ...turn] })
    expect(fetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-turn-credentials`,
      { headers: { Authorization: 'Bearer token-123' } },
    )
  })

  it('keeps STUN-only and skips the fetch when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null } as never)

    const { result } = renderHook(() => useRtcConfig())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.rtcConfig).toEqual({ iceServers: STUN_SERVERS })
  })

  it('falls back to STUN-only when the edge function fails', async () => {
    withSession()
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    const { result } = renderHook(() => useRtcConfig())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rtcConfig).toEqual({ iceServers: STUN_SERVERS })
  })

  it('ignores an empty TURN list', async () => {
    withSession()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ iceServers: [] }),
    } as Response)

    const { result } = renderHook(() => useRtcConfig())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rtcConfig).toEqual({ iceServers: STUN_SERVERS })
  })

  it('swallows network errors', async () => {
    withSession()
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useRtcConfig())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rtcConfig).toEqual({ iceServers: STUN_SERVERS })
  })

  it('does not update state after unmount', async () => {
    withSession()
    let resolveJson: (value: { iceServers: RTCIceServer[] }) => void = () => {}
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => new Promise<{ iceServers: RTCIceServer[] }>((resolve) => { resolveJson = resolve }),
    } as Response)

    const { result, unmount } = renderHook(() => useRtcConfig())
    await act(async () => {})
    unmount()

    await act(async () => {
      resolveJson({ iceServers: [{ urls: 'turn:late.example.com' }] })
    })

    expect(result.current.rtcConfig).toEqual({ iceServers: STUN_SERVERS })
    expect(result.current.loading).toBe(true)
  })
})
