/**
 * TEAM-6 (D-090): how a project reviews its deliveries — Projeto › Configurações › "Revisão antes de entregar". The policy is the PERSON's:
 * off, on in every delivery, or only in some task types; reviewed by the Coordenação, a colleague of the same function, or one persona.
 * A project nobody configured reviews EVERY delivery, by the Coordenação (the engine's `NEW_PROJECT_REVIEW`); the person turns it off.
 * The step itself (who reviews, the rounds, the seal) is the engine's (`review-step.ts`) run by `handoffs.ts`; this file only validates what
 * the person chose and shows what is in force. Stored as a screen document (`review_policy` / `v1`), no migration.
 */

import { NEW_PROJECT_REVIEW, type ReviewPolicy, type ReviewerChoice } from '@deepseek-ai/dsh-persona-engine'
import { RemoteFault } from './remote-guard.ts'
import type { ReviewPolicyView, SetReviewPolicyRequest } from './types.ts'

const TYPES_MAX = 20
const TYPE_MAX = 40

/**
 * @param stored - The policy stored for the project, or `undefined` when nobody configured it.
 * @returns What is in force, for the screen.
 */
export function reviewPolicyView(stored: ReviewPolicy | undefined): ReviewPolicyView {
  const policy = stored ?? NEW_PROJECT_REVIEW
  const reviewer = policy.reviewer
  return {
    mode: policy.mode,
    types: policy.types ?? [],
    reviewer: reviewer.kind === 'persona' ? { kind: 'persona', personaId: reviewer.personaId } : { kind: reviewer.kind },
  }
}

/**
 * Validate what the person chose, whole: a policy that is refused leaves the stored one as it was.
 * @param request - The person's choice.
 * @param inProject - Whether a persona id belongs to this project.
 * @returns The policy to store.
 */
export function readReviewPolicy(request: SetReviewPolicyRequest, inProject: (personaId: string) => boolean): ReviewPolicy {
  const mode: string = request.mode // a wire value: the type is only what a well-behaved client sends
  if (mode !== 'off' && mode !== 'all' && mode !== 'types') {
    throw new RemoteFault('invalid-payload', 'Escolha se a revisão fica desligada, em todas as entregas ou só em alguns tipos de tarefa.')
  }
  const types = [...new Set((request.types ?? []).map(type => type.replace(/\s+/gu, ' ').trim()).filter(type => type !== ''))]
  if (types.length > TYPES_MAX || types.some(type => type.length > TYPE_MAX)) {
    throw new RemoteFault('invalid-payload', `Use até ${String(TYPES_MAX)} tipos de tarefa, com até ${String(TYPE_MAX)} letras cada.`)
  }
  if (request.mode === 'types' && types.length === 0) {
    throw new RemoteFault('invalid-payload', 'Diga em quais tipos de tarefa a revisão vale.')
  }
  const reviewer = readReviewer(request.reviewer, inProject)
  return { mode: request.mode, ...(request.mode === 'types' ? { types } : {}), reviewer }
}

function readReviewer(value: SetReviewPolicyRequest['reviewer'], inProject: (personaId: string) => boolean): ReviewerChoice {
  const kind: string = value.kind // a wire value
  if (kind === 'coordination') return { kind: 'coordination' }
  if (kind === 'same-role') return { kind: 'same-role' }
  if (kind === 'persona') {
    if (typeof value.personaId !== 'string' || value.personaId === '' || !inProject(value.personaId)) {
      throw new RemoteFault('invalid-payload', 'Escolha uma pessoa da equipe deste projeto para revisar.')
    }
    return { kind: 'persona', personaId: value.personaId }
  }
  throw new RemoteFault('invalid-payload', 'Escolha quem revisa: a Coordenação, um colega da mesma função ou uma pessoa da equipe.')
}
