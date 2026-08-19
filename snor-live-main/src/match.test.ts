import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelMatching, startMatching, type Match } from './match'
import { supabase } from './supabase'

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn() },
}))

const rpc = vi.mocked(supabase.rpc)

const match: Match = {
  id: 'match-1',
  user1: 'user-1',
  user2: 'user-2',
  status: 'active',
  created_at: '2024-05-01T12:00:00.000Z',
}

describe('startMatching', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('calls the atomic RPC with the user id', async () => {
    rpc.mockResolvedValue({ data: { status: 'waiting' }, error: null } as never)

    await startMatching('user-1')

    expect(rpc).toHaveBeenCalledWith('atomic_match_or_wait', { p_user_id: 'user-1' })
  })

  it('returns the match when the RPC matched two users', async () => {
    rpc.mockResolvedValue({ data: { status: 'matched', match }, error: null } as never)

    await expect(startMatching('user-1')).resolves.toEqual({ status: 'matched', match })
  })

  it('returns waiting when the RPC reports no partner', async () => {
    rpc.mockResolvedValue({ data: { status: 'waiting' }, error: null } as never)

    await expect(startMatching('user-1')).resolves.toEqual({ status: 'waiting' })
  })

  it('returns waiting when the RPC claims a match without payload', async () => {
    rpc.mockResolvedValue({ data: { status: 'matched' }, error: null } as never)

    await expect(startMatching('user-1')).resolves.toEqual({ status: 'waiting' })
  })

  it('throws with the RPC error message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc exploded' } } as never)

    await expect(startMatching('user-1')).rejects.toThrow('rpc exploded')
  })
})

describe('cancelMatching', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('calls the cancel RPC with the user id', async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never)

    await cancelMatching('user-1')

    expect(rpc).toHaveBeenCalledWith('cancel_waiting', { p_user_id: 'user-1' })
  })

  it('ignores RPC errors because the row is cleaned up later', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } } as never)

    await expect(cancelMatching('user-1')).resolves.toBeUndefined()
  })
})
