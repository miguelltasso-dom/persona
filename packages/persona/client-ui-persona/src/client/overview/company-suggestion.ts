import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ProjectScopeRequest,
  SuggestFirstRequestsRequest,
  SuggestFirstRequestsView,
  VaultRecordView,
} from '@deepseek-ai/dsh-persona-host/types'
import { companyProfileText } from '../data/company-profile.ts'
import { unwrapRemote } from '../data/remote-call.ts'

/** The two host calls the suggestion needs. The derivation is optional: an older host without it simply gives no suggestion. */
export interface CompanySuggestionRemote {
  listVaultRecords(request: ProjectScopeRequest): Promise<RemoteResult<VaultRecordView[]>>
  suggestFirstRequests?(request: SuggestFirstRequestsRequest): Promise<RemoteResult<SuggestFirstRequestsView>>
}

/**
 * The request the Visão geral offers when nothing is happening (DESIGN-01-MUSE §5.2 #09): what the person wrote about the business
 * (the first active `brief` in the Cofre), run through the host's own derivation. No profile, no derivation, a host error or a
 * failed call all give `null`, and the block is not drawn: the screen never invents an example for a company it does not know.
 *
 * @param remote The host calls (`listVaultRecords`, optional `suggestFirstRequests`).
 * @param scope The workspace and project whose Cofre holds the profile.
 * @returns The first suggested request, or null.
 */
export async function loadCompanySuggestion(
  remote: CompanySuggestionRemote,
  scope: ProjectScopeRequest,
): Promise<{ readonly title: string } | null> {
  if (remote.suggestFirstRequests === undefined) return null
  try {
    const records = await unwrapRemote(await remote.listVaultRecords(scope))
    const profile = companyProfileText(records)
    if (profile === null) return null
    const view = await unwrapRemote(await remote.suggestFirstRequests({ cofreSeed: profile }))
    const title = view.suggestions[0]
    return title === undefined || title.trim() === '' ? null : { title }
  } catch {
    // Best effort: the Visão geral is complete without the suggestion, so a failed read is "no suggestion", not an error to show.
    return null
  }
}
