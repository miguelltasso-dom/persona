# Compartilhar persona / equipe / skills de CLI

Domínio: `persona-core` (`exportPersonaFile`, `importPersonaFile`, `exportTeamFile`, `importTeamFile`, `importCliSkillCandidates`). Remote: Anvil. UI: Lumen.

## Arquivos

- `.persona.json` — `version: 1`, `kind: "persona.share"`, `provenance` `{ source, authorId, exportedAt }`, `spec` (campos da persona).
- `.team.json` — `kind: "team.share"` + `id`, `name`, `description`, `personas[]`.

Avatar só `gallery` (upload vira `silhouette`). Sem credenciais, sem Cofre/memória privada, sem chaves. Skills no spec são **nomes**. Segredo em qualquer string ⇒ `SECRET_REFUSED` / `IMPORT_REFUSED`.

## Skills Claude Code / Codex

`importCliSkillCandidates()` lê `~/.claude/skills/**/SKILL.md` e `~/.codex/skills/**/SKILL.md`. Cada hit vira candidata `{ origin: "learned", enabled: false }`. Nunca ativa sozinha. Arquivo com cara de segredo é ignorado (não copiado).

## Remote (Anvil)

`exportPersona({ projectId, personaId })` → `{ filename, json }`
`importPersona({ projectId, json })` → `{ spec }` (cria proposta, não aplica sozinho se a política for approval)
`exportTeam({ projectId, personaIds? | templateId? })` → `{ filename, json }`
`importTeam({ projectId, json })` → `{ personas }`
`previewCliSkills()` → candidatas
`proposeCliSkills({ projectId, personaId, skillKeys })` → grava candidatas desligadas; nunca `enabled: true`
