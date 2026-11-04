# Vault export (SB-6, desktop)

Rivet: one-way Obsidian copy. Forge/Anvil: `exportBrainVault` pages + hash skip.

- `exportMarkdownOneWay` writes `.md` (no `..`). Same dest hash → skip.
- Dest extras stay (`leftoverDestFiles` / `planBrainVaultExport` / `applyBrainVaultExport` em `persona-core`; cópia desktop Rivet). Never deleted. Apply writes new/changed, skips same-hash, never deletes leftover.
- `planVaultExport` / `applyVaultExport` return `{ written, skipped, leftover }`. Apply writes; leftovers stay.
- `planBrainVaultSync({ mode: 'two_way' })` also lists dest files whose hash is not in the brain (`importFiles`). Default `one_way` imports nothing. Never deletes leftovers.
- `markdownToBrainPage` round-trips visibility (`workspace` / `project:id` / `members:a,b`) and extra frontmatter properties. Dest notes without our pack → `tryParseBrainPageMarkdown` = null.
- `applyBrainVaultSync(plan)` classifies dest imports: `page` (our frontmatter) or `foreign` (BYC markdown). Anvil persists export writes + page upserts; `foreignVaultToBringFiles(imports)` → `previewBringVault`.
- Folder = `personaDesktop.pickExportFolder()` (`purpose: 'export'`) or `pickVaultFolder()` (`purpose: 'vault'`).
