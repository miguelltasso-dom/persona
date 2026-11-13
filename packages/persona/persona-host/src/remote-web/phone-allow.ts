/**
 * MARCO M5 (Lumen D1/D2): what a PAIRED device may call. ONE source — the Gateway policy (`registerPolicy('paired', …)`) and the RemoteGuard funnel (`remote` mode) both read this — and it is a list of
 * the PERMITTED: a new Remote is born REFUSED for a phone until somebody adds it here (and its test). The refusal has a stable code, {@link REMOTE_NOT_ALLOWED}.
 *
 * The list is the Casa the phone shows (channels, threads, people, personas with presence, approvals, the board in read-only, "Esta noite", "Espera você"), what it writes as the member of the device
 * (messages, reactions, "segure" approvals, read marks), the computer-use follow and Stop (D-117), and — for a device whose member is the OWNER of the team — listing and revoking devices. NEVER: the Cofre
 * and every secret, the PC's browser, computer-use clicks/keys/resume/take-control, folders and files on the PC's disk, updating or quitting the app, pairing (but revoking), the Station, the engine and
 * accounts, creating or changing members/channels/personas/projects, moving cards, undo.
 */

/** The stable code of a refusal (the Gateway's `explain()` and the funnel say the same word). */
export const REMOTE_NOT_ALLOWED = 'remote-not-allowed'

/** Reads (the Casa). Names are the PersonaHost's `@Remote` names. */
export const PHONE_READS: readonly string[] = [
  'ping', 'listTeam', 'listPersonas', 'listProjects', 'listChannels', 'getChannelLayout', 'getChannelHeader', 'listDms', 'listMessages', 'followMessages', 'openTaskConversation', 'listTasks',
  'listApprovals', 'listBoards', 'getProjectBoard', 'getOverview', 'getOverviewNow', 'getWhileAway', 'listTurnActivity', 'getOrgChart', 'getPersonaCard', 'getAutonomy',
  'getEngineStatus', 'listDailySummaries', 'search', 'listAsideAsks', 'getAsideAsk',
  // M5/D-116/D-117 (planned: the Remotes below arrive with Flint, Zinc and this part)
  'getNightSummary', 'listWaitingForYou', 'listComputers', 'getPersonaHome', 'listComputerRuns', 'getComputerRun', 'followComputerRun', 'getComputerReplay',
]

/**
 * Reads that were on the first list (Cobalt's, vetted by Lumen's sweep as a non-owner) and are WITHHELD on a closer reading of their types (Gauge 15:53). Each carries why, and what brings it back. They are
 * denied for the phone, and the completeness spec counts them as reviewed-and-denied.
 */
export const PHONE_WITHHELD: Readonly<Record<string, string>> = {
  getOfficialQuota: 'its view carries accountId, accountLabel and detail, and the label is the local part of the account e-mail: a member must not see which account the owner pays with. Back when a view with provider and windows only exists.',
  getTurnContext: 'its view returns UsedContextRecord[] with the BODY of records that entered the turn, Cofre records included (restricted/required): Lumen D2 says never the Cofre. Back when the phone gets the records with no body (or only the non-secret kinds).',
  getOnboarding: 'the remote client reads /remote/me instead; the Remote runs before any tenant exists.',
}

/** Writes, always AS THE MEMBER OF THE DEVICE (the host takes the author from the caller, never from the request). */
export const PHONE_WRITES: readonly string[] = [
  'postMessage', 'createDm', 'reactToMessage', 'unreactToMessage', 'decideApproval', 'dismissWhileAway', 'markVisit', 'markTaskThreadRead', 'answerAttention', 'remindAtPc', 'stopComputerRun',
]

/** Allowed ONLY for a device whose member is the owner of the team (lose the phone, revoke it from the notebook). Issuing codes and approving requests stay on the PC. */
export const OWNER_DEVICE_ONLY: readonly string[] = ['listDevices', 'revokeDevice']

/**
 * Names in the lists above that are not (yet) `@Remote`s of the host: the part that adds them removes them from here, and the completeness spec fails if one of them already exists (so the list is
 * never carrying a stale "planned"). Empty on the day everything has landed.
 */
export const PHONE_PLANNED: readonly string[] = [
  'getNightSummary', 'listWaitingForYou', 'remindAtPc', 'listComputerRuns', 'getComputerRun', 'followComputerRun', 'getComputerReplay', 'stopComputerRun',
]

/**
 * What can NEVER be added to the lists above, by name: a spec fails if an allowed name matches (Lumen D2). Not an allow rule — a tripwire against the list growing a dangerous member.
 */
export const PHONE_NEVER: readonly RegExp[] = [
  /cofre/iu, /secret/iu, /credential/iu, /password|senha/iu, /^browser/iu, /^station/iu, /backup|restore|wal|checkpoint/iu, /diagnos/iu, /^(pick|choose)Directory|projectRoot|setProjectRoot|listFiles|ingest|replace.*Document|deleteVaultDocument/iu,
  /^(update|install|quit|restart)App|^applyUpdate/iu, /^(issue|approve|reject)(Device|Pair|Computer)|pairStation|^setRemoteAccess|^getRemoteAccess/iu, /^(move|create|delete|update|set|remove)(Ticket|Sprint|Workflow|Project|Workspace|Member|Channel|Persona)/iu,
  /^undo/iu, /^teach|^brain|^draftPersona|^completeOnboarding|^setPersona|^setAutonomy|^revokeConnector|^saveConnector|^connect/iu, /click|keyboard|typeText|takeControl|resumeComputer|startComputer/iu,
]

const ALLOWED = new Set<string>([...PHONE_READS, ...PHONE_WRITES])
const OWNER_ONLY = new Set<string>(OWNER_DEVICE_ONLY)

/** Who is asking, as the caller context knows it. */
export interface PhoneAsker {
  /** Whether the device's member is the OWNER of the team. */
  readonly memberIsOwner: boolean
}

/**
 * May a paired device call this Remote?
 * @param method - The Remote's name.
 * @param asker - Who the device speaks for.
 * @returns `true` only for a name on the permitted lists (and the owner-only ones for an owner's device).
 */
export function phoneAllows(method: string, asker: PhoneAsker): boolean {
  if (ALLOWED.has(method)) return true
  return asker.memberIsOwner && OWNER_ONLY.has(method)
}
