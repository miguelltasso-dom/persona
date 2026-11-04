/**
 * Multiple accounts per provider (WAVE2 §3). Policy is explicit, never silent.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { jsonValue, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** One connected account of the person. */
export interface ProviderAccount {
  readonly id: string
  readonly workspaceId: string
  readonly provider: string
  readonly label: string
  readonly homeDir: string
  readonly status: 'ok' | 'limit' | 'error' | 'checking'
  readonly createdAt: string
  readonly updatedAt: string
}

/** Rotation policy for one provider. */
export interface AccountPolicy {
  readonly id: string
  readonly workspaceId: string
  readonly scope: 'workspace' | 'persona'
  readonly scopeId: string
  readonly provider: string
  readonly mode: 'fixed' | 'next' | 'split' | 'ask'
  readonly accountIds: readonly string[]
  readonly updatedAt: string
}

/**
 * Persist provider accounts and explicit rotation policy.
 */
export class AccountRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 14).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param input - New account.
   */
  create(input: {
    id: string
    workspaceId: string
    provider: string
    label: string
    homeDir?: string
    status?: ProviderAccount['status']
  }): ProviderAccount {
    const label = input.label.trim()
    if (label === '' || input.provider.trim() === '') throw new StoreError('invalid-input', 'label')
    const now = this.now()
    const row: ProviderAccount = {
      id: input.id,
      workspaceId: input.workspaceId,
      provider: input.provider.trim(),
      label,
      homeDir: input.homeDir ?? '',
      status: input.status ?? 'ok',
      createdAt: now,
      updatedAt: now,
    }
    this.write(row)
    return row
  }

  /**
   * @param id - Account.
   */
  get(id: string): ProviderAccount | undefined {
    const row = this.store.db.prepare('SELECT * FROM provider_account WHERE id = ?').get(id)
    return row === undefined ? undefined : accountFrom(row)
  }

  /**
   * @param workspaceId - Workspace.
   * @param provider - Optional filter.
   */
  list(workspaceId: string, provider?: string): ProviderAccount[] {
    const rows = provider === undefined
      ? this.store.db.prepare(
        'SELECT * FROM provider_account WHERE workspace_id = ? ORDER BY provider, created_at, id',
      ).all(workspaceId)
      : this.store.db.prepare(
        'SELECT * FROM provider_account WHERE workspace_id = ? AND provider = ? ORDER BY created_at, id',
      ).all(workspaceId, provider)
    return rows.map(accountFrom)
  }

  /**
   * @param id - Account.
   * @param patch - Label / home / status.
   */
  update(id: string, patch: { label?: string; homeDir?: string; status?: ProviderAccount['status'] }): ProviderAccount {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next: ProviderAccount = {
      ...current,
      label: patch.label === undefined ? current.label : patch.label.trim(),
      homeDir: patch.homeDir ?? current.homeDir,
      status: patch.status ?? current.status,
      updatedAt: this.now(),
    }
    if (next.label === '') throw new StoreError('invalid-input', 'label')
    this.write(next)
    return next
  }

  /**
   * @param id - Account.
   */
  delete(id: string): void {
    if (this.get(id) === undefined) throw new StoreError('not-found', id)
    this.store.tx((db) => {
      run(db, 'DELETE FROM provider_account WHERE id = ?', [id])
    })
  }

  /**
   * @param input - Explicit policy. Never inferred.
   */
  putPolicy(input: {
    workspaceId: string
    scope: 'workspace' | 'persona'
    scopeId: string
    provider: string
    mode: AccountPolicy['mode']
    accountIds: readonly string[]
  }): AccountPolicy {
    if (input.accountIds.length === 0) throw new StoreError('invalid-input', 'accountIds')
    const id = `${input.scope}:${input.scopeId}:${input.provider}`
    const row: AccountPolicy = {
      id,
      workspaceId: input.workspaceId,
      scope: input.scope,
      scopeId: input.scopeId,
      provider: input.provider,
      mode: input.mode,
      accountIds: [...input.accountIds],
      updatedAt: this.now(),
    }
    this.store.tx((db) => {
      run(db, 'INSERT INTO account_policy (id, workspace_id, scope, scope_id, provider, mode, account_ids_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, scope, scope_id, provider) DO UPDATE SET mode = excluded.mode, account_ids_json = excluded.account_ids_json, updated_at = excluded.updated_at', [
        row.id, row.workspaceId, row.scope, row.scopeId, row.provider, row.mode,
        JSON.stringify(row.accountIds), row.updatedAt,
      ])
    })
    return row
  }

  /**
   * Persona policy wins over workspace. Missing → undefined (caller asks).
   * @param workspaceId - Workspace.
   * @param provider - Provider.
   * @param personaId - Optional persona override.
   */
  getPolicy(workspaceId: string, provider: string, personaId?: string): AccountPolicy | undefined {
    if (personaId !== undefined && personaId !== '') {
      const persona = this.store.db.prepare(
        'SELECT * FROM account_policy WHERE workspace_id = ? AND scope = \'persona\' AND scope_id = ? AND provider = ?',
      ).get(workspaceId, personaId, provider)
      if (persona !== undefined) return policyFrom(persona)
    }
    const workspace = this.store.db.prepare(
      'SELECT * FROM account_policy WHERE workspace_id = ? AND scope = \'workspace\' AND scope_id = ? AND provider = ?',
    ).get(workspaceId, workspaceId, provider)
    return workspace === undefined ? undefined : policyFrom(workspace)
  }

  /**
   * Usage rows for one account (schema ≥ 14 `account_id`).
   * @param accountId - Account.
   */
  usageForAccount(accountId: string): Array<{ tokens: number; runs: number }> {
    const row = this.store.db.prepare(
      'SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens, COUNT(*) AS runs FROM usage_record WHERE account_id = ?',
    ).get(accountId)
    if (row === undefined) return [{ tokens: 0, runs: 0 }]
    const tokens = typeof row.tokens === 'number' ? row.tokens : 0
    const runs = typeof row.runs === 'number' ? row.runs : 0
    return [{ tokens, runs }]
  }

  private write(row: ProviderAccount): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO provider_account (id, workspace_id, provider, label, home_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET label = excluded.label, home_dir = excluded.home_dir, status = excluded.status, updated_at = excluded.updated_at', [
        row.id, row.workspaceId, row.provider, row.label, row.homeDir, row.status, row.createdAt, row.updatedAt,
      ])
    })
  }
}

function accountFrom(row: Record<string, SQLOutputValue>): ProviderAccount {
  const status = text(row, 'status')
  if (status !== 'ok' && status !== 'limit' && status !== 'error' && status !== 'checking') {
    throw new StoreError('constraint', 'status')
  }
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    provider: text(row, 'provider'),
    label: text(row, 'label'),
    homeDir: text(row, 'home_dir'),
    status,
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  }
}

function policyFrom(row: Record<string, SQLOutputValue>): AccountPolicy {
  const scope = text(row, 'scope')
  const mode = text(row, 'mode')
  if (scope !== 'workspace' && scope !== 'persona') throw new StoreError('constraint', 'scope')
  if (mode !== 'fixed' && mode !== 'next' && mode !== 'split' && mode !== 'ask') {
    throw new StoreError('constraint', 'mode')
  }
  const accountIds = jsonValue(text(row, 'account_ids_json'))
  if (!Array.isArray(accountIds) || accountIds.some(item => typeof item !== 'string')) {
    throw new StoreError('constraint', 'accountIds')
  }
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    scope,
    scopeId: text(row, 'scope_id'),
    provider: text(row, 'provider'),
    mode,
    accountIds,
    updatedAt: text(row, 'updated_at'),
  }
}
