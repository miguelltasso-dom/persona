import { DatabaseSync } from 'node:sqlite'
import { defineSyncLogContract } from '../../../packages/persona/persona-store/tests/contract/sync.contract.ts'
import { NodeSyncSql } from './node-sql.ts'
import { SqlSyncLog } from '../src/sql-log.ts'

defineSyncLogContract('d1', () => new SqlSyncLog(new NodeSyncSql(new DatabaseSync(':memory:'))))
