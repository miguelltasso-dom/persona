/** Per-panel error boundary — never leave the main area blank (Keel / UX-GUIDE). */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PersonaSurfaceError } from '../kanban/PersonaSurface.tsx'
import { pt as defaultDict } from '../locale/kanban/locales.ts'

export interface LumenPanelBoundaryProps {
  readonly children: ReactNode
  readonly onRetry?: () => void
  readonly dict?: typeof defaultDict
}

interface BoundaryState {
  readonly failed: boolean
}

export class LumenPanelBoundary extends Component<LumenPanelBoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[persona-lumen-panel]', error, info.componentStack)
  }

  private retry = (): void => {
    this.setState({ failed: false })
    this.props.onRetry?.()
  }

  override render(): ReactNode {
    if (this.state.failed) {
      const dict = this.props.dict ?? defaultDict
      return (
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={this.retry}
        />
      )
    }
    return this.props.children
  }
}

/** Wrap a slot panel so render throws surface as pt-BR error UI. */
export function withLumenPanelBoundary<P extends object>(
  Panel: (props: P) => ReactNode,
  options?: { readonly onRetry?: () => void },
): (props: P) => ReactNode {
  const Wrapped = (props: P): ReactNode => (
    <LumenPanelBoundary {...(options?.onRetry !== undefined ? { onRetry: options.onRetry } : {})}>
      {Panel(props)}
    </LumenPanelBoundary>
  )
  return Wrapped
}
