export type CanvasNodeKind = 'persona' | 'task' | 'topic' | 'decision'

export interface CanvasNode {
  readonly id: string
  readonly kind: CanvasNodeKind
  readonly label: string
  readonly x: number
  readonly y: number
}

export interface CanvasEdge {
  readonly id: string
  readonly from: string
  readonly to: string
}

export const MOCK_CANVAS_NODES: readonly CanvasNode[] = [
  { id: 'n-atlas', kind: 'persona', label: 'Atlas', x: 80, y: 120 },
  { id: 'n-task', kind: 'task', label: 'Hero landing', x: 260, y: 80 },
  { id: 'n-dec', kind: 'decision', label: 'Stack Next', x: 260, y: 200 },
]

export const MOCK_CANVAS_EDGES: readonly CanvasEdge[] = [
  { id: 'e1', from: 'n-atlas', to: 'n-task' },
  { id: 'e2', from: 'n-task', to: 'n-dec' },
]
