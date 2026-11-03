import { MemoryRepositories } from '../../src/index.ts'
import { defineRepositoryContract } from './repositories.contract.ts'

defineRepositoryContract(projectId => new MemoryRepositories(projectId))
