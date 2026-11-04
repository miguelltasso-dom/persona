import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { DEFAULT_SECTORS } from './default-sectors.ts'

export interface GovernancePickOption {
  readonly id: string
  readonly label: string
}

export function buildSectorPicklist(dict: LocaleDict): readonly GovernancePickOption[] {
  const t = (key: string) => bindLocale(dict, key)
  return DEFAULT_SECTORS.map(row => ({ id: row.id, label: t(row.labelKey) }))
}

export function buildMemberPicklist(
  dict: LocaleDict,
  members: readonly { readonly id: string; readonly name: string }[],
  selfMemberId: string,
): readonly GovernancePickOption[] {
  const t = (key: string) => bindLocale(dict, key)
  if (members.length === 0) {
    return [{ id: selfMemberId, label: t('editor.memberSelf') }]
  }
  return members.map(row => ({
    id: row.id,
    label: row.id === selfMemberId ? t('editor.memberSelf') : row.name,
  }))
}
