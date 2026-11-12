/**
 * "Seus números" (colheita item 19a) · o modal "Fixar na Visão geral" (480 px): o nome do número, quando atualizar ("A cada hora" · "Todo dia às 8h"),
 * o aviso opcional "Avisar quando cair mais de 20%" (só para número) e o teste. "Testar agora" (40 px) é OBRIGATÓRIO: o resultado real aparece no
 * próprio modal e só então "Fixar" (primário, 48 px) é liberado. O host também recusa fixar sem teste: a trava não depende desta tela.
 */

import { useId, useState, type ReactNode } from 'react'
import { Button, ChoiceCards, Input, Modal, Switch } from '../primitives/index.ts'
import { IndicatorBody } from './IndicatorBody.tsx'
import type { IndicatorOfferUi, IndicatorTestUi } from './indicators-model.ts'
import { itext } from './indicators-text.ts'
import type { IndicatorsBinding } from './use-indicators.tsx'
import styles from './PinIndicatorModal.module.css'

/** The default of the drop alert (the host's `INDICATOR_ALERT_DEFAULT_PCT`). */
export const ALERT_DEFAULT_PCT = 20

export interface PinIndicatorModalProps {
  readonly offer: IndicatorOfferUi
  readonly binding: IndicatorsBinding
  readonly onClose: () => void
  /** Called after the number was pinned. */
  readonly onPinned?: (() => void) | undefined
}

type TestState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'testing' }
  | { readonly phase: 'ok'; readonly result: IndicatorTestUi }
  | { readonly phase: 'failed'; readonly message: string }

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback
}

export function PinIndicatorModal({ offer, binding, onClose, onPinned }: PinIndicatorModalProps): ReactNode {
  const alertLabelId = useId()
  const [name, setName] = useState(offer.name)
  const [schedule, setSchedule] = useState<'hourly' | 'daily'>('daily')
  const [alertOn, setAlertOn] = useState(false)
  const [test, setTest] = useState<TestState>({ phase: 'idle' })
  const [pinning, setPinning] = useState(false)
  const [pinError, setPinError] = useState<string | undefined>(undefined)
  const canAlert = offer.data.kind === 'numero'

  const runTest = async (): Promise<void> => {
    setTest({ phase: 'testing' })
    setPinError(undefined)
    try {
      setTest({ phase: 'ok', result: await binding.test(offer.messageId) })
    } catch (error: unknown) {
      setTest({ phase: 'failed', message: messageOf(error, itext('modal.testFailed')) })
    }
  }

  const pin = async (): Promise<void> => {
    if (test.phase !== 'ok' || pinning) return
    setPinning(true)
    setPinError(undefined)
    try {
      await binding.pin({ testId: test.result.testId, name: name.trim(), schedule, ...(canAlert && alertOn ? { alertDropPct: ALERT_DEFAULT_PCT } : {}) })
      onPinned?.()
      onClose()
    } catch (error: unknown) {
      setPinError(messageOf(error, itext('modal.pinFailed')))
      setPinning(false)
    }
  }

  const tested = test.phase === 'ok'
  return (
    <Modal
      open
      title={itext('modal.title')}
      eyebrow={itext('modal.eyebrow')}
      closeLabel={itext('modal.close')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" size="m" onClick={onClose}>{itext('modal.cancel')}</Button>
          <Button variant="primary" size="l" disabled={!tested || name.trim() === ''} loading={pinning} onClick={() => { void pin() }}>
            {itext('modal.pin')}
          </Button>
        </>
      )}
    >
      <div className={styles.form} data-pin-modal>
        <Input label={itext('modal.name')} value={name} maxLength={60} onChange={(event) => { setName(event.target.value) }} />
        <ChoiceCards<'hourly' | 'daily'>
          legend={itext('modal.when')}
          name="indicator-schedule"
          value={schedule}
          onChange={setSchedule}
          options={[
            { id: 'hourly', title: itext('modal.hourly'), body: itext('modal.hourlyBody') },
            { id: 'daily', title: itext('modal.daily'), body: itext('modal.dailyBody') },
          ]}
        />
        {canAlert && (
          <div className={styles.switchRow}>
            <span id={alertLabelId} className={styles.switchLabel}>{itext('modal.alert', { pct: ALERT_DEFAULT_PCT })}</span>
            <Switch checked={alertOn} onChange={setAlertOn} labelledBy={alertLabelId} />
          </div>
        )}
        <div className={styles.testRow}>
          <Button variant="secondary" size="m" loading={test.phase === 'testing'} onClick={() => { void runTest() }}>
            {test.phase === 'testing' ? itext('modal.testing') : itext('modal.test')}
          </Button>
          {!tested && <p className={styles.tip}>{itext('modal.tip')}</p>}
        </div>
        {test.phase === 'ok' && (
          <div className={styles.result} role="status" data-pin-test="ok">
            <p className={styles.resultTitle}>{itext('modal.result')}</p>
            <IndicatorBody data={test.result.data} />
          </div>
        )}
        {test.phase === 'failed' && <p className={styles.error} role="alert" data-pin-test="failed">{test.message}</p>}
        {pinError !== undefined && <p className={styles.error} role="alert">{pinError}</p>}
      </div>
    </Modal>
  )
}
