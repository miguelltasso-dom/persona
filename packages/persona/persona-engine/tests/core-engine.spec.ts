import { MemoryRepositories } from '../src/core/index.ts'
import { defineCoreEngineSuite } from './core-engine.suite.ts'

defineCoreEngineSuite(() => new MemoryRepositories())
