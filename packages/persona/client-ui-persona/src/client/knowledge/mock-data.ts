export type KnowledgeRecordType = 'brief' | 'constraint' | 'decision' | 'memory'
export type KnowledgeVisibility = 'team' | 'project' | 'private'

export interface KnowledgeRecord {
  readonly id: string
  readonly type: KnowledgeRecordType
  readonly title: string
  readonly excerpt: string
  readonly version: number
  readonly updatedAt: string
  readonly author: string
  readonly visibility: KnowledgeVisibility
}

export interface KnowledgeDocument {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly updatedAt: string
  readonly visibility: KnowledgeVisibility
}

export interface KnowledgeProposal {
  readonly id: string
  readonly recordTitle: string
  readonly summary: string
  readonly proposer: string
  readonly status: 'pending'
}

export const MOCK_KNOWLEDGE_RECORDS: readonly KnowledgeRecord[] = [
  {
    id: 'r1',
    type: 'brief',
    title: 'Tom de voz da agência',
    excerpt: 'Proximidade, clareza e zero jargão técnico com clientes.',
    version: 3,
    updatedAt: '03/11/2026',
    author: 'Miguel',
    visibility: 'team',
  },
  {
    id: 'r2',
    type: 'constraint',
    title: 'Sem dados de clientes fora do Cofre',
    excerpt: 'Credenciais e PII nunca entram em prompts públicos ou canais externos.',
    version: 1,
    updatedAt: '02/11/2026',
    author: 'Atlas',
    visibility: 'private',
  },
  {
    id: 'r3',
    type: 'decision',
    title: 'Stack do site: Next + Vercel',
    excerpt: 'Aprovado para landing e blog; CRM permanece separado.',
    version: 2,
    updatedAt: '01/11/2026',
    author: 'Bento',
    visibility: 'project',
  },
  {
    id: 'r4',
    type: 'memory',
    title: 'Cliente prefere reuniões às terças',
    excerpt: 'Agendar propostas e revisões preferencialmente terça 10h.',
    version: 1,
    updatedAt: '28/10/2026',
    author: 'Sol',
    visibility: 'team',
  },
]

export const MOCK_KNOWLEDGE_DOCUMENTS: readonly KnowledgeDocument[] = [
  { id: 'd1', name: 'Contrato-padrão-agência.pdf', version: 4, updatedAt: '30/10/2026', visibility: 'private' },
  { id: 'd2', name: 'Brandbook-dirD.pdf', version: 1, updatedAt: '03/11/2026', visibility: 'team' },
]

export const MOCK_KNOWLEDGE_PROPOSALS: readonly KnowledgeProposal[] = [
  {
    id: 'p1',
    recordTitle: 'Tom de voz da agência',
    summary: 'Incluir exemplo de resposta para orçamento recusado.',
    proposer: 'Nina',
    status: 'pending',
  },
]
