import { engineClassForTurn } from '../../persona-engine/src/engine-policy.ts'

const cheap = ['triage', 'initiative', 'librarian', 'watchdog', 'evaluation'] as const
const persona = ['execution', 'reply'] as const
for (const kind of cheap) {
  if (engineClassForTurn(kind) !== 'cheap') {
    throw new Error(`${kind} must be cheap`)
  }
}
for (const kind of persona) {
  if (engineClassForTurn(kind) !== 'persona') {
    throw new Error(`${kind} must be persona`)
  }
}
process.stdout.write('engine-class ok\n')
