// @vitest-environment jsdom
// D-089 (b): the night and house ornaments (NIGHT-THEME-SPEC §2–4, BR-P4), behind `persona.flag.houseDecor`.
// With the flag off nothing changes (not even a node). With it on: aria-hidden, no motion, outside the text, the night
// empties in the same frame as the day ones, and 200% / forced-colors take the corner and header ornaments away.
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ILLUSTRATIONS } from '../src/client/assets/generated-imports.ts'
import { ApprovedStamp } from '../src/client/primitives/index.ts'
import { CardSprig, ChannelSceneIcon, channelSceneKey, ConfettiMoment, HeaderDoodles, houseEmptyArt, houseStampUrl } from '../src/client/decor/HouseDecor.tsx'
import { HOUSE_DECOR_FLAG_KEY, isHouseDecorEnabled } from '../src/client/decor/house-decor-flag.ts'
import { pt } from '../src/client/locale/shell/locales.ts'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

installPreviewTheme()

const on = (): void => { localStorage.setItem(HOUSE_DECOR_FLAG_KEY, '1') }

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

describe('the flag', () => {
  it('is off by default and on with the key (or the window flag)', () => {
    expect(isHouseDecorEnabled()).toBe(false)
    on()
    expect(isHouseDecorEnabled()).toBe(true)
    localStorage.setItem(HOUSE_DECOR_FLAG_KEY, '0')
    expect(isHouseDecorEnabled()).toBe(false)
  })
})

describe('with the flag OFF nothing is drawn', () => {
  it('every ornament is empty', () => {
    expect(houseEmptyArt('empty-dm', 'empty-dm-noite')).toBeUndefined()
    const { container } = render(<><CardSprig /><HeaderDoodles /><ChannelSceneIcon name="Marketing" /></>)
    expect(container.innerHTML).toBe('')
  })

  it('the Visão geral has no ornament node', () => {
    const { container } = render(<OverviewView t={shellTranslate} attentionItems={[pt['overview.attentionSample']]} nowRows={[]} awayEvents={[]} />)
    expect(container.querySelector('[data-house-decor]')).toBeNull()
  })
})

describe('with the flag ON', () => {
  it('the art exists in the registry (BR-P4 keys)', () => {
    for (const key of ['corner-leaf-tl', 'header-doodles-light', 'header-doodles-dark', 'empty-dm', 'empty-dm-noite', 'empty-geral-noite', 'empty-aprovacoes', 'empty-aprovacoes-noite', 'channel-marketing', 'channel-equipe']) {
      expect(ILLUSTRATIONS[key], key).toBeTruthy()
    }
  })

  it('a night empty is the day art plus the night art (same frame), both hidden from the reader', () => {
    on()
    const art = houseEmptyArt('empty-aprovacoes', 'empty-aprovacoes-noite', 240)
    const { container } = render(<div>{art}</div>)
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(images[0]?.getAttribute('src')).toBe(ILLUSTRATIONS['empty-aprovacoes'])
    expect(images[1]?.getAttribute('src')).toBe(ILLUSTRATIONS['empty-aprovacoes-noite'])
    for (const image of images) expect(image.getAttribute('alt')).toBe('')
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    // a missing art never half-draws
    expect(houseEmptyArt('empty-aprovacoes', 'nao-existe')).toBeUndefined()
  })

  it('the channel scene icon follows the team name (generic for anything else)', () => {
    expect(channelSceneKey('Marketing')).toBe('channel-marketing')
    expect(channelSceneKey('Atendimento ao cliente')).toBe('channel-atendimento')
    expect(channelSceneKey('Financeiro')).toBe('channel-financeiro')
    expect(channelSceneKey('Diretoria')).toBe('channel-diretoria')
    expect(channelSceneKey('Produto')).toBe('channel-produto')
    expect(channelSceneKey('Jurídico')).toBe('channel-equipe')
    on()
    const { container } = render(<ChannelSceneIcon name="Marketing" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe(ILLUSTRATIONS['channel-marketing'])
  })

  it('Visão geral: the doodles sit BETWEEN the title and "Nova tarefa", and the big card has ONE sprig', () => {
    on()
    const { container } = render(<OverviewView t={shellTranslate} attentionItems={[pt['overview.attentionSample']]} nowRows={[]} awayEvents={[]} />)
    const header = container.querySelector('header')
    expect(header).not.toBeNull()
    const kids = Array.from(header?.children ?? [])
    const doodles = kids.findIndex(node => node.getAttribute('data-house-decor') === 'doodles')
    const button = kids.findIndex(node => node.tagName === 'BUTTON')
    expect(kids[0]?.querySelector('h1')).not.toBeNull()
    expect(doodles).toBe(1)
    expect(button).toBe(2)
    expect(container.querySelectorAll('[data-house-decor="sprig"]')).toHaveLength(1)
    // everything decorative is hidden from assistive tech and carries no text
    for (const node of Array.from(container.querySelectorAll('[data-house-decor]'))) {
      expect(node.getAttribute('aria-hidden')).toBe('true')
      expect(node.textContent).toBe('')
    }
    // the heading and the action are still reachable
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['overview.newTask'] })).toBeTruthy()
  })
})

describe('the channel header of a team (BR-P4 #4)', () => {
  const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
  const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as GeneralChannelViewProps['shellT']
  const members = [{ id: 'atlas', name: 'Atlas', role: 'Função', state: 'resting' }] as unknown as GeneralChannelViewProps['members']
  beforeEach(() => { HTMLElement.prototype.scrollTo = () => {}; localStorage.setItem(NAV_PLACES_FLAG_KEY, '1') })

  it('with the flag the team channel shows its scene icon (48 px, hidden from readers); #geral keeps the # badge', () => {
    on()
    const { container, unmount } = render(<GeneralChannelView t={t} shellT={shellT} members={members} messages={[]} createdForTeam="Marketing" />)
    const scene = container.querySelector('[data-house-decor="scene"]')
    expect(scene?.getAttribute('aria-hidden')).toBe('true')
    expect(scene?.querySelector('img')?.getAttribute('src')).toBe(ILLUSTRATIONS['channel-marketing'])
    unmount()
    const general = render(<GeneralChannelView t={t} shellT={shellT} members={members} messages={[]} />)
    expect(general.container.querySelector('[data-house-decor="scene"]')).toBeNull()
  })

  it('without the flag the header is the one it always was', () => {
    const { container } = render(<GeneralChannelView t={t} shellT={shellT} members={members} messages={[]} createdForTeam="Marketing" />)
    expect(container.querySelector('[data-house-decor]')).toBeNull()
  })
})

describe('the drawn stamps (BR-P4 #12)', () => {
  it('without the flag the usual paw stamp stays, with its real text', () => {
    const { container } = render(<ApprovedStamp label="Aprovado" seed="card-1" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Aprovado' })).toBeTruthy()
    expect(houseStampUrl('card-1')).toBeUndefined()
  })

  it('with the flag the drawn stamp is decoration (alt empty); the accessible name and the text are still "Aprovado"', () => {
    on()
    const { container } = render(<ApprovedStamp label="Aprovado" seed="card-1" />)
    const art = container.querySelector('img')
    expect(art?.getAttribute('alt')).toBe('')
    expect(art?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('img', { name: 'Aprovado' })).toBeTruthy()
    expect(container.textContent).toContain('Aprovado')
  })

  it('the same card always wears the same stamp and the three are all used', () => {
    on()
    expect(houseStampUrl('a-card')).toBe(houseStampUrl('a-card'))
    const urls = new Set(Array.from({ length: 40 }, (_, index) => houseStampUrl('card-' + String(index))))
    expect(urls.size).toBe(3)
    for (const key of ['stamp-feito', 'stamp-boa', 'stamp-uau']) expect(urls.has(ILLUSTRATIONS[key])).toBe(true)
  })
})

describe('the CSS rules', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'client', 'decor', 'HouseDecor.module.css'), 'utf8')

  it('the ONLY motion is the confetti of one milestone: one animation, once, within 1.2 s, off under reduced-motion', () => {
    expect(css.match(/@keyframes/gu)).toHaveLength(1)
    expect(css).not.toMatch(/transition\s*:/u)
    const animation = /animation:\s*persona-confetti-fall\s+(\d+)ms\s+ease-in\s+calc\(var\(--i\)\s*\*\s*(\d+)ms\)\s+(\d+)\s+both/u.exec(css)
    expect(animation).not.toBeNull()
    const [, duration, step, iterations] = animation as unknown as [string, string, string, string]
    expect(Number(iterations)).toBe(1)
    expect(Number(duration) + Number(step) * 7).toBeLessThanOrEqual(1200)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.leaf\s*\{[^}]*animation:\s*none/u)
  })

  it('the corner and header ornaments go away at 200% (≤ 800 px) and in forced-colors', () => {
    expect(css).toMatch(/@media \(max-width: 800px\), \(forced-colors: active\)\s*\{[^}]*\.sprig,[^}]*\.doodles[^}]*display:\s*none/u)
  })

  it('every ornament ignores the pointer and the selection', () => {
    expect(css.match(/pointer-events:\s*none/gu)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('the night art only shows in the dark theme', () => {
    expect(css).toContain("body[data-ds-dark-theme='true']")
    expect(css).toMatch(/\.pair > \.nightOnly\s*\{\s*display:\s*none/u)
  })
})

describe('the unread badge glow (NIGHT-THEME §3)', () => {
  const read = (file: string): string => readFileSync(join(__dirname, '..', 'src', 'client', file), 'utf8')

  it('the flag is mirrored on the body (and only then), so CSS-only ornaments can be gated by it', async () => {
    const { HOUSE_DECOR_ATTRIBUTE, installHouseDecorAttribute } = await import('../src/client/decor/house-decor-flag.ts')
    installHouseDecorAttribute()
    expect(document.body.hasAttribute(HOUSE_DECOR_ATTRIBUTE)).toBe(false)
    on()
    installHouseDecorAttribute()
    expect(document.body.hasAttribute(HOUSE_DECOR_ATTRIBUTE)).toBe(true)
    localStorage.clear()
    installHouseDecorAttribute()
    expect(document.body.hasAttribute(HOUSE_DECOR_ATTRIBUTE)).toBe(false)
  })

  it.each([
    ['shell/RailTeam.module.css', 'unread'],
    ['shell/ConversationsRail.module.css', 'badge'],
    ['chat/DirectMessagesView.module.css', 'unread'],
  ])('%s: the glow is a half-strength layer, dark theme + flag only, on top of nothing but the badge, gone in forced-colors', (file, cls) => {
    const css = read(file).replace(/\r\n/gu, '\n')
    expect(css).toContain(`:global(body[data-house-decor][data-ds-dark-theme='true']) .${cls}::after`)
    const head = `:global(body[data-house-decor][data-ds-dark-theme='true']) .${cls}::after {`
    const start = css.indexOf(head)
    const rule = css.slice(start + head.length, css.indexOf('}', start))
    expect(rule).toContain('box-shadow: var(--persona-night-active-glow)')
    expect(rule).toContain('opacity: 0.5')
    expect(rule).toContain('pointer-events: none')
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{[^}]*::after\s*\{[^}]*display:\s*none/u)
  })
})

describe('the confetti of one milestone (BR-P4 #13)', () => {
  it('without the flag the notice is returned untouched (not one node more)', () => {
    const { container } = render(<ConfettiMoment><p>Sprint concluída</p></ConfettiMoment>)
    expect(container.innerHTML).toBe('<p>Sprint concluída</p>')
  })

  it('with the flag: the notice plus 8 leaves, hidden from readers, and never any text', () => {
    on()
    const { container } = render(<ConfettiMoment><p>Sprint concluída</p></ConfettiMoment>)
    expect(screen.getByText('Sprint concluída')).toBeTruthy()
    const layer = container.querySelector('[data-house-decor="confetti"]')
    expect(layer?.getAttribute('aria-hidden')).toBe('true')
    expect(layer?.children).toHaveLength(8)
    expect(layer?.textContent).toBe('')
  })
})
