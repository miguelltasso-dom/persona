// @vitest-environment jsdom
// Item 26 (26.15) · o editor de Rotinas: "Quando" é UMA escolha exclusiva — "Num horário" | "Quando acontecer algo" (Muse 12/11). Com o evento, os
// horários SOMEM; nunca horário e evento juntos; o cartão solto "E-mail da empresa" saiu do editor; o evento só vale se o conector estiver ligado.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pt as routinesPt } from '../src/client/locale/routines/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { RoutineEditorModal, type EventOption, type RoutineSaved } from '../src/client/routines/RoutineEditorModal.tsx'
import { DEFAULT_WHEN } from '../src/client/routines/routine-schedule.ts'
import { EVENT_SOURCES, fieldsOf, readEventWire, stripOf, textOfFilter, wireOfFilter, wordsOf } from '../src/client/routines/routine-trigger.ts'

installPreviewTheme()
afterEach(cleanup)

const NINA = { id: 'p-nina', name: 'Nina' }
const ALL_ON: readonly EventOption[] = EVENT_SOURCES.map(source => ({ source, connected: true }))
const ONLY_EMAIL_OFF: readonly EventOption[] = EVENT_SOURCES.map(source => ({ source, connected: source !== 'email' }))
const t = (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  String((routinesPt as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))

function mount(extra: Partial<React.ComponentProps<typeof RoutineEditorModal>> = {}): { onSave: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSave = vi.fn(async (_saved: RoutineSaved) => {})
  const onClose = vi.fn()
  render(
    <PreviewFrame brandLabel="Persona">
      <RoutineEditorModal
        dict={routinesPt}
        open
        mode="create"
        initial={{ prompt: 'Responder os clientes', when: DEFAULT_WHEN, projectId: 'proj' }}
        personas={[NINA]}
        projects={[{ id: 'proj', name: 'Site' }]}
        eventOptions={ALL_ON}
        onSave={onSave}
        onClose={onClose}
        {...extra}
      />
    </PreviewFrame>,
  )
  return { onSave, onClose }
}

const pickEvent = (): void => { fireEvent.click(screen.getByRole('radio', { name: 'Quando acontecer algo' })) }

describe('o segmentado "Num horário | Quando acontecer algo"', () => {
  it('sem eventos no host (um host antigo) o editor é o de sempre: nenhuma escolha de tipo', () => {
    mount({ eventOptions: undefined })
    expect(screen.queryByRole('radio', { name: 'Quando acontecer algo' })).toBeNull()
    expect(screen.getByRole('radio', { name: /Todo dia/u })).toBeTruthy()
  })

  it('são dois botões exclusivos; abre em "Num horário" com os horários à vista', () => {
    mount()
    const group = screen.getByRole('radiogroup', { name: 'Quando' })
    const time = within(group).getByRole('radio', { name: 'Num horário' })
    const event = within(group).getByRole('radio', { name: 'Quando acontecer algo' })
    expect(time.getAttribute('aria-checked')).toBe('true')
    expect(event.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: /Dias úteis/u })).toBeTruthy()
    expect(screen.queryByLabelText('O que acontece')).toBeNull()
  })

  it('"Quando acontecer algo": os horários SOMEM e aparecem a escolha do evento e a faixa; nunca horário e evento juntos', () => {
    mount()
    pickEvent()
    expect(screen.getByRole('radio', { name: 'Quando acontecer algo' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('radio', { name: /Todo dia/u })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Dias úteis/u })).toBeNull()
    expect(screen.queryByText('Hora')).toBeNull()
    const select = screen.getByLabelText('O que acontece') as HTMLSelectElement
    expect(select.value).toBe('email')
    expect(within(select).getByRole('option', { name: 'Chegar um e-mail' })).toBeTruthy()
    expect(screen.getByText('Qualquer e-mail')).toBeTruthy()
    expect(screen.getByText('O filtro roda antes de chamar a equipe.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar regra' })).toBeTruthy()
    // e de volta: o horário volta, o evento some
    fireEvent.click(screen.getByRole('radio', { name: 'Num horário' }))
    expect(screen.getByRole('radio', { name: /Todo dia/u })).toBeTruthy()
    expect(screen.queryByLabelText('O que acontece')).toBeNull()
  })

  it('o cartão solto "E-mail da empresa" não está mais no editor, em nenhum dos dois modos', () => {
    mount()
    expect(screen.queryByText(/E-mail da empresa/u)).toBeNull()
    pickEvent()
    expect(screen.queryByText(/E-mail da empresa/u)).toBeNull()
  })

  it('as setas trocam de opção (grupo de rádio)', () => {
    mount()
    const group = screen.getByRole('radiogroup', { name: 'Quando' })
    fireEvent.keyDown(within(group).getByRole('radio', { name: 'Num horário' }), { key: 'ArrowRight' })
    expect(within(group).getByRole('radio', { name: 'Quando acontecer algo' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('a faixa e o filtro do evento', () => {
  it('"Editar regra" abre os campos do e-mail; a faixa diz o filtro em palavras e "Pronto" fecha', () => {
    mount()
    pickEvent()
    expect(screen.queryByLabelText('Para o endereço')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Editar regra' }))
    fireEvent.change(screen.getByLabelText('Para o endereço'), { target: { value: 'vendas@padarialua.com.br' } })
    fireEvent.change(screen.getByLabelText('Com as palavras'), { target: { value: 'encomenda, orçamento' } })
    expect(screen.getByLabelText('De')).toBeTruthy()
    expect(screen.getByText('vendas@padarialua.com.br · com “encomenda, orçamento”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }))
    expect(screen.queryByLabelText('Para o endereço')).toBeNull()
    expect(screen.getByText('vendas@padarialua.com.br · com “encomenda, orçamento”')).toBeTruthy() // the strip keeps it
  })

  it('um chat tem canal e não tem endereço; a agenda só tem palavras', () => {
    mount()
    pickEvent()
    fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: 'slack' } })
    fireEvent.click(screen.getByRole('button', { name: 'Editar regra' }))
    expect(screen.getByLabelText('Canal')).toBeTruthy()
    expect(screen.queryByLabelText('Para o endereço')).toBeNull()
    fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: 'calendar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Editar regra' }))
    expect(screen.getByLabelText('Com as palavras')).toBeTruthy()
    expect(screen.queryByLabelText('Canal')).toBeNull()
    expect(screen.queryByLabelText('De')).toBeNull()
  })

  it('o resumo diz o evento em palavras, com a persona e o filtro', () => {
    mount()
    pickEvent()
    fireEvent.click(screen.getByRole('button', { name: 'Editar regra' }))
    fireEvent.change(screen.getByLabelText('Para o endereço'), { target: { value: 'vendas@padarialua.com.br' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Nina' }))
    expect(screen.getByRole('status').textContent).toBe('Quando chegar e-mail em vendas@padarialua.com.br, Nina vai: Responder os clientes')
  })
})

describe('salvar', () => {
  it('um evento manda o gatilho com listas curtas e NENHUM horário', () => {
    const { onSave } = mount()
    pickEvent()
    fireEvent.click(screen.getByRole('button', { name: 'Editar regra' }))
    fireEvent.change(screen.getByLabelText('Para o endereço'), { target: { value: ' vendas@padarialua.com.br ' } })
    fireEvent.change(screen.getByLabelText('Com as palavras'), { target: { value: 'encomenda,  orçamento,' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Responder os clientes', rrule: '', projectId: 'proj',
      trigger: { kind: 'event', source: 'email', filter: { to: ['vendas@padarialua.com.br'], contains: ['encomenda', 'orçamento'] } },
    })
  })

  it('um horário NÃO manda gatilho (ausente = o relógio)', () => {
    const { onSave } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    const saved = onSave.mock.calls[0]?.[0] as RoutineSaved
    expect(saved.trigger).toBeUndefined()
    expect(saved.rrule).toMatch(/FREQ=/u)
  })

  it('um conector desligado: a opção diz "Não ligado", a nota manda ligar em Conexões e Salvar fica desligado', () => {
    mount({ eventOptions: ONLY_EMAIL_OFF })
    pickEvent()
    const select = screen.getByLabelText('O que acontece') as HTMLSelectElement
    expect(select.value).toBe('telegram') // it opens on the first source that IS connected
    expect(within(select).getByRole('option', { name: 'Chegar um e-mail · Não ligado' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'email' } })
    expect(screen.getByText(/Ligue o e-mail da empresa em Conexões/u)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar rotina' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Editar regra' })).toBeNull()
    fireEvent.change(select, { target: { value: 'telegram' } })
    expect((screen.getByRole('button', { name: 'Salvar rotina' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('"Abrir Conexões" (32 px) ao lado da nota "Não ligado": só existe com o caminho para abrir; sem ele a nota fica sozinha', () => {
    const onOpenConnections = vi.fn()
    mount({ eventOptions: ONLY_EMAIL_OFF, onOpenConnections })
    pickEvent()
    fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: 'email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Conexões' }))
    expect(onOpenConnections).toHaveBeenCalledTimes(1)
    cleanup()
    mount({ eventOptions: ONLY_EMAIL_OFF })
    pickEvent()
    fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: 'email' } })
    expect(screen.queryByRole('button', { name: 'Abrir Conexões' })).toBeNull()
  })

  it('o 1º bloco de "Quem faz" cabe sem reticências: "Coordenação decide"', () => {
    mount()
    expect(screen.getByRole('radio', { name: 'Coordenação decide' })).toBeTruthy()
  })

  it('editar uma rotina que já espera um evento abre no evento, com o filtro; trocar para horário manda o horário e nenhum gatilho', () => {
    const { onSave } = mount({
      mode: 'edit',
      initial: { id: 'r9', prompt: 'Responder os clientes', when: undefined, projectId: 'proj', trigger: { kind: 'event', source: 'email', filter: { from: ['cliente.com.br'], contains: ['pedido'] } } },
    })
    expect(screen.getByRole('radio', { name: 'Quando acontecer algo' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('de cliente.com.br · com “pedido”')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Num horário' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    const saved = onSave.mock.calls[0]?.[0] as RoutineSaved
    expect(saved.id).toBe('r9')
    expect(saved.trigger).toBeUndefined()
    expect(saved.rrule).toMatch(/FREQ=/u)
  })
})

describe('o que é puro (routine-trigger)', () => {
  it('as palavras: vírgula, ponto e vírgula e quebra separam; branco sai; no máximo 10', () => {
    expect(wordsOf(' a ,b;\n c ,, ')).toEqual(['a', 'b', 'c'])
    expect(wordsOf(Array.from({ length: 14 }, (_, n) => `w${String(n)}`).join(','))).toHaveLength(10)
  })
  it('cada fonte só leva os campos que ela tem (e o gatilho descarta o resto)', () => {
    expect(fieldsOf('email')).toEqual(['to', 'from', 'contains'])
    expect(fieldsOf('slack')).toEqual(['channel', 'from', 'contains'])
    expect(fieldsOf('calendar')).toEqual(['contains'])
    expect(wireOfFilter('slack', { from: '', to: 'x@y.com', channel: 'vendas', contains: '' })).toEqual({ channel: ['vendas'] })
  })
  it('a faixa: nada que restrinja = "Qualquer …"', () => {
    expect(stripOf(t, 'email', textOfFilter(undefined))).toBe('Qualquer e-mail')
    expect(stripOf(t, 'telegram', textOfFilter(undefined))).toBe('Qualquer mensagem')
    expect(stripOf(t, 'slack', { from: '', to: '', channel: 'vendas', contains: '' })).toBe('no canal vendas')
  })
  it('lê o gatilho do host e descarta o que não é um evento conhecido', () => {
    expect(readEventWire({ kind: 'event', source: 'email', filter: { to: ['a@b.com'] } })).toEqual({ kind: 'event', source: 'email', filter: { to: ['a@b.com'] } })
    expect(readEventWire({ kind: 'schedule' })).toBeUndefined()
    expect(readEventWire({ kind: 'event', source: 'whatsapp', filter: {} })).toBeUndefined()
    expect(readEventWire(undefined)).toBeUndefined()
  })
})

describe('a régua do CSS (o que a Muse pediu)', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'client', 'routines', 'RoutineEditor.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replaceAll('\r\n', '\n')
  it('o segmentado e o Select ficam a 40 px (a régua de controle), com a borda de controle', () => {
    expect(/\n\.segment \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/min-height:\s*var\(--control-h-m\)/u)
    expect(/\n\.segmented \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/border:[^;]*var\(--persona-outline-control\)/u)
    expect(/\n\.eventSelect \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/min-height:\s*var\(--control-h-m\)/u)
  })
  it('a dica da faixa tem 13 px e nenhum movimento é solto: só token', () => {
    expect(/\n\.stripHint \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/font-size:\s*13px/u)
    expect(css).not.toMatch(/\b\d+ms\b/u)
  })
  it('"Quem faz": "Coordenação decide" quebra ENTRE as palavras, nunca no meio (Ember, app real: "Coordenaç / ão decide")', () => {
    expect(/\n\.people \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/minmax\(104px,\s*1fr\)/u) // "Coordenação" (13 px, negrito) cabe inteira no cartão
    const name = /\n\.personName \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    expect(name).toMatch(/overflow-wrap:\s*break-word/u) // só parte a palavra que sozinha não cabe
    expect(name).not.toMatch(/overflow-wrap:\s*anywhere/u) // "anywhere" encolhia o mínimo e partia a palavra
    expect(name).toMatch(/hyphens:\s*none/u)
  })
})
