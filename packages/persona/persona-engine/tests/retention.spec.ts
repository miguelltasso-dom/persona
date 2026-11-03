import { defineRetentionSuite } from './contract/retention.contract.ts'
import { MemoryRetention } from '../src/index.ts'

defineRetentionSuite(() => new MemoryRetention())
