# Vault export (SB-6, desktop)

Rivet: one-way Obsidian copy. Forge/Anvil: `exportBrainVault` pages + hash skip.

- `exportMarkdownOneWay` writes `.md` (no `..`). Same dest hash → skip.
- Dest extras stay (`leftoverDestFiles` / `planBrainVaultExport` em `persona-core`; cópia desktop Rivet). Never deleted.
- `planVaultExport` / `applyVaultExport` return `{ written, skipped, leftover }`. Apply writes; leftovers stay.
- Folder = `personaDesktop.pickExportFolder()` (`purpose: 'export'`) or `pickVaultFolder()` (`purpose: 'vault'`).
