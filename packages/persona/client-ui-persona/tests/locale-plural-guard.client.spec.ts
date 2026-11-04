import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'locale-sources')

describe('real plurals in the copy (UX-BEYOND P0-12)', () => {
  it('no locale source writes "(s)", "(ns)", "(ões)" or "(es)": one is singular, more is plural', () => {
    const offenders: string[] = []
    for (const file of readdirSync(DIR).filter(name => name.endsWith('.json'))) {
      const json = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Record<string, string>
      for (const [key, value] of Object.entries(json)) {
        if (/\p{L}\((?:s|ns|ões|es)\)/u.test(value)) offenders.push(`${file} › ${key}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
