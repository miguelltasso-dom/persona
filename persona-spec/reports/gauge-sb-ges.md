# Gauge — SB-7 + GES-6, camada APP REAL (fork do Gauge)

Arquivo dono: `packages/persona/persona-e2e/tests/real-sb-ges-app.spec.ts` (+ helper `src/gauge-sb-ges.ts`; `src/axe-check.ts` ganhou `detail` por violação).
App real (`persona` profile em Chrome, CLIs fake no PATH, 0 IA, 0 CLI real) contra o host persistente `.maestri/tmp/gauge/host.json` (home limpo + onboarding "Em branco" + equipe Agência contratada pelo irmão GOV).
Semeadura pela MESMA porta que a UI usa: `POST /api/persona/<método>` com o cookie do `?token=` (`hostRpc`) — a UI não tem como criar páginas/permissões/planos.

## Placar (rodada final, verbatim)
`GAUGE_HOST_URL=<host> PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/real-sb-ges-app.spec.ts --reporter=verbose`
→ ver "Resultado da rodada final" no fim deste arquivo (preenchido ao terminar a última execução).

Convenção: bug de produto = `it.fails('[BUG→dono] …')` (assertiva descreve o comportamento EXIGIDO; quando o dono corrige o teste fica vermelho → trocar por `it`).

| Item | Estado | Teste |
|------|--------|-------|
| **SB-5a** navegação sob Empresa, início com as seções, sem loading preso/fatais/axe grave | ✅ verde | `[SB-5a] fica sob "Empresa"…` + capturas `sb-inicio-{light,dark}` |
| **SB-5b** Por tipo, página (propriedades slug/rev, fontes, histórico), editor manual (rev +1, versões preservadas), busca, grafo + "Ver como lista" + Tab sem armadilha | ✅ verde | 4 testes + `sb-pagina`, `sb-grafo` |
| SB-5b backlinks "Citada em" (direção invertida) | 🐞 bug→Lumen | `[BUG→Lumen] "Citada em"…` |
| SB-5b restaurar versão / lista de versões não atualiza após salvar / criar página nova inexistente | 🐞 bug→Lumen (3) | idem |
| SB-5 feed em português ("Você", nome) | ✅ verde (Lumen corrigiu durante a rodada) | `[SB-5] o feed…` |
| SB-5 "bibliotecário (Atlas)" fixo sem persona Atlas | 🐞 bug→Lumen | idem |
| SB-5 duas páginas com o mesmo título: a 2ª sobrescreve a 1ª (host identifica por slug) | 🐞 bug→Anvil | `[BUG→Anvil] duas páginas…` |
| **SB-2c** página restrita a persona some da home/busca/feed/lista; do dono aparece em "Tudo"; host recusa a restrita | ✅ verde | `[SB-2c] a página restrita…` |
| SB-2c página só do dono diz "Visível para a equipe" e "Minhas privadas" fica vazia (`restricted` = escondida de você) | 🐞 bug→Lumen+Anvil | idem |
| SB-2c índice "Comece aqui" cita título de página restrita a persona | 🐞 bug→Anvil | idem |
| **SB-3f** Permissões ativas, Revogar com confirmação (Cancelar mantém), efeito imediato, host recusa a próxima, aba "Revogadas" | ✅ verde | 2 testes + `sb-permissoes` |
| **SB-3h** "Lembrar esta permissão": escopo explícito persona/ação/alvo/validade 7d gravado (`grant-<id>`) | ✅ verde | `[SB-3h] "Lembrar…"` + `sb-lembrar-permissao` |
| SB-3h botão que APROVA chama-se "Revisar proposta" e não mostra o que muda; proposta não chega ao vivo | 🐞 bug→Prism (2) | idem |
| **SB-4a/b** exportar/importar para pasta | 🐞 bug→Lumen+Rivet (nenhuma tela chama export/import; nem aviso no web) | `[BUG→Lumen+Rivet] [SB-4]…` |
| SB-1a/1b/1c curadoria (concluir tarefa → página; contradição; regra com aceite) | ⏳ falta — sem UI nem gancho no host (`curateAfterWork` sem chamador; bug host já rastreado em `mandatory-second-brain-host.spec.ts`) | — |
| **GES-4a** editor da Coordenação: Gestor de equipe (modo de aprovação excludente, "Sempre me perguntar" padrão, tamanho máx., gasto, onde pode agir, "pode conceder Gestor", prévia com selo), **zero "Maestro" em 13 telas** | ✅ verde | 3 testes + `ges-editor-gestor` |
| **GES-4b** selo Gestor no perfil e no banco (Coordenação do template é Gestor) | ✅ verde | `[GES-4b] selo…` |
| GES-4b selo Gestor no organograma | 🐞 bug→Lumen | `[BUG→Lumen] [GES-4b]…` |
| **GES-1a** plano chega ao #geral com Aprovar/Ajustar/Agora não + resumo; nada contratado antes; Ajustar+Esc não decide; aviso de 1ª vez não cobre os botões | ✅ verde | 3 testes + `ges-plano-no-geral`, `ges-plano-ajustar` |
| GES-1a cartão do plano não aparece ao vivo (só após F5) | 🐞 bug→Prism | idem |
| GES-1a "Monte um time para o Site" gera time de escritório (Financeiro, Pessoas, outra Coordenação) | 🐞 bug→Forge | idem |
| GES-1a pedido digitado no #geral não gera plano (nenhum caminho chat→proposeGestorAssemble no host/engine) | 📝 observação (a Coordenação só propõe via tool MCP) | — |
| **GES-1b** Aprovar → "Aprovado", plano applied, auditoria com motivo | ✅ verde | `[GES-1b] Aprovar…` + `ges-plano-aprovado` |
| GES-1b depois de "Personas alocadas conforme o plano" nada foi criado (UI afirma o que não aconteceu) | 🐞 bug→Anvil+Forge | idem |
| **GES-1c** reduced-motion: sem animação infinita na faixa/rail | ✅ verde | `[GES-1c]…` |
| GES-1c personas entram animadas SÓ depois do aceite | ⏳ falta — impossível enquanto GES-1b não criar personas | — |
| **GES-3c** Saúde: seção de atividade do Gestor sem texto inventado; perfil mostra o motivo | ✅ verde | 2 testes + `ges-saude-auditoria` |
| GES-3c a Saúde mostra o que foi feito + motivo (hoje vira "Coordenação mandou 2 mensagens") | 🐞 bug→Lumen | idem |

## Bugs devolvidos aos donos (passos exatos nos pedidos `maestri ask`; capturas em `packages/persona/persona-e2e/artifacts/gauge/sb-ges/` e `.maestri/tmp/gauge/<explore>/`)
- **Lumen**: (1) "Citada em" invertido [sb4/page-client.png, sb5/page-rule.png]; (2) sem restaurar versão + histórico não atualiza ao salvar; (3) sem ação de criar página; (4) "bibliotecário (Atlas)" fixo; (5) SB-4 sem exportar/importar; (6) selo Gestor ausente do organograma; (7) Saúde: atividade do Gestor perde o motivo; (8) `restricted` não diz "privada" → "Visível para a equipe" numa página privada + "Minhas privadas" vazia (com Anvil).
- **Prism**: (1) cartão do plano não é ao vivo [ges2/geral-plan.png vs ges3/geral-after-reload.png]; (2) cartão diz "Aprovado — Personas alocadas conforme o plano" sem criar nada [ges4/aprovado.png]; (3) botão "Revisar proposta" aprova sem mostrar o que muda + proposta não chega ao vivo [appr2/*.png]; (4) popover "Estou fora" (mesmo defeito do GOV).
- **Anvil**: (1) `putBrainPage` identifica por slug e sobrescreve em silêncio (devolve outro id); (2) "Comece aqui" cita título de página restrita a persona; (3) `BrainPageView` sem campo de audiência.
- **Forge**: "Monte um time para o Site" → equipe de escritório + Coordenação duplicada.
- Já CORRIGIDOS por Lumen durante a rodada (flipados para teste normal): ids internos no feed ("person:owner" → "Você"); aviso de 1ª vez cobrindo os botões do plano.

## Achados de infraestrutura/teste
- Host compartilhado: o assunto ativo do #geral é estado do host; o irmão BYC/W2 deixou "Interface" ativo e o cartão (assunto Geral) sumia → `openGeral()` seleciona o chip Geral antes de procurar o cartão.
- `rejectGaugeApprovals()` rejeita as propostas `gauge-*` pendentes para o teste ser repetível sem crescer a caixa de Aprovações.
- Scripts exploratórios em `packages/persona/persona-e2e/artifacts/gauge-dev/sbges-*.mts` (gitignored); nome do script do irmão colidiu uma vez (`rpc1.mts`) — use prefixo próprio.
- `check-pkg persona-e2e`: meus arquivos limpos; o único erro restante é de outro arquivo (`mandatory-governance-host.spec.ts(14,10)` `bug` não usado, depois dos flips do Forge).

## Resultado da rodada final (verbatim)
```
 Test Files  1 passed (1)
      Tests  21 passed | 16 expected fail (37)
EXIT 0
```
21 testes verdes + 16 bugs rastreados (`it.fails`, todos com dono). Capturas claro/escuro (20 PNG) em `packages/persona/persona-e2e/artifacts/gauge/sb-ges/`: `sb-inicio`, `sb-pagina`, `sb-permissoes`, `sb-lembrar-permissao`, `sb-grafo`, `ges-editor-gestor`, `ges-plano-no-geral`, `ges-plano-ajustar`, `ges-plano-aprovado`, `ges-saude-auditoria` (+ JSON do axe em `artifacts/gauge/axe/sb-ges-*.json`: 0 violações críticas/sérias nas telas do Segundo cérebro e no editor).
Comando de reprodução (host próprio, sob a trava): `node scripts/persona/with-lock.mjs "Gauge sb-ges" --wait-max 3000000 -- env PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/real-sb-ges-app.spec.ts --testTimeout 600000 --hookTimeout 480000` (sem `GAUGE_HOST_URL`, o `openGaugeSession` sobe o próprio host).
`check-pkg persona-e2e`: sem erros em `real-sb-ges-app.spec.ts`, `src/gauge-sb-ges.ts`, `src/axe-check.ts`.
