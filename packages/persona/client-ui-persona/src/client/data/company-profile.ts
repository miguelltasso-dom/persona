import type { VaultRecordView } from '@deepseek-ai/dsh-persona-host/types'

/**
 * What the person wrote about the business: the first active `brief` of the Cofre that has words in it. An empty one (the old
 * "Descrever a empresa" button used to leave one) is not a profile. One rule for every screen that reads it (Visão geral, Memória).
 *
 * @param records The Cofre records of the project.
 * @returns The profile text, trimmed, or null when nobody described the company yet.
 */
export function companyProfileText(records: readonly Pick<VaultRecordView, 'kind' | 'status' | 'body' | 'factKey'>[]): string | null {
  // The company Ficha (CNPJ…) is a brief too (`company.card`): it is DATA the team reads, never the owner's description of the business.
  const profile = records.find(record => record.kind === 'brief' && record.status === 'active' && record.factKey !== 'company.card' && record.body.trim() !== '')
  return profile === undefined ? null : profile.body.trim()
}

/**
 * The first real lines of the profile, as written (markdown heading marks and list bullets are not part of the sentence).
 *
 * @param text The profile text.
 * @param max How many lines to keep.
 * @returns Up to `max` non-empty lines.
 */
export function companyProfileLines(text: string | null, max = 3): readonly string[] {
  if (text === null) return []
  return text
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+)/u, '').trim())
    .filter(line => line !== '')
    .slice(0, max)
}

/** A fresh id per description: the Cofre keeps every version of a record id, so rewriting an id that exists would be refused. */
export function newCompanyBriefId(now: number = Date.now()): string {
  return `company-brief-${now.toString(36)}`
}
