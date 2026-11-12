import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { attachBootUi } from '../src/boot-ui.ts'

describe('packaged startup UI', () => {
  it('places static recovery UI before the root without inline scripts', async () => {
    const html = await attachBootUi('<html><head></head><body><div id="root"></div></body></html>',
      new URL('../renderer', import.meta.url).pathname.replace(/^\/([A-Z]:)/u, '$1'), true, 'pt-BR')
    expect(html.indexOf('persona-boot-overlay')).toBeLessThan(html.indexOf('id="root"'))
    expect(html).toContain('shadowrootmode="open"')
    expect(html).toContain('boot-fonts.css')
    expect(html).toContain('<div id="root" hidden inert aria-hidden="true">')
    expect(html).toContain('boot.js?first=1&amp;lang=pt-BR')
    expect(html).toContain('Tentar de novo')
    expect(html).toContain('Detalhes para o suporte')
    expect(html).not.toMatch(/<script(?![^>]*src=)/u)
  })

  it('rejects missing packaged startup resources', async () => {
    await expect(attachBootUi('<body></body>', '/missing-persona-renderer', false, 'en')).rejects.toThrow()
  })
})

// The waiting scene (COLHEITA-MUSE §30) copies tokens, labels and face art from the app: these checks keep the copies from drifting.
describe('Acordando o time: the static copies follow the app', () => {
  const boot = (file: string): string => readFileSync(new URL(`../renderer/persona-boot/${file}`, import.meta.url), 'utf8')
  const app = (file: string): string => readFileSync(new URL(`../../../packages/persona/client-ui-persona/${file}`, import.meta.url), 'utf8')

  const declarations = (block: string): Map<string, string> =>
    new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)].map(match => [match[1]!, match[2]!.trim()]))
  /** The text between the first `{` after `selector` and its matching `}`. */
  const blockAfter = (css: string, selector: RegExp): string => {
    const start = css.search(selector)
    expect(start, String(selector)).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', start)
    let depth = 0
    for (let index = open; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') { depth -= 1; if (depth === 0) return css.slice(open + 1, index) }
    }
    throw new Error(`unclosed block for ${String(selector)}`)
  }
  const keyframesOf = (css: string): Map<string, string> => new Map([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/gu)]
    .map(match => [match[1]!, blockAfter(css.slice(match.index), /@keyframes/u)]))
  const palette = app('src/client/theme/persona-palette.css')
  const rootTokens = declarations(blockAfter(palette, /^:root\s*\{/mu))
  const schemeTokens = {
    light: declarations(blockAfter(palette, /^body:not\(\[data-ds-dark-theme='true'\]\),/mu)),
    dark: declarations(blockAfter(palette, /^body\[data-ds-dark-theme='true'\],\r?\n\[data-persona-scheme='dark'\]/mu)),
  }
  const resolve = (name: string, scheme: 'light' | 'dark'): string => {
    const value = schemeTokens[scheme].get(name) ?? rootTokens.get(name)
    expect(value, `${name} in ${scheme}`).toBeDefined()
    const chained = /^var\((--[\w-]+)\)$/u.exec(value!)
    return chained === null ? value!.toLowerCase() : resolve(chained[1]!, scheme)
  }
  /** The dark block only restates what changes in the dark; everything else is inherited from the light `:host`. */
  const bootTokens = (css: string, scheme: 'light' | 'dark'): Map<string, string> => {
    const light = declarations(blockAfter(css, /^:host\s*\{/mu))
    return scheme === 'light' ? light : new Map([...light, ...declarations(blockAfter(css, /^:host\(\[data-theme='dark'\]\)\s*\{/mu))])
  }

  it.each(['light', 'dark'] as const)('boot.css %s tokens equal persona-palette.css', (scheme) => {
    const css = boot('boot.css')
    const tokens = bootTokens(css, scheme)
    const pairs: readonly (readonly [string, string])[] = [
      ['--paper', '--persona-paper'], ['--card', '--persona-card'], ['--wash', '--persona-wash'], ['--ink', '--persona-ink'],
      ['--ink-soft', '--persona-ink-soft'], ['--outline', '--persona-outline'], ['--outline-soft', '--persona-outline-soft'],
      ['--sunken', '--persona-paper-sunken'], ['--accent', '--persona-accent'], ['--rail', '--persona-rail'],
      ['--rail-ink', '--persona-rail-ink'], ['--rail-ink-soft', '--persona-rail-ink-soft'],
    ]
    for (const [bootName, appName] of pairs) {
      const own = tokens.get(bootName)
      expect(own, `${bootName} in boot.css (${scheme})`).toBeDefined()
      const plain = (value: string): string => value.replace(/\s+/gu, ' ').replace(/\b0\./gu, '.').toLowerCase()
      expect(plain(own!), `${bootName} vs ${appName} (${scheme})`).toBe(plain(resolve(appName, scheme)))
    }
  })

  it('boot.css motion tokens equal persona-palette.css, and the faces stagger matches the script', () => {
    const tokens = bootTokens(boot('boot.css'), 'light')
    for (const [own, shared] of [['--motion-base', '--motion-base'], ['--motion-slow', '--motion-slow'], ['--motion-reduced-fade', '--motion-reduced-fade'],
      ['--ease-standard', '--ease-standard'], ['--ease-enter', '--ease-enter']] as const) {
      expect(tokens.get(own), own).toBe(rootTokens.get(shared)!.replace(/\s*\/\*.*$/u, ''))
    }
    const css = boot('boot.css'); const script = boot('boot.js')
    expect(script).toContain('FACE_GAP = 120, FACE_ENTER = 360')
    for (const [index, delay] of [[2, 120], [3, 240], [4, 360], [5, 480]] as const) expect(css).toContain(`.face:nth-child(${String(index)}) { animation-delay: ${String(delay)}ms; }`)
  })

  it('the scene only moves transform and opacity: no filter, no blinking lamp, no shimmer', () => {
    const css = boot('boot.css')
    expect(css).not.toMatch(/\bfilter\s*:/u)
    expect(css).not.toMatch(/\bblur\(/u)
    const frames = keyframesOf(css)
    expect([...frames.keys()].sort()).toEqual(['arrive', 'enter', 'fade', 'typing'])
    for (const [name, body] of frames) {
      const properties = [...body.matchAll(/([a-z-]+)\s*:/gu)].map(match => match[1]!)
      expect(properties.length, name).toBeGreaterThan(0)
      expect(properties.every(property => property === 'opacity' || property === 'transform'), `${name}: ${properties.join(',')}`).toBe(true)
    }
    expect(css).toMatch(/\.dots i \{[^}]*animation: typing 1\.2s steps\(1, end\) infinite/u)
    // The faces start hidden only through the animation's backwards fill: a base `opacity: 0` would keep them invisible in the
    // reduced-motion fade, whose keyframes only name `from` (found by the capture rig, 12/11).
    expect(/\.face \{[^}]*\}/u.exec(css)![0]).not.toMatch(/opacity/u)
  })

  it('every shipped face has art, and the script allows exactly those faces', () => {
    const listed = /var FACES = \[([^\]]+)\]/u.exec(boot('boot.js'))![1]!.split(',').map(id => id.trim().replaceAll("'", ''))
    const shipped = readdirSync(new URL('../renderer/persona-boot/assets/faces/', import.meta.url)).map(file => file.replace(/\.webp$/u, '')).sort()
    expect([...listed].sort()).toEqual(shipped)
    const source = readdirSync(new URL('../../../packages/persona/client-ui-persona/src/client/assets/avatars/', import.meta.url))
    for (const id of listed) expect(source, id).toContain(`${id}-96.webp`)
  })

  it('the rail labels equal the shell locale labels (pt and en)', () => {
    const script = boot('boot.js')
    const labels = (language: 'pt' | 'en'): string[] => {
      const shell = JSON.parse(app(`locale-sources/shell.${language}.json`)) as Record<string, string>
      return ['sidebar.overview', 'sidebar.projects', 'sidebar.approvals', 'place.team', 'place.memory'].map(key => shell[key]!)
    }
    for (const [index, language] of (['pt', 'en'] as const).entries()) {
      const own = [...script.matchAll(/place(?:Overview|Projects|Approvals|Team|Memory): '([^']+)'/gu)].map(match => match[1]!)
      expect(own.slice(index * 5, index * 5 + 5), language).toEqual(labels(language))
    }
  })
})
