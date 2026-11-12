/**
 * Who holds which access (harvest item 16, third slice). The team already knows who its colleagues are; now it also knows what each of them can
 * reach (Instagram, e-mail, the shop's WhatsApp…), so a persona who lacks an access asks the colleague who has it instead of telling the owner
 * "falta o login". Read from the grants the owner already gave (Configurações › Conectores): nothing new to fill in, nothing a model decides.
 */

import type { ConnectorGrantView } from './types.ts'

/** One persona who holds one access. */
export interface AccessHolder {
  readonly personaId: string
  readonly name: string
  readonly access: 'read' | 'write'
}

/** One access and everyone who holds it. */
export interface AccessEntry {
  readonly key: string
  /** What the owner sees: the connector's name ("Gmail", "Instagram"). */
  readonly label: string
  readonly holders: readonly AccessHolder[]
}

type GrantRow = Pick<ConnectorGrantView, 'personaId' | 'cli' | 'connectorId' | 'name' | 'access'>

/**
 * Group the grants by what they give access to.
 * @param grants - The workspace's grants.
 * @param nameOf - A persona's display name (a persona that is gone is left out).
 * @returns One entry per access, in the order of the labels; holders by name.
 */
export function accessMapOf(grants: readonly GrantRow[], nameOf: (personaId: string) => string | undefined): AccessEntry[] {
  const byKey = new Map<string, { label: string; holders: AccessHolder[] }>()
  for (const grant of grants) {
    const name = nameOf(grant.personaId)
    if (name === undefined) continue
    const key = `${grant.cli}:${grant.connectorId}`
    const entry = byKey.get(key) ?? { label: grant.name, holders: [] }
    if (!entry.holders.some(holder => holder.personaId === grant.personaId)) entry.holders.push({ personaId: grant.personaId, name, access: grant.access })
    byKey.set(key, entry)
  }
  return [...byKey.entries()]
    .map(([key, entry]): AccessEntry => ({ key, label: entry.label, holders: [...entry.holders].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/**
 * What one persona can reach, as a short list for a prompt ("Instagram, Gmail (só leitura)").
 * @param map - {@link accessMapOf}.
 * @param personaId - Whose.
 * @returns Empty when she holds nothing.
 */
export function accessLabelOf(map: readonly AccessEntry[], personaId: string): string {
  return map
    .flatMap((entry) => {
      const mine = entry.holders.find(holder => holder.personaId === personaId)
      return mine === undefined ? [] : [mine.access === 'read' ? `${entry.label} (só leitura)` : entry.label]
    })
    .join(', ')
}

/**
 * What she lacks that a colleague has: who to ask.
 * @param map - {@link accessMapOf}.
 * @param personaId - The one who lacks it.
 */
export function colleaguesWhoHold(map: readonly AccessEntry[], personaId: string): Array<{ readonly label: string; readonly names: readonly string[] }> {
  return map
    .filter(entry => !entry.holders.some(holder => holder.personaId === personaId))
    .map(entry => ({ label: entry.label, names: entry.holders.map(holder => holder.name) }))
}

/** The one rule a prompt that lists colleagues' access carries. Constant, so the prefix stays cache-stable. */
export const ACCESS_RULE = 'Se faltar um acesso a você e um colega o tem (a lista de colegas diz quem), peça a ele em vez de dizer ao dono que falta login.'
