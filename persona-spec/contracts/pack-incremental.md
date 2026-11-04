# Empacotamento incremental (D-076 regra 4) — plano

Rivet, 04/11 19:15. **Só plano**: o congelamento D-082 proíbe salvar em `packages/**`, `apps/**` e `scripts/**`. Nada aqui foi implementado.
Meta do Atlas: instalador em **≤ 15 min**. Hoje: ~21 min só até o `electron-builder` começar (medido abaixo), mais o `--dir` e o NSIS.

## O que foi medido (pack do `71b87a1d18`, 04/11, UTC; log `C:\p8c\package-clean.log`)

Atenção: rodou com a máquina disputada (E2E do Gauge na trava `build`, meus vitest/tsc). Os números estão inflados; servem de ordem de grandeza, não de piso.

| Etapa | Tempo | Observação |
|---|---|---|
| `git worktree add` (checkout do repo inteiro) | 58 s | 20:29:57 → 20:30:55 |
| `pnpm install --frozen-lockfile` no worktree novo | 3 min 24 s | 20:30:55 → 20:34:19 (loja `C:\p8c\pnpm-store` já quente) |
| gate `native addon` | 3 s | |
| gate `Host Typert` | 79 s | |
| gate `host compiler` (`tsc -b` das referências) | **348 s** | o mais pesado da cadeia do host |
| gate `Host bundle` / `Desktop bundle` | 86 s / 18 s | |
| gate `client compiler` | **289 s** | |
| gate `Client bundle` / `Web build` | 107 s / 44 s | |
| `host aggregate check` (`tsc -p tsconfig.host.json`) | **362 s** | em paralelo; falhou nesta rodada |
| `client aggregate check` | ≥ 3 min | começa quando o `client compiler` acaba; cortado antes de terminar |
| **Cadeia crítica até o Web build** | **~16 min** (20:34:19 → 20:50:30) | Typert 79 + host 348 + bundle 86 + desktop 18 + client 289 + bundle 107 + web 44 |
| `electron-builder --dir`, NSIS (`--resume`) | **não medido** | o pack foi encerrado antes; o b3 (04/11 11:00) levou ~7 min de build e a compressão do NSIS foi longa |

Soma antes do `electron-builder`: 58 s + 204 s + ~16 min + a cauda dos agregados ≈ **21–24 min**.

## Onde está o desperdício

1. **Worktree e `node_modules` novos a cada commit** (≈ 4,4 min), mesmo quando `pnpm-lock.yaml` e os `package.json` não mudaram.
2. **Compilação do zero** (host 348 s + client 289 s ≈ 10,6 min) num worktree sem `lib/` nem `*.tsbuildinfo`. Com `lib/` e `tsbuildinfo` do pack anterior, o `tsc -b` recompila só o que mudou.
3. **Os dois agregados de tipos rodam de novo no pack** (≈ 6 min de cauda), embora o gate "installer-grade" do Keel (D-082: `persona-gate` + `pnpm run typecheck`, os mesmos host/client aggregate) já tenha rodado no MESMO commit publicado.
4. Bundles (host 86 + desktop 18 + client 107 + web 44 = 255 s): refeitos sempre. Só valeria pular com hash das entradas; **fora do escopo** da 1ª fase.
5. NSIS: compressão pesada (setup de ~338 MB). Sem medição por etapa não dá para atacar; é a **fase 0**.

## Plano por fases (cada uma entrega sozinha)

**Fase 0 — medir (sem mudar comportamento).** `pack-state` grava `stageTimings` (início, fim e duração de cada estágio: worktree, install, overlay, cada gate, electron-builder `--dir`, NSIS) no `live.json` e no `package-clean.json`. O H2 já gera os números reais. Custo: ~20 linhas + teste.

**Fase 1 — não repetir o que o gate já provou.**
- *Pular os agregados no pack*: `package-clean` passa `DSH_DESKTOP_BUILD_SCOPE=artifacts` e `package-target.ts` roda `build.ts --scope artifacts` (sem `host-check` / `client-check`). Só quando o commit está **publicado** (D-071, já verificado hoje) e o Keel confirma o gate verde com `--trust-gate` explícito. Ganho: **~3–6 min** de cauda.
- *Reaproveitar o worktree*: um worktree fixo de pack (`C:\p8w\pack`). Para um commit novo: `git checkout --detach <rev>` no próprio worktree, em vez de `worktree add` + `install`. **Pula o install** quando `git diff --name-only <anterior> <novo>` não toca `pnpm-lock.yaml`, `pnpm-workspace.yaml` nem nenhum `package.json`. Ganho: **~4,4 min**.
  - Antes do checkout, restaurar só os caminhos que o overlay tocou (hoje: o spec do "Sobre a Persona"; em commit antigo, `electron-builder-config.mjs` e o manifesto do host): `git restore --worktree -- <caminhos>`. Sem `git clean`, sem `--force`. Se o checkout recusar por mudança local, **cai para worktree novo** (comportamento de hoje).

**Fase 2 — compilar só o delta.** No worktree reaproveitado, `lib/` e `*.tsbuildinfo` ficam. O `tsc -b` do host e do client passa a recompilar só os pacotes afetados (típico 30–90 s cada, pior caso = hoje). Ganho esperado: **~6–9 min**. Salvaguarda: **build limpo automático** (apaga `lib/` e `tsbuildinfo`) quando o diff entre os dois commits toca `tsconfig*.json`, `tsdown.config.ts`, `scripts/build.ts`, `scripts/compile-referenced-projects.ts` ou qualquer `package.json`; e `--fresh` força.

**Fase 3 — NSIS rápido para validação.** Perfil `--nsis-fast` (compressão menor) só para o NSIS de validação do Probe/fake e da execução real; o instalador do Miguel sai com a compressão cheia. Decidir com os números da fase 0.

## Estimativa honesta

| Cenário (lockfile igual, poucos pacotes mudaram) | Antes do `electron-builder` |
|---|---|
| Hoje | ~21–24 min |
| Fase 1 | ~13–16 min |
| Fase 1 + 2 | **~7–10 min** (Typert 79 s + delta de tipos ~2–3 min + bundles 255 s + overhead) |

A meta de 15 min fecha para o **`--dir` pronto** com as fases 1+2. Para o **Setup (NSIS) pronto** ela só fecha se a compressão do NSIS couber em ~5 min ou se usarmos o perfil rápido: **não sei** até a fase 0 medir. Não prometo 15 min de Setup sem esse número.

## Teste (quando for implementar)

- Função pura `planPack({ previous, next, changedFiles, worktreeState })` → `{ reuse, install, freshBuild, scope }`, testada em tabela: lockfile igual/diferente, `package.json` novo, `tsconfig` mudado, worktree sujo, `--fresh`, commit não publicado.
- Teste de integração com repositório git temporário: dois commits, o 2º mexe num arquivo → `reuse=true, install=false`; o 2º mexe no lockfile → `install=true`.
- Prova real: dois packs seguidos de commits vizinhos, comparando `stageTimings` do 1º (frio) e do 2º (incremental), e o `app.asar` do 2º idêntico ao de um pack frio do mesmo commit (comparar lista e hashes dos arquivos).

## Decisões que preciso do Keel / Atlas

1. **Autorizar `git checkout --detach` e `git restore --worktree -- <caminhos do overlay>` DENTRO do worktree de pack** (hoje proibidos: sem `checkout --force`, sem `clean`). O risco que motivou a proibição era o checkout principal; o worktree de pack é descartável.
2. **Autorizar pular os agregados no pack** quando o commit é publicado e o gate installer-grade está verde (`--trust-gate`), mantendo o comportamento atual como padrão sem a flag.
3. **Perfil NSIS rápido** só para validação (fase 3), depois da fase 0.
