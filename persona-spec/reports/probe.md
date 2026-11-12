# Probe — relatórios (mais recente no topo)

## 2026-11-12 00:45 — COLHEITA item 14: cenários RED fim a fim 5/5 OK (o produto já barra os defeitos de texto), spec do gate D-100, gate ligado ao TEAM-10 (opt-in) — 0 IA

**Comando:** `node scripts/persona/eval-padaria.mjs --scenarios [pronto-falso,pergunta-boba,jargao,jargao-tecnico,pesado]` (fake, lock `build`, ~2,5 min por cenário). O stub (a Bia) faz UMA coisa errada pelo host de verdade; cada defeito acaba em **pego** (chegou ao fio e o eval reprovou o check dono dele), **barrado** (o produto o segurou antes de a pessoa ler: o eval fica quieto, certo) ou **cego** (chegou ao fio e o eval não viu = leitor cego, a única falha do eval); qualquer outro check que vire é "ruído". Rodada inválida (host caiu, watchdog, prazo) nunca conta como "pego".
**Resultado (árvore `sha256:8a1ac970…`, 0 IA): 5/5 OK.** `pergunta-boba` PEGO (silly-asks; +1 turno explicável) · `pesado` PEGO (input 156 999 > 120 mil) · `pronto-falso`, `jargao`, `jargao-tecnico` BARRADOS PELO PRODUTO, verificado no fio gravado: o "Salvei o arquivo cartaz-final.svg" falso NÃO aparece em linha nenhuma (**item 3** segura a fala e cobra uma vez: +1 turno; o stub se corrige) e o prontuário, "a pessoa" e "HTTP 404 / JSON vazio" ENTRAM no host e a camada de fala (**item 4**) os move para dentro de `<details>` e troca "da pessoa" por "de você". Ou seja: itens 3 e 4 funcionam de ponta a ponta no app.
**Achado de produto (para Bolt/Atlas):** a pergunta boba pela FERRAMENTA `persona_ask` (WhatsApp que o pedido já tinha) CHEGA ao dono: a regra "pergunta já respondida" do item 3 só cobre a pergunta no texto de fim de turno, não a ferramenta. **Honesto:** os leitores de jargão e de "Pronto!" só foram vistos reprovando nas frases reais das tentativas 3–5 (replay + testes puros), não ao vivo no host, porque o produto agora barra esses defeitos.
**Também:** `tests/team-d100-gate.spec.ts` (22 testes: cada check por vez, replay da tentativa 5 = RED e de um fake bom = verde); o gate (D-100 + "Pronto!" falso + pergunta boba + jargão) está ligado ao fake do TEAM-10 (`mandatory-team-round.spec.ts`): grava `eval` no `fake-proof.json` SEMPRE e só reprova com `PERSONA_TEAM10_D100=1` (ligar quando os itens 1–4 estiverem integrados; até lá o roteiro antigo do stub é esperado RED). Edits aditivos: `fake-cli.ts` (opção `inputTokens`), `team-round-driver.ts` (opção `scenario`, só fake). 75 testes puros verdes · `check-pkg persona-e2e` OK · cleanroom `--strict-names` 0/0.
**Coreografia D-100 no fake (01:05, 0 IA):** `eval-padaria.mjs --d100` (o stub NÃO faz repasse próprio: sem `pass_forward`/`ask_colleague`; o fluxo é o do host: Bia entrega o texto, a arte do Téo nasce depois, UMA arte, a Lia revisa e sela a arte) = **2/2 PASSOU, estável, 4 turnos, 11 checks verdes** na árvore atual. O fake do TEAM-10 aceita a mesma coreografia (`PERSONA_TEAM10_CHOREOGRAPHY=d100`, e `PERSONA_TEAM10_D100=1` exige o gate): rodou com TODOS os checks verdes e uma única reprovação, "a árvore mudou durante a rodada" (outros donos salvaram `persona-host/src/index.ts` e `station/station.ts` nos 2 min), então o `fake-proof.json` ficou `green:false` até a árvore ser congelada. Não conta como defeito do harness.
**DEPENDÊNCIA (rodada REAL):** só com H1, H2a, H2b, H3 e H4 integrados (PLAN §12 em 00:25: H1 e H2a "todo", H2b/H3/H4 "doing") + OK escrito do Atlas com teto (meta ≤ 6 turnos, < 120 mil de entrada bruta, texto + arte). Antes: roteiro do stub atualizado para o fluxo da D-100 (Bia entrega → arte do Téo → Lia revisa), fake verde na MESMA impressão digital, `PERSONA_TEAM10_D100=1` ligado, e o reader sobre o home real com `eval-padaria.mjs --replay`.

---
## 2026-11-11 22:40 — COLHEITA item 14 (eval Padaria Lua): 1ª FATIA VERDE — fake × 3 PASSOU 3/3, estável, 0 IA

**Comando:** `node scripts/persona/eval-padaria.mjs --repeat 3` (fake; pega o lock `build`) · `--replay <home…>` avalia homes que uma rodada já deixou (sem host, sem custo; é assim que cada regra nova foi provada contra as tentativas reais 2–5 ANTES de valer) · `--strict` sai 1 se alguma repetição reprovar algum check · `--engine real` é RECUSADO por nome (rodada paga = OK escrito do Atlas com teto, pelo gate do TEAM-10).
**O que mede por rodada (11 checks, falham fechado):** turnos ≤ 6 · entrada BRUTA ≤ 120 mil (cache incluso; o peso de preço vai ao lado, só reportado — decisão do Keel 11/11) · texto e arte entregues · "Pronto!" falso (resumo "Pronto:" sobre trabalho parado/revisão sem selo, "Pronto!" nu, arquivo dito salvo que nenhum rascunho tem, "passei ao X" sem bilhete) · pergunta boba (dado que o pedido já tinha, bancada do time, > 300 caracteres, segredo em texto aberto) · jargão no fio (máquina, PNG, narração, "a pessoa", NOVA VERSÃO: cru, prontuário, caminho, id/hash, HTTP, JSON, nome de ferramenta; o que está em `<details>` não conta) · e o gate D-100 (UMA arte com o texto exato da Bia, Lia revisa, selo, 0 vazamento).
**Resultado:** fake × 3 na árvore `sha256:f3e4ac5f…` = **PASSOU 3/3, estável** (6 turnos, 7 719 de entrada do stub, 0 em cada leitor). Replay da tentativa 5 real = RED exatamente no que o Atlas leu: 12 turnos, 469 mil bruto, "Pronto:" sobre trabalho parado, as 2 perguntas bobas (WhatsApp que a pessoa já escreveu; PNG velho da própria pasta), jargão (prontuário, caminho `inputs/foto.png`, "a pessoa", NOVA VERSÃO: cru), 2 artes. Tentativa 2 (pedido sem fatos, a equipe perguntou) = limpa nos 3 leitores: perguntar ali era certo.
**Testes:** 40 puros verdes (`eval-padaria-rules.spec.ts` 21 = frases reais RED + honestas GREEN; `eval-padaria.spec.ts` 19 = avaliador, `--repeat`, runner com driver injetado, replay) + `eval-padaria-fake.spec.ts` (e2e, 449 s, passou) · `check-pkg persona-e2e` OK · `check-cleanroom --strict-names` 0 falha 0 aviso.
**Limites honestos:** o fake NÃO prova comportamento de modelo (o stub nunca diz "Pronto!" falso nem pergunta boba): 3/3 verde = encanamento + gate estrutural, não "o produto é bom". Os tokens do fake são do stub. Falta: (a) cenários RED pelo host (o stub emitindo cada defeito) para calibrar fim a fim; (b) `team-d100-gate.ts` ainda sem spec próprio (coberto pelos specs do eval e pelo replay); (c) a rodada REAL só quando 1+2+3+4 estiverem integrados, com OK do Atlas e teto (meta ≤ 6 turnos, < 120 mil bruto, texto + arte).
**Arquivos (todos novos, só em persona-e2e + 1 script):** `src/eval-padaria-rules.ts`, `src/eval-padaria.ts`, `src/eval-padaria-run.ts`, `tests/eval-padaria-rules.spec.ts`, `tests/eval-padaria.spec.ts`, `tests/eval-padaria-fake.spec.ts`, `scripts/persona/eval-padaria.mjs`, `src/team-d100-gate.ts` (escrito 11/11 17:27, agora com tsc verde). Evidência: `packages/persona/persona-e2e/artifacts/eval-padaria/eval-fake-2026-11-12T01-27-31-502Z/` (summary.md/json + proof, capturas e banco de cada repetição).

---
## 2026-11-11 11:40 — PAUSA ESTRATÉGICA (ordem do Atlas via Keel 11:32): D100-3, gate do cartaz, parei na LEITURA — nada gravado na árvore

**Estado: nenhum arquivo do repositório foi tocado.** Nenhum RED/GREEN novo; nenhum teste rodado; nenhuma rodada (fake ou real); 0 turnos pagos. Só li e medi offline (script descartável fora da árvore, no scratchpad da sessão: `dump-attempt.mjs`, que passa o banco de uma tentativa pelo leitor `readTeamTranscript`).

**Pedido do Keel (11:26, D-100 / PLAN D100-3):** estender o fake do TEAM-10 para assertar o GATE do Carbon — ≤ 6 turnos, ≤ 120 mil de entrada, 1 única arte final com o texto exato da Bia, a Lia revisa a arte final, selo "Revisado por Lia", 0 vazamento, e nenhuma fala visível com "a pessoa", "NOVA VERSÃO:" cru ou RealTurnCapError. Deixar RED agora; standby até Forge (D100-1) e Bolt (D100-2) avisarem; só então refazer o fake e avisar o Keel com o fingerprint. Rodada REAL só com OK escrito do Atlas com teto (o Keel pede).

**O que já está decidido no meu desenho (para quem retomar):**
- Módulo puro novo `persona-e2e/src/team-d100-gate.ts` + spec `tests/team-d100-gate.spec.ts`; entra no `evaluateTeamRound` por uma opção da expectativa (ex.: `d100Gate`) e no fake (`mandatory-team-round.spec.ts`) como `problems`. Nada disso existe ainda.
- Ponto de partida RED REAL = banco da tentativa 5 (`artifacts/team10/homes/real-attempt-5-2026-11-09T21-12-08-827Z`, lido hoje): 12 turnos; **2 artes** (`cartaz-pao-de-queijo.svg` no rascunho do Téo da divisão e `arte-cartaz-padaria-lua.svg` na Tarefa encadeada Bia→Téo — a colisão que a D-100 quer matar); a Lia selou só o trabalho da Bia (texto) — a revisão da arte do Téo ficou `sealed:false`; falas visíveis com "a pessoa" ("antes da aprovação da pessoa"); a Lia disse "Precisa de você: o limite de execuções reais desta rodada foi atingido (12 de 12)" como fala de persona; entrada 469 mil bruta (cache incluso; 144 mil em peso de preço, conta feita à mão sobre as 12 linhas do ledger). O gate tem de reprovar tudo isso.
- Fontes de cada checagem: turnos/entrada = `ledger`; **DECIDIDO pelo Keel (11:33): o "≤ 120 mil" é BRUTO** (`ledger.inputTokens`, cache lido incluso — o texto do Carbon, REVISÃO-01 §D dias 4-6, diz "tokens de entrada totais" e "corte >70% contra a tentativa 5": 469 mil → ~140 mil); o gate **assere o bruto ≤ 120 mil** e **reporta OS DOIS** (bruto e peso de preço, `priceWeightedInput`); o Keel leva ao Atlas se o teto de aceite deve ser bruto ou peso de preço ANTES de pedir o OK da rodada real (a t5 em peso de preço já era 144 mil); 1 arte = nomes-base distintos de svg/png fora de `inputs/` nos rascunhos; texto da Bia = bilhete Bia→Téo (`done`/`decisions`) e/ou a fala final dela, comparado com o texto do SVG final (sem diferenciar caixa; no real o Téo põe "PÃO DE QUEIJO" em caixa alta); Lia revisa a arte final = Tarefa do revisor tem o SVG com o mesmo sha do autor da arte; selo = `review_state` sealed + linha "Revisado por Lia"; "a pessoa"/"NOVA VERSÃO:"/RealTurnCapError = varredura das falas visíveis, bilhetes, títulos e resumos (sem pegar "uma pessoa"/"pessoas").
- Risco já conhecido (memória `replay-guards-offline-before-paid-runs`): toda regra nova tem de ser reprovada contra os bancos reais das tentativas 2–5 ANTES de qualquer rodada paga — regras erradas já gastaram tentativas duas vezes.

**O que falta (ordem):** (1) escrever `team-d100-gate.ts` + spec com frases reais da tentativa 5 como RED e frases limpas como GREEN; (2) ligar no `evaluateTeamRound` e no fake; (3) rodar o fake na árvore atual → deve dar RED (é o combinado); (4) standby até Forge/Bolt avisarem; (5) refazer o roteiro do stub (hoje o Téo chama `pass_forward` para a Bia e `ask_colleague` para a Lia — o desenho que a D-100 aposenta; o novo: Bia entrega o texto, a arte do Téo nasce depois do bilhete, 1 só arte, a Lia revisa a arte final) e dar o fingerprint ao Keel; (6) pedir ao Keel o OK escrito do Atlas com teto (≤ 6 turnos) antes de qualquer turno pago.

## 2026-11-07 15:35 — decisão do Atlas sobre a tentativa 3 + harness corrigido (leitor, vigia por peso de preço, fake com entrega longa) + V11 effort-board no lib 6

**Atlas (via Keel 15:20):** a tentativa 3 NÃO passa por causa de P0s de PRODUTO — a arte não vira arquivo (a persona de Arte entrega o SVG como texto, "não tenho ferramenta de imagem") e o bilhete perde a entrega (a nota da revisão leva só 290 caracteres). Meu veredito offline PASSED vale até a ressalva (sem rodada de opinião e sem Bom dia na real). **Tentativa 4 só depois dos P0-1/P0-2 corrigidos e do fake verde, com teto 11 (total ≤ 25) e OK escrito dele** (o Keel sugeriu ao Atlas uma frase humana no pedido, tipo "quero a opinião do time antes de eu aprovar", sem nome de ferramenta, para exercitar o comportamento 4).
**Harness salvo em persona-e2e (OK do Keel; check-pkg OK, 74 testes puros verdes; nada em host/lib):** (1) **leitor** — o nome do anexo do PRÓPRIO pedido não vaza (`foto.png`); a palavra "bilhete" só conta em linha escrita pelo HOST (a passagem tipada), não no texto da persona nem nos pontos da revisora; vazamento verdadeiro mantido e testado. (2) **vigia por PESO DE PREÇO** por turno (fresco ×1, cache lido ×0,1, gravado ×1,25; `priceWeightedInput`): a MESMA rodada da tentativa 3 repetida sobre o banco pesa 114,8 mil de 260 mil (maior turno 22 mil), sem aborto nem aviso; um turno nativo (309 mil gravados) pesa 386 mil e é abortado; teto de turnos e modo env mantidos. (3) **replay da tentativa 3 no harness corrigido: leaks 0, veredito PASSED, 0 problemas.** (4) **fake** — as partes da divisão respondem com uma entrega LONGA terminada em `FIM-DA-ENTREGA-COMPLETA`; o proof grava `fullDeliveryInReview` (hoje falso: a nota é clipada a 290) e vira EXIGÊNCIA com `PERSONA_TEAM10_FULL_NOTE=1` quando Tally/Bolt entregarem (~16:40); falta a checagem "arquivo de arte salvo no rascunho" (aguardo o contrato de quem entregar). Também: seis comportamentos com a VIA (`behaviorsVia`), hash da lib no proof (`libHash`, o do candidato = 7bd08b15), `treeMoved` (quem mexeu na árvore), gate por OK de tentativa (`atlas-ok-team10-N.txt`).
**V11 effort-board no lib 6 (stub, 0 IA):** 8 testes, 4 passaram. **HT-3 (a) passou no HOST** (linha `started` + 2º turno do stub com "Movi este cartão para Fazendo" no prompt: o conserto do Bolt vale; o texto na conversa só falhou porque o app estava numa aba de Configurações — corrigido); os 3 testes de EFF-1 tela falharam por SUPOSIÇÃO MINHA (a persona do onboarding vem como "Haiku", não "Padrão do motor"; a navegação de volta ao #geral) — corrigidos e dinâmicos pelo menu do host; **rodo no lib 6b com os textos NOVOS (Esforço, níveis nativos, chip "Opus · max")** que pedi ao Quill. HT-3 (b) (1º turno falha → Fazendo) e CV/FL-11 do chain anterior seguem como estavam; FL-11 "fila visível" vira teste normal depois do lib 6b (Flint).
**Pendências minhas:** `engine-class-policy.spec.ts` com timeout de 90 s no `it()` (pedido do Tally; arquivo de teste); rodar o spec no lib 6b; checagem "arte vira arquivo" e `PERSONA_TEAM10_FULL_NOTE=1` no fake da tentativa 4; novo congelamento curto + fake verde + OK escrito do Atlas (teto 11) antes de qualquer turno real.

---
## 2026-11-07 15:15 — TEAM-10 TENTATIVA 3 (REAL, candidato congelado): a EQUIPE COLABOROU DE VERDADE com a IA real (passagem, ajuda ×2, revisão com selo por ferramenta, foto vista por todos); a rodada foi ABORTADA pelo MEU vigia (rodada > 260 mil de entrada, conta cache) com 10 turnos medidos; veredito corrigido offline = PASSED

**Gasto real:** 10 turnos haiku medidos no ledger (`execution`, env_mode `needed` em todos) + o 11º em voo quando matei o host (o limitador contou 11): entrada 329 293 INCLUINDO cache (258 071 lidos + 71 152 escritos), saída 31 218; maior turno 69 989 (< 100 mil), nenhum nativo. **TEAM-10 total = 3 + 10 (11) = 13–14 de 17 autorizados** (teto 14 NÃO estourado; o arquivo diz `overbudget` porque o vigia da rodada abortou). Tentativa 3 era a última do OK de 07/11 (`atlas-ok-team10-3.txt`: teto 14, total 17); outra rodada exige NOVO OK.
**Comando:** igual ao da tentativa 2, trava `real`, `PERSONA_REAL_E2E_DIAGNOSED` (pedido sem fatos + leitor + driver + anexo da divisão + revisão sem "turn ended"), gate lendo `atlas-ok-team10-3.txt` (cap = min(14, 17 − 3)). Candidato: lib 6 `7bd08b154a45c131e718d6b5799176737d3ba7f0` (a do Quill), commit bc28dac5c2, impressão digital igual no início e no fim (0 arquivo mexido), fake FINAL verde antes (2 partes com a foto, 2 revisões seladas, 0 IA). Rodada 14:59:59–15:02:30 (149 s).
**O que a pessoa viu (resumo):** pedido autossuficiente + foto → Lia "Dividi assim: Téo — Arte; Bia — Texto." (PLANO DO HOST) → **Bia passou a arte ao Téo (pass_forward, escolha do modelo; o bilhete chegou à Tarefa dele)** → **Téo pediu ajuda à Lia (ask_colleague)** e entregou bloqueado ("não tenho ferramenta de imagem") → **Lia pediu ajuda à Bia (ask_colleague)**, Bia ajudou, Lia retomou → Lia ajudou o Téo, que retomou e entregou o cartaz como SVG no texto → **REVISÃO: a Lia aprovou e SELOU o trabalho da Bia (review_verdict por ferramenta)** e pediu ajustes ao SVG do Téo (2ª revisão em andamento no corte). A FOTO chegou às duas partes: Téo, Lia e Bia descrevem círculo vermelho, fundo azul, faixa amarela. NENHUMA pergunta à pessoa (o pedido autossuficiente funcionou; o driver de respostas não foi preciso).
**Os 6 comportamentos e a VIA (proof.json `behaviorsVia`):** 0 plano do host: divisão por função (2 Tarefas) · 1 bilhete chegou ao colega 3/3 (escolha do modelo) · 2 passagem pass_forward 1 (modelo) · 3 ajuda ask_colleague 2 (modelo) · 4 opinião (ask_team_opinion) **não ocorreu** · 5 revisão com selo: 2 revisões, 1 selo (revisão por política do host, veredito por ferramenta do modelo) · 6 Bom dia: sem leitura nesta rodada (abortou; já provado no real da tentativa 2: `posted` + `already`, 0 turno).
**Observador do Forge (`--any`) sobre o banco:** `collaborated true`; requests tool(help 2, next 1); bilhete 3/3, 0 linha do fio com bilhete; ajuda 2 pedidas/2 retomadas/0 esperando; reviews 2, sealed 1 (por ferramenta), **unreadable 0 (o conserto do "turn ended" do Bolt funciona no motor real)**; ledger 10 medidos ≤ 14. Únicos problemas: "2 chat lines authored by a technical actor" (filhos da divisão `team:split`, que a TELA esconde: falso positivo do observador, avisado ao Forge) e "no morning brief" (artefato do aborto).
**Por que abortou — erro MEU:** o vigia "rodada > 260 mil de entrada" (`ROUND_INPUT_ABORT_TOKENS`, números do Tally para 1 pedido) disparou com 329 mil porque a entrada do ledger SOMA cache lido (barato) e uma rodada boa de 10 turnos com ferramentas passa disso; era proxy do modo nativo, que o `env_mode` por turno e o teto de 100 mil por turno já cobrem. Recalibrar (pesar por turno + modo, manter o teto de turnos) assim que o Keel liberar o persona-e2e/src.
**Veredito do meu leitor: `harness-problem` por 5 LEAK-1 FALSOS POSITIVOS MEUS:** (a) `foto.png` = nome do anexo do PRÓPRIO pedido (a Téo diz "o foto.png não mostra pão de queijo"), pego pela regra "arquivos do bilhete vazam em qualquer linha"; (b) a palavra "bilhete" dentro do TEXTO da persona (termo que a própria UI mostra em "Caminho do trabalho"). Com as duas afastadas, no MESMO banco (0 IA, script fora da árvore): **`evaluateTeamRound` = PASSED, 0 problemas, 0 achados**. Correção pendente do OK do Keel (persona-e2e/src congelado).
**Achados de PRODUTO (devolvidos):** (1) **Bolt/Forge — `handoffs.ts:392–398`: a nota da REVISÃO leva só `clip(summary, 290)`: o revisor vê 290 caracteres da entrega do autor.** A Lia (modelo real) escreveu "O bilhete foi cortado logo após a menção ao SVG, então não consegui conferir a arte" e devolveu ajustes por isso: entrega longa não é revisável. (2) Forge — o observador acusa o autor técnico `team:split` (filhos da divisão, escondidos pela tela). (3) O conserto do anexo nas Tarefas filhas da divisão (Bolt) foi o achado do fake e está provado no real: a foto chegou às duas partes.
**DECISÃO PEDIDA (Keel/Atlas):** aceitar a tentativa 3 como evidência do TEAM-10 (colaboração por escolha do modelo, selo por ferramenta, sem pergunta à pessoa) apesar de: rodada abortada pelo meu vigia no meio da 2ª revisão, sem rodada de opinião (ask_team_opinion) e sem Bom dia na real? Ou nova tentativa 4 focada na opinião sobre a imagem (novo OK e novo total: sobram ~3 turnos dos 17).
**Evidências:** `packages/persona/persona-e2e/artifacts/team10/real-attempt-3-2026-11-07T17-59-59-722Z/` (proof.json com `behaviorsVia`, transcript.md, reading-transcript.md, capturas, `evidence/persona.db`; sessões da CLI no home `…/homes/real-attempt-3-…/projects/…/*.jsonl`), `artifacts/team10/real-attempt-3-observe.json`, orçamento `real-attempts.json` (`refused` 0 · `failed` 2 · `failed` 1 · `overbudget` 10). Também 07/11: lib 6 = `7bd08b15…` (hash reproduzido pelo `libHash()` do harness).

---
## 2026-11-07 13:52 — TEAM-10 TENTATIVA 2 (REAL): FALHOU no veredito ("não colaborou") com 1 TURNO pago; o encanamento está provado; LEAK-1 = falso positivo do meu leitor; a equipe perguntou à PESSOA e ninguém respondeu

**Gasto real:** 1 turno haiku (`execution`, env_mode `needed`, medido): entrada 16 180 (cache lido 11 046 / escrito 5 130), saída 2 054; vigia sem aviso; **total do TEAM-10 = 3/25 turnos**; cota semanal 4% (janela 7 d, reseta 14/11). A tentativa 2 era a ÚLTIMA (`MAX_ATTEMPTS = 2`): outra rodada real exige NOVO OK do Atlas.
**Comando (único):** `PERSONA_REAL_E2E=1 PERSONA_REAL_E2E_OK=TEAM-10 PERSONA_REAL_E2E_DIAGNOSED="pedido truncado … / ferramentas de equipe … " node scripts/persona/with-lock.mjs "Probe real TEAM-10 tentativa 2" --lock real --wait-max 3600000 -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-team-round.spec.ts --testTimeout 1800000 --hookTimeout 420000` (13:38–13:43, 246 s; teto 14, env limpo, isolamento provado p/ `claude 2.1.319`+haiku+settings `1794069386310:416`; fake FINAL verde da MESMA configuração, impressão digital `sha256:1f9f7c0e…` igual no início/no fim e igual ao snapshot das 13:25; árvore inalterada durante a rodada).
**O que a pessoa viu:** pedido natural + cartaz → Lia (Coordenação) "Téo assume este pedido. Te chamo na revisão quando estiver pronto." → Téo (Arte) **"Pergunta 1 de 4: Qual é a promoção da Padaria Lua? (produto, desconto ou preço, e se há brinde ou combo)"** com 4 chips (Desconto em % · Preço fixo / combo · Brinde ou compre 1 leve 2 · Outra) e "ou escreva do seu jeito na caixa abaixo" → faixa "Téo · Aguardando você" → depois o cartão "Resumo do dia: 1 coisa espera você". Tela limpa (claro/escuro capturados em `m9-fio-final-alto-*.png`). Ninguém passou adiante, pediu ajuda, abriu rodada de opinião ou revisou (observador do Forge `--any`: `collaborated false`, único problema "the persona did not collaborate"; integridade toda OK).
**Diagnóstico (meu + Bolt offline, da sessão REAL da CLI):** pedido INTEIRO chegou (90/90 caracteres; tentativa 1: 78/215), imagem entregue, as 4 ferramentas de equipe chegaram à CLI (`tools_json={}` corrigido), parágrafo D-097 no prompt. O modelo **entendeu o fluxo de equipe** ("quando você responder, passo o texto para a Bia") mas **não tinha fatos** (oferta, preço, prazo) → chamou `persona_ask` e a Tarefa ESPERA a pessoa (D-079 b); o harness não responde, então não houve 2º turno. **Falha de DESENHO DO PEDIDO + do harness (não responde cartão), não do produto.** O LEAK-1 do veredito (`harness-problem`) é o marcador tipado `[[persona-ask:{…}]]` no CORPO guardado do cartão (a UI o remove: `chat/wire-markers.ts` e mostra o cartão): **falso positivo do `team-transcript.ts`** — conserto: tirar o marcador de fio no fim do corpo como a UI e humanizar `persona-ask` como "Pergunta i de n: …".
**Positivos reais:** `persona_ask` funciona com o motor real e na tela (cartão de pergunta, chips, estado "Aguardando você"); isolamento `needed` (16 mil de entrada, não os 309 mil nativos); Bom dia `posted` + `already` com 0 turno; `exportDiagnostics.lastErrors` vazio; nenhuma linha `soft`; custo medido. **Achados de UX (sem dono ainda):** (a) "Pergunta 1 de **4**" para um pedido criativo simples é um questionário longo (comportamento do modelo; guidance do Forge poderia preferir marcar o que falta no próprio entregável, como o Tally viu com a Bia); (b) o balão de dica "A Coordenação distribui o pedido" fica SOBRE a última linha do fio e o campo a 1440×900.
**PARA A TENTATIVA 3 (só com OK do Atlas; teto 14; gasto 3, total ≤ 25):** (1) pedido auto-suficiente, ainda sem palavra de ferramenta (oferta, preço, prazo, canal, "preciso do texto e da arte; a foto é o rascunho"); (2) o driver responde sozinho aos cartões `persona_ask` abertos (chip neutro por `answerAttention`) e espera de novo (fato novo no veredito: "a equipe perguntou à pessoa"); (3) leitor corrigido; (4) fake verde da mesma configuração e novo congelamento curto. Nada real sem OK novo.
**Evidências:** `packages/persona/persona-e2e/artifacts/team10/real-attempt-2-2026-11-07T16-38-22-353Z/` (proof.json, transcript.md, reading-transcript.md, capturas, `evidence/persona.db`; sessão da CLI no home `…/homes/real-attempt-2-…/projects/…/*.jsonl`), observador: `artifacts/team10/real-attempt-2-observe.json`; orçamento: `artifacts/team10/real-attempts.json` (`refused` 0 · `failed` 2 · `failed` 1).

---
## 2026-11-07 13:30 — RETOMADA: V11 no BUNDLE 5 (25 verdes / 1 vermelho = HT-3, já com o patch do Bolt), fake do TEAM-10 verde menos a impressão digital, tentativa 2 à espera do congelamento

**Sem gasto real novo** (TEAM-10: 2/25 turnos; D-097 real do Tally = 1 turno, positivo). `check-pkg persona-e2e` OK; 73 testes puros do harness TEAM-10 + 39 (stub, orçamento, gate) verdes.
- **V11 web no bundle 5 `d8109efa` (stub, 0 IA; 593 s):** 6 arquivos, 25 passaram / 4 esperado-vermelho / 1 pulado / **1 vermelho = HT-3** (achado confirmado pelo Bolt: bug do HOST — mover cartão ENTREGUE para Fazendo escrevia "started" sem iniciar nada; patch aplicado no src 12:53, "pode rodar" 13:09). Esperados-vermelho que seguem: FL-11 fila visível (Flint), D-079(b) real (HT-14), 2 telas do EFF-1 cujos seletores eram da tela antiga → **reescritos** para a tela real do bundle 5.
- **EFF-1 tela (Quill, bundle 5), testes novos (reexecução pendente):** Configurações › Personas: chip por persona ("Sonnet · Caprichado" / "Padrão do motor") abre "Trocar motor"; Modelo = lista do HOST em palavras (nunca o id), Capricho = só os níveis que o modelo aceita, linha "Lista padrão do Claude: sua conta não informou os modelos" quando `source: static`, nada de "Recomendado", layout EMPILHADO (Capricho abaixo e na largura do Modelo); teclado (seta move o segmento); Aplicar grava para ELA só (host) → chip "Opus · Muito caprichado" → o próximo turno pede `--model opus --effort xhigh`; o cartão da persona mostra o mesmo chip.
- **HT-3 (Bolt 07/11):** (a) cartão ENTREGUE sem pasta + Fazendo → `harness {outcome:'started'}` + 2º turno do stub com "Movi este cartão para Fazendo" no prompt; (b) NOVO: 1º turno FALHA (chave por arquivo `FAKE_CLI_FAIL_FILE` no stub) → cartão → Fazendo → 2º turno RODA. O lado `held/delivery_pending` (projeto COM pasta) é do teste do host do Bolt.
- **TEAM-10, o que mudou no harness (sem IA):** o fake agora PROVA que o pedido INTEIRO chega ao worker (o stub registra se o prompt contém o texto — era a causa da tentativa 1: `stubRequestTurns`), que o 2º "Bom dia" responde `already` com o mesmo id (nunca 2º cartão), e NOMEIA quem mexeu na árvore se a impressão digital mudar (manifesto por arquivo). **Teto da tentativa 2 = 14** (min(teto, restante), não os 23 que sobravam). Isolamento da real provado para o `claude` 2.1.319 (verdict `needed` + paridade haiku/settings), então sem recusa de preflight.
- **Fake no bundle 5 (host ainda em movimento):** verde em tudo (preflight, 3 personas, cartaz até a CLI, pedido inteiro no worker, Bom dia `posted`+`already` com 0 turno, diag/soft vazios) exceto a impressão digital (alguém salvou `persona-host/src/orchestration.ts` durante a rodada). **Congelamento 13:25 (Keel)** → fake FINAL → tentativa 2 REAL (teto 14, total ≤ 25) com o observador do Forge (`--any`).
- **Pendente:** rerodar o spec effort-board (EFF-1 tela + HT-3 a/b) quando houver vaga `build` (Flint e Ember seguram as 2).

---
## 2026-11-05 06:40 — ⏸ PAUSA TOTAL (ordem do Atlas/Miguel: cota semanal do Claude em 85%) — ESTADO EXATO DO PROBE

**Parado no ponto seguro. Nada em execução, nada na fila, nenhuma trava segurada, nenhum arquivo pela metade.** A última edição em `packages/persona/persona-e2e` foi `src/team-round-driver.ts` (leitor com `stateLine` + `dailyBrief`); `check-pkg persona-e2e` ficou **VERDE** depois dela e eu não editei nada desde então. Conferi: nenhum processo meu (`Probe V11 web`, `Probe TEAM-10`, `v11-chain.sh`, `team10-*.sh`) vivo. **Nenhuma IA real será rodada.** CANCELADAS: tentativa 2 do TEAM-10 e o teste real do D-097.

**Gasto real total do TEAM-10: 2 turnos haiku de 25** (tentativa 1, 05:29–05:34, FALHOU no veredito: o worker recebeu o pedido truncado e não usou ferramenta de equipe). Antes: D-069 = 1 turno. A ligação das 05:20 foi recusada no preflight com 0 turnos. Cota da semana que eu li: 82% (Tally, 05:18) → 83% (host, 05:33). Estado do orçamento em `packages/persona/persona-e2e/artifacts/team10/real-attempts.json` = `[ {refused, 0 turnos}, {failed, 2 turnos} ]` (gasto 2/25; se o Atlas reabrir, a próxima é a tentativa 2, com `PERSONA_REAL_E2E_DIAGNOSED`, teto ≤ 23).

**FEITO (tudo verde nos testes puros e no typecheck; 0 IA):**
- TEAM-10 no host da árvore: `src/team-round-driver.ts` (um driver para fake e real), `src/team-round-tree-gate.ts` + `src/team-round-budget.ts` (OK do Atlas + orçamento 14/25 + "fake verde da MESMA configuração"), `src/team-round-guard.ts` (vigia de ledger: native/>100 mil por turno/>260 mil na rodada; prova de isolamento de qualquer modo isolado), `src/tree-fingerprint.ts` (impressão digital de `packages/persona/*/src` + `apps/cli/src` + `persona-e2e/src` + lib do cliente), `src/team-round-verdict.ts` (D-097: `passed | did-not-collaborate | harness-problem` + os 4 comportamentos), `src/host-flags.ts`, `src/fake-cli.ts` (`withRealEngine`; o stub registra imagem recebida), `fixtures/fake-cli/fake-cli.mjs`, `src/web-host.ts` (`cleanEnv`, `output()`), `src/real-app-session.ts` (`cleanHostEnv`, `home`, engine `real`), `src/ledger-evidence.ts` (`envMode`, `-shm` EBUSY), `tests/mandatory-team-round.spec.ts` (fake + real gated), `tests/team-round-*.spec.ts`, `tests/host-flags.spec.ts`, `tests/mandatory-team-image-plumbing.spec.ts` (4/4).
- E2E-V11 (placar enviado ao Keel 06:30): CV-5/8 5/5; CV-1/3/7 7+1 pulado; FL-11 6 + 1 esperado-vermelho (fila visível → Flint); EFF-1 host 3 verdes (tela → Quill/Flint); plumbing da imagem 4/4; D-079(b) `it.fails`; **HT-3 vermelho/achado** (started sem turno; pergunta aberta ao Bolt).
- Evidências da tentativa 1: `packages/persona/persona-e2e/artifacts/team10/real-attempt-1-2026-11-05T08-29-28-285Z/` (proof.json, transcript.md, reading-transcript.md, capturas claro/escuro, `evidence/persona.db`); home guardado em `artifacts/team10/homes/…`. Fake mais recente: `artifacts/team10/fake-proof.json` (agora **obsoleto**: o código mudou depois dele).

**PELA METADE: nada.** O que falta é só ação futura (abaixo).

**PRÓXIMOS PASSOS (só quando o Atlas chamar; nada disso foi iniciado):**
1. Reler `persona-spec/reports/probe.md` (entradas 19–22) e `persona-spec/reports/probe-team10-plano.md`.
2. Se o Atlas reabrir o TEAM-10: esperar o "BUNDLE 5 PRONTO" do Keel → refazer o **fake** (`PERSONA_E2E=1 PERSONA_TEAM10=fake` com `--lock build --priority` autorizado pelo Keel) → "fake verde, vou rodar" ao Keel → congelamento → tentativa 2 (comando no `probe.md`, entrada 20); exige novo OK com teto, `PERSONA_REAL_E2E_DIAGNOSED`, e a causa do pedido truncado corrigida e provada a seco (Forge/Bolt).
3. Rerodar no bundle 5 as de UI do V11 (EFF-1 tela, FL-11 fila) e o diag de contratação (`scripts/v11-hire-diag.ts`, ainda NÃO rodado: pergunta de produto sobre como contratar a equipe sugerida pela barra única).
4. Pendências antigas: reescrever o DET-1 instalado depois do conserto do Forge; `installed-roteiro.ts --v11` no próximo exe (agora também confere a linha de boot das 4 chaves); D-079(b) real só com modelo (HT-14).

**ARQUIVOS (modificados/novos em `packages/persona/persona-e2e`, todos consistentes e com tsc verde):** ver lista acima; `README.md` ganhou a seção "TEAM-10 on the TREE host". Observação: existe um `packages/persona/persona-e2e/.tmp-edit.mjs` não rastreado que NÃO é desta rodada (resto de edição antiga; pode ser apagado pelo Keel/dono).

---
## 2026-11-05 06:35 — placar final do E2E-V11 (bundle 3 + host da janela), plumbing da imagem 4/4, achado HT-3; TEAM-10 pronto para a tentativa 2 (D-097)

Sem gasto real novo (a tentativa 1 do TEAM-10 ficou em 2/25 turnos). `check-pkg persona-e2e` OK.
**Placar (web, stub, 0 IA) — dono do vermelho entre parênteses:**
- **CV-5** menções (`@Mídia e @Criação` = UMA Tarefa "com Criação"; e-mail/“@Anabela” não chamam ninguém) + **CV-8** "Toda a equipe" (um bloco, uma linha por persona, `estimateAsk` exato): **5/5 verdes**.
- **CV-1/CV-3/CV-7:** trilho com lugares, Ctrl+K, Alt+↑/↓, trilho de 64 px a 960 px; "Quem responde" (popover, teclado, volta à Coordenação depois de UMA mensagem, `@` filtrado vira chip); vazio do canal: **7 verdes + 1 pulado** (CV-7 do canal de EQUIPE: o cenário ainda não gera canal de equipe → Anvil/CV-6).
- **FL-11:** host (fila persistida, "Direcionar agora" no turno aberto, Parar) + chip "Direcionou {persona}" + "Você parou aqui · Continuar": **6 verdes**; **vermelho esperado:** fila VISÍVEL (bolhas tracejadas Editar/Tirar/Desfazer) → **Flint**.
- **EFF-1:** host (`setPersonaEngine`; argv `--model sonnet --effort high` só da persona certa; menu de níveis em `listConnections`) = **3 verdes**; **vermelho esperado:** a TELA (Configurações › Uma persona: Modelo + Capricho; chip "Sonnet · Caprichado") → **Quill/Flint**, rerodar no bundle 5.
- **HT-3 (vermelho, achado):** `moveTicket` de um cartão JÁ ENTREGUE (stage review) posta a linha tipada `board_card_move` "started" ("Criação começou “…” porque você moveu para Fazendo"), mas **nenhum turno roda** (stub: `invoke:claude → stdin → stdin-end → exit`, sem `turn`). Pergunta ao **Bolt**: é esperado para cartão entregue? como obter um cartão A FAZER no harness (não há Remote que crie cartão)? Se o contrato é "só inicia com trabalho pendente", a linha devia ser `held` com motivo.
- **Plumbing da imagem:** anexo → mensagem do pedido → CLI do stub recebe a imagem (bloco `image`/arquivo no prompt) → a persona responde e o anexo continua na linha da pessoa: **4/4 verdes**.
- **D-079(b):** `it.fails` (gate HT-14) como esperado; só provável com modelo real.

**TEAM-10, tentativa 2 (D-097, OK antecipado do Atlas: assim que o fake der verde no BUNDLE 5; teto 14, total ≤ 25, restam 23):** pedido NATURAL "Faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram" (anexo `foto.png` na mensagem, sem @, sem gatilho); veredito novo `passed | did-not-collaborate | harness-problem` (achado "não colaborou" ≠ erro de harness; mede passou adiante / pediu ajuda / opinião / revisão e selo); guardas para o D-096 (padrão `needed`; prova de isolamento de QUALQUER modo isolado; `native` continua matando em rodada sem conector); onboarding coberto só na CAPTURA (`getOnboarding` interceptado — `completeOnboarding` gastaria 1 turno real: Anvil); leitor com `stateLine` tipado e `dailyBrief`. Cronograma do Keel: janela de host fecha 07:00; bundle 5 ~07:20; fake ~07:40; tentativa 2 logo após.

---
## 2026-11-05 05:40 — TEAM-10 rodada REAL no host da árvore, tentativa 1: FALHOU no veredito (2 turnos de 14); V11 no bundle 3 (CV-5/8, CV-1/3, FL-11 verdes)

**Gasto real:** 2 turnos haiku (execution, `answer-only` nos dois), entrada 10 394 (5 246 + 5 148; cache escrito 5 752, lido 4 638), saída 1 290; maior turno 5,2 mil de entrada (sem aviso, sem nativo). Cota da semana: 82% (Tally, 05:18:49) → 83% oficial lido pelo host às 08:32Z. Total gasto no orçamento: **2/25** (tentativa 1 usada; a 2ª só com diagnóstico OFFLINE + OK).
**Comando (único):** `PERSONA_REAL_E2E=1 PERSONA_REAL_E2E_OK=TEAM-10 node scripts/persona/with-lock.mjs "Probe real TEAM-10" --lock real --wait-max 3600000 -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-team-round.spec.ts --testTimeout 1800000 --hookTimeout 420000` (OK do Atlas via Keel 03:03/05:29; congelamento geral 05:18–05:35; env limpo; teto do app = vigia = 14; ledger fresco; fake verde da MESMA configuração, impressão digital início=fim `sha256:189abc15aea7…`, commit bc28dac5c2, lib do bundle 4 `9f9964b1…`).
**Antes dela:** uma 1ª ligação às 05:20 foi RECUSADA no preflight antes de qualquer pedido (0 turnos): eu li a sonda do `claude` em `phase 'checking'`. Corrigido (espera `ready`, até 90 s); recusa de preflight agora é `refused` e não consome tentativa; vigia: `native`/peso >100 mil mata o host, silêncio de modo é aviso.

**Veredito (`evaluateTeamRound`): FALHOU — 1 problema: "no visible handoff line".** Fato central: **a Bia recebeu o pedido TRUNCADO** — respondeu "Não consegui ver o texto completo do pedido: ele termina em 'Padaria Lua e…'" e escreveu só um rascunho de texto; **nenhuma ferramenta de equipe foi usada** (sem `ask_colleague`, sem `pass_forward`, sem rodada de opinião); a Lia só revisou (turno 2; revisão `closed`, sem selo). As palavras que ligam as ferramentas ("depois o Téo faz a arte", "Peça à Lia…", "veja a opinião da equipe") vinham DEPOIS do corte. Hipótese (a confirmar offline, Forge/Bolt): o prompt do worker leva só o título da Tarefa (cortado em ~80 chars), não a mensagem inteira; ou as ofertas foram calculadas e o haiku não chamou. Atenção: se for o título, é um defeito de PRODUTO que atinge qualquer pedido longo, fora do TEAM-10.
**O que passou:** preflight (4 chaves de produção ligadas, claude pronto+logado, isolamento provado: claude 2.1.318/haiku/settings 1793761922390:403), 3 personas semeadas (autonomia `act`), cartaz anexado À mensagem e **chegou ao modelo** (a Bia descreveu "paleta azul, vermelha, branca e amarela"; ≥2 fatos do cartaz), 0 vazamentos (LEAK-1), `exportDiagnostics.lastErrors` vazio, nenhuma linha `soft …`, ledger medido, sem assinatura de fake, bilhete Bia→Lia entregue fora do fio, "Bom dia agora" `posted` ×2 com **0 turnos** (observação de produto: os dois cartões saem com o MESMO texto "Bom dia. Precisa de você: 1 coisa espera você." — duplicado no fio), árvore inalterada durante a rodada.
**Evidências:** `packages/persona/persona-e2e/artifacts/team10/real-attempt-1-2026-11-05T08-29-28-285Z/` (proof.json, transcript.md, reading-transcript.md, capturas m0/m-160s/m9 + `m9-fio-final-alto-claro|escuro.png`, `evidence/persona.db`; home guardado em `artifacts/team10/homes/…`). Observador do Forge e leitura de custo/cota do Tally (`persona-spec/reports/team10-reading.md`) em andamento.

**E2E-V11 — bundle 3 com o host congelado (stub, 0 IA):** CV-5/CV-8 **5/5 verdes**; CV-1/3 **7 verdes + 1 pulado** (CV-7: o canal de equipe ainda não nasce nesse cenário); FL-11 **6 verdes + 1 esperado-vermelho** (a fila visível Editar/Tirar/Desfazer → Flint; o chip "Direcionou" e o "Você parou aqui · Continuar" já estão verdes); EFF-1/HT-3: 2 vermelhos meus na 1ª passada (forma do cartão da persona e diagnóstico do "started" sem turno do stub) — corrigidos, reexecução pendente (fila `build`); `mandatory-team-image-plumbing` pendente.
**Recado de produto:** o bundle 3 liga todas as flags v1.1 do cliente por padrão → `getByRole('button', {name:'Contratar persona'})` (trilho antigo) some; harness contorna com `persona.flag.navPlaces='0'` só na contratação. Pergunta aberta: qual o caminho de contratar a EQUIPE SUGERIDA pela barra única depois do onboarding?

---
## 2026-11-05 03:58 — E2E-V11 (web, stub, 0 IA) 1ª rodada + achados do BUNDLE 3; TEAM-10 pronto no host da árvore (fake pendente da janela de host)

Nada real gasto. `check-pkg persona-e2e` OK; 30 testes puros novos verdes (orçamento, gate, vigia, isolamento, palavras do pedido).

**E2E-V11 — 1ª rodada (bundle 2):** CV-1/3/7 (conversas) 5 verdes + 2 vermelhos **meus**; CV-5/CV-8 3 vermelhos, FL-11 4, EFF-1/HT-3 3 vermelhos; D-079(b) `it.fails` (gate HT-14) verde como esperado. Causas, todas do HARNESS (nenhum bug de produto achado nesta rodada):
- `channelMessages` pedia `listMessages` com `limit: 400`; o host aceitava até 200 e devolvia página **vazia** (o Bolt agora responde `invalid-payload`) → "a linha tipada nunca chegou" em CV-5 (`coord-<id>-with`), CV-8 (bloco `coord-<id>-fan-…`), FL-11 (`stopped`), HT-3 (`board_card_move`). Corrigido: pagino com 200 + `nextSeq`.
- CV-1 Alt+↓/↑ lia o `<h1>` ("Mensagens diretas") em vez da linha ativa (`aria-current="page"` no trilho); CV-3 `@` casava também o botão do trilho → só o `option` do popover. Corrigidos.
- CV-5 "e-mail não chama ninguém": qualquer mensagem do canal abre uma Tarefa para a responsável padrão; a afirmação certa é "nenhum colaborador e nenhuma linha `com {nome}`" (agora assim). EFF-1 host: o menu de modelos/níveis vive em `listConnections` (`models`/`defaultEffortLevels`), não em `listEngineOptions`.
- FL-11: os 2 `it.fails` da UI do Flint (chip "Direcionou {persona}", "Você parou aqui · Continuar") **passaram** → viraram testes normais (a UI chegou no bundle 2). A fila visível (bolhas tracejadas Editar/Tirar/Desfazer) continua `it.fails` → Flint.

**BUNDLE 3 — achado que quebra harness (aviso feito ao Gauge e ao Keel):** `flags.ts` nasce com TODAS as flags v1.1 do cliente LIGADAS (`navPlaces` incluída): o trilho antigo some e `getByRole('button', {name:'Contratar persona'})` (`gauge-app.ts: openStructureAssistant/hireSuggestedTeam`) estoura timeout num app aberto sem flag. Contorno (`v11-app.ts`): `persona.flag.navPlaces='0'` + reload só durante a contratação, depois o padrão do produto. **Pergunta de produto aberta:** existe caminho de contratar a EQUIPE SUGERIDA (assistente "Monte uma equipe…") pela barra única depois do onboarding? Ctrl+K › "Contratar persona" abre o editor de uma persona em branco; o diag `v11-hire-diag.ts` ficou escrito, na fila.

**Cadeia V11 no bundle 3 + plumbing da imagem** (`mandatory-team-image-plumbing.spec.ts`: anexo → mensagem → CLI do stub recebe a imagem) enfileirada na `build` sem priority; resultado na próxima entrada.

**TEAM-10 — rodada real no HOST DA ÁRVORE (termos do Atlas via Keel 03:03: harness web, claude real, defaults de produção, answer-only, 1 pedido + imagem a 3 personas haiku, teto 14 na 1ª tentativa, total ≤ 25 só com diagnóstico offline).** Pronto, 0 gasto:
- `src/team-round-driver.ts` (um driver para fake e real): host da árvore com env LIMPO (`startWebHost({cleanEnv})`), linha de boot `defaults=production` + 4 chaves ligadas conferida, `claude` disponível+logado, **isolamento provado** para esta versão do claude e o estado das configurações (`isolationProofProblems` sobre o `isolation-gate.json`), 3 personas (Lia/Bia/Téo, haiku, autonomia `act`), cartaz anexado À mensagem, UM pedido, vigia do ledger a cada 1,5 s (teto do app + teto do vigia; modo do turno `answer-only`/`needed` obrigatório; 100 mil/turno e 260 mil/rodada = limites medidos pelo Tally), Bom dia agora (`postDailyBriefNow`, confere 0 turnos), cota antes/depois, `exportDiagnostics().lastErrors`, transcrito de leitura via `analyzeTeamStreamNoise`, cópia do banco.
- Gate (`team-round-tree-gate.ts` + `team-round-budget.ts`): `.maestri/tmp/atlas-ok-team10.txt` (Keel escreveu: `Teto de turnos: 14`, `Total máximo: 25`), 2ª tentativa só com `PERSONA_REAL_E2E_DIAGNOSED`, queda/ledger ilegível cobra o teto inteiro, **fake verde da MESMA configuração** (commit + impressão digital do que a rodada roda, igual no início e no fim da execução).
- O pedido único foi escolhido pelas PALAVRAS que ligam as ferramentas (`teamToolsNeeded`): "@Bia escreva o texto curto do cartaz … e depois o Téo faz a arte. Peça à Lia que confirme o tom. O cartaz anexo é o rascunho atual: veja a opinião da equipe antes de fechar." → `ask_colleague`+`pass_forward`+`ask_team_opinion` (o pedido original não ligava nenhuma). Forge aprovou; estimativa 7–12 turnos.
- **Ensaio fake (3 rodadas no código de cada momento):** preflight OK, equipe semeada, cartaz chegou à CLI do stub (1 turno com imagem), 2 turnos medidos, 6 linhas no fio, Bom dia "posted" ×2 com 0 turnos, transcrito de leitura gerado; o veredito do fake reprova como esperado (sem passagem real). Bugs meus achados no ensaio: leitura do `-shm` do banco vivo no Windows (EBUSY) — corrigida; ordem das personas. **Falta:** o fake FINAL com host congelado + lib do bundle 4 (Keel: janela de host até 04:45; fake ~05:00–05:15; real logo depois).

**Observador do Forge** (`team-round-observe.ts`) será a segunda leitura do banco da rodada real; Tally mede custo; Muse recebe as capturas.

---
## 2026-11-05 01:00 — validação da v1.1 no tree (D-079 web, CV-4, SW-9 host), plano da rodada real da equipe (TEAM-10); roteiro estrito `--v11`

Nada real gasto desde o D-069 (os 2 turnos que sobraram NÃO estão liberados — Atlas). `check-pkg persona-e2e` OK.
- **CV-4 (rosto abre a DM) — 5/5 verdes no web (tree + bundle 2):** clicar no rosto abre a DM sem cartão no rail, na faixa do #geral e no organograma; o cartão abre pelo ⋯ (`data-persona-card-trigger`), por hover longo (700 ms; precisa de uma entrada nova do ponteiro) e por Shift+F10; organograma em Lista: Enter = DM, Shift+F10 = cartão. Spec `mandatory-conversation-face-dm.spec.ts`.
- **SW-9 camada do HOST — 6/6 + 2 todo:** `mandatory-simple-workspace-host.spec.ts` pelos Remotes do PersonaHost em `.docx/.xlsx` reais, pasta sem git: S1 (rascunho intacto → Aplicar → ponto de restauração listado → `getProjectStorageUsage` medido → Desfazer byte a byte, sem `.git`), S5×3 (conflito: para e nomeia o arquivo; keep_mine/persona/both + Desfazer), S4 (planilha aberta: “Feche “preços.xlsx”…”, tudo ou nada, funciona depois), id de ponto inventado nunca vira sucesso. Faltam a UI (SW-8) e o instalado (SW-10).
- **D-079 no web, com o conserto do Bolt no tree:** (a0) canal SEM equipe → "Ainda não há ninguém na equipe para responder…" ✔ (nunca mudo); com a equipe sugerida contratada: (c) "Passei para Mídia…" (uma linha) ✔; (b) a pergunta da persona aparece mas a RESPOSTA da pessoa não é absorvida pela Tarefa que perguntou (sem 'Resposta enviada para …'; vira conversa e outro turno) — suspeita: o `waiting`+question no caminho do runner real chega como TEXTO e não abre atenção; pergunta feita ao Bolt (formato exato do relatório do worker `claude`). Achado de UI: o balão "A Coordenação distribui o pedido" cobre o composer e intercepta o clique (harness agora usa foco).
- **Instalado (H2 #4):** o D-079 do exe agora contrata a equipe antes de (a)–(d) e só exige o caso sem equipe com `PERSONA_E2E_V11=1`; o roteiro ganhou `--v11` (LEAK-1 e D-079 deixam de ser tolerados) e sai com código 1 em qualquer `FALHOU (…)`.
- **TEAM-10 (rodada REAL da equipe, D-090 b) — plano para o Atlas:** `persona-spec/reports/probe-team10-plano.md` (cenário único cartaz + imagem, 3 personas haiku, ≈10–12 chamadas, **teto proposto 14**, 1 tentativa, só com AO-1 padrão no exe — no modo nativo seriam ~3–4 milhões de tokens: não rodar; critérios fail-closed; dependências por dono; opt-in `PERSONA_TEAMWORK=1`/`PERSONA_FANOUT=1` no ambiente do app). Peças prontas: `team-transcript.ts` (fio em ordem, anexos, **Bilhetes** fora do fio com "o colega recebeu" provado no Ticket, **Revisões**, ledger medido/roteirizado, vazamentos incl. texto do bilhete por regra do Forge), `team-image-fixture.ts`, `team-round-verdict.ts`, `clean-env.ts`. Aguardo: bundle/exe com os hosts novos, transcrito limpo do Gauge e o OK + teto do Atlas.
- **Memória:** heredoc/`node -e` do Windows come barras invertidas (use Write/Edit para regex); autorização de execução real é por finalidade e teto.

---

## 2026-11-05 00:20 — **V1-P0-5 / D-069: 1ª entrega REAL VERDE na 1ª tentativa** (H2 #4, Setup instalado, commit bc28dac5c2)

**Veredito: VERDE.** Tentativa 1 de 3, 1 turno pago (≤ 3), `verifyRealFirstDeliveryRun` (Forge) `passed`, ledger MEDIDO, limitador do app 1/1 válido.
- **Build:** commit `bc28dac5c2` (base 4b2c752b47 + conserto ENG-1). Setup `C:\p8c\Persona-Setup.exe` 345.111.495 B, sha256 `665d495815ee5e81c23bacbe9e5c05017ae6dcd8ca22ee03074ec2483a6a1f6c`; instalado em `C:\p8i` (silencioso, 59 s); `Persona.exe` 246.302.720 B sha256 `ab55a5b23bc8ffed640df779fe91f95572113377cbe75e3b85cc261f7d70f9dd` (= o `win-unpacked` do Rivet). Literal do limitador no `app.asar`. Perfil limpo, env limpo (sem VITEST), CLI real `claude` logada (`claude auth status --json`), persona `{"cli":"claude","model":"haiku"}`.
- **Fake verde na MESMA exe antes da real:** roteiro #7 (00:12) `PASSOU (LEAK-1 aberto; D-079 (a) conhecido)`: installed-happy=passed (1 turno do stub, ledger medido, limitador 1/1 e recusa do 2º turno, chat persiste), sem-IA=passed.
- **Tempos (ms desde que a janela anexou; Muse mede, o proof é a medida oficial):** "Pedir agora" 28 298 → "Equipe trabalhando" 28 687 → eco do pedido no #geral 38 732 → "Em andamento" 42 746 → **1ª entrega no #geral 56 740** → "Aceitar e entrar" visível 57 350 → aceito 57 751. **Pedido → 1ª entrega = 28,4 s** (orçamento 2 min); "Equipe trabalhando" → entrega = 28,1 s.
- **Tokens (turn_ledger, `origin: measured`, 1 turno `claude/execution`):** entrada **308 902**, saída **783**, cache lido 0, cache escrito 308 900. ATENÇÃO: no ledger a entrada JÁ INCLUI o cache escrito (308 902 = 2 novos + 308 900), então a requisição foi de ~**308,9 mil tokens** (o `totalRequestTokens` do proof, 617 802, soma duas vezes; corrigido no harness para a próxima — o proof desta rodada fica como foi gravado). Isto é a **linha de base D-085, modo native** (a chamada inchada: peso das ferramentas/MCP do app; ~8× os ~38–44 mil do Tally sem as ferramentas).
- **Custo estimado (não há tabela de preço no repo; estimativa, conta Max sem cobrança por token):** com preços públicos de Haiku (US$ 1/M entrada, 1,25× na escrita de cache, US$ 5/M saída) ≈ 308 900 × 1,25/M + 783 × 5/M ≈ **US$ 0,39**.
- **O que a pessoa viu (transcrito em `real-installed/transcript.md`, do `persona.db` copiado):** "Em andamento: Primeira entrega" → a entrega de verdade, em português, honesta: "Resumo do que a equipe sabe sobre a empresa — Não há acesso ao Cofre nesta tarefa … os cinco pontos vêm só do brief recebido: 1. Agência Ponto, estúdio de sites e campanhas. 2. PMEs. 3. Cliente atual: Padaria Lua. … 5. Lacunas: não há dados sobre equipe, preços, outros clientes, ferramentas, prazos ou metas. Proposta da primeira tarefa prática: diagnóstico inicial para a Padaria Lua …" → "Primeira entrega pronta". Quadros: 0 fixtures de demo, o card entregue conta como concluído (read-only).
- **Abertos (conhecidos, não bloqueiam):** LEAK-1 — o #geral mostra como "Você" o prompt interno ("A Coordenação: faça o pedido abaixo … Não use ferramentas … Brief da empresa …"); corrigido no tree da v1.1. (O marcador `\bbrief\b` também acusa a palavra "brief" na resposta do modelo — falso positivo do leitor, não é vazamento.) D-079 (a) 'obrigado' mudo em canal sem equipe — corrigido pelo Bolt no tree da v1.1.
- **Evidência:** `packages/persona/persona-e2e/artifacts/first-delivery/real-installed/` (`proof.json`, `verifier-input.json`, `verifier-output.json`, `transcript.md`, `evidence/persona.db`, capturas m0-t0, m1-working, m3-geral-ask-echo, m4-geral-persona-message, m6-accept-visible, m7-after-accept, m9-quadros). Para parar na 1ª verde: não há mais tentativas; 2 dos 3 turnos autorizados ficam sem uso.

---

## 2026-11-04 22:25 — ENG-1 resolvido na causa (produto: empacotamento); H2 #4 = validação; TEAM-10 (rodada real da equipe) com peças prontas

Nada real gasto. `check-pkg persona-e2e` OK.
- **ENG-1 (Rivet, 22:15):** no exe H2 #3 o `import('@botiverse/oar')` quebra (`SyntaxError … PI_ATTRIBUTION`: `@earendil-works/*` flutuou 1.3.0→1.5.0 fora do lockfile no runtime empacotado) ⇒ `engine_unavailable` síncrono, 0 turnos. A minha prova (stub fiel + eventos `stdin/stdin-end/exit` do stub: só sondas de detecção, nenhuma sessão de turno) apontou o produto; o limitador real-turn-cap foi descartado (sem CAP também falha; ledger ausente = vazio).
- **Plano do Keel (Atlas OK):** H2 #4 = base 4b2c752b47 + só o conserto do Rivet (deps travadas + gate de import real de todos os runtimes), sem congelar o tree. Eu rodo o FAKE (roteiro #5) e, verde, a 1ª entrega REAL D-069 (≤3 turnos haiku, limitador absoluto/fresco, env limpo, `baseline D-085` native). Registrar o hash/sha256 que o Keel anunciar.
- **D-090 / TEAM-10 (a minha parte: a rodada REAL curta, só depois do ENG-1 e do roteiro verde):** peças prontas e testadas — `src/team-transcript.ts` (transcrito legível do `persona.db`, vazamentos marcados), `src/team-image-fixture.ts` (PNG fixo), `src/team-round-verdict.ts` (`evaluateTeamRound`: ledger medido ≤ teto, sem assinatura do fake, ≥2 personas, linha de passagem visível, a imagem chegou e outra persona descreveu ≥2 coisas que ela realmente mostra, sem LEAK-1/erro de motor); 9 testes unitários. O fluxo espera as telas/ferramentas TEAM-* e o OK/teto do Atlas.
- **Corrigido no meu harness hoje:** `startInstalledDesktop` limpa `VITEST*`/`PERSONA_SCRIPTED*`/`NODE_ENV=test` e recusa lançar com variável de modo-teste; `startDesktop` ganhou `cleanEnv` e não se auto-trava quando o chamador já está sob `with-lock`; o real acusa ledger com assinatura do fake.

---

## 2026-11-04 21:45 — fake no instalado (H2 #3, 4b2c752b47): 3 falsos vermelhos do HARNESS corrigidos; resta 1 recusa SÍNCRONA do runner no exe (engine_unavailable)

Nada real gasto. Setup `C:\p8c\Persona-Setup.exe` d940ccf6…c2ba (352.396.932 B, `pack exit 0` 20:17); instalado em `C:\p8i`, `Persona.exe` sha256 2b8030ba…3462 (246.302.720 B), literal `PERSONA_REAL_TURN_CAP` no `app.asar`. Install silencioso 244 s.
- **Rodada #1 (20:36, 3/3 vermelho)**: detecção "Verificando…" > 40 s e 'celebrate' em <1 s com 0 turnos. **Causa (Forge, confirmada no código): o exe herdava `VITEST=true`** do vitest ⇒ `product.ts`/`runner.ts` rodam o runner FAKE scripted (readiness forçado, engine `dsh`, 1/1 tokens, banco `:memory:`); a "detecção de 3 min" também era esse modo.
- **Rodada #2 (20:52)**: meu erro adicional — um `\|` perdido (heredoc do Node no Windows) virou alternância sempre verdadeira e o fluxo saiu do passo 3 em 1,5 s.
- **Correções (persona-e2e)**: `src/clean-env.ts` (tira `VITEST*`, `PERSONA_SCRIPTED*`, `*_SCRIPTED_STREAM`, `NODE_ENV=test`); `startInstalledDesktop` recusa lançar com variável de modo-teste no env final; o real acusa **ledger com assinatura do fake** (engine `dsh` / 1-1 tokens); o fluxo espera Claude "Pronta" estável por 4 s (`PERSONA_E2E_DETECT_SETTLE_MS`, padrão 300 s no instalado) e **falha rápido** com o texto do app ("O motor de X não está disponível…"). LEAK-1 (Muse): `leak1.firstDeliveryLines` no proof + `PASSOU (LEAK-1 aberto)` no veredito; D-085: campo `baseline D-085` (native; fail-closed) no proof real.
- **Rodada #4 (21:17, env limpo)**: detecção < 1 s (Claude/Codex "Pronta"); **"Sem IA" PASSOU**; happy e D-079 falham: após "Equipe trabalhando", `coord-<ticket>-done = [[run-error:{code:engine_unavailable,provider:Claude}]]`, 0 turnos, ledger vazio. Repetido sem concorrência (21:41): igual; **a recusa é síncrona** (ticket 00:41:51.356Z → erro .361Z), não timeout/stub/carga. Logs do host: só "desktop start". Roteado a Rivet/Forge (P0). O stub `claude auth status --json` tem `loggedIn:true`+email (compatível com o real); OAR desembrulha `claude.cmd` em `node claude.mjs` (já é node direto).
- Pendências: fake VERDE do instalado (bloqueia o OK do real D-069); `installed-det1.spec` (it.fails) a reescrever como "pedir antes da detecção não termina em 'failed'" depois da correção do Forge; web-host/desktop-host passam `process.env` (VITEST) mas o web usa `liveRunner` — sem efeito medido, não mexi.

---

## 2026-11-04 20:10 — D-085: o proof da execução real leva o "baseline D-085" (modo native), fail-closed

Nada real gasto. `check-pkg persona-e2e` OK; `ledger-evidence` + verificador real 62/62.
- **`baselineD085(ledger)`** (`src/ledger-evidence.ts`): `mode:'native'` (declarado pelo decreto), entrada/saída/cache read/cache write, `totalRequestTokens` (entrada + cache), soma das 6 camadas (`layers.tools` = o peso do MCP) e as linhas por turno do `turn_ledger`.
- **Fail-closed**: sem ledger, ledger vazio ou qualquer turno que não seja `measured` (`allMeasured=false`) → `valid:false` + `reason`; o run reporta `baseline D-085 unusable: …` e NÃO fica verde (a estimativa não vira linha de base).
- Ligado em `mandatory-first-delivery-real-installed.spec.ts` (campo `baseline D-085` do `proof.json`) e ensaiado no `real-dryrun` (fake medido → válido). Teto de tokens a priori: não (decisão do Atlas/Keel); o teto de TURNOS segue.

---

## 2026-11-04 19:55 — CONV-2 (Bolt): "estou terminando uma tarefa" sem título na DM de OUTRA pessoa — aceite pelo host real, 4/4

Nada real gasto (0 IA). `check-pkg persona-e2e` OK; J8 (reinício com "oi") 1/1 depois do CONV-2.
- `mandatory-conversation-busy-dm.spec.ts` (PersonaHost real, caminho público `postMessage` → orquestração → `listMessages`): projeto COMPARTILHADO `sp`, dona Ana pediu a Tarefa "Relatório do dia" no #geral (rodando, injetada como nos specs do Bolt), 2º membro Bia (role `member`) abre a DM e escreve "Como você está?".
  - [BUSY-1] DM da Bia com a MESMA persona (Bento): `coord-<id>-busy` = "Estou terminando uma tarefa; respondo em seguida." (sem título; uma linha só).
  - [BUSY-2] contra-prova, DM da Ana: "Estou terminando “Relatório do dia”; respondo em seguida." (título entre aspas).
  - [BUSY-3] OUTRA persona (Nina): Bia → "A equipe está terminando uma tarefa; respondo em seguida."; Ana → "A equipe está terminando “Relatório do dia”; respondo em seguida.".
  - [BUSY-4] isolamento: Ana não lê a DM da Bia, Bia não lê a da Ana, e o título só aparece onde a linha o diz.
- Limite honesto: a Tarefa "rodando" é injetada no repositório (como Bolt faz); o turno de modelo real não é necessário para estar "rodando". Não cobre o fluxo UI com dois usuários (um segundo membro precisa de outra sessão; fica para quando houver sessão multi-membro no web host).

---

## 2026-11-04 19:45 — SW-9: S2 e S3 viraram testes reais (camada do engine) — 10/10 cenários passam

Nada real gasto. `check-pkg persona-e2e` OK; `mandatory-simple-workspace.spec.ts` 9 passed | 2 todo (host/UI e instalado); `sw-engine-acceptance.ts` 74 s, 0 fail, 0 blocked.
- **S2** (SW-4): PATH = só System32 (`gitOnPath()` falso), MinGit 2.56.0.4 extraído do cache `C:/p8c` por `installPersonaMinGit` (o script nunca baixa; sem o zip o cenário fica `blocked` com o motivo), `resolveGitExecutable` → `bundled`, `createReviewDelivery({git: <cmd/git.exe>})`: rascunho → revisar (só o arquivo mudado) → aplicar (ponto de restauração) → desfazer byte a byte; pasta sem `.git`; histórico no home privado. `PERSONA_SW_BUNDLED_GIT=<…\mingit\cmd\git.exe>` aponta para o MinGit de um app INSTALADO (G3, quando o Rivet avisar o `win-unpacked` do H2).
- **S3** (SW-5), com `createWindowsHistoryFileOps` como o host: (i) planilha aberta (handle `FileShare.None` de outro processo) ao PREPARAR → "Feche “preços.xlsx” no Excel, Word ou outro aplicativo…", nenhum rascunho pela metade, funciona depois de fechar; (ii) idem ao APLICAR (tudo ou nada, Desfazer exato); (iii) caminho > 300 caracteres (rascunho/Aplicar/Desfazer); (iv) OneDrive só-online SIMULADO: hidratação chamada ANTES de cada cópia (3 arquivos) e, se a nuvem falha, "Abra o OneDrive e marque “cardápio.docx” como “Sempre manter neste dispositivo”…", sem rascunho deixado e pasta intacta. OneDrive real só-online não é possível aqui (cliente parado; ninguém toca nos arquivos do Miguel).
- Falta: SW-9 host/UI (SW-6 Anvil + SW-8 Lumen) e SW-10 instalado (perfil limpo, sem git, "atualize o cardápio.docx", nenhuma palavra técnica na tela).

---

## 2026-11-04 19:20 — plano pós-congelamento (D-082): CV-4 (rosto abre a DM) no persona-e2e

Congelado: nada salvo em packages/apps/scripts até o FIM do Keel com o hash do H2 #3. Plano para depois (resposta da Muse, 19:14):
- **Seletores**: `data-persona-card-trigger=<id da persona>` (um por rosto e por ⋯, abre o cartão); `data-persona-dm-trigger=<id>` no rosto (abre a DM). O ⋯ do rail tem "Abrir perfil" DIRETO e "Sobre {nome}" (cartão). Prism confirma os atributos quando o build existir.
- **`navigateProfileViaRailCard`**: caminho principal = ⋯ do rail → "Abrir perfil" (2 passos); reserva = foco no rosto + Shift+F10. Não depende mais do rosto chamado "Sobre {nome}".
- **E2E novo (3 lugares)**: clicar o rosto abre a DM no rail/barra, na faixa da equipe e no organograma; o cartão só pelo ⋯ ("Sobre {nome}"), hover longo (~700 ms) ou Shift+F10. Exceção: organograma em modo "Lista" (teclado) — Enter abre a DM, Shift+F10 abre o menu.
- **Não é meu**: `scripts/persona/design-shots.mjs` `openCard` (Muse troca depois do hash).
- **Sem mudança esperada**: `waitForSeededTeam` (aceita texto/"Conversar com"/"Sobre"); helpers por `data-nav-panel`/`data-nav-contains`/`data-tab-panel` (os lugares ficam compactos e "Conversas" some como lugar, mas os atributos permanecem).
- Em seguida: roteiro do fake instalado (`scripts/installed-roteiro.ts`) no Setup do H2 #3, depois a rodada web do D-079.

---

## 2026-11-04 19:05 — roteiro do fake instalado pronto (D-079 completo a/b/c/d incluso); aguardo NSIS e a vez no `build`

Nada real gasto. `check-pkg persona-e2e` OK.
- **D-079 compartilhado**: `src/conversation-d079.ts` (cenários a/b/c/d + regras do stub + linhas exatas "Resposta enviada para …" / "Passei para …: lê assim que terminar o passo atual."). O spec web `mandatory-conversation-d079.spec.ts` agora usa o módulo (mesma lógica, sem duplicar).
- **Fake instalado (pedido do Keel para o hash FINAL)**: `mandatory-first-delivery-installed.spec.ts` ganhou o 3º teste "D-079 full conversation in the installed exe" — boot separado SEM o limitador (b e c precisam de turnos extras do stub), onboarding → 1ª entrega aceita → a/b/c/d; proof em `artifacts/first-delivery/installed-d079/` (mensagens, retorno de cada uma, turnos do stub, `turn_ledger`, sha256 do exe). O teste CAP=1 continua cobrindo só o (a), sem 2º turno de modelo.
- **Roteiro de um comando para o Setup novo** (`scripts/installed-roteiro.ts`, sob `--lock build`): identidade do Setup (sha256/bytes/mtime) → desinstala a instalação anterior e instala silencioso em `C:\p8i` (cronometrado) → sha256 do `Persona.exe` + varredura do literal do limitador → spec instalado inteiro (chat + recusa CAP=1 + D-079 a/b/c/d + sem IA) → UMA linha de veredito (hash, sha256 do Setup e do exe, limitador no exe, estágio dos 3 proofs, "mesmo exe") em `artifacts/first-delivery/installed-roteiro.json`. Não gasta turno de modelo e NÃO inicia a execução real (depende do OK explícito do Keel).
- **Estado**: o `C:\p8c\Persona-Setup.exe` atual ainda é o anterior (mtime 14:08Z, sha256 34dafa1e…); o watcher continua esperando o NSIS novo (H2/FINAL). A rodada web do D-079 segue na fila `build` atrás do "Keel ship H2 INSTALLER-GRADE #2".

---

## 2026-11-04 18:30 — D-079 (conversa com Tarefa aberta) escrito; varredura do limitador no exe corrigida; fake com regras/escrita; aguardo NSIS do H2

Nada real gasto. `check-pkg persona-e2e` OK; unidade `fake-cli` 19/19, `turn-cap` 5/5, `real-run-budget` 6/6.
- **D-079 (Bolt/Atlas), E2E escrito** — `mandatory-conversation-d079.spec.ts` (web, fake, um host): setup (1ª entrega aceita = Tarefa aberta no #geral); (a) "obrigado" e "quanto custou isso?" → reação | mensagem nova de outro autor | texto novo em `role=status`/`aria-live` (a pergunta exige RESPOSTA); (b) a persona pergunta "Qual o preço novo do pão francês?" (JSON `waiting`+`question`) e a resposta da pessoa continua a Tarefa (2º turno + relatório final); (c) mesmo assunto durante a execução vira continuação visível; (d) nenhuma mensagem sem retorno. O (a) também entrou nos fakes da 1ª entrega web e instalado (no instalado, com `CAP=1`: sem 2º turno de modelo). **Falhas em (a)/(c) hoje = FALHA ESPERADA (CONV-1 do Bolt pendente), não regressão**; a 1ª rodada está na fila `build` (atrás do gate do Keel) só para calibrar seletores. O (a/b/c) completo só conta no hash FINAL.
- **Fake CLI**: `FAKE_CLI_RULES` (resposta pelo CONTEÚDO do pedido, 1ª regra que casa), `FAKE_CLI_REPLIES` (pelo número do turno, contado do log compartilhado), `writeFile`/`conflictDir` (escreve no rascunho e, ao mesmo tempo, na pasta do projeto: conflito real para a Muse).
- **Varredura do limitador no exe**: a varredura da instalação inteira leva **145 s** num build real (17 621 arquivos / 245 MB; com limite de 60 s daria "não achei" mesmo com o literal presente). Agora lê PRIMEIRO os pacotes `dsh-persona-runners`/`dsh-persona-host` desempacotados (onde mora o limitador, resposta em < 1 s), depois o asar, e só então uma caminhada limitada. No b3a4e5b933: `found:false` com `ownerPackageChecked:true` (correto: é anterior ao limitador).
- **Guardião**: recusa nova tentativa depois de uma que cobrou > 1 turno (o verificador rejeitaria o histórico para sempre; achado do Gauge).
- **Instalado**: o pack do H 71b87a1d18 morreu (aggregate check do host); o NSIS base é o H2 (snapshot 6b7cb8ce70, gate em modo instalador). Rivet avisa quando o Setup existir (`scripts/persona/pack-status.mjs`); Keel manda o hash. Sequência: NSIS → instalar → fake instalado (chat + CAP=1 + sem IA; sha256 + commit no proof) → OK do Keel → execução real única sob `--lock real` (livre: o Tally terminou 13/20 chamadas).
- **Dado útil (Tally)**: a base de uma requisição real nesta máquina é ~38–44 mil tokens de entrada; a rodada de 1 turno deve somar **90–300 mil tokens de entrada** (é o normal desta conta, não defeito); 10–18 s por chamada → cabe nos 120 s.
- **`reap-orphans.mjs`**: não cai mais com caracteres de controle na linha de comando de outros processos.

---

## 2026-11-04 17:00 — harness real: veredito pelo verificador do Forge, orçamento PURO e validado, loggedCli independente

Nada real gasto. `check-pkg persona-e2e` OK; unidade verde (`real-run-budget` 6/6, `turn-cap`, `ledger-evidence` 4/4, gate do spec real). Ensaio web com o verificador na fila da trava `build`.
- **Veredito = `verifyRealFirstDeliveryRun` (Forge, 57/57)**, rodado depois do `stop` por `scripts/verify-real-run.ts` sobre uma CÓPIA do banco: `ledger` canônico COMPLETO (`canonicalLedgerRows`: id, personaId, engine, kind, 4 contadores, 6 layers, at; opcionais NULL omitidos; obrigatório NULL fica NULL para o verificador reprovar — sem default inventado), `attempts` = histórico inteiro com a atual por último, `currentAttempt` 1-based, observation montada com as APIs de leitura do host na cópia (ticket, entrega `coord-<ticket>-done` source runner, marco). Verde só se `passed` do verificador E o ledger tem 1 execution medida E o limitador ≤ 1; a UI sozinha não vale.
- **Achados do Gauge, corrigidos** (`src/real-run-budget.ts`, função pura): (1) guardião e verificador agora usam a MESMA contagem por linha, `max(paidTurns ?? 1, capTurns ?? 0)`, sempre conhecida (ledger ilegível = 1, não "corrompido"); (2) `assessAttempts` valida tipos (negativo/fracionário/texto/inseguro/ausente = problema, histórico não confiável, `readAttempts` lança); (3) `loggedCli` não é mais derivado do ledger (circular): `claude auth status --json` (só status, sem turno) ANTES da rodada e fora do app; sem CLI logado, nada é gasto. Separação fake × real: `exeIdentity` (sha256 do exe com fake verde) + `fakeLeaks` + limitador exigido no exe + `loggedCli` independente. Limite honesto: o verificador não autentica a origem de uma linha "measured"; o ensaio e o real divergem só em `loggedCli` (ensaio sem esse dado deriva do ledger).
- **Ensaio com o verificador (fake, web): 3/3 PASS** (`mandatory-first-delivery-real-dryrun.spec.ts`): `verifyRealFirstDeliveryRun` aceitou — `passed: true`, `paidTurnsTotal 1`, `executionTurns 1`, `triageTurns 0`, `injectTurns 0`, `ledgerValid`/`attemptsValid` true; observation lida da cópia do banco: pedido `first-delivery`, Tarefa `done`, entrega `coord-<ticket>-done` (source runner), marco `ready` único. Primeira vez que a cadeia inteira (esquema real do `turn_ledger` → leitor → conversão canônica → verificador) roda sobre um banco de verdade.
- **`scripts/persona/reap-orphans.mjs` endurecido**: a lista de processos do PowerShell trouxe caracteres de controle crus (uma mensagem longa de outro agente na linha de comando) e o `JSON.parse` lançou — o reaper caía no fim de job com trava. Agora troca os caracteres de controle por espaço e, se ainda não der para ler, avisa e pula a rodada (nunca lança).
- **Seletores**: `dogfood-agencia.ts` aceita "Tirar permissão|Revogar" e "Tirar agora|Revogar agora" (Lumen/Muse); Gauge atualizou o dele.

---

## 2026-11-04 16:15 — harness da execução REAL endurecido (Keel/Forge D-069): orçamento por turnos pagos, falha fechado, limitador exigido no NSIS

Nada real gasto. `mandatory-first-delivery-real-installed.spec.ts` (+ `src/turn-cap.ts`, `src/ledger-evidence.ts`, `src/exe-identity.ts`); `check-pkg persona-e2e` OK; unidade `turn-cap` + `ledger-evidence` + gate 7/7 (1 skip = o teste real, que só roda autorizado).
- **Orçamento**: total = soma, por tentativa anterior, de `max(paidTurns do turn_ledger, turnos do ledger do limitador, 1 se ilegível)`; recusa se soma + 1 > 3, se já foram 3 tentativas ou houve verde; da 2ª em diante exige `PERSONA_REAL_E2E_DIAGNOSED`.
- **Falha fechado**: `real-attempts.json` ausente = vazio; ilegível/corrompido/não-lista = erro (não devolve `[]`).
- **Verde só depois do ledger**: após parar o app, exatamente **1 `execution` medida, 0 triage/inject/outros**, saída > 0, ledger do limitador ≤ 1; a UI "delivered" sozinha vira `UNVERIFIED` e consome a tentativa.
- **Vigia durante a rodada** (o app não tem limitador pré-turno; `FIRST_DELIVERY_MAX_PAID_TURNS` só é lido pelo verificador depois do fato): copia o `turn_ledger` a cada 1,5 s e **mata a árvore do app** ao ver o 2º turno ou um turno que não seja `execution` (`OVERBUDGET`).
- **Quadros** capturado na mesma rodada (`m9-quadros`, só leitura, antes do stop; exige 0 fixtures e "1 concluído").
- **Limitador do app (Rivet)**: o app é lançado com `PERSONA_REAL_TURN_CAP=1` e `PERSONA_REAL_TURN_LEDGER=artifacts/first-delivery/real-turn-ledger/attempt-N.ledger` (um por tentativa, somam no total); **recuso gastar** se o exe instalado não contiver `PERSONA_REAL_TURN_CAP` (varredura do asar e do runtime). Formato do arquivo: lido de forma tolerante; pedi o exato ao Rivet.
- **Para o verificador puro do Forge** (`verifyRealFirstDeliveryRun`): `proof.json` traz `ledger.rawRows` (todas as colunas), `attemptsSnapshot`, `currentAttempt` (1-based), `attemptsFile`, `timeline`; `evidence/persona.db` para montar a observation.
- **Corrigido de passagem**: a varredura lia o asar duas vezes (teste de unidade pegou).

### Para liberar o gasto faltam
NSIS do hash novo **com o limitador** (Rivet) + chat do Anvil; fake instalado verde (com chat) no MESMO exe; OK do Keel.

---

## 2026-11-04 15:35 — SW engine S1 + S4 + S5×3 PASS (S4 promovido); rail novo (NAV-SPEC) sem depender de rótulo

### PASSOU
- **SW-9/SW-10 camada do engine, 4/4 + 4 todo** (`mandatory-simple-workspace.spec.ts`, 47 s; repo conferido antes e depois: `HEAD a1dccb5f8f`, 0 branches `persona/*`): **S1** (cardápio.docx: rascunho → Revisar → Aplicar → Desfazer byte a byte, pasta sem `.git`), **S5** ×3 (ficar com o meu / com o da persona / manter os dois + Desfazer, sem marcadores) e **S4** planilha aberta durante o Aplicar: tudo-ou-nada **e agora o aviso acionável** — "Feche “preços.xlsx” no Excel, Word ou outro aplicativo e tente de novo. Se continuar, confira a permissão do arquivo." (fix do Forge no engine; meu teste estava como `it.fails` e virou vermelho como previsto, então **promovi para `it`**). Pendentes: **S2** (git embutido, SW-4 Rivet), **S3** (OneDrive, SW-5 Rivet), camada host/UI (SW-6 Anvil, SW-8 Lumen) e SW-10 no instalado.

### NAV-SPEC A-1 (6 lugares) — gates sem depender de rótulo
`src/real-gallery/navigate-panel.ts` clica primeiro em `[data-nav-panel="<MainPanelId>"]` / `[data-tab-panel="<MainPanelId>"]` e só cai no rótulo legado se não existirem. Pedido ao Prism (e à Muse, via `tell`): pôr esses atributos nos itens do rail e nas abas com os ids atuais (as rotas não mudam) no mesmo commit do rail novo — assim a ordem de troca dos rótulos deixa de importar. Ainda usam rótulo do rail fora do meu pacote: `scripts/persona/design-shots.mjs`, `quill-remote-team-ui.mjs` (`nav(page,'Canais')`) e os scripts do Keel (ui-boot-check, persona-boot-smoke).

### Estado da fila
NSIS do hash novo (Rivet; o pack do a1dccb5f8f falhou às 15:09 e o Keel vai publicar hash novo com o fix do chat do Anvil) → instalar → fake instalado verde (agora com "digitar no #geral + Enter + recarregar") → execução REAL D-069 (harness pronto/ensaiado). SW-9 host/UI e SW-10 no instalado aguardam SW-6/SW-8.

---

## 2026-11-04 15:15 — SW-9/SW-10 camada do engine: S1 + S5×3 PASS, S4 tudo-ou-nada PASS; INCIDENTE (branches persona/t* criadas por engano, removidas); chat no fake instalado

### INCIDENTE (corrigido, sem perda)
Meu primeiro `scripts/sw-engine-acceptance.ts` criava a "pasta do usuário" em `.maestri/tmp`, DENTRO do repositório do projeto. A fábrica do `ReviewDelivery` sobe os pais procurando `.git` e escolheu o **Git real**: rodou `git worktree`/branch contra o checkout e deixou as branches **`persona/t1`, `persona/t4`, `persona/t5`** e 3 entradas de worktree órfãs. Conferido: `HEAD` do `persona-dev` seguiu em `a1dccb5f8f` (reflog só com os resets do Keel), as 3 branches apontavam para o MESMO commit (nenhum commit novo, nenhum merge efetivo). Removi **só as minhas** (`git branch -D persona/t1 persona/t4 persona/t5` + `git worktree prune`, que só tinha essas 3 órfãs). Causa apontada pelo Forge (obrigado) e confirmada. Correções na fixture: `createUserFolder` agora usa `os.tmpdir()`, **recusa** qualquer pai com `.git` ancestral (`gitAncestorOf`, teste novo) e o script aborta antes de preparar rascunho se a fábrica não devolver `HistoryReviewDelivery`. Reconferido depois da rodada boa: `HEAD a1dccb5f8f`, 0 branches `persona/*`.

### PASSOU (engine, pasta fora de qualquer repositório, Office reais)
`mandatory-simple-workspace.spec.ts` (`PERSONA_E2E=1`, 88 s): **3 passam, 1 falha esperada, 4 todo**; evidência `artifacts/sw/engine-acceptance.json`.
| Cenário | Resultado |
|---|---|
| **S1 + núcleo do SW-10** — pasta sem git com git no PATH: "atualize o cardápio.docx" → rascunho (pasta intacta enquanto trabalha) → Revisar lista só o arquivo alterado → Aplicar (ponto de restauração) → .docx com os preços novos, demais arquivos idênticos → Desfazer devolve o .docx **byte a byte**; **nenhum `.git` na pasta**; histórico em `<home>/history/sw/git` | **PASS** |
| **S5 conflito** (a pessoa edita o mesmo arquivo durante a Tarefa) × 3 escolhas: *ficar com o meu*, *ficar com o da persona*, *manter os dois* (cópia com sufixo) + Desfazer; nada é sobrescrito antes da escolha; sem marcadores | **PASS ×3** |
| **S4 planilha aberta durante o Aplicar** (trava exclusiva do Windows, como o Excel) | **tudo-ou-nada PASS** (nada aplicado pela metade, arquivos intactos, funciona depois de fechar, Desfazer restaura os dois). **Falta o aviso acionável** — hoje: "Não conseguimos atualizar o histórico desta pasta. Seus arquivos continuam salvos; tente de novo." (tom certo, mas não diz "feche a planilha X") → **[Rivet SW-5]**; teste marcado `it.fails` (fica vermelho quando o SW-5 entrar: promover). |
| **S2 sem git e sem git no PATH** | **bloqueado SW-4**: hoje "Não conseguimos preparar o rascunho. Reabra ou reinstale a Persona para restaurar o componente necessário." (pt-BR, sem jargão; o MinGit embutido ainda não é resolvido) |
| **S3 OneDrive** | **bloqueado SW-5** (falta a simulação do placeholder online) |
| Camada host/UI e SW-10 no instalado | aguardam SW-6 (Anvil) e SW-8 (Lumen) |

### Pedido do Keel (chat) — incluído nos specs
O candidato a1dccb5f8f tem um P0 de chat (caixa do #geral não envia: `postMessage` sem `occurredAt`). `sendGeralMessageAndReload` (web e instalado): digita no #geral + Enter, vê a mensagem, **recarrega o app** e vê de novo (persistida). Falha com mensagem clara ("composer não envia" / "mensagem sumiu após recarregar"). O fake e a execução REAL passam a valer para o hash NOVO que o Rivet reempacotar depois da correção do Anvil.

### Fila
NSIS do hash novo (Rivet, depois do fix do Anvil) → instalar em `C:\p8i` → fake instalado (inclui chat) verde → real D-069 sob `--lock real` (harness pronto e ensaiado). SW-9 host/UI e SW-10 instalado aguardam SW-6/SW-8. Detalhe técnico: `check-pkg persona-e2e` só acusa `mandatory-governance-host.spec.ts` (Gauge, TS6133).

---

## 2026-11-04 14:45 — web+fake 9/9 PASS (feliz + sem IA); rodada REAL preparada e travada (D-069); aguardo NSIS a1dccb5f8f

### PASSOU
| Item | Evidência |
|------|-----------|
| **1ª entrega UI web + fake CLI — 9/9** | `mandatory-first-delivery-fake.spec.ts` (v4, bundle do client rebuild às 14:0x): **feliz** — onboarding 1–5 → Pedir agora → "Equipe trabalhando" → celebrar → Aceitar e entrar → entrega no #geral → Quadros mostra o projeto real com "1 concluído" e 0 fixtures; **1 turno pago** visto pelo stub; foco nas fases (working → H1 no diálogo, celebrate → SECTION no diálogo); console limpo. **Sem IA** — o passo 5 abre direto em "Falta uma IA para a equipe trabalhar." (foco no H1 do diálogo), "Conectar uma IA" no diálogo, sem estado de trabalho/celebração, "Entrar sem pedir agora" entra no app, #geral sem "Carregando…". Passo 3 com fake: Claude e Codex "Pronta para usar", Cursor "Não detectada", sem IA todos "Não detectada" (o `installed=true` forçado foi corrigido pelo Rivet). `artifacts/first-delivery/{happy,no-engine}/proof.json` + capturas. |
| **Tempo (máquina carregada)** | ask → celebrar: 11 s, 12,8 s, 14,7 s e **43 s** nas 4 rodadas web (o fake responde em 2,5 s: a diferença é o host/CPU com builds de outros em paralelo). A rodada real deve rodar com a máquina quieta (trava `real`; peço janela sem bundle/gate). |
| **Host + runner + fake** | 2/2 PASS (13:28): 1 chamada, só `execution`, 0 triagem. |
| **Harness da execução REAL (D-069)** | `mandatory-first-delivery-real-installed.spec.ts`: recusa sem `PERSONA_REAL_E2E=1` + `PERSONA_REAL_E2E_OK=D-069` + texto de autorização em `.maestri/tmp/atlas-ok-real-run.txt` + `PERSONA_INSTALLED_EXE` + `PERSONA_NSIS_COMMIT`; exige **fake verde no MESMO exe** (sha256 do `installed-happy/proof.json`); recusa se houver fake no ambiente; **orçamento**: máx. 3 tentativas no total (`artifacts/first-delivery/real-attempts.json`, a tentativa conta antes de gastar), para na 1ª verde, da 2ª em diante exige `PERSONA_REAL_E2E_DIAGNOSED=<diagnóstico offline com o fake>`; 120 s; `stop()` mata a árvore. Linha do tempo no formato da Muse (t0, working, slow, failed, accept visível, eco do pedido no #geral, 1ª mensagem de persona no #geral, t1 = primeiro entre accept e mensagem, t2 = clique; ms desde o anexo da janela) + 1 captura por marco; **ledger lido depois do `stop()`** (`turn_ledger`: tokens entrada/saída/cache, `measured`) e cópia do `persona.db` (+WAL/SHM) em `evidence/` para o Forge; diretório da rodada preservado até a leitura (`keepRunRoot`). Verificado: gate (skip), `ledger-evidence.spec.ts` 3/3, 17/17 com o fake-cli; `check-pkg persona-e2e` só acusa arquivos do Gauge (`mandatory-governance-host.spec.ts` TS6133). |

### Ensaio do harness real (fake, web) — 2/2 PASS
`mandatory-first-delivery-real-dryrun.spec.ts`: roda `runRealFirstDelivery` + `readLedgerEvidence` contra o app web com o fake, para não gastar uma das 3 tentativas reais com bug de harness. O 1º ensaio achou um erro MEU (a lista do #geral só carrega depois do clique, então "qualquer id novo" pegava mensagens antigas): agora a entrega é a mensagem `…-done` e todos os ids novos entram na timeline com o horário. 2º ensaio: timeline completa (t0 44,9 s; working +0,7 s; eco do pedido; `exec-…-progress`; `coord-…-done`; `first-delivery-milestone`; accept visível; t2), capturas m0/m1/m3/m4/m6/m7, ledger lido do `<home>/db/persona.db`: **1 turno, `execution`, `measured`**. Neste ensaio a máquina estava carregada (t1 − t0 ≈ 43 s com turno fake de 3 s: o eco do pedido só apareceu 37 s depois do clique) — o número real só vale com a máquina quieta.

### ACHADOS NOVOS
- **A detecção repete a cada ~57 s** com o app ocioso (timeline do stub: rodada em +0 s e outra em +57 s: `claude --version`, `claude auth status`, `claude -p --input-format stream-json`, `codex app-server --listen stdio://` ×2, `opencode models`…). Com CLIs reais são vários processos por minuto em segundo plano → **[Rivet/Tally]** custo/CPU/bateria; considerar intervalo maior e só com a janela visível.
- **Um probe pendurado deixa o cartão em "Verificando…" indefinidamente** (OpenCode do fake não implementa `opencode serve`: 40 s depois ainda "Verificando…"). Em PC real, uma CLI travada faria o mesmo → **[Rivet/Prism]** teto (ex.: 10 s) e estado "Sem resposta".
- Instalado: ainda aguardo o NSIS (a1dccb5f8f). Quando sair: instalar em `C:\p8i`, rodar o fake instalado (2 cenários), só então a real.

### Plano da rodada real (para Keel/Forge/Muse)
1) NSIS a1dccb5f8f instalado em perfil limpo (`/S /D=C:\p8i`); 2) fake instalado verde **no mesmo exe** (grava sha256); 3) `node scripts/persona/with-lock.mjs "Probe real" --lock real --wait-max 3600000 -- pnpm exec vitest run …real-installed.spec.ts` com `PERSONA_REAL_E2E=1 PERSONA_REAL_E2E_OK=D-069 PERSONA_NSIS_COMMIT=a1dccb5f8f PERSONA_INSTALLED_EXE=C:\p8i\Persona.exe`; 4) artefatos em `packages/persona/persona-e2e/artifacts/first-delivery/real-installed/` (`proof.json`, capturas por marco, `evidence/persona.db`); 5) aviso ao Forge (paths + ledger), à Muse (timeline) e ao Keel (hash, se verde). Máquina quieta durante a rodada.

---

## 2026-11-04 14:00 — web+fake v3: foco nas fases OK, Quadros real OK; NSIS desinstala limpo; spec da execução REAL pronto (travado)

### PASSOU
| Item | Evidência |
|------|-----------|
| **1ª entrega, UI web + fake, 5/9** | `mandatory-first-delivery-fake.spec.ts` (v3): ask → celebrar em **14,7 s**; **foco nas fases do passo 5**: "Equipe trabalhando" → H1 no diálogo; "Primeira entrega" celebrada → SECTION (`data-persona-step-focus`) no diálogo; **1 turno pago** visto pelo stub (23 chamadas ao stub no total, 1 `turn`); entrega no #geral; **Quadros mostra o projeto real "Pessoal" com "1 concluído" e 0 fixtures** (corrigido desde as 13:40; `happy/09-quadros.png`). |
| **NSIS — desinstalação** | `Uninstall Persona.exe /currentuser /S`: **56 s**; `C:\p8i` removido, atalhos (Menu Iniciar e Área de Trabalho) removidos, entrada de registro removida. Instalação silenciosa seguiu 303 s. |
| **Spec da execução REAL pronto** | `tests/mandatory-first-delivery-real-installed.spec.ts`: dupla trava (`PERSONA_REAL_E2E=1` + `PERSONA_REAL_E2E_OK=<autorização do Atlas>` + `PERSONA_INSTALLED_EXE`), recusa se houver fake no ambiente, 120 s, **um** run sem laço, `desktop.stop()` agora mata a árvore inteira (taskkill /T) para não sobrar `claude` quente. Verificado só o gate (1 passa, 1 skip). Rodar (quando o Atlas liberar): `node scripts/persona/with-lock.mjs "Probe real" --lock real --wait-max 3600000 -- …`. Nada real gasto. |

### AINDA FALHA (devolvido; mesmas causas do 13:40)
- Passo 3: cartões **não atualizam depois da detecção** (40 s depois, "Claude: Não detectada" com o motor funcionando) → **Prism/Anvil**.
- Sem IA: OpenCode "Pronta para usar" e "Falta uma IA" não aparece (installed forçado `true` em `connections.ts`) → **Rivet**. O 4º teste do bloco ("Carregando…") falha em cascata (o onboarding fica aberto).
- Instalado: aguardo NSIS novo (Rivet; no momento só o SW-4/MinGit está sendo preparado).
- Detalhe visual aberto: barra branca vazia sob "Sua equipe" por cima de "Organização" (Lumen/Muse).

### Fila
V1-P0-5 real: aguarda OK do Atlas (Keel repassa). V1-P0-6/D8: aguarda NSIS novo. SW-9/10: aguardam SW-1..8 (Forge SW-1..3 em andamento; resto `todo`). S7 (UI): propose/coordenação/Cofre-no-contexto ainda `it.todo` (host J3/J4/J5 verdes).

---

## 2026-11-04 13:40 — 1ª entrega web+fake PASSOU (1 turno pago, 11 s); S7 teclado PASSOU; instalado b3a4e5b933 FALHOU 2/2 (anterior às correções); 4 achados devolvidos

### PASSOU
| Item | Evidência |
|------|-----------|
| **1ª entrega, UI real (web persona) com fake CLI** | `mandatory-first-delivery-fake.spec.ts` (comando: `PERSONA_E2E=1 pnpm exec vitest run … --testTimeout 600000 --hookTimeout 400000` sob `with-lock`): onboarding 1–5 → Pedir agora → "Equipe trabalhando" → "Sua equipe entregou o primeiro trabalho!" em **10,97 s** (turno do fake 2,5 s) → Aceitar e entrar → entrega no #geral; console limpo; o stub viu **1 turno pago** (alvo do Keel: 1; teto 3). `artifacts/first-delivery/happy/proof.json` + 10 capturas. **4/7 PASS**, 3 FALHARAM (abaixo). |
| **S7 — onboarding só com teclado** | `mandatory-onboarding-keyboard.spec.ts` **1/1 PASS** (129 s com o rebuild do bundle `client-ui-persona`, 37 s): após cada troca de passo o foco está no H1 dentro do `role=dialog`; 28 paradas de Tab, **0 fora do diálogo**; entra no app só por teclado. Antes do conserto do Prism: FALHOU (foco no `<body>` após o passo 4→5 e 129 de 152 paradas fora do modal). `artifacts/first-delivery/keyboard/proof.json`. |
| **Host + runner real (OAR) + fake, sem UI** | repetível: `mandatory-first-delivery-host-fake.spec.ts` (+ `scripts/first-delivery-fake-host.ts`); antes das correções do Forge/Anvil: 3 turnos pagos, 25,7 s, ledger 3/3 `measured`, `broke: []`. **Reexecutado com o código novo (13:28): 2/2 PASS** — `broke: []`, `verification.passed`, **1 chamada** (1 095 tokens de entrada / 56 de saída, só `execution`, 0 triagem), Tarefa `done`, marco `ready`; inclui o teste "no máximo 1 turno pago". |
| **Fake-cli** | `fake-cli.spec.ts` + `simple-workspace-fixtures.spec.ts` **20/20**; `check-pkg persona-e2e` OK. Corrigido hoje: **codex e opencode respondiam como claude** (o OAR "desembrulha" o `.cmd` e roda `node fake-cli.mjs` sem o nome da ferramenta que estava no argumento do atalho) → cada ferramenta tem agora o seu `.mjs` (`FAKE_CLI_TOOL`), teste de identidade incluído. |

### FALHOU (devolvido, com evidência)
| Item | Evidência | Dono |
|------|-----------|------|
| **Instalado NSIS b3a4e5b933 — caminho feliz** | `mandatory-first-delivery-installed.spec.ts`: 2 min em "Equipe trabalhando", volta ao passo 5 intro **sem erro**; `fakeCliInvocations: 0` (nem `--version`): o PATH/`OAR_*_BIN` do Electron não produziram nenhuma execução do stub. Anterior às correções (PERSONA_E2E_EXTRA_PATH, probe assíncrono, 1 turno). `artifacts/first-delivery/installed-happy/{proof.json,electron.log,zz-failed.png}` | **Rivet** (NSIS novo) |
| **Instalado — sem IA** | passo 5 mostra o intro (Pedir agora), não "Falta uma IA" (FR-2/3 ainda não no instalado). `installed-no-engine/` | Rivet (NSIS novo) |
| **Detecção sempre `installed=true`** | `scripts/detect-connections-diag.ts` (sem gasto): com PATH mínimo + pins para arquivo inexistente, `detectConnections` devolve claude/codex/opencode/cursor `installed=true` e **opencode `loggedIn=true`** (`probeCli`: com runtime OAR faz `binary = { ok: true }`). Efeito: OpenCode "Pronta para usar" sem CLI nenhuma e "Falta uma IA" (FR-3) não dispara. Spec: "step 3 does not call any tool ready when none is installed" e "step 5 says an AI is missing" (web 2 falhas). | **Rivet** (`persona-runners/src/resolve/connections.ts`) |
| **Detecção lenta e passo 3 enganoso** | 26,6 s sem CLI, 10,3 s com o fake; durante esse tempo os cartões dizem "Não detectada" (nunca "Verificando…"). | Rivet (latência) / **Prism** (estado "verificando") |
| **Quadros mostra dados de demonstração** | home limpo, depois da 1ª entrega aceita: "Contratação — Designer" e "Site da agência" (são `boards/mock-data.ts`), sem o projeto real nem o cartão entregue; balão branco vazio na barra lateral sobre "Organização". `happy/09-quadros.png`. Spec "has the card done on the board" (exige 0 fixtures e "1 concluído"). | **Lumen** |

### Achados de infraestrutura (resolvidos por mim)
- **Host web do persona não sobe sem `PERSONA_VAULT_TEST_CIPHER=1`**: o plugin `connection` (required) chama `vault.modifyRecord` e o Cofre novo lança `VaultUnavailableError` fora do Electron → o boot inteiro falha ("Cofre indisponível neste modo"). `startWebHost` liga a flag (nunca no exe). Quem sobe `dsh web --profile persona` sem ela (dev, ui-boot-check, smoke) quebra → **[Keel/Rivet/Anvil]** considerar o `connection` degradar sem Cofre.
- `startInstalledDesktop` expõe `log()`; os specs instalados gravam `electron.log`, `proof.json` e a lista de chamadas do stub **mesmo quando falham**.
- `withFakeCliOnPath` grava `FAKE_CLI_LOG` (`scope.invocations()`): prova de que o app chamou o motor.

### Instalador NSIS b3a4e5b933 (D8, parcial)
Silencioso `/S /D=C:\p8i`: exit 0, **303 s** (lento), atalhos Menu Iniciar + Área de Trabalho, desinstalador registrado (HKCU), 1 168 MB, sem MinGit (SW-4 `todo`). Metadados: CompanyName "Hangzhou DeepSeek Artificial Intelligence Co., Ltd."; Setup com FileDescription do upstream. Tela de erro de boot por cima do app em 1 de 3 execuções do exe (intermitente; `installed-happy/01-step1.png` da 1ª rodada). **Desinstalação ainda não exercitada** (deixo para depois do NSIS novo).

### Estado da fila
- V1-P0-5 (execução REAL única): **aguardo** o OK explícito do Atlas via Keel; plano: claude/haiku, timeout 120 s + dispose, dentro do exe instalado, **só depois** do fake web+instalado verdes; alvo 1 turno pago.
- V1-P0-6 / D8: aguardo **NSIS novo** (Rivet) para reexecutar o spec instalado; o spec já está pronto.
- Repasse ao Gauge feito: `reports/probe-handoff-gauge.md`.
- SW-9/SW-10: fixtures prontas (`src/simple-workspace-fixtures.ts`: .docx/.xlsx reais, pasta sem `.git`, PATH sem git, trava exclusiva de arquivo); cenários aguardam SW-1..8.

### Arquivos tocados (Probe)
`packages/persona/persona-e2e/`: `src/{fake-cli,real-app-session,web-host,installed-desktop,first-delivery-flow,simple-workspace-fixtures,index}.ts`, `fixtures/fake-cli/*` (stubs por ferramenta), `scripts/{first-delivery-fake-host,detect-connections-diag}.ts`, `tests/{fake-cli,simple-workspace-fixtures,mandatory-first-delivery-fake|installed|host-fake,mandatory-onboarding-keyboard,mandatory-onboarding-from-zero}.spec.ts`, `README.md`. `check-pkg persona-e2e` OK.

---

## 2026-11-04 12:15 — fake-cli responde 1 turno (11/11); host + runner real + fake PASSOU; NSIS b3a4e5b933 instala; UI/instalado na fila da trava

### PASSOU
| Item | Evidência |
|------|-----------|
| **Fake-cli com turno completo (P0 #1)** | `fake-cli.spec.ts` **11/11** (`pnpm exec vitest run packages/persona/persona-e2e/tests/fake-cli.spec.ts --testTimeout 60000`, 2 s). Env: `FAKE_CLI_TURN_MS` latência, `FAKE_CLI_FAIL` (1 / mensagem / `crash` / `quota`), `FAKE_CLI_REPLY`, `FAKE_CLI_INPUT_TOKENS`, `FAKE_CLI_MODEL`. O `result` de sucesso leva `usage` + `modelUsage` (sem isso o ledger ficava vazio e o verificador acusava `measured-execution` e `call-budget`). `--help` não trava mais (`codex app-server --help`). Muse avisada. |
| **Trava anti-gasto** | `withFakeCliOnPath()` agora também pina `OAR_CLAUDE_BIN`, `OAR_CODEX_BIN` e `OAR_OPENCODE_BIN` nos stubs (o OAR tem fallback para `~/.local/bin/claude.exe` e esta máquina tem claude/codex/opencode reais). Novo `withNoEngineOnPath()` (PATH mínimo, pins para arquivo inexistente, sem `DEEPSEEK_API_KEY`) para o caminho "Falta uma IA". |
| **Host + runner real (OAR) + fake, sem UI** | `first-delivery-real-cli.ts` com o fake: `broke: []`, **25,7 s**, 3 turnos, ledger 3/3 `measured` (2 triagens + 1 execução ligada à Tarefa), Tarefa `done`, marco `ready`, entrega `source=runner` no #geral. Antes dos tokens medidos: `broke: [evidence:measured-execution, evidence:call-budget]`. As 3 causas do diagnóstico das 09:35 já estão corrigidas por Anvil/Forge. Spec novo: `mandatory-first-delivery-host-fake.spec.ts` + `scripts/first-delivery-fake-host.ts`. |
| **NSIS b3a4e5b933** (`C:\p8c\Persona-Setup.exe`, 338 342 203 B, sha256 34DAFA1E274B51EA, não assinado) | Instalação silenciosa `/S /D=C:\p8i`: **exit 0**, atalhos no Menu Iniciar e na Área de Trabalho, entrada de desinstalação (HKCU, `Uninstall Persona.exe /currentuser`), 1 168 MB em disco, `app.asar` presente, `Persona.exe` com ProductName e FileDescription = Persona. |

### ACHADOS (devolvidos)
- **Instalação silenciosa levou 303 s** (32 k arquivos; Defender provável) → **[Rivet]** UX: progresso no instalador; considerar reduzir `app.asar.unpacked`/runtime.
- **Metadados**: CompanyName do `Persona.exe` = "Hangzhou DeepSeek Artificial Intelligence Co., Ltd."; o **Setup** tem FileDescription "Electron desktop shell for a bundled dsh runtime and external plugins" (texto do upstream) → **[Rivet/Keel]** marca; manter crédito MIT em LICENSE/Sobre, mas não como empresa do produto.
- **Sem MinGit no instalado** (esperado: SW-4 ainda `todo`).
- **A 1ª entrega gasta 3 turnos de modelo**: inject do prompt da persona (`onb-1:prompt`) + triagem (`ingest:first-delivery`) + execução do worker. O orçamento "3 execuções reais" do projeto é consumido por UM V1-P0-5 → **[Keel]** decidir se o inject do prompt precisa ser turno pago ou se o orçamento conta só `execution`.

### INCIDENTE (zero custo)
Ao gravar este relato, um `node -e "..."` com crases dentro de aspas duplas fez o bash executar trechos do texto como comandos. Chegaram a rodar o `codex` real (`app-server --help`, só ajuda) e o `claude` real sem prompt (`--print` sem entrada → erro imediato). **Nenhuma chamada de modelo** e nada foi gravado fora deste relato. Corrigido: relatos agora vão por arquivo (Write), nunca por shell com crases.

### EM CURSO (fila da trava build; Lumen/Anvil/Rivet na frente)
- `mandatory-first-delivery-fake.spec.ts` (UI web: onboarding 1–5 → Pedir agora → Equipe trabalhando → celebrar → Aceitar e entrar → #geral + quadro; e o caminho sem IA "Falta uma IA") e `mandatory-first-delivery-installed.spec.ts` (mesmos 2 cenários no exe instalado `C:\p8i\Persona.exe`). Resultado no próximo relato.
- V1-P0-5 real: só com o OK do Keel.

### Arquivos tocados (Probe)
`packages/persona/persona-e2e/`: `src/fake-cli.ts`, `fixtures/fake-cli/fake-cli.mjs`, `src/real-app-session.ts`, `src/index.ts`, `src/first-delivery-flow.ts` (novo), `scripts/first-delivery-fake-host.ts` (novo), `tests/fake-cli.spec.ts`, `tests/mandatory-first-delivery-fake.spec.ts` (novo), `tests/mandatory-first-delivery-installed.spec.ts` (novo), `tests/mandatory-first-delivery-host-fake.spec.ts` (novo), `README.md`. `check-pkg persona-e2e` OK.

### Fila
UI web + instalado (trava); SW-9/SW-10 depois de SW-1..8 (todos `todo`).

---

## 2026-11-04 09:35 — B9 Tier 1 6/6 PASS; first-delivery contract 5/5; diagnóstico P0 real CLI; D8 unpacked falha confirmada

### PASSOU
| Item | Resultado |
|------|-----------|
| **B9 Tier 1 real app** | `mandatory-b9-real-app.spec.ts` **6/6 PASS** (~87 s); console errors **0** (404 createWorkspace sanado); #geral composer, kanban global, draft send, reduced-motion, dirD visual diff todos verdes |
| **Harness Windows fix** | `locked-launch.ts`: `shell: false` para `process.execPath` (elimina erro `'C:\Program' não é reconhecido` em caminhos com espaço) |
| **First-delivery contract** | `mandatory-first-delivery-contract.spec.ts` **5/5 PASS**; corrigido path do teste (`derive-first-delivery.client.spec.ts`, não `.tsx`) |
| **PRO-6 contracts** | `mandatory-proactivity-contract.spec.ts` **4/4 PASS** (PRO-1 engine 9/9, aceite 6/6, PRO-3 runner 10/10, PRO-6 away 2/2) |
| **GOV & PB §3 contracts** | `mandatory-governance-contract.spec.ts` e `mandatory-project-boards-contract.spec.ts` **7/7 PASS** (J1–J10, J12–J18, J19) |
| **Boot Publish & V1-Close** | `mandatory-boot-publish-contract`, `mandatory-v1-close-contract`, `mandatory-installed-boot-contract` **12/12 PASS** |
| **check-pkg** | `scripts/persona/check-pkg.mjs persona-e2e` **OK em 6.9s** |

### FALHOU (evidência e causa raiz devolvidas)
| Item | Evidência |
|------|-----------|
| **V1-P0 Real CLI (`first-delivery-real-cli.ts`)** | `broke: ["no-runner-delivery-on-geral", "exec-budget-exceeded"]`. Três causas: 1) `listConnections` chamado síncrono antes de `connections.ready()`; 2) `stages.length > 3` acusa estouro falso porque `mark()` grava 6 marcas internas de telemetria; 3) `flush()` termina sem mensagem do runner no `#geral`. Devolvido a **[Anvil/Forge/Rivet]** |
| **D8 Unpacked Exe (`installed-onboarding-cdp.mjs`)** | Timeout 180s esperando `[data-persona-shell]`, `rootEmpty: true`, screenshot `installed-onboarding-fail.png`. Confirma achado da Muse (falha de boot por ENOENT do patch yml no asar). Devolvido a **[Rivet]** |

### Arquivos tocados (Probe)
`packages/persona/persona-e2e/src/locked-launch.ts`
`packages/persona/persona-e2e/tests/mandatory-first-delivery-contract.spec.ts`

### Fila (não vazia)
D8 NSIS novo (Rivet); re-run V1-P0 real CLI após correção Anvil/Forge; PRO-6 layer 2 UI; benchmarks F3.

---

## 2026-11-04 08:02 — Keel D-062/B9: lock livre; harness deadlock fix; B9 5/6

### PASSOU
| Item | Resultado |
|------|-----------|
| **Fila build** | Rivet `package-clean b26d8b99a2` soltou lock (~08:00); **sem exit 75** nesta rodada |
| **Harness** | `web-host.ts`: com `PERSONA_LOCK` do `with-lock` externo → `launchDirect` (evita nested lock / falso `WebHostBootTimeoutError`) |
| **B9 Tier1 retry** | Host ~87 s; **5 pass** (#geral composer, kanban, dirD, reduced-motion, not harness shell) |

### FALHOU
| Item | Evidência |
|------|-----------|
| **B9 console gate** | `persona/createWorkspace` **HTTP 404** → bootstrap live store + dev seed falham no browser → **[Lumen/Anvil]** rota/host persona no profile `persona` |
| **D8** | `C:\p8c\Persona-Setup.exe` ainda 343148924 @ 05:56 → **[Rivet]** NSIS pós-pack (trava `pack` D-062) |

### Notas Keel
- B9 atrás do Rivet antigo: **confirmado** na 1ª tentativa (espera fila + timeout 240 s por deadlock interno, não só pack).
- **Exit 75**: repetir `with-lock` conforme orientação; próximas packs Rivet não seguram `build.lock`.
- Re-run B9 após `createWorkspace` verde (ou smoke 9/9 explicar delta).

### Fila (não vazia)
D8 exe; B9 console 404; first-delivery contract run; P0 real CLI; PRO-6; GOV/PB §3.

---

## 2026-11-04 07:35 — B9 boot timeout + contracts 12/12; D8/Rivet pendente

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts** | v1-close + boot-publish + D8 harness **12/12** (~88 s) |
| **`run-persona-e2e-vitest.mjs`** | helper OK; B9 chamou com `PERSONA_E2E=1` |
| **AG-001/003 re-run** | **3/3** — Prism AG-003 Ensinar no perfil verde (`dogfood-ag-003.client.spec.tsx`) |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **B9 Tier1 (lock)** | `WebHostBootTimeoutError` — `dsh web` não subiu em 240 s pós-lock (fila Rivet `b26d8b99a2`); **infra**, não regressão de gate smoke 9/9 anterior |
| **D8 PRIORIDADE** | `C:\p8c\Persona-Setup.exe` ainda 343148924 @ 05:56 → **[Rivet]** NSIS novo pós-pack |
| **persona-gate (--skip-smoke)** | **persona-host** + **persona-runners** TS (`wave2.ts`, `resolve-runner.spec.ts`) → **[Anvil/Rivet]** mid-publish |

### Fila (não vazia)
D8 exe + gate full; B9 Tier1 re-run pós-lock livre; PRO-6 fake-clock; GOV/PB §3 E2E; axe 23×.

---

## 2026-11-04 07:20 — Keel AG-001/003 + sprints site + dev brain grant

### PASSOU (Keel ~07:30 publish)
| Item | Resultado |
|------|-----------|
| **AG-001** | `ProjectFlowBoard.tsx` `sprintsEnabled` + site/simples/marketing; `dogfood-ag-001.client.spec.tsx` **PASS** |
| **AG-003** | `dogfood-ag-003.client.spec.tsx` — só `it.fails` Ensinar (Prism); 1 expected fail |
| **AG-004 dev** | `seed-default-team.ts` `seedDevHarnessBrainGrant` só com `readClientDevSeedEnabled` + `seedDevHarnessScenario` (onboarding real intocado); Anvil host AG-004 4/4 |
| **Kanban tests** | 8 files **32 pass** + 1 expected fail |
| **check-pkg** | `client-ui-persona` OK |

### Arquivos tocados (Lumen/Prism ao voltar)
`ProjectFlowBoard.tsx`, `seed-default-team.ts`, `dogfood-ag-001.client.spec.tsx`, `dogfood-ag-003.client.spec.tsx`, `seed-default-team.client.spec.ts`

### Fila (não vazia)
D8 exe Rivet pos-V28; PRO-6 fake-clock; GOV/PB §3; AG-003 verde quando Prism Ensinar; persona-gate smoke já ok 10:08 UTC.

---

## 2026-11-04 07:10 — Contracts 21/21 + gate Prism TS + promo PRO/S7/GES

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts batch** | **21 pass** (~113 s) — boot-publish, PRO-6, GES, S7 host, scope, v1-close |
| **B9 + aceite layer-1** | B9 4 pass; BYC/SB/W2/GOV/PB contracts **21 pass** (~71 s) |
| **Promoção aceite** | `mandatory-proactivity` (UI smoke), `mandatory-onboarding-from-zero` (bootstrap+playwright contract), `mandatory-team-manager` (GES contract replay) |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **client-ui-persona** TS2739/TS2769 `register-lumen-ui.tsx` + TS2339 `register-prism-screens.tsx` `LocaleRuntime.active` → **[Prism/Lumen]**; bundle + eval scan OK |
| **D8** | Setup ainda 343148924 @ 05:56 (pre-V28) → **[Rivet]** |

### Fila (não vazia)
PRO-6 fake-clock (8 todo); S7 clean HOME + dirD strict; B9 Tier 1 app (3 todo); GOV/PB §3 full; axe 23×; D8 NSIS pos-V28.

---

## 2026-11-04 07:05 — V1 close E2E contract 3/3 + aceite partial + D8 ainda Rivet

### PASSOU
| Item | Resultado |
|------|-----------|
| **`mandatory-v1-close-contract`** | **3/3** (~112 s) — `v1-close.spec`, `assert-opt2.ts`, host `measureV1Close` wire |
| **Promoção `it.todo`→real** | `mandatory-governance` (3), `mandatory-project-boards` (hub), `mandatory-wave2` (SubjectBar), `mandatory-bring-your-context` (Importadores), `mandatory-second-brain` (gallery) — com `PERSONA_E2E=1` |
| **Post-it Status** | `maestri note edit` timeout 2× (07:05) — linha acima só em `probe.md` até Maestri responder |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **D8 PRIORIDADE (1)** | Setup `C:\p8c\Persona-Setup.exe` 343148924 B @ 05:56 **anterior** ao Forge V28 (06:17); exe instalado @ 04:53 ainda **`unsafe-eval` CSP** → `#root` vazio, `hasPersonaShell=false` (`installed-cdp-diag.json`) → **[Rivet]** NSIS pós-V28 + pack web |
| **Gate instalado completo** | Aguarda exe novo; Probe re-roda onboarding 5 passos + shots + desinstala quando Rivet avisar |

### Fila (não vazia)
PRO-6 layer-2 (8 todo); S7 UI (3 todo + dirD); B9 (3 todo); GOV/PB §3 cenários completos (partial gallery ✔); BYC/SB/GES app todos; axe 23×; D8 exe Rivet.

---

## 2026-11-04 06:47 — Muse microcópia finish onboarding

### PASSOU
| Item | Resultado |
|------|-----------|
| **Espelho** | `real-app-locale.pt.ts` + `playwright-onboarding.mjs` → **`Entrar na Persona`** (Muse; `MICROCOPY.md`) |
| **Contract** | `playwright-onboarding-contract` finish CTA + proíbe `Entrar no Persona` |
| **boot-publish contract** | **9/9** |
| **Harness** | `dogfood-padaria.ts` notas de diagnóstico alinhadas (seletor já usava `onboarding.finish`) |

---

## 2026-11-04 06:38 — **PERSONA_GATE ok** + galeria **23/23** + OPT/TOK

### PASSOU
| Item | Resultado |
|------|-----------|
| **`persona-gate.mjs`** | **`PERSONA_GATE ok`** (~245 s) — check-pkg 11/11, bundle, boot smoke **9/9** |
| **`real-gallery-blank-panel`** | **23/23** health (~103 s) — incl. `segundo-cerebro` |
| **GOV/PB gallery + org-chart scale** | **6/6** |
| **token/opt/working-send contracts** | **11/11** |

### Fila (não vazia)
PRO-6 layer-2 (8 todo); S7 UI (3 todo + dirD); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas claro/escuro; D8 exe Rivet CSP; axe matrix 23×; GES Prism gallery todo.

---

## 2026-11-04 06:30 — PB-9/GES contracts + ws-storm + S7 motion

### PASSOU
| Item | Resultado |
|------|-----------|
| **PB-9 + GES contracts** (+ gallery) | **12 pass**, 1 todo (Prism Gestor editor gallery) |
| **`real-gallery-panel-gate`** ws-storm | **6/6** |
| **S7 UI bar** | reduced-motion **PASS** (`mandatory-scope.spec.ts`) |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **persona-host** TS6133/TS6196 `measureV1Close`/`V1CloseMeasureView` unused → **[Anvil/Forge]** (bundle ok) |

### Fila (não vazia)
PRO-6 layer-2 (8 todo); S7 UI (3 todo + dirD); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas; D8 exe Rivet; axe/blank-panel 23×; gate após host fix.

---

## 2026-11-04 06:23 — gallery contracts batch (BYC/SB/W2/PRO/GOV)

### PASSOU (`PERSONA_CONTRACT_INCLUDE_GALLERY=1`, host único)
| Suíte | Resultado |
|-------|-----------|
| BYC + SB | **13/13** (~92 s) — Importadores + Segundo cérebro |
| W2 + PRO-6 + GOV | **16/16** (~109 s) — SubjectBar, overview smoke, org-chart + two-day |

### Fila (não vazia)
PRO-6 layer-2 (8 todo app/fake clock); S7 UI (4); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas claro/escuro; D8 exe Rivet; axe 23×; blank-panel full matrix opcional.

---

## 2026-11-04 06:12 — **PERSONA_GATE ok** + bootstrap 10/10

### PASSOU
| Item | Resultado |
|------|-----------|
| **`persona-gate.mjs`** | **`PERSONA_GATE ok`** — check-pkg 11/11, bundle, **boot smoke clean home 9/9** (~238 s) |
| **`mandatory-boot-bootstrap`** | **10/10** dev seed (~150 s) |
| **Contracts** | boot-publish + D8 harness + GES/GOV/PB layer-1 — **19 pass**, 1 todo (GES Prism gallery) |
| **reap-orphans** | 0 árvores >15 min (free ~24 GB) |

### Fila (não vazia)
D8 exe Rivet CSP; PRO-6 layer-2 (8 todo); S7 UI (4); B9 (3 todo); PB-9/GOV-10 aceite nomeado+capturas; axe 23×; BYC/SB app surface todos.

---

## 2026-11-04 06:01 — contracts v1 + B9 + gate bloqueio store

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts keyless** | scope/S7/PRO/boot/import/activity — **20/20** |
| **B9 Tier 1** | **6/6** (+3 todo Rivet/Prism) ~90 s |
| **`mandatory-installed-boot-contract`** | **3/3** (D8 scripts + reap-orphans) |
| **check-pkg persona-e2e** | OK |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **persona-store** `screens/repos.ts` TS2322/TS2558 (2 erros) → **[Anvil/Forge]**; bundle ok, boot smoke não rodou |
| **D8 exe** | continua **FALHOU** (CSP, ver 05:48) → **[Rivet]** |

### PRO-6 / S7 (Probe fila)
- PRO-6: layer 1 **verde**; layer 2 **8 todo** + UI smoke 2/2 em gallery.
- S7: host **verde**; UI **4 todo** (Prism/Anvil).

---

## 2026-11-04 05:48 — D8 Setup 1d4e5e95b8 boot/onboarding gate **FALHOU** (Rivet)

### Repro (Probe)
1. `C:\p8c\Persona-Setup.exe` (343134036 B) → `/S /D=C:\Users\migue\dev\persona\.maestri\tmp\probe-p8-install` → `Persona.exe` 246302720 B.
2. `installed-cdp-diag.mjs` (90s): `dsh-app://app/`, title Persona, **`[data-persona-shell]=0`**, `#root` vazio.
3. `installed-onboarding-cdp.mjs`: **timeout 180s** waiting `[data-persona-shell]` (onboarding 5 passos **não** apareceu).

### Evidência
| Artefato | Caminho |
|----------|---------|
| CDP diag JSON/png | `packages/persona/persona-e2e/artifacts/installed-cdp-diag.{json,png}` |
| Espelho Miguel | `.maestri/tmp/shots/installer/blank-root.png` (atualizado `probe-p8-blank-root-diag.png`) |
| Console | **CSP** `script-src` bloqueia **`unsafe-eval`** no bundle (`pageerror` no diag) |

### Veredito → **[Rivet]** (+ desktop CSP `secure-shell.ts` / pack)
Instala/desinstala OK; **app renderer não monta** → gate boot/onboarding **FALHOU**. Source `persona-gate` boot smoke 9/9 **não** cobre NSIS.

### Harness Probe
- `scripts/persona/reap-orphans.mjs` (list/`--kill`, >15 min).
- `installed-onboarding-cdp.mjs` grava `installed-onboarding-fail.png` + JSON em falha.
- Vitest subprocess timeouts 120/180/120s (`run-vitest-subprocess.ts`).

### Memória (Atlas urgente)
Vitest órfãos encerrados (~9 → **~29 GB** livres). Regra no `persona-e2e/README.md`.

### Fila (não vazia)
D8 verde após fix CSP/mount; PRO-6 layer-2; S7/B9 todos; PB-9/GOV-10; persona-gate após Prism TS.

---

## 2026-11-04 05:18 — PRO-6 contract gallery + gate bloqueado (Prism)

### PASSOU
| Item | Resultado |
|------|-----------|
| **PRO-6 layer 1** | `mandatory-proactivity-contract` engine/runner/jsdom **4/4** |
| **PRO-6 layer 2 (parcial)** | bloco gallery: `mandatory-proactivity-ui` **2/2** + contract **6/6** com `PERSONA_CONTRACT_INCLUDE_GALLERY=1` |
| **Gallery batch** | GOV/PB/BYC/W2/B9 **37/37** (+4 B9 todo); SB flake em batch → **afterAll 180s** fix, isolado **OK** |
| **Import/activity/working-send contracts** | **24/24** |
| **check-pkg persona-e2e** | OK |

### FALHOU / bloqueio
| Item | Evidência |
|------|-----------|
| **`persona-gate.mjs`** | **check-pkg** `client-ui-persona` (8) + `persona-host` (7): `subjects.retry` locale, `persona-live-store` undefined invoke, stubs `conversationScopeFromKey` → **[Prism/Anvil]**; bundle **ok**, boot smoke **não rodou** |

### PRO-6 v1 (Probe)
| Camada | Status |
|--------|--------|
| § Aceite 1–5 (fake clock) | **verde** via engine/runner |
| § Aceite 6 app + 7 bullets layer-2 | **2/8** UI smoke; **8 `it.todo`** (`mandatory-proactivity.spec.ts`) — fake clock + awayEvents seed |

### Fila (não vazia)
S7 UI 4 todo, B9 4 todo, GOV/PB/W2 aceite nomeado §4/§3, BYC/SB/GES app todos, axe 23×, gate após Prism, capturas claro/escuro.

---

## 2026-11-04 05:07 — Muse microcópia onboarding (espelho E2E)

### PASSOU
| Item | Resultado |
|------|-----------|
| **`real-app-locale.pt.ts`** | step3 **Ferramentas de IA neste computador**; step5 **Boas-vindas ao #geral** (Muse; glossário `persona-spec/design/MICROCOPY.md`) |
| **Harness sync** | `playwright-onboarding.mjs` alinhado; contract novo step3/5 vs mirror |
| **`dogfood-padaria`** | **PASS** (~281 s, home limpo) |
| **boot-publish + onboarding contract** | **8/8** |
| **check-pkg persona-e2e** | OK |

### Nota
- `dogfood-padaria` + `real-app-session` já importam `real-app-locale.pt.ts` — só o driver de publish boot estava defasado.

---

## 2026-11-04 04:38 — contracts batch + a11y harness

### PASSOU
| Item | Resultado |
|------|-----------|
| **Contracts keyless batch** | scope + PRO + boot-publish + W2 + GOV + PB — **28/28** |
| **`real-surface-a11y` harness** | `testTimeout` **120s** + dev seed (antes 5s flake) |

### FALHOU (devolver builder)
| Item | Evidência |
|------|-----------|
| **SB axe/teclado** | `real-surface-a11y` `segundo-cerebro`: **possible focus trap on button** — **[Lumen/Prism]** |

---

## 2026-11-04 04:29 — SB-5a gallery + health panel

### PASSOU
| Item | Resultado |
|------|-----------|
| **`real-gallery-second-brain`** | **1/1** (~28 s) — `[data-persona-surface="second-brain"]`, heading Segundo cérebro |
| **`mandatory-second-brain-contract`** + gallery | **7/7** (layer-1 + SB-5a subprocess) |
| **Galeria** | slug `segundo-cerebro` em `panels.ts` + nav Empresa; health matrix **23** painéis (+1) |
| **check-pkg persona-e2e** | OK |

### Deps (fila ainda aberta)
PRO-6 layer-2, B9/S7 UI todos, PB-9/GOV-10/W2-11 aceite nomeado+capturas, BYC app todos, GES Prism gallery, axe matrix, onboarding teclado.

---

## 2026-11-04 04:36 — PERSONA_GATE ok + BYC Importadores + ws-storm

### PASSOU
| Item | Resultado |
|------|-----------|
| **`PERSONA_GATE ok`** | check-pkg + bundle + boot smoke 9/9 (após cap `listConversationSubjects` rate-limited no smoke) |
| **BYC-1b** | `real-gallery-byc-import` + contract gallery **PASS** |
| **GES host** | `persona-host/gestor.spec` promovido no contract (**4/4** + 1 todo Prism gallery) |
| **ws-storm** | `real-gallery-panel-gate` **6/6** |
| **W2/BYC contracts** | gallery subprocess **verde** |

### Harness / deps
- **`persona-boot-smoke.mjs`:** até 4 pageerrors benignos `listConversationSubjects` rate-limited no tour (dependência **Anvil** throttle em clean home rápido).
- **`boot-smoke-benign-errors.spec.ts`** no publish contract.

### Fila Probe (não vazia)
PRO-6 layer-2 (7), B9 todos (4), S7 UI (4), PB-9/GOV-10 aceite nomeado+capturas, SB/second-brain gallery todo, GES Prism gallery, axe matrix completo, onboarding teclado.

---

## 2026-11-04 04:22 — S7 host contracts + Padaria + W2 SubjectBar

### Entregue (persona-e2e)
- **`mandatory-scope-contract.spec.ts`:** J1/J3+propose/J4/J5 host (**4/4**).
- **`mandatory-s7-host-contract`:** J1–J10 (**1/1** batch).
- **Padaria dogfood** (`dogfood-padaria.spec.ts`): **PASS** (~191 s, home limpo).
- **W2 SubjectBar:** harness `getByRole('tab', Geral)` — **`real-gallery-wave2-subjects` PASS** (id `#persona-subject-subject-geral` flake → **[Prism]** se tablist sem chip).

### S7 fechamento v1 (Probe)
| Camada | Status |
|--------|--------|
| Host J1–J10 | **verde** (s7 + scope contracts) |
| UI motion + dirD | **2/2** |
| UI onboarding zero / teclado / cards SCOPE | **4 todo** (Prism+Anvil) |

### Fila (não vazia)
PRO-6 layer-2 (7), B9 todos (4), PB-9/GOV-10/W2-11 aceite nomeado+capturas, BYC/SB app todos, axe matrix, onboarding UI S7.

---

## 2026-11-04 04:05 — PERSONA_GATE ok + GOV/PB gallery contracts + S7 2/6

### PASSOU
| Suíte | Resultado |
|-------|-----------|
| **`persona-gate.mjs`** | **`PERSONA_GATE ok`** (check-pkg + bundle + boot smoke 9/9) |
| Bootstrap dev seed | **10/10** |
| S7 scope UI bar | **2/2** (reduced-motion + dirD informacional) |
| GOV/PB contracts + **`PERSONA_CONTRACT_INCLUDE_GALLERY=1`** | **7/7** (incl. gallery subprocess) |
| Org chart mandatory + real 60/150 + two-day health | **9/9** E2E |
| Layer-1 contracts batch (PRO/BYC/SB/GES/TOK/activity) | **23 pass**, 5 todo |
| Turno 03:46 | galeria 22/22, B9 6/6 |

### Fila Probe (não vazia)
- **S7** 4 cenários `it.todo` (onboarding zero, persona_propose, handoff Coordenação, Cofre contexto).
- **PRO-6** layer-2 (7 todos app/fake clock).
- **B9** 4 todos (runner/members/desktop).
- **PB-9 / GOV-10 / W2-11** aceite completo (5+5+3 cenários nomeados + capturas claro/escuro).
- **BYC/SB** surface `it.todo`; **Padaria** dogfood; axe matrix opcional.

---

## 2026-11-04 03:46 — Galeria 22/22 + GOV/PB smoke; gate bloqueado (Prism WIP)

### PASSOU (E2E, host único `PERSONA_HOST_NO_LOCK=1`)
| Suíte | Resultado |
|-------|-----------|
| Boot smoke isolado (`--port 3366`) | **9/9** clean-home |
| **`real-gallery-blank-panel`** | **22/22** (~134 s) — PB-9/GOV-10 loading preso (parcial) |
| **`real-gallery-governance` + `real-gallery-project-boards`** | **3/3** |
| **`mandatory-b9-real-app` Tier 1** | **6/6** (+4 todo Rivet/Prism); harness WAVE2 (`heading` Geral, composer textarea) |
| Turno anterior: bootstrap **10/10**, S7 reduced-motion, PRO-6 UI **2/2** |

### FALHOU / bloqueio
- **`persona-gate.mjs`:** **check-pkg + bundle vermelhos** — `GestorPlanAdjustModal.tsx` (TS1024 `readonly`, locale keys, size `"s"`) + `GeneralChannelView` import morto; **`persona-host`** 1 erro → **[Prism]** (Probe não conserta feature).
- Smoke no gate: só roda se check-pkg limpo; boot smoke isolado **OK**.

### Fila Probe (não vazia)
- B9 **4 todos** (runner/kanban/members/desktop); PRO-6 layer-2 (7 todos); scope **4 todos** + dirD; BYC/SB/W2 gallery todos; Padaria; org-chart browser E2E; gate verde após **Prism** fechar `GestorPlanAdjustModal`.

---

## 2026-11-04 03:08 — JANELA ENCERRADA (Keel 4884366950): bootstrap 10/10 + S7 motion

### Keel
- **JANELA ENCERRADA** — builders podem editar core/client de novo; snapshot candidato no worktree do Keel.

### PASSOU
- **`mandatory-boot-bootstrap`:** **10/10** (~2,2 min) após harness Probe:
  - `BOOT_GATE_MAIN_PANELS` com `readySelector` Lumen (`knowledge`, `routines`, `files`, `usage`, `connections`, …).
  - `runBootstrapPanelCheck` + timeout 150 s/painel + ErrorState.
  - Teste 2 fatiado por slug (fail loud).
- **S7 / scope:** `mandatory-scope` **reduced-motion** verde (~98 s).
- **PRO-6 UI:** `mandatory-proactivity-ui` 2/2 (turno anterior, revalidado).
- **Publish:** `persona-gate` **check-pkg + bundle OK**; **boot smoke FALHOU** (host sem `dsh web:` em 120 s — CLI preso em plugins/services; reproduzível após rajada E2E). Re-run isolado quando host subir → **[Anvil/Rivet infra host]** se persistir fora de carga Probe.

### Infra E2E
- Host boot timeout intermitente se vários vitest browser competem → usar **`PERSONA_HOST_NO_LOCK=1`** e um host por vez.

### Fila Probe (ainda aberta)
- PRO-6 layer-2 `it.todo` (7), PB-9/GOV-10/W2-11 gallery, B9 tier-1, scope 4 todos + dirD, BYC/SB surface todos, Padaria, org-chart browser, `real-gallery-blank-panel`.

---

## 2026-11-04 02:34 — Publish gate VERDE + boot smoke 9/9

### PASSOU
- **`persona-gate.mjs`** (check-pkg + bundle + boot smoke): **`PERSONA_GATE ok`** (~5,8 min).
- **Clean-home tour:** 9/9 painéis sem ErrorState/Carregando (home temp + onboarding real).
- **Fix Probe (scripts/persona):** `playwright-onboarding.mjs` — step 1 via placeholder (não `input[type=file]`); fluxo alinhado a `completeOnboardingOverlay` (step 4 Continuar).
- **`playwright-onboarding-contract.spec.ts`** + item em `mandatory-boot-publish-contract`.

### FALHOU / parcial
- **`mandatory-boot-bootstrap`:** **1/2** — Prism (`BOOT_GATE_PRISM_PANELS`) OK; **`BOOT_GATE_MAIN_PANELS` timeout 600 s** (painel Lumen preso em loading ou nav lenta) → **[Lumen/Prism]** dev seed; clean-home 9/9 não cobre o mesmo roster.

### PRO-6 UI smoke (dev seed)
- **`mandatory-proactivity-ui`:** **2/2 PASS** após assert via `geralComposerLocator` (~70 s).

### Dependências
- PRO-6 layer-2 (7 todos), PB-9/GOV-10/W2-11 gallery, B9 tier-1, S7 scope 4 todos, Padaria — fila aberta.

---

## 2026-11-04 02:24 — Fila Vigia: contratos layer-1 + PRO-6 parcial

### Entregue
- **`mandatory-boot-publish-contract.spec.ts`:** ordem 9 painéis, alinhamento `REAL_GALLERY_PANELS`, subprocess sanitize.
- **`mandatory-proactivity-contract`:** +1 teste jsdom `overview-preview` (PRO-6 bullet 6 parcial — links no painel “fora”).
- README persona-e2e: bloco publish boot.

### Gates (subprocess / keyless)
| Suíte | Resultado |
|-------|-----------|
| boot-publish + PRO + BYC | **12 pass**, 1 todo |
| GOV/PB/TOK/activity/GES/SB/W2/OPT | **28 pass**, 4 skip, 4 todo (~82 s) |
| org-chart + fake-cli + web-host-boot | **9/9** |
| **BYC host walk (`logo.png` ignored)** | **verde** (histórico Forge resolvido no tree atual) |

### `persona-gate.mjs` (--skip-smoke --skip-typert)
- **check-pkg 11/11:** OK
- **client bundle:** **FALHOU** — `PooledAccount` already declared (parse Rolldown) → **[Prism/Lumen]** fora da folha Probe na freeze
- **boot smoke:** não rodou (bundle vermelho; mesmo com bundle verde, tour browser ainda depende `#geral`/Prism)

### Fila Probe (não vazia)
- Layer-2 browser: PRO-6 (7 todos + `#geral` composer), PB-9/GOV-10 gallery, B9, bootstrap dev seed, galeria 22, Padaria, org-chart &lt;1s overlap.
- Publish: re-run `persona-gate.mjs` completo após bundle verde + smoke clean-home.

---

## 2026-11-04 02:10 — Atlas clean-home tour no publish gate

### Entregue (persona-e2e + scripts/persona — folha OK na freeze)
- **`BOOT_GATE_CLEAN_HOME_TOUR`:** 9 painéis (Visão geral → #geral → Conexões → Uso → Saúde → Organograma → Quadros → Conhecimento → Aprovações).
- **`runCleanHomeTourChecks`:** falha em `role="alert"` (ErrorState) ou `Carregando…`/skeleton/`aria-busy` (12 s/painel).
- **`persona-boot-smoke.mjs`:** home temp limpa → onboarding Playwright → tour (tsx import bootstrap).
- **`persona-gate.mjs`:** smoke via `node --import tsx/esm …/persona-boot-smoke.mjs`.
- Teste: **`boot-gate-clean-home.spec.ts`** (ordem 9 slugs).

### Verificação
```
pnpm exec vitest run packages/persona/persona-e2e/tests/boot-gate-clean-home.spec.ts
node scripts/persona/persona-gate.mjs --skip-typert   # smoke real quando client verde
```

---

## 2026-11-04 02:04 — Freeze Keel: gates + fila pós-janela

### Gates subprocess (sem browser, persona-e2e OK)
| Gate | Resultado |
|------|-----------|
| Keyless e2e (boot-sanitize, fake-cli, visible-copy, token baseline, web-host-boot) | **9/9** |
| `mandatory-governance-contract` | **4 pass**, 2 skip gallery |
| `mandatory-activity-contract` (T3 §9) | **2/2** |
| Batch anterior (TOK/GES/SB/BYC/W2/PB-9/PRO) | **19 pass** layer-1 |

### Bloqueios (sem edit client/core na freeze)
- **E2E browser:** devSeed vazio + `#geral` composer → **Prism** (Muse 04:20: `map-rail-team.ts` `arriving` — 5 testes client).
- **Handoff Maestri Prism** enviado (715781).

### Fila Probe pós-freeze
- Layer-2: PRO-6, PB-9, GOV-10, W2-11, B9, galeria, Padaria, org-chart browser — **após JANELA ENCERRADA + client verde**.
- Layer-1: manter `mandatory-*-contract` no push snapshot Rivet.

---

## 2026-11-04 01:56 — Keel janela congelada + Probe folha VERDE

### Conformidade Keel (01:45+ freeze pacotes core/client)
- **Probe não edita** persona-core/engine/store/host/runners/vault/usage/client-ui-persona até **"JANELA ENCERRADA"** no Status.
- Trabalho permitido: **persona-e2e**, **persona-spec/reports**, gates subprocess, docs de aceite.

### persona-e2e (folha)
- **`check-pkg persona-e2e`:** OK (~5 s).
- **`tsc -p persona-e2e`:** OK.
- **Layer-1 contracts:** **7/7** arquivos, **19 pass** + skips/todos (~71 s subprocess).
- **E2E browser:** boot bootstrap **2/2 FAIL** — dev seed vazio (`SUA EQUIPE` sem Atlas) + `#geral` composer → **Prism** (bloqueio instalador; alinhado Keel "client primeiro").

### Harness (já em persona-e2e, pré-freeze)
- `waitForSeededTeam`: rail avatars + expand lista; 45 s.
- `openRealPersonaApp`: `dismissBlockingOverlays`.

---

## 2026-11-04 01:30 — #geral regressão + PRO-6 UI harness

### Diagnóstico `#geral` / composer
- **`[Prism] geral` isolado:** **FALHOU** 120 s (antes 22/22 galeria) — possível regressão produto ou overlay scrim bloqueando nav.
- **Harness:** `openRealPersonaApp` chama `dismissBlockingOverlays`; `ensureGeralComposer` sempre `resetGalleryHome`; composer wait 90 s sem swallow; galeria `geral/canais` timeout 240 s.
- **PRO-6 UI:** harness overlay fix → **1/2 pass** (Visão geral + `#persona-attention-title` OK); **1 fail** `#geral` composer (240 s) — **[Probe→Prism]** mesmo bloqueio B9/galeria-geral isolado.

### Gates subprocess
- WAVE2 + PB-9 + TOK contracts **verdes** (esta sessão).
- Org-chart jsdom **2/2** + jornadas **19/19**.

### Boot bootstrap (`mandatory-boot-bootstrap`)
- **2/2 FALHOU:** `seeded team missing (Atlas)` após 25 s + `#geral` composer timeout 90 s nos painéis Prism — **[Probe→Prism]** dev seed / live store (regressão vs galeria 22/22 ~00:24).

### Fila
- Prism: #geral composer + rail seed Atlas; PRO-6 composer E2E; B9; galeria 22 re-run; PB-9/GOV-10/W2 todos; Padaria; BYC walk Forge.

---

## 2026-11-04 01:05 — TOK gate Forge + B9 harness

### Tokens (OPT-1 / OPT-2)
- **`mandatory-token-scenarios-contract`:** **2/2 verdes** — baseline JSON + subprocess `token-measure.spec.ts` (402 tokens, gate +10%).
- JSON `persona-spec/baselines/token-scenarios.json` ainda placeholder numérico; fonte de verdade engine = Forge `bench-tokens.md`.

### B9 mandatory-b9-real-app
- **FALHOU** 2×: `beforeAll` composer `#geral` (cold start 1440×900); retry `ensureGeralComposer` estourou hook 360 s.
- **Harness:** composer deferido do `beforeAll`; viewport 1280×720; retry 3× em `ensureGeralComposer`.
- **3ª corrida:** **4/6 pass** (console, kanban, reduced-motion, dirD); **2 fail** `#geral composer` + draft (180 s timeout) — **[Probe→Prism]** canal #geral/composer não monta no cold start (galeria 22/22 verde na mesma noite sugere flake ou ordem de nav; re-run geral isolado pendente).

### Contratos revalidados
- GES **1 verde** + BYC **2 verdes** (walk host ainda todo).

---

## 2026-11-04 00:45 — GES promovido + gates layer 1 + galeria 22

### Gestor (GES) — **PASSOU** layer 1
- **`gestor.spec.ts`:** **10/10** verdes.
- **`mandatory-team-manager-contract`:** subprocess `gestor.spec.ts` promovido (**1 verde**); demais GES engine/gallery ainda `it.todo`.

### Gates subprocess (sem browser, esta sessão)
| Gate | Resultado |
|------|-----------|
| `mandatory-project-boards-contract` | **3/3** |
| `mandatory-second-brain-contract` | **5/5** |
| `mandatory-wave2-contract` | **7 pass**, 1 skip gallery |
| `mandatory-proactivity-contract` | **2/2** |
| Jornadas host | **19/19** |

### BYC — **FALHOU** (Forge)
- `bring-context-walk.spec.ts`: binário `logo.png` não listado em `ignored` (walk só `.md` keep). **[Probe→Forge]**

### Galeria 22
- 1ª corrida isolada: **21/22** — `[Lumen] perfil` timeout `Sobre Atlas` (rail densidade avatars @ 720p esconde ⋯).
- **Fix harness** `navigateProfileViaRailCard`: `resetGalleryHome` + expandir rail lista + fallback Shift+F10 → card → Abrir perfil.
- Re-run `-t perfil:` **PASS** (~63 s).
- Corrida completa pós-fix: **22/22 PASS** (~239 s, host isolado).

### B9 real app (esta sessão)
- **`mandatory-b9-real-app`:** **FALHOU** `beforeAll` — composer `#geral` não visível em 120 s após `ensureGeralComposer` (host abriu; possível stuck loading Canais — re-run após galeria verde ou **[Probe→Prism]**).

### Fila Probe
- PRO-6 / PB-9 / GOV-10 / W2-11 E2E todos; org-chart browser; TOK bench; Padaria; B9 re-run; S7 UI; D8 blocked; W2 SubjectBar → Prism.

---

## 2026-11-03 19:10 — PROJECT-BOARDS.md §3 (aceite, BRIEFING 15)

### Entregue
- **`mandatory-project-boards.spec.ts`:** 7× `it.todo` mapeando §3 (projetos isolados, categoria coluna↔engine, editor de fluxo, sprints+marco, proposta Coordenação, nav Quadros, panorama opcional) com tags `[Forge|Anvil|Lumen|Prism|Muse]`.
- **`persona-e2e/README.md`:** comando vitest.

### Verificação
```
node scripts/persona/check-pkg.mjs persona-e2e → OK
pnpm exec vitest run …/mandatory-project-boards.spec.ts → 7 todo
```

Promover cada `it.todo` → `it` quando o dono citado entregar host/store/UI.

---

## 2026-11-03 19:00 — Keel panel gate (loading preso, console storm, WS, onboarding)

### Entregue
- **`panel-gate.ts`:** stuck loading 5s (`Carregando`/skeleton/`aria-busy`), console fatals (`ERR_INSUFFICIENT_RESOURCES`, `Maximum update depth`, `#185`), WS storm ≤10 frames/3s, overlay com `persona.onboarding.complete.v1=1`.
- **`real-gallery-blank-panel.spec.ts`:** health combinado `[Owner] slug`.
- **`real-gallery-panel-gate.spec.ts`:** storm dedicado (conhecimento/uso/aprovacoes/…).
- **`capture.ts`:** galeria com dev seed + colunas index Loading stuck / Console fatals / WS 3s / Onboarding bug.
- **`keel-panel-diag.mjs`:** repro contra host já aberto (Keel :3191).

### Verificação
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 9.5s
```
E2E host bloqueado por lock Muse `design-shots` neste turno — gate **deve falhar vermelho** em Conhecimento/Uso/Aprovações quando lock livre (Keel achado).

### Comandos
```
$env:PERSONA_E2E='1'; vitest real-gallery-blank-panel.spec.ts
$env:PERSONA_E2E='1'; vitest real-gallery-panel-gate.spec.ts
node --import tsx/esm scripts/persona/keel-panel-diag.mjs <url>
```

---

## 2026-11-03 21:45 — Atlas gate bootstrap live store + protocolo post-it

### Protocolo (Keel/Atlas)
- **Persona · Status / Memória / UX & Animação:** só `maestri note edit` com âncora (última linha em `== LINHAS ==` ou última linha própria); **nunca** `note write`. Correção = linha nova.

### Gate bootstrap (Atlas)
- **`boot-gate-bootstrap.ts`:** pageerror/console.error, equipe semeada (`Atlas`), 9 painéis principais sem `Carregando…` após 12s (poll).
- **`exec-bootstrap-gate.mjs`:** hook em `ui-boot-check.mjs` (exit 1 se erros).
- **`persona-boot-gate.ts`:** mesma verificação no smoke-persona.
- **`mandatory-boot-bootstrap.spec.ts`:** vitest dedicado (dev seed + onboarding storage).

### Evidência
**Antes (unwrap cru / gate novo):** `mandatory-boot-bootstrap.spec.ts` falhou ~580s — pageerror `SlotAssemblyError`, nav bloqueada por scrim onboarding, `channels.find` não apareceu (bootstrap abortou cedo).

**Depois (unwrap listChannels etc. + Prism rawRemote):** 2ª corrida falhou ~735s — `createWorkspace conflict` (host já existia; bootstrap trata conflict?), scrim ainda bloqueia nav, SlotAssemblyError transitório.

```
PERSONA_E2E=1 vitest mandatory-boot-bootstrap.spec.ts → 1 failed
```

### Próximo Probe
- Gate: dismiss onboarding robusto + tratar `createWorkspace` conflict como ok (alinhar Prism/Muse).
- Re-run smoke-persona + `ui-boot-check.mjs` sob lock quando árvore verde.

---

## 2026-11-03 20:05 — Keel P1 painel em branco (detector + galeria)

### Probe (entregue)
- **`blank-main-panel.ts`**: mede só a coluna main (`[data-persona-shell] > child[1]` — rail também tinha `data-persona-grain`, falso negativo antes).
- **`navigate-panel.ts`**: rail agrupado Muse (Buscar em tudo…, expandir **Mais**, Configurações).
- **`real-gallery-blank-panel.spec.ts`**: 20 testes nomeados `[Owner] slug` — **regressão vermelha** quando main vazio.
- **`capture.ts`**: index com colunas **Main blank?** + console (texto, não `—`).

### Evidência (1ª corrida pós-fix main column)
```
PERSONA_E2E=1 vitest real-gallery-blank-panel.spec.ts
 8 passed | 12 failed (~457s)
```
Falhas esperadas Lumen (Keel): **kanban**, **conexoes**, **rotinas**, **conhecimento**, **arquivos**, **uso**, **aprovacoes**, **regras**, **perfil**, **membros**, **importar**, **canvas** (main cream / timeout nav). **visao-geral**, **geral**, **equipe**, **busca**, **projetos**, **canais**, **dms** passaram.

### Galeria
- `.maestri/tmp/shots/real/index.md` (77 png; re-run `capture-real-gallery.mjs` preenche blank+console).
- `finish-real-gallery-index.mjs` para índice offline.

### Donos (Status)
- **Lumen**: Remote* / tenant scope — painel branco + error boundary pt-BR (Keel).
- **Prism**: slot `main` / PersonaAppFrame vs registro Lumen.
- **Muse**: empty/error Screen primitives.

---

## 2026-11-03 19:52 — B9 Tier 1/2 verdes + fila Atlas (continuação)

### Pronto
- **Tier 2 CDP:** `desktop-host.ts` conecta ao `DSH_DESKTOP_RENDERER_DEBUG_PORT` injetado (não ao primeiro `DevTools listening` do processo main `--inspect`).
- **smoke-desktop:** espera `[data-persona-shell]` + `assertNotHarnessShell` (B9 desktop boot).
- **mandatory-b9:** sessão única `describe.sequential` (~82 s, 6 passed | 4 todo).
- README: aviso de **não** paralelizar web host + desktop (contention no `with-lock`).

### Comandos (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 4.5s

PERSONA_E2E=1 vitest mandatory-b9-real-app.spec.ts
 Test Files  1 passed (1)
      Tests  6 passed | 4 todo (10)
   Duration  84.40s

PERSONA_E2E=1 vitest smoke-desktop.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  247.87s

PERSONA_E2E=1 vitest smoke-persona + smoke-web + fake-cli + smoke.spec → passed (b9 falhou só por lock paralelo com desktop; re-run isolado verde)
PERSONA_E2E=1 vitest preview-visual.spec.ts → 1 passed (~10s)
PERSONA_E2E=1 vitest mandatory-scope.spec.ts → 2 passed | 4 todo (turno anterior)
```

### Fila Probe (PLAN — não vazia; dependências)
| Item | Estado |
|------|--------|
| B9 E2E real app Tier 1 | **6/6 verdes** (+ 4 todo produto) |
| A6 Tier 2 desktop smoke | **verde** (~248 s) |
| S7 scope obrigatório | **2/6** (reduced-motion + dirD); 4 todo (Prism/Anvil/Forge) |
| PRO-6 proatividade | **8 todo** (PRO-1..5) |
| B8 / C9 / D9 / E10 / F3 / F6 | todo, blocked em features |

---

## 2026-11-03 18:35 — Keel: inspect sync console + ui-boot-check + PRO-6/SCOPE

### Veredito (cordis-client-runner / persona-app)
- **Não é teardown do gate** (`capturas → stop`). Timeline `probe-inspect-console-timing.mjs`: o único `console.error` cai **entre `localStorage` + `reload()`** (~46 ms antes de `reload done`), **antes** de screenshot/context.close/taskkill. Carga única **sem reload** → **zero** erros inspect.
- **Causa:** `ClientCordisInspectRegistry.publish()` no unload/reload da página (`cordis-client-runner` + providers em `client/providers.ts`); `syncInspectManifest` falha com `Failed to fetch` enquanto a navegação aborta o fetch — ruído de harness web-app, não regressão Persona UI.
- **`persona-app/cordis.patch.yml`:** **não desabilitar** `cordis-client-runner` nem `cordis-inspect-providers` (este último está em `packages/bundle/web-app/cordis.patch.yml` ~L167, host global). Persona já desliga `ui-cordis` (L140); runner/inspect seguem necessários ao web-app + persona-runners.
- **Patch aplicado (Probe):** `ui-boot-check.mjs` usa `addInitScript` + `persona.onboarding.complete.v1` **antes do primeiro `goto`** (sem `reload`) em channel/720/1080 → **0 erros de console**; dirD channel **~34,8%** (`persona-light-channel.png`).

### Pronto
- B9 harness: `real-app-session.ts`, `mandatory-b9-real-app.spec.ts`, `web-host` `--profile persona`, `fixtures/real-app-locale.pt.ts`.
- SCOPE: `mandatory-scope.spec.ts` — 2 cenários verdes (reduced-motion real app + dirD via `runPersonaUiBootGate`); 4 `it.todo` produto.
- PRO-6: `mandatory-proactivity.spec.ts` permanece 8× `it.todo` (aceite E2E quando PRO-1..5 existirem).

### Comandos (verbatim)
```
node scripts/persona/check-pkg.mjs persona-e2e
persona-e2e: OK in 3.9s

node scripts/persona/with-lock.mjs "Probe ui-boot-check after initScript fix" --release-on "dsh web:" -- node scripts/persona/ui-boot-check.mjs
console errors (0):
(none)
diffRatio channel vs dirD: 0.34818904320987654 pass:true
```

### Fora / donos
- **Upstream (opcional):** `cordis-client-runner/inspect-registry.ts` — não `console.error` em falha de sync durante `pagehide`/abort (Forge/Harness).
- B9 mandatory: 4× `it.todo` (runner reply, kanban host, edit persona, Tier 2 CDP).

---

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
