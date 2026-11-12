// @vitest-environment jsdom
// Muse (achado do SW-7, bundle 6): na faixa da equipe estreita (~460 px, 4–5 membros, estados longos) as etiquetas de nome se SOBREPUNHAM e o texto
// cortava no meio ("Descan", "Num rasc"). Regra: as etiquetas NUNCA se sobrepõem; abaixo da largura que cabe, a etiqueta mostra só o nome e o ponto de
// estado, e o texto do estado fica para o leitor de tela e para o `title`.
// O layout real (caixas, sobreposição) é medido em Chrome de verdade pela galeria (`faixa-equipe-*`); aqui ficam a estrutura e as guardas do CSS.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

const CSS = readFileSync(join(import.meta.dirname, '../src/client/team/TeamChannelStrip.module.css'), 'utf8').replaceAll('\r\n', '\n')

const MEMBERS: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', quiet: true, systemRoles: ['team_manager'] },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working', draftFiles: 3 },
  { id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working' },
  { id: 'sol', name: 'Sol', role: 'Relacionamento', state: 'waiting' },
  { id: 'luna', name: 'Luna', role: 'Atendimento', state: 'resting' },
]

/** Corpo do bloco `@container` informado (até a chave que o fecha), ou '' se não existir. */
function containerBody(query: string): string {
  const start = CSS.indexOf(`@container ${query} {`)
  if (start < 0) return ''
  const open = CSS.indexOf('{', start)
  let depth = 0
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i)
  }
  return ''
}

describe('faixa da equipe: o estado fica legível sem a etiqueta mostrar o texto', () => {
  it('cada etiqueta leva "nome · estado" no title (o que o mouse lê quando o texto some)', () => {
    render(<TeamChannelStrip t={shellTranslate} members={MEMBERS} />)
    const titles = Array.from(document.querySelectorAll('li [title]')).map(node => node.getAttribute('title'))
    expect(titles).toEqual([
      `Atlas · ${pt['team.statusResting']}`,
      `Nina · ${pt['team.statusDraft']}`,
      `Bento · ${pt['team.statusWorking']}`,
      `Sol · ${pt['team.statusWaiting']}`,
      `Luna · ${pt['team.statusAvailable']}`,
    ])
  })

  it('o texto do estado continua no DOM (leitor de tela) em todos os estados, e o rascunho tem a frase inteira só para o leitor', () => {
    render(<TeamChannelStrip t={shellTranslate} members={MEMBERS} />)
    expect(screen.getByText(pt['team.statusResting'])).toBeTruthy()
    expect(screen.getByText(pt['team.statusWorking'])).toBeTruthy()
    expect(screen.getByText(pt['team.statusWaiting'])).toBeTruthy()
    expect(screen.getByText(pt['team.statusAvailable'])).toBeTruthy()
    const draft = screen.getByText(pt['team.statusDraftSr'])
    expect(draft.className).toContain('persona-sr-only')
    // o texto curto do rascunho que a pessoa vê é decorativo (a frase do leitor já diz tudo): nunca lido duas vezes
    expect(screen.getByText(pt['team.statusDraft']).getAttribute('aria-hidden')).toBe('true')
  })

  it('o nome tem o próprio elemento (as reticências cortam o nome, nunca o ⋯ nem o ícone do Gestor)', () => {
    const { container } = render(<TeamChannelStrip t={shellTranslate} members={MEMBERS} personaFace={() => ({ onClick: () => undefined, onPointerEnter: () => undefined, onPointerLeave: () => undefined, onKeyDown: () => undefined, 'aria-keyshortcuts': 'Shift+F10' })} personaMenu={id => ({ onClick: () => undefined, 'aria-haspopup': 'dialog', 'aria-expanded': false, 'data-persona-card-trigger': id })} />)
    const atlas = screen.getByText('Atlas')
    // o nome é um span só com o texto; o ⋯ (botão) é irmão dele dentro da mesma linha, não filho
    expect(atlas.children.length).toBe(0)
    expect(atlas.parentElement?.querySelector('button')).not.toBeNull()
    expect(within(atlas.parentElement as HTMLElement).getByRole('button', { name: /Atlas/u })).toBeTruthy()
    expect(container.querySelectorAll('li').length).toBe(MEMBERS.length)
  })
})

describe('faixa da equipe: CSS que impede a sobreposição', () => {
  it('cada membro é um container pela largura que recebe (a decisão é da caixa, não da janela)', () => {
    expect(CSS).toMatch(/\.member\s*\{[^}]*container:\s*persona-member\s*\/\s*inline-size\s*;/u)
  })

  it('a etiqueta cabe na caixa do membro: border-box + max-width 100% + min-width 0', () => {
    const tag = /^\.tag\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? ''
    expect(tag).toMatch(/box-sizing:\s*border-box\s*;/u)
    expect(tag).toMatch(/max-width:\s*100%\s*;/u)
    expect(tag).toMatch(/min-width:\s*0\s*;/u)
  })

  it('nome e estado comprido terminam em reticências e nunca quebram a linha', () => {
    expect(/^\.tagNameText\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/text-overflow:\s*ellipsis\s*;[\s\S]*white-space:\s*nowrap\s*;|white-space:\s*nowrap\s*;[\s\S]*text-overflow:\s*ellipsis\s*;/u)
    expect(/^\.tagStatusText\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/text-overflow:\s*ellipsis\s*;/u)
    expect(/^\.tagName\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/display:\s*inline-flex\s*;/u)
    expect(/^\.tagMore\s*\{([^}]*)\}/mu.exec(CSS)?.[1] ?? '').toMatch(/flex:\s*none\s*;/u)
  })

  it('abaixo da largura que cabe: só nome + ponto; o texto do estado sai da vista MAS não do leitor de tela (nunca display: none)', () => {
    const compact = containerBody('persona-member (max-width: 144px)')
    expect(compact).not.toBe('')
    const hidden = /\.tagStatusText\s*\{([^}]*)\}/u.exec(compact)?.[1] ?? ''
    expect(hidden).toMatch(/position:\s*absolute\s*;/u)
    expect(hidden).toMatch(/clip:\s*rect\(0 0 0 0\)\s*;/u)
    expect(hidden).toMatch(/width:\s*1px\s*;/u)
    expect(hidden).not.toMatch(/display:\s*none/u)
    expect(hidden).not.toMatch(/visibility:\s*hidden/u)
    // a etiqueta compacta fica numa LINHA só (o ponto à esquerda do nome, nunca órfão numa 2ª linha) e ganha a folga que o nome (+ ⋯) precisa
    expect(compact).toMatch(/\.tag\s*\{[^}]*flex-direction:\s*row\s*;[^}]*gap:\s*6px\s*;[^}]*padding:\s*4px 8px\s*;/u)
    expect(compact).toMatch(/\.tagStatus\s*\{[^}]*order:\s*-1\s*;/u)
  })
})
