/** On-demand runtime components: pinned manifest, verified download and installation. */
export { ComponentManager } from './manager.ts'
export type { ComponentFailure, ComponentManagerOptions, ComponentState } from './manager.ts'
export { parseComponentManifest } from './manifest.ts'
export type { ComponentKind, ComponentManifest, ComponentManifestEntry } from './manifest.ts'
export { voiceModelArchive, VOICE_MODEL_ARCHIVE, VOICE_MODEL_ENTRY } from './voice-model.ts'
export { default } from './plugin.ts'
export { default as PersonaComponents } from './plugin.ts'
export type { Config } from './plugin.ts'
