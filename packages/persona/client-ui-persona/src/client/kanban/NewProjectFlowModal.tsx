/** Model picker when creating a workflow (BOARDS-SPEC §5). */

import { useState, type ReactNode } from 'react'
import { FLOW_MODELS, flowModelLabel } from '../boards/flow-models.ts'
import type { FlowModelId } from '../boards/types.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, FlowIcon, Modal } from '../primitives/index.ts'
import styles from './Kanban.module.css'

const HOST_TEMPLATE: Record<FlowModelId, 'contratacao' | 'site' | 'software' | 'marketing' | 'atendimento' | 'simples' | 'em_branco'> = {
  contratacao: 'contratacao',
  site: 'site',
  software: 'software',
  marketing: 'marketing',
  atendimento: 'atendimento',
  simples: 'simples',
  branco: 'em_branco',
}

export interface NewProjectFlowModalProps {
  readonly dict: LocaleDict
  readonly onClose: () => void
  readonly onSelectTemplate: (template: 'contratacao' | 'site' | 'software' | 'marketing' | 'atendimento' | 'simples' | 'em_branco') => void | Promise<void>
}

export function NewProjectFlowModal({ dict, onClose, onSelectTemplate }: NewProjectFlowModalProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [selected, setSelected] = useState<FlowModelId>('site')

  return (
    <Modal
      open
      size="l"
      title={t('newProject.title')}
      description={t('newProject.body')}
      closeLabel={t('editor.discard')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('editor.discard')}</Button>
          <Button
            variant="primary"
            onClick={() => { void onSelectTemplate(HOST_TEMPLATE[selected]) }}
          >
            {t('newProject.confirm')}
          </Button>
        </>
      )}
    >
      <div className={styles.modelGrid}>
        {FLOW_MODELS.map(model => (
          <Card
            key={model.id}
            as="article"
            padding="m"
            interactive
            className={styles.modelCard}
            role="button"
            tabIndex={0}
            aria-pressed={selected === model.id}
            onClick={() => { setSelected(model.id) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelected(model.id)
              }
            }}
          >
            <FlowIcon model={model.id} size={48} />
            <span className={styles.columnTitle}>{flowModelLabel(dict, model.id)}</span>
          </Card>
        ))}
      </div>
    </Modal>
  )
}
