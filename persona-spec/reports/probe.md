# Probe — relatórios (mais recente no topo)

## 2026-11-03 15:40 — PROACTIVITY.md aceite (it.todo)

### Pronto
- `tests/mandatory-proactivity.spec.ts`: 8 cenários de aceite v1 (Vigia + relógio falso, pull loop, deps, fila vazia ± objetivo, recuperação runner, limites proposta/orçamento/silêncio, "Enquanto você estava fora").
- README atualizado com comando vitest.

### Comandos (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 4.xs

pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-proactivity.spec.ts
 Test Files  1 skipped (1)
      Tests  8 todo (8)
```

### Fora
- Implementação real aguarda Forge (engine/Vigia), Anvil (store/host/events), Rivet (runner recovery).

---

## 2026-11-03 14:52 — check-pkg + preview-visual TS fix

### Pronto
- `preview-visual.spec.ts`: `VisualDiffRow` omite `diffOverlayPath` quando ausente (`exactOptionalPropertyTypes`).
- `persona-boot-gate`: diff `dirD-tela.png` sempre que a referência existir (divergência registrada mesmo sem shell).

### Comando (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 4.8s
```

### Gate UI (#geral + personagens Brush)
- smoke-persona **verde** após fix Prism (`PERSONA_E2E=1`, ~65s): zero activation warnings + zero console errors.
- Capturas: `packages/persona/persona-e2e/artifacts/persona-light.png`, `persona-dark.png`.
- Divergência dirD-tela (1440×900): **~87,95%** pixels (shell monta, layout ainda ≠ mock Brush); pass estrito só com `PERSONA_E2E_STRICT_DIRD=1` quando #geral + personagens estiverem prontos.

```
node scripts/persona/check-pkg.mjs persona-e2e && PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-persona.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

---

## 2026-11-03 14:15 — smoke-persona boot gate + harness (Keel fila P-2)

### Pronto
- `runPersonaUiBootGate()` integra `scripts/persona/ui-boot-check.mjs`: perfil `persona`, Chrome claro/escuro, capturas em `packages/persona/persona-e2e/artifacts/persona-light.png` e `persona-dark.png`, falha em `web boot: warning: … did not activate` e erros de console.
- `startWebHost` / `startDesktop` usam `with-lock.mjs` com `--release-on` (`dsh web:` / DevTools ready).
- Preview visual diff + motion/jank + HTML report (`preview-visual.spec.ts` verde).
- `png-compare.ts`: `waitForFunction` antes de `globalThis.compare` (fix typecheck push).

### Arquivos
- `packages/persona/persona-e2e/src/{persona-boot-gate,locked-launch,persona-boot-gate}.ts`, `visual-diff/*`, `preview-capture.ts`, `motion-jank.ts`, `axe-check.ts`
- `packages/persona/persona-e2e/tests/{smoke-persona,preview-visual,smoke-web-harness}.spec.ts`
- `packages/persona/persona-e2e/fixtures/preview-pages/*`
- `packages/persona/persona-e2e/README.md`

### Comandos (verbatim)

`tsc -p packages/persona/persona-e2e/tsconfig.json --noEmit` → exit 0

```
PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/smoke-persona.spec.ts
 Test Files  1 failed (1)
      Tests  1 failed (1)
 FAIL … activation warnings:
[light] web boot: warning: 1 entry did not activate
@deepseek-ai/dsh-client-ui-persona: failed: Error: cannot get property "remote.persona" without inject
… 'root' has no registration …
```
**Esperado vermelho** até Prism corrigir mount; capturas geradas em `artifacts/`.

```
PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/preview-visual.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Tier 2 (`smoke-desktop`) verde em run anterior (~276s); re-run pendente neste turno.

### Builder watch
- `client-ui-persona` tests: **FALHOU** 1/21 — `kanban-preview.client.spec.tsx` duplicate article (reportado a Lumen via maestri ask).

### Pedido Keel (deps)
- `@axe-core/playwright` em `persona-e2e` para scans a11y não-skipped.

### Upstream
- Nenhum.

### Fora
- `mandatory-scope` `it.todo` → testes reais quando S7/B8 entregarem.
- Diff dirD-tela no smoke-persona só quando `[data-persona-shell]` aparecer.
