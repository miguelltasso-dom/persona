// @vitest-environment jsdom
// IV-9: criar e editar Rotinas, em linguagem de gente (UX-BEYOND §IV-9): o modal, a frase, a lista e a ligação com o host.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteRoutinesPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { en as routinesEn, pt as routinesPt } from '../src/client/locale/routines/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { RoutineEditorModal, type RoutineSaved } from '../src/client/routines/RoutineEditorModal.tsx'
import { RoutinesView, type RoutineActions, type RoutineRow } from '../src/client/routines/RoutinesView.tsx'
import {
  DEFAULT_WHEN,
  describeWhen,
  normalizeWhen,
  rruleFromWhen,
  weekRangeLabel,
  whenFromRrule,
} from '../src/client/routines/routine-schedule.ts'
import { routineNameFromPrompt } from '../src/client/routines/routine-wire.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
installPreviewTheme()

afterEach(() => { cleanup() })

const tPt = (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  String((routinesPt as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))
const tEn = (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  String((routinesEn as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))

describe('Quando: a escolha de gente ↔ a regra do host ↔ a frase', () => {
  it('escreve a regra nos mesmos formatos do buildRrule do host', () => {
    expect(rruleFromWhen(normalizeWhen([0, 1, 2, 3, 4, 5, 6], '09:00'))).toBe('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')
    expect(rruleFromWhen(normalizeWhen([1, 2, 3, 4, 5], '09:00'))).toBe('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0')
    expect(rruleFromWhen(DEFAULT_WHEN)).toBe('FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0')
    expect(rruleFromWhen({ choice: 'custom', time: '14:30', days: [3, 1, 5] })).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=14;BYMINUTE=30')
    // todos os dias a outra hora continua sendo "todo dia", não uma regra semanal de 7 dias
    expect(rruleFromWhen({ choice: 'custom', time: '08:15', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('FREQ=DAILY;BYHOUR=8;BYMINUTE=15')
  })

  it('lê de volta só esses formatos, e a ida e a volta não mudam o que a rotina significa', () => {
    for (const rule of [
      'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
      'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0',
      'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=14;BYMINUTE=30',
      'FREQ=DAILY;BYHOUR=8;BYMINUTE=15',
    ]) {
      const when = whenFromRrule(rule)
      expect(when, rule).toBeDefined()
      expect(rruleFromWhen(when!)).toBe(rule)
    }
    expect(whenFromRrule('FREQ=DAILY;BYHOUR=9')?.time).toBe('09:00') // a regra do iniciativa diária do host, sem BYMINUTE
    expect(whenFromRrule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')?.choice).toBe('daily')
    expect(whenFromRrule('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0')?.choice).toBe('weekdays')
    expect(whenFromRrule('FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0')?.choice).toBe('weekly')
    // outra hora ou outros dias = "Escolher…"
    expect(whenFromRrule('FREQ=WEEKLY;BYDAY=WE;BYHOUR=9;BYMINUTE=0')?.choice).toBe('custom')
    expect(whenFromRrule('FREQ=DAILY;BYHOUR=18;BYMINUTE=0')?.choice).toBe('custom')
  })

  it('o que o editor não escreve fica como "Horário personalizado" (nunca adivinhado)', () => {
    for (const rule of ['FREQ=HOURLY;INTERVAL=2', 'FREQ=MONTHLY;BYMONTHDAY=5;BYHOUR=9;BYMINUTE=0', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9', 'FREQ=WEEKLY;BYHOUR=9', 'lixo', '']) {
      expect(whenFromRrule(rule), rule).toBeUndefined()
    }
  })

  it('diz em português e em inglês, sem nunca mostrar a regra', () => {
    expect(describeWhen(tPt, normalizeWhen([0, 1, 2, 3, 4, 5, 6], '09:00'))).toBe('Todo dia às 9:00')
    expect(describeWhen(tPt, normalizeWhen([1, 2, 3, 4, 5], '09:00'))).toBe('De segunda a sexta às 9:00')
    expect(describeWhen(tPt, DEFAULT_WHEN)).toBe('Toda segunda às 9:00')
    expect(describeWhen(tPt, { choice: 'custom', time: '14:30', days: [6] })).toBe('Todo sábado às 14:30')
    expect(describeWhen(tPt, { choice: 'custom', time: '09:00', days: [1, 3, 5] })).toBe('Segunda, quarta e sexta às 9:00')
    expect(describeWhen(tEn, DEFAULT_WHEN)).toBe('Every Monday at 9:00')
    expect(describeWhen(tEn, { choice: 'custom', time: '09:00', days: [1, 3, 5] })).toBe('Monday, Wednesday and Friday at 9:00')
    for (const text of [describeWhen(tPt, DEFAULT_WHEN), describeWhen(tPt, normalizeWhen([1, 2], '07:00'))]) expect(text).not.toMatch(/FREQ|BYDAY|rrule|cron/iu)
  })

  it('a semana é a real (segunda a domingo), sem data fixa', () => {
    expect(weekRangeLabel(new Date(2026, 10, 4))).toBe('2 a 8 de nov') // quarta 4/11 → seg 2 a dom 8
    expect(weekRangeLabel(new Date(2026, 10, 8))).toBe('2 a 8 de nov') // domingo ainda é a mesma semana
    expect(weekRangeLabel(new Date(2026, 10, 9))).toBe('9 a 15 de nov')
    expect(weekRangeLabel(new Date(2026, 9, 29))).toBe('26 de out a 1 de nov') // atravessa o mês
    expect(weekRangeLabel(new Date(2026, 10, 4), 'en')).toBe('Nov 2–8')
    expect(weekRangeLabel(new Date(2026, 9, 29), 'en')).toBe('Oct 26 – Nov 1')
  })

  it('o nome vem do pedido, curto', () => {
    expect(routineNameFromPrompt('  Resumir as vendas   da semana ')).toBe('Resumir as vendas da semana')
    expect(routineNameFromPrompt('x'.repeat(100))).toHaveLength(58)
  })
})

const NINA = { id: 'p-nina', name: 'Nina' }
const BENTO = { id: 'p-bento', name: 'Bento' }

function mountModal(extra: Partial<React.ComponentProps<typeof RoutineEditorModal>> = {}): { onSave: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSave = vi.fn(async (_saved: RoutineSaved) => {})
  const onClose = vi.fn()
  render(
    <PreviewFrame brandLabel="Persona">
      <RoutineEditorModal
        dict={routinesPt}
        open
        mode="create"
        initial={{ prompt: '', when: DEFAULT_WHEN, projectId: 'proj' }}
        personas={[NINA, BENTO]}
        projects={[{ id: 'proj', name: 'Site' }]}
        onSave={onSave}
        onClose={onClose}
        {...extra}
      />
    </PreviewFrame>,
  )
  return { onSave, onClose }
}

describe('o modal "Nova rotina"', () => {
  it('Salvar fica desligado, com o motivo à vista, até haver um pedido', () => {
    mountModal()
    const save = screen.getByRole('button', { name: 'Salvar rotina' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getByText('Escreva o que fazer para salvar.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Resumir as vendas da semana' } })
    expect(save.disabled).toBe(false)
    expect(screen.queryByText('Escreva o que fazer para salvar.')).toBeNull()
  })

  it('o resumo diz em palavras o que vai acontecer, com a persona escolhida, e muda ao escolher', () => {
    mountModal()
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Resumir as vendas' } })
    // sem dona: a frase recomeça com maiúscula e diz que a coordenação escolhe
    expect(screen.getByRole('status').textContent).toBe('Toda segunda às 9:00. A coordenação escolhe quem faz: Resumir as vendas')
    // o cartão mostra o dia que a regra vai usar: nada escondido
    expect(screen.getByRole('radio', { name: /Toda semana \(segunda\)/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Nina' }))
    expect(screen.getByRole('status').textContent).toBe('Toda segunda às 9:00, Nina vai: Resumir as vendas')
    fireEvent.click(screen.getByRole('radio', { name: /Dias úteis/u }))
    expect(screen.getByRole('status').textContent).toBe('De segunda a sexta às 9:00, Nina vai: Resumir as vendas')
    expect(screen.getByRole('status').textContent).not.toMatch(/FREQ|BYDAY/u)
  })

  it('"Escolher…" abre os dias e a hora, e salva a regra certa com a persona e o projeto', async () => {
    const { onSave, onClose } = mountModal()
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Revisar os contratos' } })
    expect(screen.queryByLabelText('Hora')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Escolher…/u }))
    // começa do que o "Toda semana" significava: segunda marcada
    expect(screen.getByRole('button', { name: 'segunda' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'quarta' }))
    fireEvent.click(screen.getByRole('button', { name: 'sexta' }))
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '14:30' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Bento' }))
    expect(screen.getByRole('status').textContent).toBe('Segunda, quarta e sexta às 14:30, Bento vai: Revisar os contratos')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledTimes(1) })
    expect(onSave).toHaveBeenCalledWith({
      id: undefined,
      prompt: 'Revisar os contratos',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=14;BYMINUTE=30',
      ownerPersonaId: 'p-bento',
      projectId: 'proj',
    })
    await waitFor(() => { expect(onClose).toHaveBeenCalled() })
  })

  it('"Escolher…" sem nenhum dia não salva e diz o que falta', () => {
    mountModal()
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Algo' } })
    fireEvent.click(screen.getByRole('radio', { name: /Escolher…/u }))
    fireEvent.click(screen.getByRole('button', { name: 'segunda' }))
    expect(screen.getByText('Escolha ao menos um dia.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar rotina' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('uma falha ao salvar diz que nada mudou e deixa tentar de novo', async () => {
    const onSave = vi.fn(async () => { throw new Error('host down') })
    mountModal({ onSave })
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Algo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Não consegui salvar agora. Nada mudou. Tente de novo.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar rotina' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('com um só projeto não pergunta o projeto; com vários, pergunta', () => {
    mountModal()
    expect(screen.queryByRole('radiogroup', { name: 'Em que projeto' })).toBeNull()
    cleanup()
    mountModal({ projects: [{ id: 'proj', name: 'Site' }, { id: 'p2', name: 'Contratação' }] })
    expect(screen.getByRole('radiogroup', { name: 'Em que projeto' })).toBeTruthy()
  })

  it('editar uma rotina com horário que o editor não escreve mantém a regra como está', async () => {
    const { onSave } = mountModal({
      mode: 'edit',
      initial: { id: 'r1', prompt: 'Varredura', when: undefined, keepRrule: 'FREQ=HOURLY;INTERVAL=2', projectId: 'proj' },
    })
    expect(screen.getByText(/horário personalizado/u)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Todo dia/u })).toBeNull()
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Varredura de PRs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    await waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ id: 'r1', prompt: 'Varredura de PRs', rrule: 'FREQ=HOURLY;INTERVAL=2' })
  })

  it('editar: pausar e apagar só existem se o host sabe, e apagar pede confirmação', async () => {
    const onTogglePause = vi.fn(async (_paused: boolean) => {})
    const onDelete = vi.fn(async () => {})
    const { onClose } = mountModal({
      mode: 'edit',
      initial: { id: 'r1', prompt: 'Varredura', when: DEFAULT_WHEN, projectId: 'proj', paused: false },
      onTogglePause,
      onDelete,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    await waitFor(() => { expect(onTogglePause).toHaveBeenCalledWith(true) })
    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Apagar esta rotina?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar rotina' }))
    await waitFor(() => { expect(onDelete).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(onClose).toHaveBeenCalled() })
  })

  it('criar não mostra Pausar nem Apagar', () => {
    mountModal({ onTogglePause: async () => {}, onDelete: async () => {} })
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull()
  })
})

const ROW: RoutineRow = { id: 'r1', name: 'Resumo das vendas', prompt: 'Resumir as vendas', rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', ownerPersonaId: 'p-nina', ownerName: 'Nina', projectId: 'proj', paused: false }
const PAUSED: RoutineRow = { ...ROW, id: 'r2', name: 'Backup', rrule: 'FREQ=HOURLY;INTERVAL=6', ownerPersonaId: undefined, ownerName: undefined, paused: true }

function actions(extra: Partial<RoutineActions> = {}): RoutineActions {
  return { personas: [NINA, BENTO], projects: [{ id: 'proj', name: 'Site' }], defaultProjectId: 'proj', canEdit: true, onSave: vi.fn(async () => {}), ...extra }
}

function mountView(props: Partial<React.ComponentProps<typeof RoutinesView>>): void {
  render(<PreviewFrame brandLabel="Persona"><RoutinesView dict={routinesPt} {...props} /></PreviewFrame>)
}

describe('a tela de Rotinas', () => {
  it('lista as rotinas em frases de gente, com "Pausada" e o horário que o editor não escreve', () => {
    mountView({ routineRows: [ROW, PAUSED], actions: actions() })
    const list = screen.getByRole('region', { name: 'Suas rotinas' })
    expect(within(list).getByText('Toda segunda às 9:00 · Nina')).toBeTruthy()
    expect(within(list).getByText('Horário personalizado · Coordenação')).toBeTruthy()
    expect(within(list).getByText('Pausada')).toBeTruthy()
    expect(list.textContent).not.toMatch(/FREQ|BYDAY|INTERVAL/u)
  })

  it('um horário que o editor não escreve usa a frase do host, e nunca a regra crua', () => {
    mountView({ routineRows: [{ ...PAUSED, humanSchedule: 'A cada 6 horas' }, { ...ROW, id: 'r9', name: 'Outra', rrule: 'FREQ=HOURLY;INTERVAL=3', humanSchedule: 'FREQ=HOURLY;INTERVAL=3' }], actions: actions() })
    expect(screen.getByText('A cada 6 horas · Coordenação')).toBeTruthy()
    // o host devolve a regra crua quando não sabe dizer: a tela cai em "Horário personalizado"
    expect(screen.getByText('Horário personalizado · Nina')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/FREQ=/u)
  })

  it('as rotinas da própria equipe só pausam: o host não apaga, então o editor não oferece Apagar', () => {
    mountView({ routineRows: [{ ...ROW, id: 'initiative:p-nina', name: 'Iniciativa de Nina', system: true }], actions: actions({ onDelete: vi.fn(async () => {}), onTogglePause: vi.fn(async () => {}) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Iniciativa de Nina' }))
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull()
  })

  it('a semana mostrada é a real, nunca "03/11 – 09/11"', () => {
    mountView({ routineRows: [ROW], actions: actions() })
    expect(document.body.textContent).not.toContain('03/11')
    expect(document.body.textContent).toContain(tPt('week.label', { range: weekRangeLabel(new Date()) }))
  })

  it('UM primário por tela: com rotinas "Nova rotina" fica no cabeçalho; sem rotinas fica no vazio e o cabeçalho não tem primário', () => {
    mountView({ routineRows: [ROW], actions: actions() })
    expect(screen.getAllByRole('button', { name: 'Nova rotina' })).toHaveLength(1)
    cleanup()
    const onAskSuggestions = vi.fn()
    mountView({ routineRows: [], initialState: 'empty', actions: actions(), onAskSuggestions })
    expect(screen.getAllByRole('button', { name: 'Nova rotina' })).toHaveLength(1)
    expect(screen.getByText('Nenhuma rotina ainda')).toBeTruthy()
    // "Pedir sugestões" passa a secundário
    fireEvent.click(screen.getByRole('button', { name: 'Pedir sugestões à coordenação' }))
    expect(onAskSuggestions).toHaveBeenCalledTimes(1)
  })

  it('sem como criar, nada de botão morto: o vazio continua oferecendo as sugestões como antes', () => {
    const onAskSuggestions = vi.fn()
    mountView({ routineRows: [], initialState: 'empty', onAskSuggestions })
    expect(screen.queryByRole('button', { name: 'Nova rotina' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: routinesPt['empty.action'] as string }))
    expect(onAskSuggestions).toHaveBeenCalledTimes(1)
  })

  it('"Editar" só existe quando o host atualiza; a linha inteira também abre o editor', () => {
    mountView({ routineRows: [ROW], actions: actions({ canEdit: false }) })
    expect(screen.queryByRole('button', { name: /Editar/u })).toBeNull()
    cleanup()
    mountView({ routineRows: [ROW], actions: actions() })
    fireEvent.click(screen.getByText('Resumo das vendas'))
    expect(screen.getByRole('dialog', { name: 'Editar rotina' })).toBeTruthy()
    expect((screen.getByLabelText('O que fazer') as HTMLInputElement).value).toBe('Resumir as vendas')
    expect(screen.getByRole('radio', { name: 'Nina' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar Resumo das vendas' }))
    expect(screen.getByRole('dialog', { name: 'Editar rotina' })).toBeTruthy()
  })

  it('apagar mostra "Rotina apagada · Desfazer" e o Desfazer devolve a MESMA rotina', async () => {
    const onDelete = vi.fn(async () => {})
    const onRestore = vi.fn(async () => {})
    mountView({ routineRows: [ROW], actions: actions({ onDelete, onRestore }) })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Resumo das vendas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar rotina' }))
    expect(await screen.findByText('Rotina apagada')).toBeTruthy()
    expect(onDelete).toHaveBeenCalledWith(ROW)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(onRestore).toHaveBeenCalledWith(ROW) })
    expect(screen.queryByText('Rotina apagada')).toBeNull()
  })

  it('o formulário da janela de silêncio continua funcionando com o primitivo Input', async () => {
    const onAddQuietWindow = vi.fn(async () => {})
    mountView({ routineRows: [ROW], actions: actions(), onAddQuietWindow })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar janela' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Noite' } })
    fireEvent.change(screen.getByLabelText('Das'), { target: { value: '21:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar janela' }))
    await waitFor(() => { expect(onAddQuietWindow).toHaveBeenCalledWith({ label: 'Noite', start: '21:00', end: '07:00' }) })
  })
})

function tenantReady(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
  return bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
}

describe('ligado ao host (RemoteRoutinesPanel)', () => {
  const schedule = { id: 'r1', projectId: 'proj', name: 'Resumo das vendas', rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', timeZone: 'America/Sao_Paulo', paused: false, catchUp: 'run_once' as const, silenceStart: '22:00', silenceEnd: '07:00', runs: [], prompt: 'Resumir as vendas', ownerPersonaId: 'p-nina' }
  function panel(persona: unknown): void {
    const { store } = createShellStore()
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteRoutinesPanel persona={persona as PersonaRemoteClient} useTenant={tenantReady()} useShell={bindObservableForTest(store)} />
      </PreviewFrame>,
    )
  }
  const base = () => ({
    listRoutineSchedule: vi.fn(async () => ({ ok: true as const, value: [schedule] })),
    listPersonas: vi.fn(async () => ({ ok: true as const, value: [{ id: 'p-nina', workspaceId: 'ws', projectId: 'proj', name: 'Nina', title: 'Pesquisa', description: '', avatarKind: 'gallery', avatarRef: 'nina', systemRoles: [], canRecruit: false }] })),
    createRoutine: vi.fn(async () => ({ ok: true as const, value: {} })),
    pauseRoutine: vi.fn(async () => ({ ok: true as const, value: {} })),
  })

  it('cria: monta o pedido para o host com a regra, o nome curto, o pedido e quem faz', async () => {
    const persona = base()
    panel(persona)
    await screen.findByText('Toda segunda às 9:00 · Nina')
    fireEvent.click(screen.getByRole('button', { name: 'Nova rotina' }))
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Mandar o relatório de sexta' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Nina' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    await waitFor(() => { expect(persona.createRoutine).toHaveBeenCalledTimes(1) })
    expect(persona.createRoutine).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws',
      projectId: 'proj',
      name: 'Mandar o relatório de sexta',
      prompt: 'Mandar o relatório de sexta',
      rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
      ownerPersonaId: 'p-nina',
      catchUp: 'skip',
    }))
    expect(String((persona.createRoutine.mock.calls[0] as unknown as [{ id: string }])[0].id)).toMatch(/^routine-/u)
  })

  it('um host sem updateRoutine ainda lista, mas não oferece "Editar"; com updateRoutine, edita pelo id', async () => {
    const persona = base()
    panel(persona)
    await screen.findByText('Toda segunda às 9:00 · Nina')
    expect(screen.queryByRole('button', { name: /Editar/u })).toBeNull()
    cleanup()
    const updateRoutine = vi.fn(async () => ({ ok: true as const, value: {} }))
    panel({ ...base(), updateRoutine })
    await screen.findByText('Toda segunda às 9:00 · Nina')
    fireEvent.click(screen.getByRole('button', { name: 'Editar Resumo das vendas' }))
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Resumir as vendas e o estoque' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotina' }))
    await waitFor(() => { expect(updateRoutine).toHaveBeenCalledTimes(1) })
    expect(updateRoutine).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', projectId: 'proj', prompt: 'Resumir as vendas e o estoque', ownerPersonaId: 'p-nina' }))
  })

  it('apagar e desfazer: o host recebe deleteRoutine e depois o createRoutine com o MESMO id', async () => {
    const deleteRoutine = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const persona = { ...base(), updateRoutine: vi.fn(async () => ({ ok: true as const, value: {} })), deleteRoutine }
    panel(persona)
    await screen.findByText('Toda segunda às 9:00 · Nina')
    fireEvent.click(screen.getByRole('button', { name: 'Editar Resumo das vendas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar rotina' }))
    await waitFor(() => { expect(deleteRoutine).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', id: 'r1' }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(persona.createRoutine).toHaveBeenCalledTimes(1) })
    // volta EXATAMENTE como era: nome, fuso, catch-up e janela de silêncio incluídos
    expect(persona.createRoutine).toHaveBeenCalledWith(expect.objectContaining({
      id: 'r1',
      name: 'Resumo das vendas',
      prompt: 'Resumir as vendas',
      rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
      ownerPersonaId: 'p-nina',
      timeZone: 'America/Sao_Paulo',
      catchUp: 'run_once',
      silenceStart: '22:00',
      silenceEnd: '07:00',
    }))
  })
})

describe('a rotina da própria equipe', () => {
  it('no modal: sem Apagar (nunca um botão que falha), com a linha que diz por quê, e Pausar continua', () => {
    mountModal({
      mode: 'edit',
      isTeamRoutine: true,
      initial: { id: 'initiative:p-nina', prompt: 'Iniciativa', when: DEFAULT_WHEN, projectId: 'proj', paused: false },
      onTogglePause: async () => {},
    })
    expect(screen.getByText('Rotina da equipe: dá para pausar, não apagar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull()
  })

  it('uma rotina comum não mostra essa linha', () => {
    mountModal({ mode: 'edit', initial: { id: 'r1', prompt: 'Algo', when: DEFAULT_WHEN, projectId: 'proj' }, onDelete: async () => {} })
    expect(screen.queryByText('Rotina da equipe: dá para pausar, não apagar.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Apagar' })).toBeTruthy()
  })
})
