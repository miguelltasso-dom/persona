// Real Persona gallery (Keel → Probe): web profile persona, all main panels, light/dark × 720/1080.
// Outer lock only (avoid nested with-lock): node scripts/persona/with-lock.mjs "Probe real gallery" -- node --import tsx/esm scripts/persona/capture-real-gallery.mjs
import { runRealGalleryCapture } from '../../packages/persona/persona-e2e/src/real-gallery/capture.ts'

const { rows, indexPath } = await runRealGalleryCapture()
console.log(`real gallery: ${String(rows.length)} captures → ${indexPath}`)
