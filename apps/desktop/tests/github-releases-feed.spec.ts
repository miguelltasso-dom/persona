import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  PERSONA_GITHUB_OWNER,
  PERSONA_GITHUB_REPO,
  parseLatestYml,
  personaGenericFeedUrl,
  personaGithubPublish,
  renderLatestYml,
} from '../src/github-releases-feed.ts'

describe('GitHub Releases feed (fake, no publish)', () => {
  it('points at the Persona fork and renders latest.yml', () => {
    expect(personaGithubPublish('stable')).toEqual({
      provider: 'github',
      owner: PERSONA_GITHUB_OWNER,
      repo: PERSONA_GITHUB_REPO,
      releaseType: 'release',
    })
    expect(personaGithubPublish('nightly').releaseType).toBe('prerelease')
    expect(personaGenericFeedUrl('http://127.0.0.1:9', 'stable')).toBe('http://127.0.0.1:9/stable')
    const sha512 = createHash('sha512').update('exe').digest('base64')
    const yml = renderLatestYml({
      version: '0.2.2-alpha.3',
      path: 'Persona-Setup-0.2.2-alpha.3.exe',
      sha512,
      size: 3,
    })
    expect(parseLatestYml(yml)).toMatchObject({
      version: '0.2.2-alpha.3',
      path: 'Persona-Setup-0.2.2-alpha.3.exe',
      sha512,
      files: [{ url: 'Persona-Setup-0.2.2-alpha.3.exe', size: 3 }],
    })
  })

  it('serves latest.yml from a local fake without publishing', async () => {
    const sha512 = createHash('sha512').update('fake').digest('base64')
    const body = renderLatestYml({
      version: '0.2.2-alpha.3',
      path: 'Persona-Setup.exe',
      sha512,
      size: 4,
    })
    const server = createServer((req, res) => {
      if (req.url === '/stable/latest.yml') {
        res.writeHead(200, { 'content-type': 'text/yaml' })
        res.end(body)
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    try {
      const origin = `http://127.0.0.1:${String(address.port)}`
      const response = await fetch(`${personaGenericFeedUrl(origin, 'stable')}/latest.yml`)
      expect(response.ok).toBe(true)
      const parsed = parseLatestYml(await response.text())
      expect(parsed.version).toBe('0.2.2-alpha.3')
      expect(JSON.stringify(parsed)).not.toMatch(/github\.com\/repos/u)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error === undefined ? resolve() : reject(error))
      })
    }
  })
})
