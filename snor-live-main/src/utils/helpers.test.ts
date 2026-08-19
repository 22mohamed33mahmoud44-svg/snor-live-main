import { afterEach, describe, expect, it, vi } from 'vitest'
import { initials, playRadarSound, timeAgo } from './helpers'

describe('timeAgo', () => {
  const now = new Date('2024-05-01T12:00:00.000Z')

  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (msAgo: number) => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    return new Date(now.getTime() - msAgo).toISOString()
  }

  it('returns "الآن" for less than a minute', () => {
    expect(timeAgo(at(0))).toBe('الآن')
    expect(timeAgo(at(59_999))).toBe('الآن')
  })

  it('returns minutes below an hour', () => {
    expect(timeAgo(at(60_000))).toBe('1د')
    expect(timeAgo(at(59 * 60_000))).toBe('59د')
  })

  it('returns hours below a day', () => {
    expect(timeAgo(at(60 * 60_000))).toBe('1س')
    expect(timeAgo(at(23 * 60 * 60_000))).toBe('23س')
  })

  it('returns days from a day onwards', () => {
    expect(timeAgo(at(24 * 60 * 60_000))).toBe('1ي')
    expect(timeAgo(at(10 * 24 * 60 * 60_000))).toBe('10ي')
  })
})

describe('initials', () => {
  it('prefers full_name over username', () => {
    expect(initials({ id: '1', full_name: 'sara ahmed', username: 'zed' })).toBe('S')
  })

  it('falls back to username', () => {
    expect(initials({ id: '1', username: 'omar' })).toBe('O')
  })

  it('falls back to "?" for missing or empty profiles', () => {
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
    expect(initials({ id: '1', full_name: '', username: '' })).toBe('?')
  })
})

describe('playRadarSound', () => {
  type Ctx = {
    currentTime: number
    destination: object
    createOscillator: () => ReturnType<typeof makeOscillator>
    createGain: () => ReturnType<typeof makeGain>
  }

  const makeOscillator = () => ({
    type: '',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })

  const makeGain = () => ({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  })

  const installAudioContext = () => {
    const oscillators: ReturnType<typeof makeOscillator>[] = []
    const gains: ReturnType<typeof makeGain>[] = []
    const ctx: Ctx = {
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        const osc = makeOscillator()
        oscillators.push(osc)
        return osc
      },
      createGain: () => {
        const gain = makeGain()
        gains.push(gain)
        return gain
      },
    }
    const AudioContext = vi.fn(() => ctx)
    vi.stubGlobal('AudioContext', AudioContext)
    vi.stubGlobal('webkitAudioContext', undefined)
    return { oscillators, gains, AudioContext }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('plays a first tone immediately and a second one after a delay', () => {
    vi.useFakeTimers()
    const { oscillators, gains } = installAudioContext()

    playRadarSound()

    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].type).toBe('sine')
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 0)
    expect(oscillators[0].start).toHaveBeenCalled()
    expect(oscillators[0].stop).toHaveBeenCalledWith(0.4)
    expect(gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, 0.4)

    vi.advanceTimersByTime(110)

    expect(oscillators).toHaveLength(2)
    expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(880, 0)
    expect(oscillators[1].stop).toHaveBeenCalledWith(0.3)
  })

  it('does nothing when the browser has no AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)

    expect(() => playRadarSound()).not.toThrow()
  })

  it('swallows errors thrown while building the audio graph', () => {
    vi.stubGlobal('AudioContext', vi.fn(() => {
      throw new Error('audio unavailable')
    }))

    expect(() => playRadarSound()).not.toThrow()
  })
})
