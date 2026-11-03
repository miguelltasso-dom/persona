import { defineCrashSuite } from './contract/crash.contract.ts'
import { MemoryRepositories } from '../src/index.ts'

defineCrashSuite(() => new MemoryRepositories())
