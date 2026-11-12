/**
 * P1-10 (Muse, 12/11 07:07), "Janelas de silêncio": a lista e o editor da janela de silêncio da EQUIPE INTEIRA, só com o que o host obedece (HONEST-1): todo dia, início e fim.
 * Sem "Dias" e sem "Quem" até o host ter; prometer isso seria prometer o que ele não cumpre.
 *
 *  - Cada janela é uma linha: "Toda noite · 22h às 7h · Toda a equipe" ("Toda noite" só quando o fim é na manhã seguinte; senão "Todo dia"), a chave liga/desliga, Editar e ⋯.
 *  - Desligar pela chave aplica na hora (o host apaga a janela) e guarda o rascunho na tela, com "Janela desligada · Desfazer" por 10 s; ligar de novo grava com os MESMOS campos.
 *  - ⋯ pede a confirmação NA LINHA: "Apagar esta janela?" com Apagar (perigo) e Manter (com o foco).
 *  - "+ Nova janela de silêncio" abre o formulário na própria lista (sem modal): "Das [hora] às [hora]", a frase do que a janela faz, Salvar e Cancelar.
 * Sem handler, nenhum botão (nada morto): a lista fica só de leitura.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Chip, Input, Switch, UiIcon } from '../primitives/index.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import styles from './RulesProactivity.module.css'

/** A janela como a tela a guarda (o que o host manda e recebe). */
export interface QuietWindowRow {
  readonly id: string
  readonly label: string
  readonly start: string
  readonly end: string
}

export interface QuietWindowsProps {
  readonly dict: LocaleDict
  readonly windows: readonly QuietWindowRow[]
  /** Grava (cria ou muda) uma janela; uma rejeição = o host recusou (a tela diz que não deu). */
  readonly onSave?: ((item: QuietWindowRow) => Promise<void>) | undefined
  /** Apaga uma janela (o host PARA de obedecer na hora). */
  readonly onDelete?: ((id: string) => Promise<void>) | undefined
  /** Relógio injetável (testes): o "Agora em silêncio até 7h" conta a partir dele. */
  readonly now?: (() => Date) | undefined
}

const UNDO_MS = 10_000
/** O nome que a janela leva no host (a tela não pergunta nome: a linha se descreve pelos horários). */
const WINDOW_LABEL = 'Silêncio da equipe'

const minutesOf = (time: string): number => {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/** "22:00" → "22h"; "07:30" → "7h30". */
export function hourLabel(time: string): string {
  const [hours = '0', minutes = '00'] = time.split(':')
  const hour = String(Number(hours))
  return Number(minutes) === 0 ? `${hour}h` : `${hour}h${minutes.padStart(2, '0')}`
}

/** A janela passa da meia-noite (o fim é na manhã seguinte)? */
export function crossesMidnight(item: Pick<QuietWindowRow, 'start' | 'end'>): boolean {
  return minutesOf(item.end) < minutesOf(item.start)
}

/** Agora está dentro da janela (hora local da pessoa, fim exclusivo: a mesma conta do host)? */
export function isQuietNow(item: Pick<QuietWindowRow, 'start' | 'end'>, at: Date): boolean {
  const minute = at.getHours() * 60 + at.getMinutes()
  const start = minutesOf(item.start)
  const end = minutesOf(item.end)
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end
}

interface Draft {
  readonly id: string | undefined
  readonly start: string
  readonly end: string
}

interface Row {
  readonly item: QuietWindowRow
  readonly on: boolean
}

export function QuietWindows({ dict, windows, onSave, onDelete, now = () => new Date() }: QuietWindowsProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [off, setOff] = useState<readonly QuietWindowRow[]>([])
  const [form, setForm] = useState<Draft | undefined>(undefined)
  const [confirming, setConfirming] = useState<string | undefined>(undefined)
  const [undo, setUndo] = useState<QuietWindowRow | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const undoTimer = useRef<number | undefined>(undefined)
  const keepRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => () => { window.clearTimeout(undoTimer.current) }, [])
  useEffect(() => { if (confirming !== undefined) keepRef.current?.focus() }, [confirming])

  // A window the person switched off stays "off" on the screen even while the list still carries it (the draft wins until it is switched on again).
  const rows: readonly Row[] = [
    ...windows.map(item => ({ item, on: !off.some(draft => draft.id === item.id) })),
    ...off.filter(draft => !windows.some(item => item.id === draft.id)).map(item => ({ item, on: false })),
  ]

  /** Roda uma ação do host: a tela só muda depois que ele aceitou; recusa = "Não consegui salvar a janela". */
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setFailed(false)
    try {
      await action()
      return true
    } catch (error) {
      void error
      setFailed(true)
      return false
    } finally {
      setBusy(false)
    }
  }

  const turnOn = async (item: QuietWindowRow): Promise<void> => {
    if (onSave === undefined) return
    if (await run(() => onSave(item))) {
      setOff(list => list.filter(draft => draft.id !== item.id))
      setUndo(undefined)
    }
  }

  const turnOff = async (item: QuietWindowRow): Promise<void> => {
    if (onDelete === undefined) return
    if (!(await run(() => onDelete(item.id)))) return
    setOff(list => [...list.filter(draft => draft.id !== item.id), item])
    setUndo(item)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => { setUndo(undefined) }, UNDO_MS)
  }

  const erase = async (row: Row): Promise<void> => {
    if (row.on && onDelete !== undefined && !(await run(() => onDelete(row.item.id)))) return
    setOff(list => list.filter(draft => draft.id !== row.item.id))
    setConfirming(undefined)
  }

  const formInvalid = form !== undefined && (form.start === '' || form.end === '' || form.start === form.end)
  const submit = async (): Promise<void> => {
    if (form === undefined || onSave === undefined || formInvalid) return
    const id = form.id ?? `quiet-${Date.now().toString(36)}`
    if (await run(() => onSave({ id, label: WINDOW_LABEL, start: form.start, end: form.end }))) setForm(undefined)
  }

  const editable = onSave !== undefined && onDelete !== undefined

  return (
    <div className={styles.quietBlock} data-quiet-windows="">
      <ul className={styles.ruleList}>
        {rows.length === 0 && form === undefined && <li className={styles.ruleMeta}>{t('quiet.empty')}</li>}
        {rows.map((row) => {
          const { item } = row
          const nameId = `persona-quiet-${item.id}`
          const kind = t(crossesMidnight(item) ? 'quiet.kind.night' : 'quiet.kind.day')
          const hours = t('quiet.hours', { start: hourLabel(item.start), end: hourLabel(item.end) })
          const quietNow = row.on && isQuietNow(item, now())
          return (
            <li key={item.id} className={styles.ruleRow} data-quiet-window={item.id} data-quiet-on={row.on ? 'on' : 'off'}>
              <div className={styles.quietLine}>
                {editable && <Switch checked={row.on} disabled={busy} labelledBy={nameId} onChange={(next) => { void (next ? turnOn(item) : turnOff(item)) }} />}
                <span id={nameId} className={styles.ruleText}>{t('quiet.line', { kind, hours })}</span>
                {editable && (
                  <span className={styles.quietActions}>
                    <Button size="s" variant="ghost" disabled={busy} onClick={() => { setForm({ id: item.id, start: item.start, end: item.end }) }}>{t('quiet.edit')}</Button>
                    {/* Muse 08:51: "⋯" prometia um menu; é um botão "Apagar" que abre a confirmação na linha (some enquanto a confirmação está aberta). */}
                    {confirming !== item.id && <Button size="s" variant="ghost" disabled={busy} onClick={() => { setConfirming(item.id) }}>{t('quiet.delete')}</Button>}
                  </span>
                )}
              </div>
              {/* Muse 08:51: silêncio é descanso, não "espera você": o chip leva o tom de "Descansando" (lavanda), nunca o âmbar. */}
              {quietNow && <div className={styles.quietNow}><Chip size="s" tone="neutral" className={styles.quietNowChip} icon={<UiIcon name="clock" size={14} />}>{t('quiet.now', { end: hourLabel(item.end) })}</Chip></div>}
              {confirming === item.id && (
                <div className={styles.quietConfirm} role="group" aria-label={t('quiet.confirm')}>
                  <span className={styles.ruleText}>{t('quiet.confirm')}</span>
                  <Button size="s" variant="danger" disabled={busy} onClick={() => { void erase(row) }}>{t('quiet.delete')}</Button>
                  <Button ref={keepRef} size="s" variant="secondary" onClick={() => { setConfirming(undefined) }}>{t('quiet.keep')}</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {undo !== undefined && (
        <p className={styles.quietUndo} role="status">
          <span>{t('quiet.undoText')}</span>
          <Button size="s" variant="ghost" onClick={() => { void turnOn(undo) }}>{t('quiet.undo')}</Button>
        </p>
      )}

      {form !== undefined && (
        <form className={styles.quietForm} onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <div className={styles.quietFields}>
            <Input type="time" label={t('quiet.from')} value={form.start} onChange={(event) => { setForm({ ...form, start: event.target.value }) }} />
            <Input type="time" label={t('quiet.to')} value={form.end} onChange={(event) => { setForm({ ...form, end: event.target.value }) }} />
          </div>
          <p className={styles.ruleMeta}>{t('quiet.explain')}</p>
          {form.start !== '' && form.start === form.end && <p className={styles.ruleMeta} role="alert">{t('quiet.sameHour')}</p>}
          <div className={styles.saveRow}>
            <Button type="submit" variant="primary" size="m" loading={busy} disabled={formInvalid}>{t('quiet.save')}</Button>
            <Button size="m" variant="ghost" disabled={busy} onClick={() => { setForm(undefined) }}>{t('quiet.cancel')}</Button>
          </div>
        </form>
      )}

      {failed && <p className={styles.ruleMeta} role="alert">{t('quiet.failed')}</p>}
      {onSave !== undefined && form === undefined && (
        <div className={styles.quietAdd}>
          <Button size="s" variant="ghost" onClick={() => { setForm({ id: undefined, start: '22:00', end: '07:00' }) }}>{t('quiet.add')}</Button>
        </div>
      )}
    </div>
  )
}
