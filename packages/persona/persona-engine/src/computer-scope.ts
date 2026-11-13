/* oxlint-disable typescript/no-unnecessary-condition, typescript/no-unnecessary-boolean-literal-compare -- every input here crosses a trust boundary (signed card, local record, wire): the fail-closed checks must not assume the static types. */
/**
 * M9 / D-117: o modelo "Só eu / Da equipe" e a REGRA DURA (a matriz D2 do Lumen), como funções puras.
 *
 * Quem chama: o EXECUTOR (a ponte do desktop que move o mouse) antes de CADA passo, via `createComputerScopeGuard`;
 * o host em `createPersona` / `updatePersona` / `HomeRecord` via `validatePersonaComputerConfig`; o cadastro do D-116 via
 * `canEnrollComputerAsTeam`. O tipo do computador vem da MÁQUINA (`readComputerKind` do registro local), nunca da ficha, da casa
 * declarada pela persona, do cliente ou do roster que chega pela rede. Tudo falha FECHADO: dado estranho nunca permite.
 */

export type PersonaAudience = 'private' | 'team'
export type ComputerKind = 'personal' | 'team'

/** O que a persona (ficha assinada) declara. */
export interface ComputerUsePersona {
  readonly id: string
  readonly audience: PersonaAudience
  readonly creatorId: string
  /** A casa da persona (HomeRecord assinado, D-116): o id do computador onde ela MORA. Ausente/vazio = `not-home` (falha fechada). */
  readonly homeComputerId: string
  /** "Pode mexer no computador": permissão explícita, desligada por padrão (D-117 regra 2). */
  readonly computerUse: boolean
}

/**
 * O que o PRÓPRIO computador guarda sobre si: é o registro LOCAL desta máquina (versão e assinatura conferidas por quem o lê),
 * NUNCA o certificado ou o roster como chegou da rede (um roster antigo ou forjado não pode ligar a capacidade nem mudar o tipo).
 */
export interface ComputerDescriptor {
  /** Id deste computador (o mesmo do `homeComputerId` das personas que moram aqui). */
  readonly computerId: string
  readonly kind: ComputerKind
  readonly ownerId: string
  /** `caps.computerUse` do certificado do computador da equipe, ligado por quem o cadastrou. */
  readonly teamComputerUse: boolean
}

export type ComputerScopeReason =
  | 'invalid'
  | 'unreadable'
  | 'computer-use-off'
  | 'not-home'
  | 'not-owner'
  | 'private-persona-on-team-pc'
  | 'team-persona-on-personal-pc'
  | 'team-computer-not-enabled'
  | 'commander-not-allowed'

export type ComputerScopeDecision = { readonly allow: true } | { readonly allow: false; readonly reason: ComputerScopeReason }

const deny = (reason: ComputerScopeReason): ComputerScopeDecision => ({ allow: false, reason })
const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.length > 0
const isAudience = (v: unknown): v is PersonaAudience => v === 'private' || v === 'team'
const isKind = (v: unknown): v is ComputerKind => v === 'personal' || v === 'team'

/**
 * A matriz D2. Ordem importante: a regra dura (equipe nunca em PC pessoal) vale ANTES de qualquer lista ou permissão,
 * inclusive com `computerUse` ligado, o dono comandando e o comandante na lista.
 */
export function decideComputerUse(input: {
  readonly persona: ComputerUsePersona
  readonly computer: ComputerDescriptor
  readonly commanderId: string
  readonly allowedIds: readonly string[]
}): ComputerScopeDecision {
  const { persona, computer, commanderId, allowedIds } = input
  if (
    persona === null || typeof persona !== 'object' ||
    computer === null || typeof computer !== 'object' ||
    !isAudience(persona.audience) || !isKind(computer.kind) ||
    !nonEmpty(commanderId) || !nonEmpty(persona.creatorId) || !nonEmpty(computer.ownerId) ||
    !Array.isArray(allowedIds)
  ) {
    return deny('invalid')
  }
  if (persona.computerUse !== true) return deny('computer-use-off')
  // Lumen P1: a persona só mexe no computador onde ela MORA. Casa diferente OU ausente = recusa, ANTES de qualquer lista.
  if (!nonEmpty(persona.homeComputerId) || !nonEmpty(computer.computerId) || persona.homeComputerId !== computer.computerId) {
    return deny('not-home')
  }

  if (persona.audience === 'team') {
    if (computer.kind !== 'team') return deny('team-persona-on-personal-pc') // REGRA 1: nunca, por nenhum caminho
    if (computer.teamComputerUse !== true) return deny('team-computer-not-enabled')
    if (!allowedIds.includes(commanderId)) return deny('commander-not-allowed')
    return { allow: true }
  }

  // audience === 'private' ("Só eu")
  if (computer.kind !== 'personal') return deny('private-persona-on-team-pc') // decisão do Keel (D9.1)
  if (persona.creatorId !== computer.ownerId || commanderId !== computer.ownerId) return deny('not-owner')
  return { allow: true }
}

/** A cada passo o executor lê o estado ATUAL; falha de leitura = recusa (nunca permite no escuro). */
export function createComputerScopeGuard(input: {
  readonly persona: () => ComputerUsePersona
  readonly computer: () => ComputerDescriptor
  readonly allowedIds: () => readonly string[]
}): { check(commanderId: string): ComputerScopeDecision } {
  return {
    check(commanderId) {
      try {
        return decideComputerUse({
          persona: input.persona(),
          computer: input.computer(),
          commanderId,
          allowedIds: input.allowedIds(),
        })
      } catch {
        return deny('unreadable')
      }
    },
  }
}

/** Registro local da máquina (gravado por `enrollThisComputer` feito NELA). Nasce vazio = pessoal. */
export interface ComputerEnrollmentRecord {
  readonly enrolledAsTeam?: boolean
  readonly confirmedByComputerOwner?: boolean
  readonly confirmedByTeamOwner?: boolean
}

/** `team` só com os DOIS consentimentos (dono do PC e dono da equipe), todos `=== true`. Qualquer outra coisa: `personal`. */
export function readComputerKind(record: ComputerEnrollmentRecord | undefined): ComputerKind {
  if (record === undefined || record === null || typeof record !== 'object') return 'personal'
  return record.enrolledAsTeam === true && record.confirmedByComputerOwner === true && record.confirmedByTeamOwner === true
    ? 'team'
    : 'personal'
}

export type ConfigValidation = { readonly ok: true } | { readonly ok: false; readonly reason: ComputerScopeReason }

/**
 * O host recusa a combinação proibida ao criar/alterar a persona ou a casa dela (a tela só esconde a opção).
 * Privada: só o PC pessoal do próprio criador, com computerUse ligado ou não. Da equipe sem `computerUse`: mora onde o D-116 mandar.
 */
export function validatePersonaComputerConfig(input: { readonly persona: ComputerUsePersona; readonly home: ComputerDescriptor }): ConfigValidation {
  const { persona, home } = input
  if (!isAudience(persona?.audience) || !isKind(home?.kind)) return { ok: false, reason: 'invalid' }
  // Lumen 15:15 (3): a persona PRIVADA só mora no PC PESSOAL do PRÓPRIO criador, com computerUse ligado OU desligado
  // (o que ela recebe numa DM fica decifrado no banco do PC onde roda).
  if (persona.audience === 'private') {
    if (home.kind !== 'personal') return { ok: false, reason: 'private-persona-on-team-pc' }
    if (!nonEmpty(persona.creatorId) || persona.creatorId !== home.ownerId) return { ok: false, reason: 'not-owner' }
    return { ok: true }
  }
  // Da equipe: desligado = ok em qualquer PC (D-116: pode morar no PC pessoal do criador, só não mexe); ligado + PC pessoal = recusado.
  if (persona.computerUse !== true) return { ok: true }
  if (home.kind === 'personal') return { ok: false, reason: 'team-persona-on-personal-pc' }
  return { ok: true }
}

/** "Levar para outro computador" (D-116): a permissão não viaja; o dono do computador novo liga de novo. */
export function personaAfterMove(persona: ComputerUsePersona): ComputerUsePersona {
  return { ...persona, computerUse: false }
}

/** D5: um PC com persona "Só eu" que mexe no computador não vira da equipe sem desligar antes. */
export function canEnrollComputerAsTeam(input: { readonly personasHere: readonly ComputerUsePersona[] }): ConfigValidation | { readonly ok: false; readonly reason: 'private-computer-persona-on' } {
  return input.personasHere.some(p => p.audience === 'private' && p.computerUse === true)
    ? { ok: false, reason: 'private-computer-persona-on' }
    : { ok: true }
}
