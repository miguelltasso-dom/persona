import type { CanvasGraphView } from '@deepseek-ai/dsh-persona-host/types'
import type { CanvasEdge, CanvasNode } from '../../canvas/mock-data.ts'

/** Host spatial graph → CanvasView props. */
export function canvasGraphToUi(graph: CanvasGraphView): {
  readonly nodes: readonly CanvasNode[]
  readonly edges: readonly CanvasEdge[]
} {
  return {
    nodes: graph.nodes.map(node => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      x: node.x,
      y: node.y,
    })),
    edges: graph.edges.map(edge => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
    })),
  }
}
