/** Stage timeout rejects instead of hanging. */
import { packagingStep } from './packaging-step.mjs'

const started = Date.now()
try {
  await packagingStep(undefined, 'stall', () => new Promise(() => {}), undefined, 400)
  console.error('expected timeout')
  process.exit(1)
} catch (error) {
  if (!`${error}`.includes('timed out') || Date.now() - started > 3_000) {
    console.error(error, Date.now() - started)
    process.exit(1)
  }
}
console.log('packaging-step timeout: ok')
