import { describe, expect, it } from 'vitest'
import { admit, RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from '../src/station/admission.ts'

const GB = 1024 ** 3

describe('COLHEITA 24: the station admits by RAM', () => {
  it('takes the turn when the floor plus one CLI fits, closing nothing', () => {
    expect(admit({ freeBytes: RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES + 1, running: [], now: 0 })).toEqual({ ok: true, evict: [] })
  })

  it('closes the least recently used idle CLI first, and only as many as needed', () => {
    const running = [
      { id: 'recente', idleSince: 900 },
      { id: 'antigo', idleSince: 100 },
      { id: 'meio', idleSince: 500 },
    ]
    // Room for the floor and two CLIs, but three are alive and one more asks (four in all): the two oldest idle go.
    const free = RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * 2
    expect(admit({ freeBytes: free, running, now: 1_000 })).toEqual({ ok: true, evict: ['antigo', 'meio'] })
  })

  it('says "sem vaga" without killing anything when even an empty machine would not fit', () => {
    expect(admit({ freeBytes: 200 * 1024 ** 2, running: [{ id: 'a', idleSince: 1 }], now: 2 }))
      .toEqual({ ok: false, reason: 'sem-vaga', evict: [] })
  })

  it('counts every turn asking at once', () => {
    const free = RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * 2
    expect(admit({ freeBytes: free, running: [], now: 0, asking: 2 })).toEqual({ ok: true, evict: [] })
    expect(admit({ freeBytes: free, running: [], now: 0, asking: 3 })).toEqual({ ok: false, reason: 'sem-vaga', evict: [] })
  })

  it('a station with plenty of memory never closes a warm CLI', () => {
    expect(admit({ freeBytes: 32 * GB, running: [{ id: 'a', idleSince: 1 }], now: 2, asking: 3 })).toEqual({ ok: true, evict: [] })
  })
})
