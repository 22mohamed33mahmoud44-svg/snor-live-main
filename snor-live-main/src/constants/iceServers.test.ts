import { describe, expect, it } from 'vitest'
import { RTC_CONFIG_STUN_ONLY, STUN_SERVERS } from './iceServers'

describe('ICE configuration', () => {
  it('only exposes STUN urls', () => {
    expect(STUN_SERVERS.length).toBeGreaterThan(0)
    for (const server of STUN_SERVERS) {
      expect(String(server.urls)).toMatch(/^stun:/)
    }
  })

  it('ships no TURN credentials in the bundle', () => {
    for (const server of STUN_SERVERS) {
      expect(server.username).toBeUndefined()
      expect(server.credential).toBeUndefined()
    }
  })

  it('builds the STUN-only config from the shared list', () => {
    expect(RTC_CONFIG_STUN_ONLY).toEqual({ iceServers: STUN_SERVERS })
  })
})
