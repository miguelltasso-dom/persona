/**
 * D-121 (Keel 12/11): the record a computer of the team keeps of the personas it is LENT. Decision B: she runs her turns HERE, with this computer's own runner and account, while her project, memory and tools stay on the
 * owner's PC; so this computer holds no persona row, no project and no home book of hers — only WHERE she lives (a home with an epoch) and the sheet the owner signed (law 3), in a file of its own. It is the home port the
 * handoff protocol and the executor's `homeCheck` use on a member computer. Like the book of the owner's PC, a persona nobody told it about "lives here at epoch 0" (so an order for a later epoch is refused), and `set`
 * is a compare-and-set by epoch. A file that is damaged, or whose records say something else, is no record at all.
 *
 * Lumen's review (22:12): the sheet that comes with a bundle waits as PENDING and only a `set` that passes the compare-and-set makes it hers (an older transfer that ends late never overwrites the newer sheet); the
 * highest epoch ever seen of a persona is remembered (a floor) even after she goes back to the owner's PC; and what the owner signs carries a domain prefix and the workspace.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { HandoffError, type HomePort, type HomeView } from './handoff.ts'

/** The sheet that came with her. */
export interface LentSheet {
  readonly json: string
  readonly signature: string
  readonly signerSigningPublic: string
}

interface Record_ {
  computerId: string
  epoch: number
  state: 'active' | 'moving'
  movingTo?: string
  sheet?: LentSheet
}

const isSheet = (value: unknown): value is LentSheet => typeof value === 'object' && value !== null
  && typeof (value as LentSheet).json === 'string' && typeof (value as LentSheet).signature === 'string' && typeof (value as LentSheet).signerSigningPublic === 'string'

function valid(value: unknown): Record_ | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const item = value as Partial<Record_> & { readonly sheet?: unknown }
  if (typeof item.computerId !== 'string' || item.computerId === '' || typeof item.epoch !== 'number' || !Number.isSafeInteger(item.epoch) || item.epoch < 1) return undefined
  if (item.state !== 'active' && item.state !== 'moving') return undefined
  return {
    computerId: item.computerId, epoch: item.epoch, state: item.state,
    ...(typeof item.movingTo === 'string' && item.movingTo !== '' ? { movingTo: item.movingTo } : {}),
    ...(isSheet(item.sheet) ? { sheet: { json: item.sheet.json, signature: item.sheet.signature, signerSigningPublic: item.sheet.signerSigningPublic } } : {}),
  }
}

/**
 * What the owner signs when she is taken to another computer: WHO created her and the autonomy she asks for (so the destination checks its hosting rule on what the owner signed, never on a header), the team it is for, and her
 * sheet. Nothing else travels (D-121): no memory, no rules, no skills.
 */
export interface SheetEnvelope {
  readonly v: 1
  readonly personaId: string
  readonly workspaceId: string
  readonly creatorMemberId: string
  readonly autonomy: 'baixa' | 'media' | 'alta'
  readonly sheet: string
}

/** The domain of this signature: the key that signs it also signs requests, certificates and transfers, each with its own prefix, so none can be replayed as another. */
export const ENVELOPE_DOMAIN = 'persona/sheet-envelope/v1\n'

/** @param envelope - What the owner signs. @returns Its text. */
export function envelopeText(envelope: SheetEnvelope): string {
  return JSON.stringify({ v: 1, personaId: envelope.personaId, workspaceId: envelope.workspaceId, creatorMemberId: envelope.creatorMemberId, autonomy: envelope.autonomy, sheet: envelope.sheet })
}

/** @param json - The text of an envelope. @returns The bytes that are signed and verified (the domain prefix, then the text). */
export function envelopeBytes(json: string): Buffer {
  return Buffer.from(`${ENVELOPE_DOMAIN}${json}`, 'utf8')
}

/** @param json - The signed text of a sheet. @returns The envelope, or `undefined` when it is not exactly one. */
export function readEnvelope(json: string): SheetEnvelope | undefined {
  try {
    const value = JSON.parse(json) as Partial<SheetEnvelope>
    if (value.v !== 1 || typeof value.personaId !== 'string' || value.personaId === '' || typeof value.workspaceId !== 'string' || value.workspaceId === '') return undefined
    if (typeof value.creatorMemberId !== 'string' || value.creatorMemberId === '' || typeof value.sheet !== 'string') return undefined
    if (value.autonomy !== 'baixa' && value.autonomy !== 'media' && value.autonomy !== 'alta') return undefined
    return { v: 1, personaId: value.personaId, workspaceId: value.workspaceId, creatorMemberId: value.creatorMemberId, autonomy: value.autonomy, sheet: value.sheet }
  } catch (error) {
    void error
    return undefined
  }
}

/** The lent personas of this computer, and the home port over them. */
export class LentHomes implements HomePort {
  private records: Map<string, Record_> | undefined
  private floors: Map<string, number> | undefined
  private readonly pendingSheets = new Map<string, LentSheet>()

  /**
   * @param path - The file (its folder is created on the first write).
   * @param thisId - This computer's id (a persona nobody told it about lives here at epoch 0).
   */
  constructor(private readonly path: string, private readonly thisId: () => string) {}

  private load(): void {
    if (this.records !== undefined && this.floors !== undefined) return
    const records = new Map<string, Record_>()
    const floors = new Map<string, number>()
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as { readonly lent?: unknown; readonly floor?: unknown }
      if (typeof parsed.lent === 'object' && parsed.lent !== null && !Array.isArray(parsed.lent)) {
        for (const [personaId, value] of Object.entries(parsed.lent)) {
          const record = valid(value)
          if (record !== undefined) records.set(personaId, record)
        }
      }
      if (typeof parsed.floor === 'object' && parsed.floor !== null && !Array.isArray(parsed.floor)) {
        for (const [personaId, value] of Object.entries(parsed.floor)) if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) floors.set(personaId, value)
      }
    } catch (error) {
      void error // missing or damaged: no records
    }
    this.records = records
    this.floors = floors
  }

  private all(): Map<string, Record_> {
    this.load()
    return this.records as Map<string, Record_>
  }

  private floor(): Map<string, number> {
    this.load()
    return this.floors as Map<string, number>
  }

  /** @returns The highest epoch ever seen of a persona here (a record that is gone leaves its epoch behind). */
  private highest(personaId: string): number {
    return Math.max(this.all().get(personaId)?.epoch ?? 0, this.floor().get(personaId) ?? 0)
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, JSON.stringify({ lent: Object.fromEntries(this.all()), floor: Object.fromEntries(this.floor()) }), { encoding: 'utf8', mode: 0o600 })
    renameSync(temp, this.path)
  }

  /** @param personaId - A persona. @returns Where she lives as far as this computer knows. */
  resolve(personaId: string): HomeView {
    const record = this.all().get(personaId)
    if (record === undefined) return { computerId: this.thisId(), epoch: 0, state: 'active' }
    return { computerId: record.computerId, epoch: record.epoch, state: record.state, ...(record.movingTo === undefined ? {} : { movingTo: record.movingTo }) }
  }

  /** `moving` is durable; idempotent. */
  close(personaId: string, _why: 'moving', movingTo: string): void {
    const record = this.all().get(personaId)
    if (record === undefined) return
    record.state = 'moving'
    record.movingTo = movingTo
    this.save()
  }

  /** Reopens only a persona that is `moving`; nothing is invented for one that is not known. */
  open(personaId: string): void {
    const record = this.all().get(personaId)
    if (record?.state !== 'moving') return
    record.state = 'active'
    delete record.movingTo
    this.save()
  }

  /**
   * Compare-and-set by epoch against the highest epoch EVER seen: an equal or lower epoch is `stale-epoch` (and the sheet that waited for it is dropped). The sheet that came with the bundle becomes hers only here.
   */
  set(personaId: string, home: { readonly computerId: string; readonly epoch: number }): void {
    const pending = this.pendingSheets.get(personaId)
    this.pendingSheets.delete(personaId)
    if (!Number.isSafeInteger(home.epoch) || home.epoch < 1 || home.epoch <= this.highest(personaId)) throw new HandoffError('stale-epoch')
    const sheet = pending ?? this.all().get(personaId)?.sheet
    this.all().set(personaId, { computerId: home.computerId, epoch: home.epoch, state: 'active', ...(sheet === undefined ? {} : { sheet }) })
    this.floor().set(personaId, home.epoch)
    this.save()
  }

  /** The sheet that came with her waits here until the home is set for the epoch that carried it (an older transfer that ends late never replaces a newer sheet). */
  putSheet(personaId: string, sheet: LentSheet): void {
    this.pendingSheets.set(personaId, sheet)
  }

  /** @param personaId - A persona. @returns The sheet that is hers here (the one that waits is not hers yet). */
  sheetOf(personaId: string): LentSheet | undefined {
    return this.all().get(personaId)?.sheet
  }

  /**
   * @param creatorMemberId - A creator.
   * @param except - A persona that does not count (the one being received).
   * @returns How many of that creator's personas are lent here (read from the sheets the owner signed).
   */
  countByCreator(creatorMemberId: string, except?: string): number {
    let count = 0
    for (const [personaId, record] of this.all()) if (personaId !== except && record.sheet !== undefined && readEnvelope(record.sheet.json)?.creatorMemberId === creatorMemberId) count += 1
    return count
  }

  /** @returns The personas this computer is lent. */
  lent(): readonly string[] {
    return [...this.all().keys()]
  }

  /** She goes back to the owner's PC: her record and her sheet are deleted, and the epoch she had stays as a floor (an old bundle of hers can never come back). */
  forget(personaId: string): void {
    this.pendingSheets.delete(personaId)
    const record = this.all().get(personaId)
    if (record === undefined) return
    this.floor().set(personaId, Math.max(record.epoch, this.floor().get(personaId) ?? 0))
    this.all().delete(personaId)
    this.save()
  }
}
