/**
 * Um quadro de exemplo da EQUIPE REAL para o shell real — SÓ PARA CAPTURA. Sem um host com `Config.teamwork` (e uma equipe que de fato
 * passou trabalho adiante) o quadro não tem como mostrar "Pedido por", "Esperando", "Revisando" nem o "Caminho do trabalho", e a revisão
 * de design (D-074: dentro do shell completo) precisa vê-los. Opt-in, só com as DUAS chaves de dev (o mesmo padrão do Revisar):
 * `localStorage['persona.devSeed.v1'] = '1'` e `localStorage['persona.devSeed.teamwork'] = '1'`. Sem elas nada daqui roda, nenhuma chamada
 * ao host é trocada e o app real nunca vê um cartão de exemplo. Os cartões levam o selo "Exemplo" e não se movem (nunca chamam o host).
 */

import type { FlowCardModel, FlowColumnModel } from '../kanban/flow-types.ts'
import { readClientDevSeedEnabled } from '../remote/persona-dev-seed.ts'
import { personaPortrait } from '../second-brain/brain-ui-adapters.ts'
import type { TeamworkPersona } from './teamwork-context.tsx'

const KEY = 'persona.devSeed.teamwork'
const ID_PREFIX = 'dev-teamwork-'

export function teamworkDevSampleEnabled(): boolean {
  if (!readClientDevSeedEnabled()) return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** The example cards never reach the host: a drag or a "Mover para" on one of them does nothing. */
export function isTeamworkSampleCardId(id: string): boolean {
  return id.startsWith(ID_PREFIX)
}

const SAMPLE_NAMES: Readonly<Record<string, string>> = { nina: 'Nina', bento: 'Bento', atlas: 'Atlas' }

/** The faces of the example: the default team's own portraits (the capture app has Atlas, Bento, Nina… as its real roster). */
export function teamworkSamplePersona(personaId: string): TeamworkPersona | undefined {
  const name = SAMPLE_NAMES[personaId]
  if (name === undefined) return undefined
  return { name, avatarSrc: personaPortrait({ name }) }
}

/**
 * Three cards: one asked by a colleague (with a 3-step path and a note), one waiting on a colleague, one under review.
 * Only the columns the board really has are used; with no "doing" column there is nowhere honest to put them.
 */
export function teamworkSampleCards(columns: readonly FlowColumnModel[], projectId: string, projectName: string): readonly FlowCardModel[] {
  const doing = columns.find(column => column.category === 'doing')
  if (doing === undefined) return []
  const review = columns.find(column => column.category === 'review')
  const base = { projectId, projectName, teamId: 'team', teamName: 'Equipe', blocked: false, waitingEvent: false, reviewApproved: false, sample: true as const }
  const cards: FlowCardModel[] = [
    {
      ...base,
      id: `${ID_PREFIX}arte`,
      title: 'Arte da home',
      columnId: doing.id,
      column: 'in_progress',
      handoff: { role: 'asked', otherPersonaId: 'nina' },
      path: [
        { personaId: 'nina', step: 'handed' },
        { personaId: 'bento', step: 'wrote' },
        { personaId: 'atlas', step: 'reviewed' },
      ],
      note: {
        fromPersonaId: 'nina',
        done: ['Texto da home pronto e aprovado', 'Tom de voz definido'],
        needed: ['Arte do topo da página', 'Uma versão para celular'],
        decisions: ['Tom informal, sem emoji', 'Cores da marca, sem foto de banco de imagens'],
        files: ['site/home.md', 'site/marca.md'],
      },
    },
    {
      ...base,
      id: `${ID_PREFIX}texto`,
      title: 'Texto da página de contato',
      columnId: doing.id,
      column: 'in_progress',
      handoff: { role: 'waiting', otherPersonaId: 'bento' },
    },
  ]
  if (review !== undefined) {
    cards.push({
      ...base,
      id: `${ID_PREFIX}folheto`,
      title: 'Folheto de novembro',
      columnId: review.id,
      column: 'in_review',
      reviewing: { personaId: 'atlas', round: 1 },
    })
  }
  return cards
}
