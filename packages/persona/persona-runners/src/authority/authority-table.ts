/**
 * COLHEITA item 8: the ONE authority table. Who a run acts for (`person`, `routine`, `unattended`) times what an action is (`ActionKind`) gives exactly one verdict
 * (`allow`, `ask`, `deny`). Every deterministic gate of the product (the command judge, the file-write confinement, the CLI fail-closed rules) reads this table; none of
 * them keeps a verdict of its own. Pure: no I/O, no model, no clock.
 *
 *  - `person`: the person asked, directly or through a colleague. Within the persona's grants it may act; what leaves the machine or destroys waits for the person.
 *  - `routine`: a scheduled run. Nobody is looking at it, so nothing that needs a person's decision can be asked: it is refused.
 *  - `unattended`: a run nobody is behind (woken by a report, a note or an event). Same limits as a routine.
 *
 * `ask` never means "run it": it means "stop and let the person decide on a card". Where there is no one to ask, the caller turns `ask` into `deny`
 * (`verdictFor` already does it for `routine` and `unattended`).
 */

import type { ActionClass } from '../resolve/tool-action.ts'
import type { ToolLevel } from '../resolve/tool-level.ts'

/** Who a run acts for. */
export type AuthorityKind = 'person' | 'routine' | 'unattended'

/** Every authority, in a stable order (tests and screens iterate it). */
export const AUTHORITY_KINDS: readonly AuthorityKind[] = ['person', 'routine', 'unattended']

/**
 * What an action is, from the point of view of the damage it can do.
 *  - `read`: looks, changes nothing.
 *  - `draft-change`: creates or changes files INSIDE the draft of the task (the person reviews before anything reaches the real folder).
 *  - `interact`: acts inside a page of the browser the person lent the persona (click, type, drag). Only a run with a person behind it may: nobody watches a routine, and a page can steer a model.
 *  - `outside-change`: changes something OUTSIDE the draft.
 *  - `send`: something leaves the machine (network, push, publish, deploy, mail).
 *  - `delete`: destroys something the draft does not own.
 *  - `secret`: reads credentials, keys, tokens or the product's own vault.
 *  - `never`: takes over the machine or the product (privilege, encoded code, registry, killing processes, remote code).
 *  - `unknown`: the command cannot be read plainly (substitution, a script file, an interpreter, a name the table does not list).
 */
export type ActionKind = 'read' | 'draft-change' | 'interact' | 'outside-change' | 'send' | 'delete' | 'secret' | 'never' | 'unknown'

/** Every kind, ordered from the harmless to the worst (the order {@link worstOf} uses). */
export const ACTION_KINDS: readonly ActionKind[] = ['read', 'draft-change', 'interact', 'unknown', 'delete', 'send', 'outside-change', 'secret', 'never']

/** What the gate answers. */
export type Verdict = 'allow' | 'ask' | 'deny'

/**
 * The table. `ask` in the `person` column is what turns into an approval card; the same cell for the other authorities is `deny`.
 * Writing outside the draft, reading secrets and the `never` list are refused for everybody: no card can lift them.
 */
const TABLE: Readonly<Record<ActionKind, Readonly<Record<AuthorityKind, Verdict>>>> = {
  'read': { person: 'allow', routine: 'allow', unattended: 'allow' },
  'draft-change': { person: 'allow', routine: 'allow', unattended: 'allow' },
  'interact': { person: 'allow', routine: 'deny', unattended: 'deny' },
  'unknown': { person: 'ask', routine: 'deny', unattended: 'deny' },
  'delete': { person: 'ask', routine: 'deny', unattended: 'deny' },
  'send': { person: 'ask', routine: 'deny', unattended: 'deny' },
  'outside-change': { person: 'deny', routine: 'deny', unattended: 'deny' },
  'secret': { person: 'deny', routine: 'deny', unattended: 'deny' },
  'never': { person: 'deny', routine: 'deny', unattended: 'deny' },
}

/**
 * The raw cell of the table.
 * @param authority - Who the run acts for.
 * @param action - What the action is.
 */
export function authorityCell(authority: AuthorityKind, action: ActionKind): Verdict {
  return TABLE[action][authority]
}

/**
 * The verdict for one action of a run, after the persona's own shell grant.
 *  - shell `none`: no command runs at all (`deny`);
 *  - shell `read`: only `read` runs; anything else is refused outright (a `read` persona has nobody to ask: it never asked for more);
 *  - shell `write`: the table decides.
 * @param authority - Who the run acts for.
 * @param action - What the action is.
 * @param shell - The persona's shell grant (`write` when the caller does not restrict).
 */
export function verdictFor(authority: AuthorityKind, action: ActionKind, shell: ToolLevel = 'write'): Verdict {
  if (shell === 'none') return 'deny'
  if (shell === 'read') return action === 'read' ? 'allow' : 'deny'
  return authorityCell(authority, action)
}

/**
 * The worst of several kinds (a command line of three commands is as bad as its worst command).
 * @param kinds - Kinds found in one command line. Empty ⇒ `unknown` (nothing was read, nothing is proved).
 */
export function worstOf(kinds: readonly ActionKind[]): ActionKind {
  if (kinds.length === 0) return 'unknown'
  let worst: ActionKind = 'read'
  for (const kind of kinds) {
    if (ACTION_KINDS.indexOf(kind) > ACTION_KINDS.indexOf(worst)) worst = kind
  }
  return worst
}

/** What else is true of a run besides who it acts for. */
export interface RunOrigin {
  /** The run started from an e-mail the person RECEIVED: its text was written by someone else. */
  readonly viaEmail?: boolean
  /** Who the run acts for (default `person`). */
  readonly authority?: AuthorityKind
}

/**
 * The origin rules for what may run without asking. `pay` and `delete` are never pre-allowed anywhere.
 *  - A run that started from a received e-mail NEVER sends on its own: whatever the persona's standing permission pre-allows, `send` is taken out, so a send always reaches the person's
 *    card (the exact call, once).
 *  - An UNATTENDED run (the persona's own initiative, a plan of the Coordenação, an external event) never has `send`, `pay` or `delete` pre-allowed either, waiver or not (Keel, 12/11): it
 *    needs the person's card. The owner's "não perguntar de novo" is consent to what she asks for or schedules herself, not to what the team starts by itself.
 *  - A routine the owner SCHEDULED keeps her standing permission: it is her explicit consent ("mande o resumo toda segunda por e-mail").
 * @param classes - The connector action classes the persona may do without asking.
 * @param origin - What started the run.
 * @returns The classes still allowed without asking.
 */
export function preAllowAfterOrigin(classes: readonly ActionClass[], origin: RunOrigin = {}): ActionClass[] {
  const unattended = origin.authority === 'unattended'
  return classes.filter(cls => !(origin.viaEmail === true && cls === 'send') && !(unattended && (cls === 'send' || cls === 'pay' || cls === 'delete')))
}

/**
 * The same cell for every authority, for docs and screens ("who may do what").
 * @param action - What the action is.
 */
export function authorityRow(action: ActionKind): Readonly<Record<AuthorityKind, Verdict>> {
  return TABLE[action]
}
