# Vault export (SB-6, desktop)

Rivet: one-way Obsidian copy. Forge/Anvil: `exportBrainVault` pages + hash skip.

- `exportMarkdownOneWay` writes `.md` (no `..`). Same dest hash → skip.
- Dest extras stay (`leftoverDestFiles` / `planBrainVaultExport` / `applyBrainVaultExport` em `persona-core`; cópia desktop Rivet). Never deleted. Apply writes new/changed, skips same-hash, never deletes leftover.
- `planVaultExport` / `applyVaultExport` return `{ written, skipped, leftover }`. Apply writes; leftovers stay.
- Folder = `personaDesktop.pickExportFolder()` (`purpose: 'export'`) or `pickVaultFolder()` (`purpose: 'vault'`).
