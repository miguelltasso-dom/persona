/**
 * Carbon P2-03a: the edge is not exposed by default and carries no secret in the repository. `workers_dev = false` (no public `*.workers.dev` address until the operator
 * chooses a route), and the webhook secret lives only in `.dev.vars` (git-ignored; `.dev.vars.example` documents it) or, in production, in `wrangler secret put` — never in
 * `wrangler.toml`. A static check: no worker is started.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/gu, '\n')
const toml = read('../wrangler.toml')
const code = toml.split('\n').filter(line => !line.trim().startsWith('#')).join('\n') // the comments explain; only the settings count

describe('wrangler.toml', () => {
  it('does not expose the worker on a public workers.dev address by default', () => {
    expect(code).toMatch(/^workers_dev\s*=\s*false\s*$/mu)
    expect(code).not.toMatch(/^workers_dev\s*=\s*true\s*$/mu)
  })

  it('holds no secret: [vars] has no webhook secret, token, key or pepper (those go in .dev.vars locally and `wrangler secret put` in production)', () => {
    const vars = /^\[vars\]\n([\s\S]*?)(?:^\[|\s*$(?![\s\S]))/mu.exec(code)?.[1] ?? ''
    expect(vars).not.toMatch(/SECRET|TOKEN|KEY|PEPPER|PASSWORD/iu)
    expect(code).not.toContain('dev-only-local-secret')
  })
})

describe('the local secret', () => {
  it('lives in .dev.vars: git-ignored, with a documented .dev.vars.example that has no real value', () => {
    const ignore = read('../../../.gitignore')
    expect(ignore).toMatch(/^\.dev\.vars\*?$/mu)
    expect(existsSync(fileURLToPath(new URL('../.dev.vars.example', import.meta.url)))).toBe(true)
    const example = read('../.dev.vars.example')
    expect(example).toContain('GITHUB_WEBHOOK_SECRET=')
    expect(example).not.toMatch(/GITHUB_WEBHOOK_SECRET=\S{12,}$/mu) // a placeholder, not a value somebody could reuse
  })
})
