import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ mock: 'client' })),
}))

const importSupabase = () => import('./supabase')

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(createClient).mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a client with the env credentials and persistent auth storage', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    const { supabase } = await importSupabase()

    expect(supabase).toEqual({ mock: 'client' })
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'anon-key', {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    })
  })

  it.each(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])('throws when %s is missing', async (key) => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv(key, '')

    await expect(importSupabase()).rejects.toThrow(/Supabase/)
    expect(createClient).not.toHaveBeenCalled()
  })
})
