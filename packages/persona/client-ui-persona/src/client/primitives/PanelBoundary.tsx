import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Button } from './Button.tsx'
import { EmptyState } from './Feedback.tsx'
import { UiIcon } from './icons.tsx'

export interface ErrorStateProps {
  readonly title: ReactNode
  readonly body?: ReactNode
  /** Retry label; omit to hide the button. */
  readonly retryLabel?: string | undefined
  readonly onRetry?: (() => void) | undefined
  /** Technical detail shown small and selectable (never the only text). */
  readonly detail?: string | undefined
}

/** Honest error state: Brush "empty-error" art + human title + one retry action (never a blank panel). */
export function ErrorState({ title, body, retryLabel, onRetry, detail }: ErrorStateProps): ReactNode {
  return (
    <div role="alert">
      <EmptyState
        illustration={ILLUSTRATIONS['empty-error']}
        title={title}
        body={(
          <>
            {body}
            {detail !== undefined && <code style={{ display: 'block', marginTop: 8, fontSize: 12, opacity: 0.7, userSelect: 'text' }}>{detail}</code>}
          </>
        )}
        action={retryLabel !== undefined && onRetry !== undefined ? (
          <Button variant="primary" icon={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />} onClick={onRetry}>{retryLabel}</Button>
        ) : undefined}
      />
    </div>
  )
}

export interface PanelBoundaryProps {
  readonly children: ReactNode
  /** Panel name for logs ("kanban", "connections"…). */
  readonly panel: string
  /** pt-BR copy; defaults are used when omitted. */
  readonly title?: string
  readonly body?: string
  readonly retryLabel?: string
}

interface PanelBoundaryState {
  readonly error: Error | null
  readonly attempt: number
}

/** Error boundary per main panel: a render crash shows ErrorState + "Tentar de novo" instead of a blank area. */
export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  override state: PanelBoundaryState = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<PanelBoundaryState> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[persona] painel "${this.props.panel}" falhou ao renderizar`, error, info.componentStack)
  }

  private readonly retry = (): void => {
    this.setState(prev => ({ error: null, attempt: prev.attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div style={{ height: '100%', overflowY: 'auto', display: 'grid', placeItems: 'center' }}>
          <ErrorState
            title={this.props.title ?? 'Esta tela tropeçou'}
            body={this.props.body ?? 'Algo deu errado ao montar esta tela. Seus dados estão salvos — tente de novo.'}
            retryLabel={this.props.retryLabel ?? 'Tentar de novo'}
            onRetry={this.retry}
            detail={this.state.error.message}
          />
        </div>
      )
    }
    return <div key={this.state.attempt} style={{ display: 'contents' }}>{this.props.children}</div>
  }
}
