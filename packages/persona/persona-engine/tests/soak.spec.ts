import { defineSoakSuite } from './contract/soak.contract.ts'
import { openMemorySoak } from '../src/index.ts'

defineSoakSuite(openMemorySoak)
