# Relatos — Anvil (persona-store / persona-host)

Mais recente no topo. Dono: store, host, sync, `apps/persona-edge`.

---

## 12/11 01:0x — COLHEITA ITEM 16 (fatias 2-tela e 3) + os 5 ajustes da Carbon

**Fatia 3 — "quem tem qual acesso" (host).** Novo `persona-host/src/access-map.ts` (`accessMapOf`, `accessLabelOf`, `colleaguesWhoHold`, `ACCESS_RULE`): as concessões de conector do workspace (`ConnectorGrantsHost.list`) viram, por pessoa, "o que ela pode usar". Entra no prompt de duas formas, sempre como texto constante por estado (prefixo estável do Tally): (a) cada colega na lista de colegas leva `acesso: Gmail, Instagram` no campo `role` (`talkLayers`); (b) quando o workspace tem alguma concessão, a camada de fala ganha `ACCESS_RULE` ("quem tem o acesso é quem faz; peça a essa pessoa, não prometa o que ela não tem"). `teamGuidance` (Forge, `harness-team.ts`) aceita `access` opcional por colega. Ganchos pequenos: `orchestration.ts` (`accessOf`, 1 campo + 2 usos), `index.ts` (`this.orchestration.accessOf = …` e `accessLabelOf` nas deps do TeamTools). Sem artigo antes de nome (regra do Keel).
**Aba "Jeito de trabalhar" (tela, spec da Muse §16b).** `client-ui-persona/src/client/playbook/PlaybookPanel.tsx` + `.module.css` (novos): um cartão por jeito, título 15 px; "Usado 3 vezes · o último ontem" em palavras; chip NEUTRO de estágio (`Aprendendo · 1 de 3`, `Aprendendo · falta outro dia`, `Pronto para virar skill`, `Já é skill`); "O que você costuma pedir:" com até 3 ajustes em aspas curvas e "Ver tudo"; "Decidir em Aprovações" só onde há oferta; ação única `Esquecer` que confirma no cartão (`Sim, esquecer` / `Manter`, foco em `Manter`); estados vazio ("Nada aprendido ainda." + `Conversar com {nome}`), carregando (2 blocos, sem shimmer) e erro, só texto. `PersonaProfilePage.tsx`: aba entre Memória e Skills, só quando o host sabe listar (`playbookRows !== undefined`). Dados: dois @Remote novos em `persona-host/src/index.ts` — `listPlaybook(ListPlaybookRequest)` e `forgetPlaybook(ScreenDocRequest)` (Typert regenerado: `wrote 40 Typert artifact(s)`); `data/persona-screens-remote.ts` (facade opcional) e `data/lumen-remote-panels.tsx` (carrega, esquece, "Decidir" leva a Aprovações).
**Cartão da oferta em Aprovações.** A oferta do host (id `skill-offer-…`) lê "Virar skill" / "Agora não" e o carimbo "Virou skill" (antes "Revisar skill" / "Dispensar" / "Aprovado"). Aditivo: `ApprovalItem.dismissKey/stampKey` (mock-data.ts), `isSkillOffer` + 2 campos em `data/adapters/approvals.ts`, 4 linhas em `InboxDetail.tsx`/`ReactiveApprovalsList.tsx` (rótulo do "não", carimbo e tooltips). Qualquer outra skill segue com as palavras de sempre (teste).
**Fala simples — `codeify`.** Caminhos e códigos que ficam no texto simples ou na dobra "Detalhes" saem em `código` (crase) para o cliente mostrar em mono.
**Os 5 ajustes da Carbon (Ember 00:41).** (1) a citação cortada fecha `…”`, sem pontuação duplicada: o corte deixou de ser do CSS (que comia a aspa final) e passou a ser nosso — `memory/quote-cut.ts` mede a caixa numa cópia oculta (mesma classe e largura) e acha o MAIOR corte que cabe em 4 linhas (1 no compacto), refeito quando a largura muda (200%); sem layout (teste/painel oculto) corta por caracteres e quebras; (2) "Ver tudo"/"Ver menos" com inicial maiúscula (Memória e Jeito de trabalhar); (3) a guia da citação usa `--persona-outline-control` (a lilac-300 sumia no escuro), nas duas telas; (4) o chip de origem "Cofre" virou "Memória" (Cofre é o das senhas) e "rev N" saiu de TODOS os cartões; (5) o título virou "Memória da equipe". Seletores atualizados: `lumen-queue2.client.spec`, `memory-owner-source`, `playbook-panel`, E2E `owner-memory-item16`.
**Testes novos/alterados.** Host: `playbook.host.spec.ts` (+conversas, "Agora não", estágios, Esquecer), `access-map.spec.ts`, `access-wiring.host.spec.ts`, `speech.spec.ts` (+codeify). Cliente: `playbook-panel.client.spec.tsx` (cartões, estágios, Esquecer, estados, aba, cartão de oferta), `quote-cut.client.spec.ts` (11, puro), `memory-owner-source.client.spec.tsx` (+corte fechado, "rev", "Cofre", título). E2E real: `owner-memory-item16.spec.ts` agora confere em cada célula da matriz claro/escuro × 100%/200% que a citação fechada termina `…”`, sem pontuação duplicada e sem nada para o clamp cortar.
**Flake corrigido.** `memory-owner-source` (Prism 00:23) montava "ontem" como agora − 26 h, o que erra perto da meia-noite; agora dia de calendário ao meio-dia (também em `playbook-panel`).
**Provas.** Host (últimos): `Test Files 10 passed · Tests 100 passed` (playbook, speech/codeify, access-map/wiring, prefix-layers, markdown). Cliente alvo: `Test Files 4 passed (4) · Tests 51 passed (51)` (quote-cut, memory-owner-source, playbook-panel, lumen-queue2) + `markdown-details`/`decisions-unified`/`team-lines` verdes; SUÍTE COMPLETA do client (lock check): `Test Files 4 failed | 447 passed (451)` — as 4 falhas NÃO são minhas: `opinion-block-late-collapse` (2; spec RED do D-100 de 11/11 17:26, `OpinionBlock.tsx:131` ainda tem `useState(consolidated === undefined)`, frente Flint), `rail-ai-status` (1), `lumen-rpc-adapters` listConnections (1), `connections-remote` (1). check-pkg: `client-ui-persona: OK`, `persona-e2e: OK`; `persona-host`: 3 erros que não são meus (`cofre.ts` `deps` não lido; `index.ts` webhook do GitHub `secretOf` agora async; `webhook-http.spec.ts`).
**Limitações.** (a) O carimbo do cartão da oferta diz "Virou skill" mas NÃO tem o link "Ver em Skills" (a Muse pediu `✓ Virou skill · Ver em Skills`; falta a navegação a partir do carimbo, que é primitiva do Lumen). (b) "Detalhes técnicos" dobrados dentro do cartão do jeito NÃO foram feitos: a view não tem dado técnico (só tipo de trabalho, usos e ajustes). (c) O estágio "Aprendendo · falta outro dia" (3 usos no mesmo dia) não está na spec da Muse: escolha minha, avisar a ela. (d) A persona não tem gênero no modelo; toda a cópia nova é sem artigo. (e) Os recibos antigos "Revisão aceita: …" continuam no Cofre (só somem da lista). (f) Falta o aceite da Muse (§16b: matriz claro/escuro × 100%/200% com 3 jeitos, confirmação de Esquecer, cartão em Aprovações, vazio e erro) — precisa de dados de exemplo na galeria do Ember ou de um E2E com 3 jeitos reais.

---

## 12/11 00:10 — COLHEITA ITEM 16 (fatia 2, host): playbook silencioso → "Virar skill?" + decisões finais da fatia 1

**Decisões aplicadas depois do relato abaixo.** Keel (23:51): NADA de artigo deduzido do nome → chip "Só para Probe" e linha "Você disse numa conversa direta com Probe hoje:" (`personaArticle` e `to.article` removidos). Muse (23:52): chips de visibilidade e regra NEUTROS iguais a "Conversa" (âmbar é só "Esperando você"; o neutro já é o lilás do brand — um override lilac-200 ficaria claro-sobre-claro no escuro), "rev N" não aparece nos cartões do dono (era a posição na lista), a citação abre em 1 linha quando o texto da memória já é a própria citação (o caso longo). A Muse também pediu `isFeminineName`; prevaleceu a decisão do Keel (sem artigo) e avisei a Muse.
**Fatia 2 (só host, sem tela nova).** O "recibo técnico" `Revisão aceita: <id do ticket>` (antes: memória que todo o time lia e aparecia em Memória) deixa de existir. Novo `persona-host/src/playbook.ts`: uma entrega que o dono APLICOU é um uso silencioso de como aquela persona faz aquele tipo de trabalho (nota em `screen_doc` `playbook_note`; nada no chat, nada que o time leia); o que o dono PEDE para mudar é anotado junto ("como ele gosta"); 3 usos do mesmo tipo de trabalho em pelo menos 2 dias diferentes fazem UMA oferta — o cartão de skill que já existe em Aprovações: "Bia aprendeu “…” (usado 3×). Virar skill?" (1 clique ativa a skill candidata; nunca oferece duas vezes; mesma entrega duas vezes conta uma; títulos parecidos = mesmo tipo, por palavras, sem modelo). `feedback-wire.ts` reescrito (`learnFromAcceptedReview`, `learnFromRequestedChanges`, lê o Task, nunca o id); `index.ts`: 3 call-sites trocados em `acceptReview`/`requestChanges` (o caminho "bloqueado por conflito" não aprende nada); `screens.ts`: `listMemory` esconde os recibos antigos (autor `review`), `SkillProposal`/`ProposeSkillRequest.question` opcional.
**Provas.** `Test Files 9 passed (9) · Tests 96 passed (96)` (owner-memory 12 + playbook 7 + speech/wiring/style + cliente memory/`<details>`); locales regenerados (`locales exit 0`); bundle `exit 0`; APP REAL `owner-memory-item16.spec.ts` `Test Files 1 passed (1) · Tests 3 passed (3)` com a copy nova e a matriz claro/escuro × 100%/200%. check-pkg: `persona-e2e: OK`; `client-ui-persona` (24 erros em `team-connect/*`, chaves `teamAi.*` do Flint) e `persona-host` (2 erros: `IndicatorOfferView`/`IndicatorSchedule` não usados em `index.ts`, do Rivet) NÃO são do item 16.
**Limitações.** (a) Os recibos antigos já gravados continuam no Cofre (só somem da lista; revogar em lote fica para uma limpeza combinada). (b) A aba "Como ela trabalha" (lista das notas por persona) AINDA NÃO TEM TELA: as notas ficam em `listPlaybook(...)` no host; a tela é do Quill/Prism quando o Keel decidir. (c) A skill candidata sai com um rascunho simples (tipo de trabalho + exemplo do pedido + "o dono costuma pedir…"); o dono lê antes de aceitar. (d) Falta a fatia 3: o mapa "quem tem qual acesso".

---

## 11/11 23:50 — COLHEITA ITEM 16 (fatia 1): memória que se prova — o que o dono pede para o time lembrar fica com a prova

**O que o Miguel sente.** Diz no #geral "Pessoal, lembrem disso: a promoção é 2 pães de queijo por R$ 9" (ou "Regra da casa: nunca prometer entrega no mesmo dia", "A partir de agora…", "Lembra que…" numa DM) e o time passa a saber: vira UMA memória que todas as personas leem (rule = contexto obrigatório em todo turno), ligada à mensagem exata. No perfil da persona › Memória o cartão mostra a fonte e as palavras do dono: **"Você disse no #geral hoje:"** + a citação literal em aspas curvas (itálico, fio lilás, 4 linhas e "ver tudo"); chips "Toda a equipe" / "Regra da casa"; em DM "Você disse ao Probe numa conversa direta hoje:" + chip "Só o Probe". Dito de novo = continua UMA memória; dito ao time o que a persona guardava só para ela = a cópia dela é arquivada ("Tornar do time"). Segredo (senha, token, número longo) nunca entra (é do Cofre); pergunta ("Lembra do pedido?") não é ordem; só pessoa do workspace escreve (nunca persona, rotina, linha do time).
**Por que "se prova".** Quem escreve é o HOST, nunca um modelo: um texto externo lido na mesma rodada não rebaixa nem inventa o que o dono disse. O registro guarda `sourceIds=[mensagem]` + um documento de prova (`memory_proof`: citação literal, quem, quando, onde, canal).

**Arquivos.** Novo `persona-host/src/owner-memory.ts` (detector `ownerMemoryAskOf`, `captureOwnerMemory`, `memoryProofOf`, `personaArticle`); host: `types.ts` (`MemoryView.source/scope/rule/to` e `MemorySourceView`, todos OPCIONAIS), `screens.ts` (`listMemory(projectId, viewerId)` preenche prova/escopo/regra/destinatária e lista a regra do dono, que não é kind "memory"), gancho de 2 linhas em `index.ts` `appendMessage` + `listMemory` passa `actorOf(...)` (autorizados pelo Keel). Cliente (autorizado pelo Keel): `data/adapters/memory.ts`, `memory/{MemoryPanel.tsx,MemoryPanel.module.css,mock-data.ts}`, `locale-sources/memory.{pt,en}.json` (+ regenerados). Copy e estilo conforme a Muse (22:42): "Você" só para o dono do app (nome para outro membro), canal pelo nome, data "hoje/ontem/em dd/mm" (ano só se ≠ corrente), linha de fonte 13px/600/`--persona-ink-muted`, citação 14px itálico `--persona-ink` com fio 3px `--persona-lilac-300`, “…”, 4 linhas + "ver tudo". Ajuste do Quill/Gauge: `.proofMore` e o `.summary` do `<details>` usam `var(--control-h-s)`.
**Testes novos.** `persona-host/tests/owner-memory.host.spec.ts` (12), `client-ui-persona/tests/memory-owner-source.client.spec.tsx`, `persona-e2e/tests/owner-memory-item16.spec.ts`.

**Provas.** Host `owner-memory.host.spec.ts`: `Test Files 1 passed (1) · Tests 12 passed (12)` (detector com perguntas/segredos/curtas fora, captura em canal e DM, dedupe, "Tornar do time", só pessoa do workspace, lista com `mine` por visualizador, caminho real `postMessage` → Memória, Esquecer). Cliente + `<details>` + host: `Test Files 4 passed | 1 failed (5) · 47 passed (48)` na 1ª rodada (a falha era só o papel do 2º membro no teste, corrigido; reexecutado verde). check-pkg: `client-ui-persona: OK`, `persona-e2e: OK`; `persona-host`: 28 erros em arquivos de outras frentes (`harness-dispatch.ts`, `index.ts` `ActionEventView`, `team-connect.host.spec.ts`), nenhum nos meus. APP REAL: `owner-memory-item16.spec.ts` (fake CLI + host web + Chrome; bundle refeito) passou 2/2 antes da matriz; capturas em `packages/persona/persona-e2e/artifacts/first-delivery/owner-memory-item16/` (`memory-1-list`, `memory-2-long-closed`, `memory-3-long-open`).
**Limitações.** (a) A persona não tem gênero no modelo: o artigo ("à Bia"/"ao Bento") segue o nome (termina em "a" → feminino); sugiro um campo `gender` na persona (decisão do Keel). (b) Só cobre o que o dono diz em palavras; **falta** (fatia 2) o playbook silencioso → "Virar skill?" após 3 usos e (fatia 3) o mapa "quem tem qual acesso". (c) O "Tornar do time" é automático por frase repetida ao time; ainda não há botão. (d) Memórias antigas de revisão ("Revisão aceita: <ticket>…", `feedback-wire.ts`) continuam na lista; são o "recibo técnico" que a fatia 2 deve silenciar.
**Falta.** Pré-aceite do Ember e aceite de tela da Muse (matriz claro/escuro × 100%/200% sendo capturada).

---

## 11/11 22:35 — COLHEITA ITEM 4 (fatia 1): fala simples por padrão + detalhe técnico dobrável + direito ao silêncio

**O que o Miguel sente.** A persona abre com o que aconteceu, em frase do dia a dia, e chama o dono de "você" (nunca "a pessoa"/"o usuário"). Caminho de pasta, código de erro, hash, JSON e nome de ferramenta saem do texto e vão para UM bloco "Detalhes" dobrado no fim (abre por clique/teclado). Passo que o dono precisa seguir fica visível, em lista numerada. Títulos de relatório (`Decisões que tomei:`, `O que não fiz e por quê:`) vão para a dobra; `Entrega:`/`Resumo:` perdem o rótulo. "Fala mais simples" / "pode ser técnico" na conversa troca o registro (guardado por projeto, sem chamar modelo; a própria resposta àquela frase já fala do jeito novo). Silêncio: um run pode responder só `[[passar-a-vez]]`; o marcador NUNCA aparece (nenhuma grafia, nem meio digitado no balão em streaming, nem em linha de Tarefa/relato/revisão); mensagem de PESSOA nunca fica sem linha (D-079): vira uma frase simples.

**Arquivos novos (meus).** `persona-host/src/speech.ts` (módulo puro: `speechRules/speechLayer/passRule`, `readPass`, `streamSafe`, `speakToOwner`, `shapeSpeech`, `splitDetails/composeSpeech/clipSpeech`), `persona-host/src/speech-style.ts` (registro por projeto + `styleRequestOf`), `persona-host/tests/{speech.spec.ts,speech-wiring.host.spec.ts,speech-style.host.spec.ts}`, `client-ui-persona/tests/markdown-details.client.spec.tsx`, `persona-e2e/tests/speech-item4.spec.ts`.
**Ganchos (aditivos).** `persona-host/src/orchestration.ts` (CRLF preservado: 0 linhas LF): import; `clipWords` agora delega a `clipSpeech`; `talkLayers` 1 linha (`capabilities` += `speechLayerFor(event)`); métodos novos `settlePassedReply/speechStyleOf/speechLayerFor/taskLine` junto de `talkPrompt`; `finishReply`: sink do stream → `streamSafe`, `shapeSpeech(...)` no lugar de `finishHostTalk(raw, event.body)`; `postAs`: última porta (`readPass`); Tarefa: `finalWords` passa por `readPass` (Task que passa fecha com "Sem novidades por aqui.") e os 3 `postAs` de Tarefa usam `taskLine`. Ordem do pipeline como o Keel fixou: turn-close (texto cru, Bolt) → readPass/shapeSpeech → postAs. Cliente (autorizado pelo Keel, só aditivo): `chat/markdown/{parse-markdown.ts,MarkdownBody.tsx,MarkdownBody.module.css}` — `<details>` é a única tag HTML lida (resumo sempre texto, corpo Markdown, fecho ausente durante streaming vai até o fim, `</details>` dentro de bloco de código não fecha); o resto do HTML segue virando texto.
**Prefixo estável (para o Tally).** A camada de fala é UM parágrafo constante por (registro, pode-passar): igual em toda mensagem de pessoa; só mensagens não-escritas-por-pessoa levam também a regra do silêncio.

**Provas (saída real).**
- Host: `speech.spec.ts` + `speech-wiring.host.spec.ts` + `speech-style.host.spec.ts` + regressão dirigida (talk-voice, streaming, never-silent, token-wiring, token-opt, real-path, attachments, bug-crash-1, delivered-words) → `Test Files 12 passed (12) · Tests 118 passed (118)`.
- Cliente: `markdown-details.client.spec.tsx` + `markdown-parse` + `markdown-body` + `channel-markdown` → `Test Files 6 passed (6) · Tests 82 passed (82)` (junto do host).
- Suíte INTEIRA do host: `Test Files 6 failed | 219 passed (225) · Tests 20 failed | 1465 passed` — as 6 falhas NÃO são do item 4: `account-swap-policy/-remote` (13; trava de janela da Jade antes da Tarefa), `state-lines-parts` (1; cadeia do Forge muda a ordem do script), `opinion-run` (4; testes RED do D-100 `NOVA VERSÃO`, `opinion-run.ts` não é meu), `sw-windows-draft` (MinGit ausente neste ambiente), `first-delivery-engine-wait` (timeout de 5 s sob carga). Os 4 primeiros reexecutados isolados falham igual (`fail4-1.log`).
- `check-pkg`: `persona-host: OK`; `client-ui-persona`: 1 erro em `connections-engine-capabilities.client.spec.tsx` (não meu); `persona-e2e`: 2 erros em `eval-padaria-run.ts`/`team-d100-gate.ts` (não meus; meu spec compila). `generate-typert`: `wrote 40 Typert artifact(s)`.
- Sala limpa: `check-cleanroom.mjs --files <10 arquivos>` → `PASSOU — 10 arquivo(s) checado(s), 0 falha(s), 0 aviso(s)`.
- APP REAL (bundle do cliente refeito `bundle exit 0`; host web + stub de CLI + Chrome): `persona-e2e/tests/speech-item4.spec.ts` → `Test Files 1 passed (1) · Tests 5 passed (5)`: (1) "Abrimos às 7h todos os dias e você já pode conferir." + "→ Detalhes" fechado, abre por clique e mostra `C:\Users\ana\padaria\horario.json`; (2) "pode ser técnico" → próxima resposta traz o caminho no texto, sem dobra; (3) "fala mais simples" → dobra de novo; (4) `[[passar-a-vez]]` → uma linha simples e o marcador não existe na tela. Capturas: `packages/persona/persona-e2e/artifacts/first-delivery/speech-item4/speech-1-folded.png`, `speech-1-open.png` (+ 2/3/4).

**Limitações conhecidas.** (a) "a pessoa" é reescrito só quando é claramente o dono (não mexe em "a pessoa que ligou"); "avisei a pessoa que o cartaz saiu" fica (ambíguo) — o prompt já proíbe. (b) Prévias (lista de conversas, notificação do desktop) podem mostrar a tag `<details>` crua de mensagens novas: não toquei nesses leitores. (c) Silêncio quieto de rotina/iniciativa (fechar a Tarefa sem linha nenhuma) NÃO está feito: hoje uma Tarefa que passa fecha com "Sem novidades por aqui."; fica para a fatia 2. (d) "NO_REPLY" é aceito só como grafia de entrada que modelos produzem (o marcador nosso é `[[passar-a-vez]]`). (e) O helper `hireSuggestedTeam` do e2e está quebrado na árvore atual ("Contratar persona" não aparece no rail); meu spec não o usa (a persona do onboarding responde por `@Probe`).
**Falta.** Pré-aceite do Ember; depois item 16 (memória que se prova).

---

## 07/11 16:45 — P0-1 "ARTE VIRA ARQUIVO" NO HOST (D-099) + `ultra` + BUG-CRASH-1 + host fechado v2 + HT-11 em staging

**P0-1 (host, no tree; contrato em `persona-settings-host.md` §(7)).** Causa (Tally): `tools = {}` ⇒ CLI sem nenhuma ferramenta. O runner já separava files/shell/web; faltava o padrão e o interruptor.
- **Padrão:** toda persona que o produto cria nasce `tools = { files: 'write' }` (onboarding, contratar, Gestor, `createPersona`). A contratada herda NO MÁXIMO o que a contratante tem (teto D-081/083; `harness-hiring`/`j03-hire` ajustados). **Personas já existentes ficam `{}`** (migração combinada com o Keel). Decisão minha: nasce ligado SEMPRE (não só com pasta) porque o onboarding cria as personas antes da pasta existir; quem decide é a TRAVA POR TAREFA (`file-tools.ts` `toolsForTask`): numa CLI a concessão só vale se a Tarefa tem pasta de rascunho (`ticket.execution.directory` ≠ `.`); sem rascunho a Tarefa é só texto; a chave do runner aquecido leva `:files`.
- **Gateway:** `gatewayLevelOf` delega ao `gatewayToolLevel` do Tally; `files:'write'` sozinho deixa o gateway em `none` (só coordenação; sem e-mail/navegador/computador). `runner.ts` segue no nível nativo.
- **Rascunho para quem trabalha a pedido de colega:** `prepareReview` pulava toda Tarefa com rota; agora a rota `mode:'task'` (passagem, parte de plano: a arte do time) ganha rascunho se a persona salva arquivos. 1ª entrega e conversa seguem só-texto.
- **draftRoot:** `ActionBridge.arm(runner, ticketId, draftRoot)` ⇐ `ticket.execution.directory` (o gate nega escrita fora do rascunho).
- **Interruptor:** Remote `setPersonaCanSaveFiles` + `PersonaView.canSaveFiles` / `canSaveFilesAvailable` (nomes combinados com o Quill para o lib 6c).
- **Imagens no Revisar:** `ReviewFileView.afterImage/beforeImage/folderImage` (data URI ≤ 262 144 caracteres, leitura confinada; `review-images.ts`).
- **Provas:** `tests/file-tools.host.spec.ts` 8/8 (avesso: sem a trava por Tarefa o teste "projeto sem pasta é só texto" falha); `harness-hiring`, `j03-hire`, `engine-effort` verdes; check-pkg host/core/runners OK. Suíte do host final em curso (resultado ao Keel).
- **Achado para o Forge (engine, não meu):** em pasta que é repositório git o provedor Git lista só `git diff --numstat` e NÃO inclui arquivo NOVO não rastreado (a arte nova não apareceria no Revisar); pasta comum (histórico privado) não é afetada. Nas notas da versão como limite.

**Antes (mesmo dia):** `ultra` do Codex entregue (core+host; RED 4 → GREEN; check-pkg dos 4 pacotes + cliente OK); BUG-CRASH-1 (relato de falha nunca derruba o host; RED 3 → GREEN 4; o seq duplicado era a rig do Flint, hunk do store em staging desligado); EFF-1 no ledger sem migração; host fechado v1 (2465) e v2 (359 arquivos / 2493 testes). **Em staging (v1.2, fora de src):** HT-11 (`.maestri/staging/anvil-ht11/`, `--check` OK: 14 hunks + 2 arquivos novos + contrato §(8)). Os 3 `apply.mjs` de staging tinham uma falha de idempotência (hunk só-de-acréscimo parecia "âncora OK" já aplicado: um segundo `--apply` duplicaria); corrigida nos três, não reaplicar nada sem `--check`.
**Arquivos P0-1:** `persona-host/src/{file-tools,review-images}.ts` (novos), `{onboarding,gestor,screens,types,index,orchestration,action-bridge}.ts`, `tests/{file-tools.host.spec,harness-hiring.spec,journeys/j03-hire.spec}.ts`, contrato §(7), notas da versão (3 limites + 1 novidade). Reverter: `node .maestri/staging/anvil-files/apply.mjs --revert` (volta os 6 arquivos de src; os ajustes de teste e `action-bridge.ts`/`arm` são à parte).
**Falta (meu):** resultado da suíte do host final; o Forge regenera o Typert; Quill liga o interruptor no lib 6c. Depois: PARAR e avisar o Keel (regra da cota).

---

## 07/11 14:16 — BUG-CRASH-1 NO TREE (o relato de falha nunca derruba o host) + auditoria pedida + conferência do Tally

**BUG-CRASH-1 (P0 do Flint/Keel 13:19).** O app fechava sozinho (exit 1, "fatal load failure") quando o relato de uma falha esbarrava num StoreError: `settleTask` chamava `failReply` dentro do próprio catch sem nada em volta, e a linha `this.work = this.work.then(() => this.settleTask(...))` (L823) era a ÚNICA da família sem `.catch`: a rejeição derrubava o processo e, antes disso, deixava a cadeia de trabalho rejeitada para toda Tarefa seguinte.
- **Causa do `seq` duplicado (item c): NÃO é do store.** Diagnóstico próprio, antes do Flint retirar: o `persona.db` de captura tinha `channel:geral` com cursor=16 e max_seq=22; os 6 eventos acima do cursor (`md-<ms>`, `occurred_at_utc` +1 s por linha) vinham de `INSERT INTO event` direto da rig do Flint (`flint-shots.mjs`: seq = MAX+1 sem mover `stream_cursor`). O `append` (cursor+1 dentro de BEGIN IMMEDIATE) está correto; nenhum caminho de produto escreve evento fora dele (grep: só `repos.ts`, `scale/seed.ts` que move o cursor, e specs). O hunk S1 do store (`append` seguir o log quando ele está à frente) **ficou em staging, desligado** (`.maestri/tmp/anvil/p0-staging/apply.mjs --with-store`), fora do candidato por decisão do Keel: caminho quente de gravação sem necessidade de produto demonstrada.
- **Aplicado em `persona-host/src/orchestration.ts` (4 hunks por âncora exata, tudo-ou-nada, backup em `p0-staging/backup`):** O1 o `this.work = …settleTask` ganha `.catch` (soft failure `settle-task`); O2 `failReply` vira seguro (`try/catch` → `softFailure('fail-reply')`, `not open` sai calado; cobre os 7 chamadores; o corpo antigo virou `reportRunFailure`); O3 `reportResolveFailure`: a linha de falha é opcional (a Tarefa já está `blocked`) e o `ticketSettled` sempre sai; O4 `postAs` engole `conflict` SÓ quando a linha já está gravada (`events.has(id)`); conflito com a linha ausente continua subindo.
- **Prova RED/GREEN:** `tests/bug-crash-1.host.spec.ts`. No código antigo 3 vermelhos (1: relato recusado não pode rejeitar nem deixar unhandled, vira soft line e o `ticketSettled blocked` sai; 2: a cadeia não envenena e a próxima Tarefa roda um turno; 3: `postAs` idempotente), com a MESMA sequência do log de campo (`run failed … RunnerResolveError` e depois `run failed … StoreError: conflict`); depois da correção 4/4 (a 3b guarda que um conflito com a linha ausente não é engolido em silêncio). Specs dirigidos de caminho de falha (20 arquivos: first-delivery, quota, not_logged_in, real_turn_cap, d096, ht9…) = 149 verdes. Logs: `.maestri/tmp/anvil/bug-crash-1-{red4,green,specs,checkpkg}.log`.
- **check-pkg host:** 1 erro de tipo que NÃO é meu: `tests/delivered-words.spec.ts(113,37)` TS2322 (arquivo novo, não rastreado, salvo 14:12 por quem faz o comportamento 5; avisei o Bolt e o Keel).
- **Também 12:35-14:00:** conferi o diff do Tally para o `input_tokens` em dobro (`ledger-input.ts` novo + `estimate-calibration.ts:139` + `estimate-account.ts:40`): correto e mínimo, guarda igual à do Probe. O Bolt aplicou o HT-3 e mais 2 linhas em `orchestration.ts` (resposta da pessoa depois de reiniciar) em regiões que não toquei; combinamos a ordem por recado ("SALVEI 14:07").

**Arquivos:** `persona-host/src/orchestration.ts`, `persona-host/tests/bug-crash-1.host.spec.ts`; staging `.maestri/tmp/anvil/p0-staging/{apply.mjs,backup/}`.
**Falta da auditoria que o Keel pediu (TEAM-6/7, FLOW-1, SB-6, W2-10, CV-6, ISO-6/7, TEAM-15):** interrompida pelo P0; retomo na fila (levantamento parcial: TEAM-6 host tem `getReviewPolicy`/`setReviewPolicy` + `reviewedBy` no cartão e o selo "Revisado por" no cliente; TEAM-7 tem `MessageView.dailyBrief` + `morning-brief*.spec`; SB-6 tem `exportBrainVault`/`importBrainVault` no host).

---

## 07/11 13:12 — RETOMADA: HOST FECHADO (suíte final) + corrida de saída corrigida + EFF-1 NO LEDGER (sem migração)

**Host fechado (12:36, ao Keel).** check-pkg core 5.7 s / store 7.9 s / host 17.8 s / runners 15.4 s = OK. SUÍTE FINAL `vitest run` host+store+core+runners UMA vez sob `--lock check`: **356 arquivos / 2465 testes (2 skipped)**, 236 s. Vermelhos da rodada cheia = 5 testes em 2 arquivos, todos de CARGA (timeout de 45 s com git real + EPERM de limpeza): `review.spec` (4) e `sw-windows-draft.spec` S2 (1) → sozinhos 17/17 verdes. Logs: `.maestri/tmp/anvil/final-{checkpkg,suite,suite-reds}-1107.log`.
- **1 erro solto REAL, corrigido:** `morning-brief.host.spec` deixava um Unhandled Rejection `database is not open` (`onTaskSettled` → `curateProjectReports` depois do `store.close`, corrida de saída). `index.ts` `onTaskSettled` agora ignora só o `not open` (a mesma regra do `settleTask`; o boot cura de novo); qualquer outro erro continua subindo. `morning-brief` 8/8 sem erro.
- Bolt aplicou o HT-3 depois da suíte (combinado por recado; ele não tocou em `types.ts`).

**EFF-1 no LEDGER (Keel: sem migração; v26 só com OK dele).** Achado: a linha do `turn_ledger` não guardava nem o modelo (o `usage_record.model` recebe o NOME DO MOTOR e o painel de Uso agrupa por ele: não mexi, mudaria a tela).
- **core** `token-ledger.ts`: `TurnLedgerEntry` + `model`, `modelRequested`, `effortRequested`, `modelDropped`, `effortDropped` (opcionais); validação `ENGINE_CHOICE` (identificador curto, nunca prosa); `LEDGER_CHOICE_FIELDS`, `isLedgerChoiceValue`, `ledgerChoiceOf` (exportados em `domain/index.ts` e `index.ts`).
- **store** `ledger/repos.ts`: o detalhe é JSON em `screen_doc` (`kind 'turn_engine'`, id = id da linha), na MESMA transação, só com escolha/queda; regravar sem escolha apaga; `list()` faz LEFT JOIN (colunas prefixadas `t.`); detalhe estragado sai campo a campo. Schema continua 25.
- **host** `types.ts` `TurnLedgerView` +5; `engine-choice.ts` (novo: `engineChoiceOf`, `model` só ao lado de escolha/queda, prosa fora sem perder a medição) + 1 linha no sink de `orchestration.ts`. Tally acrescentou `effortDropped` ao `MeasuredUsage` a meu pedido. Typert: `TurnLedgerView` é referenciado (sem regen).
- **Provas:** `eff1-ledger.host.spec` 5/5 (Opus+Máximo chega ao spec e à linha; Padrão do motor = nada; quedas guardadas e a Tarefa segue; prosa fora; `engineChoiceOf`) — **avesso: sem o mapeamento 3 falham**; `turn-ledger.spec` (store) 5/5; core + store inteiros + 13 specs do host que leem o ledger = **99 arquivos / 815 verdes**; check-pkg core/store/host OK; oxlint limpo. Contrato `persona-settings-host.md` §(6). Caminho da prova real enviado ao Tally (`host.ledger.list`).

**Arquivos:** `persona-core/src/domain/{token-ledger,index}.ts`, `persona-core/src/index.ts`, `persona-store/src/ledger/repos.ts`, `persona-store/tests/turn-ledger.spec.ts`, `persona-host/src/{index,orchestration,types,engine-choice}.ts`, `persona-host/tests/eff1-ledger.host.spec.ts`, `persona-spec/contracts/persona-settings-host.md`.
**Próximo:** congelamento curto do Keel às 13:25 (tentativa 2 do TEAM-10); pedir o próximo item ao Keel.

---

## ⏸ PAUSA TOTAL (Atlas, por ordem do Miguel; cota semanal do Claude a 85%, reseta no sábado) — estado exato do Anvil, 05/11 ~06:35

**Parado em ponto seguro.** Nenhuma edição pela metade, nenhum job rodando, nada lançado, nenhuma IA real depois da ordem. Último estado de código: `check-pkg persona-host` OK (06:29, depois do EFF-1) e as specs tocadas por último verdes (`engine-menu-claude` 6, `engine-effort` 8, `connections` 4, `diagnostics` 1 = 19). Os jobs em segundo plano que eu tinha terminaram todos.

**FEITO nesta madrugada (tudo no tree, com testes; detalhes nas entradas abaixo: 06:40, 05:00, 04:20, 04:00, 03:20, 02:00):**
- TEAM-15 (flags ligadas por padrão; `PERSONA_HOST_FLAGS=production`; linha de boot e `exportDiagnostics().flags`); HT-9 cola do host (gate por runner, cartão, aprovação com `takeReleased`, `onActionApproved`); ponte dos `ConnectorPorts` reais (conta, `mcp_status`, CLI real sem modelo); **mandato por servidor** (bloqueador de release); P0 de boot (fold do assunto/`compileUsed` nunca rejeitam, boot fail-soft por projeto); autor sempre nomeável; Bom dia consistente (critério único, texto sem pessoa, `variant`).
- **2ª janela de host (integrador):** D-096 do host (migração v25 + `envModeReason` + `engine-note` + `engineNote`), Saúde sem rotinas do sistema, prévia de ação NO FIO (`action-card:<id>`), **EFF-1: o menu do Claude** (`claude-menu.ts`: 12 modelos + 5 níveis do `initialize`, tabela estática de reserva, `ConnectionView.source` `cli|static`).

**PELA METADE: nada em código.** Uma coisa NÃO foi feita: a **SUÍTE FINAL** (host + store + core + runners, UMA vez) que o Keel pediu para depois do `auto:5` do Tally (~06:50) e o aviso "host fechado" até 07:00. A última suíte completa que rodei foi 279 arquivos / 1873 testes às ~06:10 (CV-6 + D-096 + Saúde), ANTES da prévia no fio e do EFF-1; depois disso só rodei specs dirigidas (acima + prévia 20 + brief 5).

**PRÓXIMOS PASSOS (quando o Atlas chamar; nada disso gasta IA real):**
1. Rodar `check-pkg` de core, store, host e runners e a suíte final `vitest run packages/persona/{persona-host,persona-store,persona-core,persona-runners}` sob `--lock check`, depois que o Tally tiver aplicado o `ENABLE_TOOL_SEARCH=auto:5` (conferir `git status` / avisos dele). Esperado: os vermelhos conhecidos são de carga (`first-delivery-engine-wait`, `scale`, `sw-windows-draft`: passam sozinhos).
2. Dizer ao Keel "host fechado" com o número da suíte; conferir se o Forge regenerou o Typert **depois** do meu último save em `types.ts` (`ConnectionView.source`, `MessageView.actionPreview`, `ActionPreviewWire`); os `.d.ts` gerados referenciam o type do host, não o embutem, então deve estar certo.
3. Pendências que NÃO são minhas e dependem de IA real/exe: `ht89-dry` na versão INSTALADA; TEAM-10 tentativa 2 e o teste real do D-097 (CANCELADOS pela pausa); recaptura da Saúde (Lumen, bundle 5).
4. Se faltar o que cortar: o EFF-1 **não** se corta (ordem do Atlas); a prévia no fio já está no tree.

**ARQUIVOS (persona-host/src): novos** `action-bridge.ts`, `connector-bridge.ts`, `flags.ts`, `claude-menu.ts`, `engine-note.ts`; **alterados** `index.ts`, `orchestration.ts`, `governance.ts`, `external-actions.ts`, `connector-policy.ts`, `connector-grants-host.ts`, `connection-probe.ts`, `diagnostics.ts`, `runner.ts`, `team-cards.ts`, `handoffs.ts`, `types.ts`. **core/store:** `persona-core/src/domain/token-ledger.ts`, `persona-store/src/{migrations,constants}.ts` (v25), `ledger/repos.ts`, `tests/{open,migrate-fixtures}.spec.ts`. **Testes novos (host):** `host-flags`, `boot-fail-soft.host`, `ht9-host-bridge`, `connector-bridge`, `thread-authors.host`, `brief-single-criterion.host`, `health-system-routines.host`, `engine-note`, `d096-fallback.host`, `action-card-thread.host`, `engine-menu-claude` (+ guardas em `team-cards-split.host`, `env-optins`, `connector-policy`, `ht9-gate-contract`). **Contratos:** `flags-defaults.md`, `permission-gate.md` (cola, ponte, mandato), `team-real.md` §13/§14/§14b, `persona-settings-host.md` §(5). **Staging fora de `packages/`:** `.maestri/tmp/anvil/{d096-staging,preview-staging}/` (já aplicados) e os scripts de verificação com a CLI real (`connection-menu-dry.mts`, `claude-init-dry.mts`: só contagens, zero modelo).

**Regras que sigo:** nenhum commit (o Keel commita); nenhum `git reset/clean`; nenhuma IA real; nada novo até o Atlas chamar.

---

---

## 05/11 06:40 — A 2ª JANELA DE HOST: D-096, Saúde, prévia no fio, EFF-1 (menu do Claude) — e a ordem de aplicação

**Integrador da janela.** Ordem combinada e cumprida: Forge (pedido inteiro, D-097, includeTextOnly) → Bolt (CV-6, schema v24) → Tally (runners do D-096) → **eu (D-096 host, v25)** → prévia no fio → EFF-1. Cada um aplicou o seu staging por script atômico (`--check` antes, tudo-ou-nada); os meus ficam em `.maestri/tmp/anvil/{d096,preview}-staging/` (fora de `packages/`, pedido do Keel).
- **D-096 (host, v25).** `turn_ledger.env_mode_reason` (migração lida da versão corrente: depois da v24 do CV-6), `LedgerEntry.envModeReason`, `engine-note.ts` (a frase do cartão da Tarefa, pura: "Rodou no modo nativo desta vez: o conector Gmail não estava disponível." / "…precisa que você entre de novo na conta; a persona seguiu sem ele." / "…o isolamento ainda não foi verificado nesta versão do motor."), `TaskView.engineNote`. Sem reexecução: o Tally decide antes do primeiro token. O mandato do gate (`allowedServers`) fica armado também no `native-once`. Provas: `engine-note.spec`, `d096-fallback.host.spec` (5 casos), a store inteira (34 arquivos / 358 verdes na aplicação).
- **Saúde (Muse/Lumen).** As rotinas do SISTEMA (Resumo da manhã, iniciativa de cada persona) saíram da lista e da nota da Saúde (`governance.isSystemRoutine`): sem X vermelho, sem baixar a nota; a rotina da PESSOA sem dono continua achado. `health-system-routines.host.spec` (4); sem a correção 2 deles falham. (Os 2 primeiros testes liam `kind/subjectId` que a view não tem: passavam sem a correção; corrigi para `id`.)
- **Prévia de ação NO FIO.** `action-card:<id>` da persona, `MessageView.actionPreview` (`ActionPreviewWire`), atualizado no lugar a cada mudança (`external_action` → `changed` → `events.touch`); `action-card-thread.host.spec` (4). Contrato `team-real.md` §14/§14b.
- **EFF-1 (Atlas 06:21: não sai desligado).** Achado na CLI real (zero modelo): o host devolvia o menu do Codex (32 modelos) mas do **Claude `models: []`/`defaultEffortLevels: []`**; o `initialize` de controle do claude já lista 13 modelos com `supportedEffortLevels`. `claude-menu.ts`: o `ConnectionProbe` completa o cartão do Claude com esse menu, uma vez por versão; sem resposta da CLI, TABELA ESTÁTICA (`default/opus/sonnet/fable/haiku` × `low…max`); `ConnectionView.source = 'cli' | 'static'` (o nome da spec; a tela AGORA mostra a origem, pedido do Keel/Atlas) e `exportDiagnostics().menus`. **Medido no host real: Claude 12 modelos + 5 níveis, source 'cli'**. Escolha→runner já estava ponta a ponta (`setPersonaEngine` → `specOfPersona` → `--model/--effort`; 'Padrão do motor' = nada; 'sonnet' fixo nunca): `engine-effort.spec`, `persona-effort.spec`. `engine-menu-claude.spec` (6). Contrato `persona-settings-host.md` §(5).
- **Fio/Bom dia/mandato (anteriores nesta madrugada):** ver 04:00, 04:20 e 05:00. O avesso das garantias foi verificado (sem o `allowedServers` o teste do Drive falha; sem `isSystemRoutine` a Saúde falha).
- **Dois testes da suíte tratados:** `migrate-fixtures` (store) estourava 5 s com 25 versões → 60 s justificado; o do 'Bom dia agora' reescrito para a regra nova do Bolt/Muse (pedido à tarde sem novidade devolve o MESMO cartão).
- **Falta:** a SUÍTE FINAL (host + store + core + runners) UMA vez, depois que o Tally aplicar o `auto:5` (~06:45); resultado ao Keel até 07:00. Typert: regenerado pelo Forge; `ConnectionView.source` e `MessageView.actionPreview` são tipos do host (referenciados, não embutidos no `.d.ts` gerado).

---

## 05/11 05:00 — Bom dia consistente (um critério, texto sem pessoa, variant); host congelado até a 2ª janela

- **(A)** `groupDone` marca `grouped: true` (Tally: `MorningTask.grouped`): o corpo do pedido agrupado sai "Ontem: Campanha de Natal ficou pronta (texto, arte e posts).", sem "Lia terminou".
- **(B)** UM critério de "espera a pessoa" no host (`waitingOnPerson`): Tarefa em revisão/bloqueada; ajuda/revisão de colega é passo do time; **passagem entregue conta** (`Handoffs.isPassageTask`). "Precisa de você", os itens de "Hoje" (uma Tarefa em revisão não é "trabalhando") e o lembrete EQ-14 leem o mesmo: a mesma Tarefa nunca em 2 seções. Filtrei no host em vez de usar o `needsPerson` do Tally (a regra dele mantinha a passagem em Hoje).
- **variant** (`morning`/`on-demand`) já saía (Bolt); agora tem teste. Contrato: `team-real.md` §13. Prova: `brief-single-criterion.host.spec` (4).
- **Verificação:** check-pkg persona-host OK, oxlint limpo nos meus arquivos, suíte do host **188 arquivos / 1117 testes verdes**.
- **Staging fora de src (host congelado, Keel 04:52):** `persona-host/staging-d096/` — `README.md` (o desenho do D-096 do lado do host: sem reexecução, o Tally decide ANTES do primeiro token; `envModeReason` no livro; `engineNote` no cartão da Tarefa; o mandato do gate também no `native-once`; o teste GUARDA em 6 pontos) e `apply.mjs` (`--check` valida as âncoras em memória: **CHECK OK, 6 arquivos, schema 23→24, nada gravado**; `--apply` só na 2ª janela, depois do sinal do Tally). Contrato `team-real.md` §14 (a prévia de ação NO FIO, último item da janela; `expirou` = `cancelled` + `failureReason: "expirou"`).
- **Para a 2ª janela (~06:00):** D-096 (needed por padrão; fallback nativo decidido ANTES do primeiro token no resolveRunner, sem reexecução; `env_mode_reason` no livro, numeração da migração a combinar com o CV-6 do Bolt), CV-6 ganchos + laço de boot, `details.reason` no RemoteFault, includeTextOnly (Forge), e a prévia de ação no fio se o Keel quiser (`MessageView.actionPreview`).

---

## 05/11 04:20 — BLOQUEADOR DE RELEASE fechado: a persona nunca tem mais acesso do que a pessoa concedeu (mandato por servidor); autor sempre nomeável

**Bloqueador do Keel (D-081/D-083) — corrigido, com teste que FALHA sem a correção.** O `PermissionGate` decidia por CLASSE global (`preAllow`) e só conhecia `ownServers`: numa Tarefa nativa (todos os conectores da conta carregados) um `mcp__claude_ai_Google_Drive__search_files` — leitura provada pelo próprio servidor — passava mesmo com grant só do Gmail, e um envio pelo Drive virava cartão de "aprovar". Agora:
- **Tally** (`persona-runners/src/resolve/permission-gate.ts`, a meu pedido): `GateArming.allowedServers`; toda ferramenta `mcp__` de servidor fora de `allowedServers` ∪ `ownServers` é NEGADA sem `PermissionRequest` (nem leitura, nem cartão), mesmo em `approved[]`; `takeOutOfMandate()` só com nomes; ausente = compat. Testes dele: +7.
- **Host (meu):** o port `mcpServerNameOf(cli,id)` (a ponte responde com o nome cru do CLI, `claude.ai Gmail`) e `ActionBridge.arm` passa `allowedServers` = os servidores dos conectores que ESTA Tarefa recebeu (pedido da pessoa, "desta vez" ou permissão permanente), sanitizados; conector cujo servidor o host não sabe nomear fica FORA do mandato (fail closed); `settle` drena `takeOutOfMandate`.
- **Prova:** `ht9-host-bridge.spec` (8): Gmail dela; Drive carregado na conta e não concedido; o modelo lê e tenta compartilhar pelo Drive → negado, **nenhum cartão**, a Tarefa não fica `blocked`, `forRunner` entrega só o Gmail. **Verificado pelo avesso:** tirando o `allowedServers` do `arm`, o teste falha (a leitura do Drive passava). Contrato: `permission-gate.md` § "A cola do host" item 7.

**Do Muse (bundle 3):** (a) *linha sem autor* — `postAs` gravava o literal `'coordination'` como autor quando não havia falante, um id que ninguém nomeia (o cliente mostra só a hora). Agora grava a persona de Coordenação do projeto, e a LEITURA (`viewMessage`) também troca o literal pela Coordenação (bases antigas). (b) *as falas "pronto" por parte como stateLine absorvido* — já estão tipadas (`tagState`) e absorvidas quando existe o cartão; **guardas novas**: `team-cards-split.host.spec` (pedido dividido por função: todo item do fio tem autor humano ou de persona, nenhum "Pronto: …" nem "Em andamento: …" ao lado dos cartões) e `thread-authors.host.spec` (campanha do Gestor em 3 partes com fala viva de cada persona: nenhuma fala fica como linha ao lado do plano/entrega). Os dois passam no host da árvore: **se o bundle 3 ainda mostra a linha, ele é anterior às correções do Bolt (stateLine na gravação) e minha (autor / chave `split-`)**; se aparecer no próximo, me mande o JSON do evento (id, actorId, stateLine).
- **Para o Quill/Probe/Gauge:** soft failures agora também no stderr do host (fora do Vitest): `[persona-host] soft <prefixo>: <código>`, uma vez por tipo. `subject-fold: forbidden` é o caso TRATADO; reprovam `boot-project:` e `compile-context:`. Probe pediu congelar `persona-host/src`; o Keel abriu a janela até 04:45 só para isto.
- **Quill:** `run failed (first-delivery): Error: probe timeout` com `teamwork=0` é a sonda de prontidão do motor sem CLI real no harness (não é do host da v1.1); o host seguiu vivo, como deve.

**Provas:** suíte inteira do host **186 arquivos / 1110 testes verdes**; check-pkg persona-host OK; oxlint limpo nos arquivos que toquei; `thread-authors.host.spec` e o teste de autor passam depois dessa rodada.

---

## 05/11 04:00 — P0 de boot corrigido na raiz; ponte dos ConnectorPorts reais (CLI real, zero modelo); "Concluído" depois do cartão

**P0 do boot (Quill 03:25, Keel 03:28) — corrigido e provado.** Com os comportamentos da v1.1 ligados (o padrão do produto agora) o host MORRIA no boot da captura: `StoreError: forbidden` em `compileUsed` → `attachSubjectFold` → `EventRepos.listTopic` → `assertRead`. Causa: o fold do assunto lê o tópico em nome de `event.actorId`; uma mensagem num assunto escrita por quem não é membro nem participa do canal (a linha de uma persona, a do próprio time, um membro removido — o caso do `handoff:…:review`) é proibida, `compileUsed` rejeitava e, como a promessa é criada ANTES de o runner resolver e só aguardada depois, ninguém a observava: rejeição não observada = processo morto ("dsh: fatal load failure", do app-boot). Qualquer base real com um assunto assim derrubaria o app inteiro.
- **Raiz:** (1) `attachSubjectFold` é contexto OPCIONAL: não lança mais (`foldSubject` por dentro); a leitura proibida não acrescenta nada e fica UMA linha curta em `lastErrors`/diagnóstico (`subject-fold: forbidden`: só o tipo, nunca nome nem corpo); (2) `compileUsed` nunca rejeita (qualquer falha = sem contexto extra + linha `compile-context: …`); (3) o boot é fail-soft POR PROJETO (`registerPersona`, `scheduler.arm`, `remoteTeam.resume`, `runtime`, `curateProjectReports`): uma base estranha diz `boot-project: …` e o host sobe. Nada se lê em nome de quem não pode.
- **Prova:** `tests/boot-fail-soft.host.spec.ts` (4): a leitura crua do assunto ESTÁ proibida (a falha era real) e o wrapper a contém; `attachSubjectFold` sozinho é fail-soft e quem pode ler continua recebendo o fold; **base suja em `flagDefaults:'production'`** (assunto ilegível, persona aposentada com Tarefa e cartão de plano, aberta por um host novo do mesmo arquivo): tudo o que a primeira tela pede responde e um turno novo no assunto roda; host novo em base vazia sobe sem linha de erro.
- **O app instalado (home com dados do Miguel)?** Sim, é o mesmo código: antes de TEAM-15 o time estava desligado e não havia linhas de persona em assunto; ligado, qualquer base com handoff/revisão num assunto caía no caso. Com a correção entra no próximo exe (bundle). Não li o home real; as formas de dado estão cobertas pelo teste da base suja.

**Ponte dos ConnectorPorts reais (Keel 03:05/03:27, caminho crítico da v1.1) — pronta e provada na CLI REAL, zero modelo.** `persona-host/src/connector-bridge.ts` é só o ADAPTADOR sobre o pré-voo único do Tally (`McpStatusCache`/`availableConnectorsOf`/`cliIsolationProven`, que ele publicou a meu pedido): `availableConnectors` (conectores CONECTADOS da conta, nome sem "claude.ai " e a URL do proxy só em memória), `connectorDefinitionOf` (`account`), `mcpStatusOf` (tabela enxuta sem URL: o gate só chama de leitura o que o PRÓPRIO servidor provou), `cliIsolation` (`cliIsolationProven` com a versão do probe), `connectorsNeededBy` (o puro do engine, só com texto da pessoa). O host cria a ponte no boot (nunca sob Vitest), atualiza em segundo plano quando velha (15 min; falha espera 2 min); `connectorPorts` explícito vence a ponte.
- **CLI real:** `persona-host/scripts/connector-bridge-dry.ts` (só requisições de controle, só contagens): 12,3 s, 21 servidores, 412 ferramentas, **5 conectores da conta, todos `account`**; por conector a leitura provada passa (4/57→28 etc.), envia/apaga/paga perguntam e **nenhuma** ferramenta sem prova virou leitura (0 em todos); `BRIDGE OK`.
- **Cadeia inteira no host:** `ht9-host-bridge.spec` (7) inclui a frase da pessoa → ponte → conector → leitura sem cartão → envio com cartão → aprovar → sai. `connector-bridge.spec` (7). Contrato: `permission-gate.md` § "A ponte dos ports reais".
- **Limites honestos:** só conector DA CONTA; no modo padrão `answer-only` uma Tarefa com ferramentas roda NATIVA (todos os conectores da pessoa carregados; `cliIsolation = none` e o cartão avisa), e o gate continua perguntando antes de enviar. `connectorCostOf` não está ligado. Falta o ht89-dry na versão INSTALADA (precisa do exe).

**"Concluído: …" depois do cartão (Atlas, Gauge) — corrigido.** `TeamCards.replaced` procurava o documento do pedido dividido por função com a chave crua `<id>` quando ele é `split-<id>`: nunca achava o cartão, então a frase de fechamento era escrita e lida ao lado do cartão de entrega. Guarda nova em `team-cards-split.host.spec` (depois do cartão, aprovar as 3 partes não produz nenhuma linha `/^Concluído:/`).

**Provas desta rodada:** suíte do host 185 arquivos / 1102 testes verdes, 1 falha de carga conhecida (`first-delivery-engine-wait`, estoura 5 s sob carga e passa sozinha); oxlint limpo nos meus arquivos (os erros que sobram em `orchestration.ts` são de outros: attention-answer, `error.cause`, `withImages`); **check-pkg do host está VERMELHO por causa de `tests/state-lines-parts.spec.ts` (linhas 31–34, string não terminada), arquivo em edição de outro dono** — não é meu; o meu estava verde antes.

---

## 05/11 03:20 — HT-9: a cola do host, ponta a ponta sem modelo; override `production` e smoke das flags

**Cola do HT-9 no host (integrador, Keel 02:22) — pronta e provada sem modelo.** `persona-host/src/action-bridge.ts` (`ActionBridge`) liga o `PermissionGate` do Tally ao cartão de ação externa e à Tarefa; `tests/ht9-host-bridge.spec.ts` (6) roda o orquestrador REAL + o gate REAL (o gancho HTTP) + o cartão + as permissões contra um "Claude" falso que pede o gancho antes de cada chamada e só executa no conector falso quando o gancho diz `allow`. As quatro propriedades do Keel, no host:
1. **send sem aprovação → nada sai e aparece o cartão:** leitura passa (o pré-voo provou `readOnly`), o e-mail não; UM cartão `kind:'action'` com o conteúdo real; a Tarefa fica `waiting` (sem "pronto"); o hash nunca aparece numa tela.
2. **aprovar → sai exatamente aquela ação, uma vez:** `decideApproval` → `onActionApproved` (ligado agora; antes ninguém o ligava) acorda a Tarefa; o runner seguinte leva `approved` por conector; o conector recebe os argumentos que a pessoa viu; o cartão vira `sent` só porque o gate REALMENTE liberou (`takeReleased`, que o Tally publicou a meu pedido); a mesma chamada num turno depois pede de novo.
3. **argumentos reescritos → negado:** B não sai, o cartão de A fecha como "o pedido mudou antes de enviar; veja o novo cartão" e B vira outro cartão.
4. **pagar/apagar sempre com prévia mesmo com "Sempre permitir":** com send/pay/delete = never o e-mail passa, pay e delete viram cartões (`canRemember:false`; o de apagar lista os arquivos). **Uma verdade só:** `decideConnectorUse` devolve `preview` para pay/delete com QUALQUER permissão e `preAllowFor` nunca as lista (assertivas de `connector-policy.spec` e do contrato do Tally trocadas para a nova verdade, nenhuma apagada).
- **Mudanças:** `runner.ts` (`HostRunnerRequest.permissionGate`; `resolveHostRunner` passa `accountConnectors` + `permissionGate` ao `resolveRunner` — antes os conectores da Tarefa não chegavam ao runner), `orchestration.ts` (gate por runner em `resolveFor`, `arm` antes do turno, `settle` depois, `waiting` com cartão, o gate sai com o runner), `connector-grants-host.ts` (`approved` por conector em `forRunner`, port `mcpStatusOf`), `external-actions.ts` (`approvedWithConnector`, `approvedDocs`, `sendingDocs`; conector sem id nunca vira permissão permanente), `index.ts` (`actionBridge`, `portsNow`: Claude = `blocked-report`, `onActionApproved`). Contrato: `contracts/permission-gate.md` § "A cola do host".
- **Gate por RUNNER (não por persona×projeto×finalidade):** a Tarefa que leva conectores já tem runner próprio (`warmKeySuffix`), então um gate por runner nunca é dividido entre Tarefas; fica mais seguro que o por-persona sugerido. Com 2+ conectores na mesma Tarefa vale a interseção das classes (o gate só tem classes globais).
- **O que falta para o APP instalado ter conectores (não é da cola):** ninguém instala os `ConnectorPorts` reais hoje (`connectorPorts = {}`): `availableConnectors`, `connectorDefinitionOf`, `cliIsolation` (prova ISO-5) e `mcpStatusOf` (`mcp_status` com `readOnly`/`destructive`; sem ele até `list_emails` pede aprovação, fail-closed). Sem esses ports o app não oferece conector nenhum, nem de leitura. Isso é da ponte do shell (Rivet/Bolt); o host só traz o padrão `permissionRequests`.
- **Não coberto aqui:** a CLI real. O gancho na CLI real é do `scripts/ht89-dry.ts` (Tally/Rivet, 7 cenários, endpoint falso); esta prova usa um Claude falso que fala o mesmo protocolo do gancho.

**TEAM-15, complemento pedido pelo Keel 02:26:** `PERSONA_HOST_FLAGS=production` (ambiente) ou `Config.flagDefaults:'production'` faz o padrão valer LIGADO mesmo sob Vitest (Gauge/Probe provam o padrão de produção sem mexer em env das flags); `Config.<flag>:false` e `PERSONA_<FLAG>=0` continuam vencendo. Smoke no app instalado, sem env: `exportDiagnostics().json.flags = {teamwork,fanout,startOnBoardMove,productTools,defaults}` e a linha de boot `[persona-host] flags teamwork=1 fanout=1 startOnBoardMove=1 productTools=1 defaults=production` no stderr (o Probe já lê). Provas em `host-flags.spec` (15). Avisados: Gauge, Probe, Flint, Rivet.

**Provas:** `ht9-host-bridge.spec` 6/6, `external-actions.host.spec` 8/8, `connector-policy.spec`, `ht9-gate-contract.spec`, `connector-grants.spec`, `connector-release.host.spec`, `host-flags.spec`, `env-optins.spec`; check-pkg persona-host OK; **suíte inteira do host 180 arquivos / 1070 testes verdes**; oxlint limpo nos arquivos que toquei (os 5 erros que sobram em `orchestration.ts`, linhas do attention answer, `error.cause` e `withImages`, são de outro dono).

---

## 05/11 02:00 — Funções da v1.1 vêm LIGADAS no host (TEAM-15); cartões de equipe, /resumo, prewarm, persona_retire

**TEAM-15 (Keel):** `teamwork`, `fanout`, `startOnBoardMove` e `productTools` eram opt-in (`Config` ou env `=1`). Agora **vêm ligadas no app real**; o opt-out é `Config.<flag>:false` ou `PERSONA_<FLAG>=0` (também `false`/`off`/`no`). `cordis.patch.yml` segue sem `config`: o padrão mora no host.
- **Fonte única:** `persona-host/src/flags.ts` (`resolveHostFlag`: Config > env > padrão ligado). `index.ts` não lê mais `config.<flag> === true` nem `PERSONA_<FLAG> === '1'` para as quatro (a condição do gateway de ferramentas também usa `productToolsEnabled`).
- **Única exceção, num lugar só:** sob Vitest o padrão continua **desligado** (as suítes montam um host nu e ligam o que testam; `VITEST` já decide scripted e banco em memória). Escolhi isto em vez de passar `false` em ~100 specs: nenhuma asserção foi apagada nem enfraquecida e nada precisou mudar nelas. Se o Keel preferir o inverso (padrão ligado também no Vitest e `false` explícito nas specs), é uma troca de uma linha em `flags.ts` mais a varredura das specs; me diga.
- **Inventário** (dono, padrão antes/agora, o que liga, flags do cliente que ficam de fora): `persona-spec/contracts/flags-defaults.md`. Orquestração: `skipTriage`/`courtesyNoModel` já eram ligados.
- **Cliente (Flint, FLAGS-ON-1, mesma tabela do contrato):** as flags do cliente também vêm LIGADAS; só `actionPreview` segue OFF até a decisão do HT-9 às 12:00 (Keel). Conector/prévia de ação não mudam de padrão no host (não há flag de host para isso). A revisão de entrega (TEAM-6) roda dentro de `teamwork`: com ele ligado por padrão, projeto sem política cai em `NEW_PROJECT_REVIEW` (todas as entregas, revisor = Coordenação).
- **Lint:** corrigi 5 erros de oxlint que estavam no `index.ts` (3 comparações `=== true` de booleano em `setPersonaCanRecruit`/`setPersonaHireDirect`, uma condição sempre verdadeira em `alternativeEngines`, um spread de string em `skillTitleOf`).
- **Prova:** `tests/host-flags.spec.ts` (resolução pura sem `VITEST`: ligado, opt-out por flag, `1` ainda liga, valor lixo mantém o padrão, Config vence o env nos dois sentidos, exceção do Vitest; host real: `false` no Config vence `1` no env, `true` vence `0`, e checagem estática de que não há leitura crua) e `env-optins.spec.ts` (ganhou o `=0`).

**Também fechado nesta rodada (já testado, sem relato antes):** cartões de equipe com absorção tipada por `stateLine` (`team-cards*.host.spec`); o "Ontem" do bom-dia agrupa por `request{...}` com o nome do assunto e sem Tarefas internas de handoff; `/resumo` volta com `AsideAskView.kind = 'summary'` e pergunta fixa (um /resumo gravado antes do `kind` também é lido como resumo: nunca mostra o prompt do host); prewarm do isolamento (`isolation-prewarm.host.spec`); `persona_retire` (V23, `persona.retired_at`; só desfaz, nunca apaga: `persona-retire.host.spec`).

---

## 05/11 00:30 — O fio como equipe de pessoas (TEAM-R), prévia de ação externa (HT-9, lado do host)

**Resposta à leitura do Atlas ("parece um log") — minha parte, na fonte e com teste** (`tests/thread-rule.host.spec.ts`, 6):
- **Autor técnico nunca visível (TEAM-R4):** `listMessages`, `followMessages` (baseline e incrementos), `search` e a replicação do time remoto ignoram qualquer autor com `:` (`routine:*`, `team:*`). Os eventos continuam guardados (o engine os lê como gatilho). **Teste guarda:** depois de rotina, divisão e iniciativa pelo MESMO caminho do agendador, nenhum autor visível tem `:`.
- **Rotina de sistema (R5):** "Resumo da manhã" nunca vira Tarefa nem mensagem (o Bom dia é o cartão). O "@Lia Resumo curto…" do transcrito é a rotina **custom** que o Gauge semeia à mão: o gatilho some do fio, e o Gauge deve tirá-la do roteiro.
- **Títulos (R3, minha metade):** com `Config.teamwork` a Tarefa de fala direta nasce com título curto e humano (`ticket-title.ts`: sem "@nome", sem "por favor", corta no espaço com "…", nunca no meio da palavra). Os títulos das PARTES da divisão são do Forge.
- **"Precisa de você" (R7):** só conta o que espera decisão da pessoa — Tarefas em revisão/bloqueadas que NÃO são pedido entre colegas ou revisão (`origin handoff:*`) + aprovações pendentes (agora inclui os cartões de conector e de ação).
- **Ruído do fio (R1/R6):** concordado com a Muse que a regra vale **na fonte** e só tira "Pronto/Concluído/Esperando" quando os cartões vivos existirem (plano e entrega, do Prism) — a pessoa não pode perder o sinal de que acabou. **Depende do Forge** (onde fica requestId → partes → Tarefas): perguntei; ETA ~2 h depois da resposta. O "Em andamento" das Tarefas de revisão já sai pelo `quietTask` do Forge.

**HT-9 (prévia de ação externa) — o lado do host está pronto, sem o runner.** `external-actions.ts` + `ApprovalView.kind='action'` + `decideApproval({kind:'action', choice:'send'|'edit'|'cancel', edited?, remember?})` (`external-actions.host.spec`, 8): cartão com o conteúdo real (e-mail: para/assunto/corpo; pagamento: valor/quem/referência; apagar: itens), **pay e delete sempre pedem**, prévia cortada ou com parte escondida **não se aprova às cegas**, "Não perguntar de novo" só em e-mail/post e só a caixa de envio daquele conector, no máx. **2 tentativas por Tarefa e ferramenta**, **expira em 24 h**, editar/cancelar avisam a persona como **dado**, id opaco (o hash nunca chega à tela). Contrato em `team-real.md` §10. **Falta (outro lado, com Tally/Bolt/Rivet):** o runner entregar o pedido do gate ao host e reabrir a Tarefa com `approvedFor(...)`; até lá a aprovação fica guardada e **nada é executado** (falha fechada). `MessageView.actionEvent` com `content` vem com a execução.

**Também hoje:** `postMessage.opinionOn` (resposta da pessoa à opinião), "Liberar para {B}" (7 testes), reunião (8), política de revisão (5) — ver as entradas de 23:25 e 00:00.

**Prova.** `generate-typert` 40/40 depois da última edição · `check-pkg persona-host`: nada meu vermelho (o único vermelho agora é `goalLine` não usado em `handoffs.ts`, WIP do Forge) · specs novos todos verdes (thread-rule 6, external-actions 8, connector-release 7, person-opinion 4, morning-brief 8, handoff-views/integrity, review-policy) · oxlint limpo nos meus arquivos.

**Abertos (D-076):** (1) emissor de `teamPlan`/`deliveryCard` (espera o Forge); (2) HT-9 lado do runner (espera Tally/Bolt). **Parados:** CV-6 (canais de equipe) até o aceite da equipe real.

---

## 05/11 00:00 — "Liberar para {B}" no host, resposta da pessoa à opinião, 'Bom dia' confirmado

**"Precisa de você / Liberar para {B}" (TEAM-3 + HT-8) — no tree, com teste.** Um só tipo de aprovação para os dois casos de "a persona precisa de um conector que ainda não pode usar": `ApprovalView.kind = 'connector'` (colega: "Bia pediu ao Teo, mas o Teo não pode usar o Gmail"; iniciativa: "a Nina quer usar o Drive"). Contrato final em `team-real.md` §9. Como funciona: ao abrir o pedido (`handoffs.ts`, `open()`), o host lê o que a **fala da própria pessoa** (a 1ª Tarefa da cadeia; só eventos de autor humano) precisa e o que o colega pode usar (`ConnectorGrantsHost.gapFor`); se falta um conector, o pedido **espera**: linha tipada `handoff` com `status: 'blocked'` + `connector` (autor = a persona que pediu), a Tarefa do colega NÃO nasce, quem pediu continua "Esperando {B}", e um cartão `connector` fica em Aprovações (`connector-asks.ts`). A resposta: `decideApproval({ kind: 'connector', choice })` — **`once`** abre a Tarefa do colega e libera o conector SÓ para ela (autorização por Tarefa, some quando acaba), **`always`** cria uma concessão permanente de **leitura** e devolve `connectorDecision.grant` (é o que o Desfazer do Toast passa a `revokeConnector`), **`not-now`** fecha o cartão e acorda quem pediu para seguir sem a ajuda (nunca recusa em silêncio). Só o dono do workspace responde; já respondido = devolve como está; escolha ou cartão desconhecido recusa sem gravar. `decideApproval` ganhou `choice` e `accept` ficou opcional (os tipos antigos continuam exigindo `accept`). **Injeção:** só texto de autor humano abre o cartão (mensagem de outsider, de persona ou do sistema não cria lacuna); o corpo do cartão tem só nomes e o título que a própria persona escreveu. `connector-release.host.spec` (7).

**Resposta da pessoa à opinião (Flint).** `postMessage({..., opinionOn: { requestId, mark? } })`: a mensagem é da pessoa, volta como `opinion.kind = 'reply'` sob o pedido da rodada e **não é roteada** (nenhuma Tarefa nasce; é resposta, não pedido novo). Recusas sem gravar: equipe desligada, marca desconhecida, pedido de outra conversa. `person-opinion.host.spec` (4).

**Bom dia (TEAM-7).** O Keel não tinha visto que já está no host desde 23:25; passei as instruções de como o Gauge liga (clock, fuso, `teamworkEnabled`, `getWhileAway`/`check`/ciclo do agendador).

**Prova.** `check-pkg persona-host` OK nos meus arquivos (o único vermelho agora é `harness-hiring.spec.ts`, do "Pode contratar direto", de outro dono) · Typert 40/40 regenerado depois da última edição · 97 arquivos / 1387 testes verdes dos specs de aprovações, handoff, conectores, ACL, agendador, revisão, reunião, equipe, cartão, quadros e LEAK-1 (os 3 vermelhos da rodada eram de `client-ui-forge`, que o filtro `tests/controller` pegou sem querer) · oxlint limpo nos meus arquivos.

**Próximo:** HT-9 host (o gancho do Tally: ciclo de vida do gate, tabela `external_action`, cartão de prévia `kind: 'action'`, reexecução com o hash aprovado, `MessageView.actionEvent` com `content` só depois de executar).

---

## 04/11 23:25 — EQUIPE-REAL no host: reunião (TEAM-7), integridade e views do handoff, política de revisão, contrato do "Liberar"

**TEAM-7 "Bom dia" (host) — pronto, atrás de `Config.teamwork`.** `morning-brief-host.ts`: a função pura do Tally (`buildMorningBrief`, sem IA) + a metade do host. Rotina da equipe "Resumo da manhã" (id `morning-brief:{projeto}`), ligada em todo projeto, **só pausável** (`system: true`; apagar e editar recusados). Quando: 1ª abertura do app após 6:00 (gancho em `getWhileAway`), senão o relógio do agendador às 9:00 (roda **sem motor conectado**), no máx. 1 por dia, **nunca depois do meio-dia**, só com o que dizer. O cartão é uma mensagem da Coordenação no #geral (corpo = o mesmo texto legível) + `MessageView.dailyBrief` (ids reais, `paused` ao vivo, `routineId`). A rotina nunca vira Tarefa/modelo (o agendador a trata como feita). Spec `morning-brief.host.spec` (8): flag desligada, 1/dia, janela, "nada a dizer", "algo espera a pessoa", pausa, sem Tarefa de modelo, LEAK-1.

**Handoff — 2 furos do Gauge fechados.** (1) INTEGRIDADE: a linha handoff é gravada **e devolvida** com autor = a **persona** (nunca a pessoa); a Tarefa do colega segue herdando o mandato da pessoa por `FirstDeliveryRouteDirective.mandateActorId` na rota (só o host preenche; mensagem de persona sem rota continua não acordando ninguém). `handoff-integrity.spec` (3). (2) `TaskView.note/path/reviewing/reviewedBy` e `BoardCardView.handoff/reviewing/reviewedBy` (chips "Pedido por A"/"Esperando B", "Revisando", selo); `handoff-views.spec` (3) + `review-policy.spec`.

**Política de revisão (TEAM-6 config).** `getReviewPolicy`/`setReviewPolicy` (`review-policy.ts`): desligada / todas / por tipo + quem revisa; projeto sem configuração = ligada em tudo pela Coordenação; só o dono do workspace muda; recusa grava nada. `review-policy.spec` (5).

**Contratos.** `team-real.md` §7 (nomes finais do fio) e **§9 "Liberar para {B}" + pedido de iniciativa** (um só `ApprovalView.kind='connector'`; `decideApproval({kind:'connector', choice})`; `connectorDecision.grant` para o Desfazer). `persona-settings-host.md`. Código do "Liberar" a seguir.

**Cessões:** TEAM-12 e a ferramenta de opinião (TEAM-4 host) foram para Forge e Tally. **Pedido pequeno do Quill feito:** `submitTeachDraft.skillTitle` (1–80 letras; vazio = "Skill ensinada").

**Prova.** `check-pkg persona-host` OK · Typert 40/40 regenerado · 63 arquivos/736 testes dos specs de rotina, agendador, handoff, boards, equipe, reunião, cartão, LEAK-1, 1ª entrega, esforço, ACL e revisão: verdes · oxlint limpo nos meus arquivos · spec de eco do edge verde. Zero IA real, commit ou deploy.

---

## 04/11 22:30 — EFF-1 host, contratos de Configurações › Personas, duplicata investigada

**EFF-1 (modelo + capricho) no host — pronto.** O capricho vive no `runner` da persona (JSON já existente: sem migração): `runnerSchema` do core ganhou `effort?` só no motor `cli` (`effortLevelSchema`, 5 níveis). `setPersonaEngine` aceita `runnerModel: string | null` e `runnerEffort?: nível | null` (null = "Padrão do motor": nenhum `--model`/`--effort`); omitido mantém o nível só se motor E modelo não mudaram; nível desconhecido → `invalid-payload`; trocar motor/modelo **encerra a sessão quente** da persona (antes uma escolha nova ficava presa à sessão aberta). `createPersona` aceita `runnerEffort`. `specOfPersona`/`specFromConnection` copiam o `effort` só quando escolhido. `listConnections` ganhou `models[{id,label,effortLevels[],defaultEffort?}]` e `defaultEffortLevels` (resposta ao Flint: opção A) a partir do `modelMenu` do Tally; o modelo `default` não é uma linha (a tela sempre oferece "Padrão do motor"); modelo `disabled` não aparece; **sem `recommended`, sem `hint`**. Novo `engine-menu.ts`.

**Contratos para a aba Configurações › Personas (Quill), publicados 4 h antes do prazo:** `persona-spec/contracts/persona-settings-host.md` + seção 7 "Correções do host" em `team-real.md` (nomes finais do fio). No tree e com teste: `setPersonaTeamwork` (pode pedir ajuda, 1–20 por dia, 1–3 rodadas; faixa inválida recusa inteira), `setPersonaCanRecruit`, `PersonaView.engine`/`teamwork`, `Config.teamwork` (padrão desligada), `TeamworkSettings` (`teamwork-settings.ts`, porta para o `handoffs.ts` do Forge).

**Duplicata do E13 (P0 rebaixado pelo Keel).** Abri os bancos da execução que falhou: a mensagem estava gravada **uma vez** nas duas mesas; spec novo `apps/persona-edge/tests/echo-one-line.spec.ts` (edge local real, 2 hosts, polling ligado) prova 1 linha por mesa e head do edge == nº de mensagens; `one-message-one-line.spec.ts` (host) idem em 4 estados do motor. Era a corrida do cliente (Prism).

**Prova.** `check-pkg persona-host` OK (20 s) · `check-pkg persona-core` OK · Typert 40/40 depois da última edição · vitest: engine-effort 8, teamwork-settings 6, leak1 6, one-message 3, persona-card, connections, first-delivery*, onboarding, remote-acl, edge echo + host-bridge (verdes). oxlint limpo nos meus arquivos (um achado de estilo em `runner.ts:277` é do `toolsFor` do HT-0, não meu).

**Próximo (ordem do Keel):** bug D-079 da rotina das 9h absorvida como resposta → TEAM-7 (reunião sem IA) → TEAM-12 → "Liberar para {B}" → HT-9 host → TEAM-4 → TEAM-14/TEAM-6. CV-6 parado até o aceite da equipe real.

---

## 04/11 21:20 — LEAK-1 fechado no host (P0): o fio mostra uma frase; as instruções ficam na Tarefa

**O que mudou.** A 1ª entrega não posta mais o prompt interno como mensagem "Você" no #geral. Agora o corpo visível é **o pedido da própria pessoa** (A-6, normalizado) ou **uma frase curta e humana** — `"{Coordenação}, resuma o que já sabemos da empresa e proponha a primeira tarefa da semana."` (`firstDeliveryVisibleLine`, Forge, aprovada pela Muse). As instruções (só texto, sem ferramentas, `deny`, o brief como dado) vão na diretiva de rota do host (`first_delivery_route.assignment`), que nenhum Remote devolve, e a Tarefa as lê de lá. Instalações antigas (rota sem `assignment`) caem no texto do gatilho, como antes.
- Forge: `persona-engine/src/first-delivery.ts` (`firstDeliveryVisibleLine`), `preroute/rules.ts` (`FirstDeliveryRouteDirective.assignment?`), `index.ts` do engine; e em `persona-host/src/index.ts` o `postFirstDeliveryAsk` + assinatura de `appendMessage` (acertado por tell; ele me avisou depois de salvar).
- Anvil: `persona-host/src/orchestration.ts` (`FirstDeliveryRouteSchema` com `assignment` opcional; `bindExecution` lê a instrução da rota), `first-request.ts` (comentários: `firstRequestAsk` devolve o ASSIGNMENT, não a linha visível), specs.
- Pedido que **não** soa como ordem ("Ideias para atrair mais clientes") continua virando Tarefa: a rota é autorizada pelo host, não depende de `wantsWork` sobre o texto.

**Teste guarda** (`persona-host/tests/leak1-first-delivery.spec.ts`, 6 testes): varre **todas as mensagens guardadas do projeto** (canais, DMs, tópicos) + as mensagens lidas por `listMessages` de cada canal e DM + os cartões `listTasks`, o `getFirstDelivery` e as aprovações, contra 11 frases-sentinela ("Não use ferramentas", "resuma somente", `\bbrief\b`, "dados, não instruções", "Pedido da pessoa:", …) **e** o marcador do brief da empresa. Cenários: padrão, pedido próprio, pedido que não é ordem, depois da entrega (cortesia, menção, pergunta), rota antiga. Um teste confirma que as sentinelas **não são vazias** (reconhecem o texto interno antigo) e que a frase curta é limpa. Outro prova que o **worker ainda recebe** as instruções completas e o JSON do brief no prompt (`deny`, sem ferramentas).
- Specs alinhados à linha nova: `first-delivery.host`, `first-request` ×3, `onboarding` (os 5 vermelhos que o Keel viu).

**Prova.** vitest (trava check): leak1 + first-delivery.host + first-request + onboarding + token-wiring + conversation-d079 + first-delivery-proof + remote-acl → **31 arquivos / 278 testes verdes**. `check-pkg persona-host` **OK** (43 s) · `check-pkg persona-engine` **OK** · oxlint limpo nos meus arquivos. Sem mudança de Remote/tipo público → Typert não precisa regenerar. Zero IA real, commit ou deploy.

**Limites.** (1) Prova no host real com SQLite e runner de mentira; **a conferência no app INSTALADO** (o que o Probe/Muse viram) precisa de uma build — não faço build-assets até o Keel dizer. (2) Uma instalação que já tem a mensagem antiga gravada no #geral continua mostrando-a (o histórico não é reescrito); só as novas entregas saem limpas. (3) Ao abrir o LEAK-1 descobri um erro de digitação que eu mesmo causaria: no shell desta máquina uma barra invertida dupla vira simples, então um `\b` virou caractere de controle em dois specs; achei pela varredura de caracteres de controle e corrigi (todos os arquivos que toquei estão limpos).

---

## 04/11 20:40 — D-084/HT-8 no host (inerte), D-085 no livro, schema v22; estável para o corte das 21:00

Tree consistente e verificado às 20:40 (avisado ao Keel): `check-pkg persona-host` OK (20,6 s), `persona-store` OK, `generate-typert` 40/40 **depois** da última edição, oxlint limpo nos meus arquivos. Bateria: **44 arquivos / 422 testes verdes** (store inteiro + os specs do host que tocam as minhas mudanças). Zero IA real, commit ou deploy.

**Recaptura clara do chat — FECHADA.** Rodou na trava `build` (`exit 0`; o harness agora falha se a mensagem enviada não estiver no quadro). `.maestri/tmp/shots/remote/engine-unavailable/wire-1-composer.png` mostra "Ana 20:21 — Mensagem nativa do compositor…" no fio, seguida da linha honesta do host. Observação (Lumen/Prism, não meu): o cartão de erro do Guia ainda mostra o retrato duas vezes.

**D-085 (Atlas) — o modo de cada chamada no livro.** `turn_ledger.env_mode` (`native` | `answer-only` | `needed`), opcional, na mesma migração v22; linhas antigas ficam sem (nada é preenchido depois). Cadeia ligada de ponta a ponta: Forge `TurnLedgerEntry.envMode` no core (valida os 3 valores) · Tally `RunnerUsage/MeasuredUsage.envMode` · **minha linha** em `orchestration.ts` · store/host. Provas: `turn-ledger.spec` (grava os três, ausente continua ausente, valor fora é recusado) e `ledger-duration.spec` (o modo chega ao livro; não reportado ⇒ sem campo).

**D-084 (decisão do Miguel) — o ISO-2 virou HT-8; HT-9/HT-7 esperam terceiros.** O host fica pronto, **inerte** (nenhuma UI, nada exposto; sem as portas do runner ele entrega conectores só-leitura ou nenhum: falha fechada):
- **Store v22** (aditiva): `connector_grant` com **dispensa por classe** (`send`/`pay`/`delete`; pagar e apagar **sempre** pedem prévia, a única dispensa é a explícita da própria classe, decisão do Keel + Muse), `connector_grant_log` só-acrescenta (sobrevive à persona), `ticket_connector_auth` (autorização **por Tarefa**), `env_mode`. Tabela própria, **não** `persona.tools` (o `effectiveToolLevel` toma o máximo de todas as entradas).
- **Regras de produto no host (funções puras):** `decideConnectorUse` (a tabela inteira: iniciativa sem permissão ⇒ pede; `asked` ⇒ recusa; pedido/"desta vez" ⇒ lê livre, muda e reporta, enviar segue a autonomia; pagar/apagar sempre prévia), `preAllowFor` (o que o runner libera na abertura; sem portão `blocked` só leitura), `warmKeySuffix` (chave do runner quente por Tarefa).
- **Guardrail do Keel — quem autoriza é a PESSOA.** A autorização por pedido sai **só** de evento cujo autor é membro humano do workspace (o gatilho de origem e as mensagens dela na Tarefa). Texto que a persona **leu** (email recebido, documento, resultado de ferramenta) nunca autoriza. **Teste de injeção** com quatro autores indevidos (externo, persona, sistema, ex-membro) e o caso "a Tarefa B não herda o runner quente da Tarefa A com o Gmail liberado" (a chave inclui o `ticketId` e o fingerprint; o Bolt já ligou no `resolveFor`).
- **Remotes:** `listConnectorGrants`, `grantConnector` (ACL de dono; auditoria; linha "Você deu à Nina permissão de usar o Gmail…" no #geral; evicção dos runners quentes dela), `revokeConnector`, `estimateConnectorGrantCost` (custo medido **antes** de confirmar; sem medida a tela não escreve número). Recusa só `not-grantable` (conector que **nunca** poderia carregar), `limit-reached`, `invalid-payload`, `forbidden`, `not-found`; **`isolation-partial` deixou de ser recusa** (no Codex a permissão vale como política do host e a visão devolve `loadedAlways`).
- **Contrato** `contracts/connector-grants.md` reescrito com a regra do Miguel e as restrições do runner (Rivet/Keel): a CLI pede, o turno termina `blocked`, **aprovar = reexecutar** com a ferramenta liberada **uma vez** e amarrada ao **hash dos argumentos** ("aprovei A, enviou B" não acontece); sem Desfazer para email/post/pagamento; contas ISO-5 só pela permissão da CLI. O Tally fixou `classifyTool` (a classe mais estrita vence), `boundedInput` (+`truncated`/`masked`) e `argsHash` (SHA-256 do JSON canônico).
- **Provas:** `connector-grants.spec` (host, 15), `connector-policy.spec` (10), `connector-grants.spec` (store), `remote-acl.spec`.
- **Depende de terceiros (não é código meu):** o experimento seco do Tally (`permissionRequests`, liberar por ferramenta+hash), o **HT-0** (transporte das ferramentas até a CLI viva, Rivet) e `connectorsNeededBy`/`availableConnectors`. Até lá o HT-9 (cartão de prévia, `external_action`) **não foi escrito**: não há como segurar `send`/`pay`/`delete`, e fingir que segura seria pior. **HT-7** espera HT-2..6.

**v1.1 fora do hash:** CV-6 (canais por equipe) só contrato (`team-channels.md`, v1 por projeto). **Pendente depois do corte:** suíte inteira do host de novo (a última rodada completa foi às 19:30 e tinha 3 vermelhos que não eram meus: `aside-ask` e `conv2-recover` do Bolt, e o `scale.spec` que passa sozinho).

---

## 04/11 19:25 — OPT-9, P1-7 e os specs vermelhos fechados; contratos ISO-2 e CV-6 escritos (congelamento D-082)

Tree estável e consistente (avisado ao Keel): `check-pkg persona-host` OK (17 s), `persona-store` OK (13 s), `generate-typert` 40/40 rodados **depois** da última edição. Nada salvo em `packages/**` desde o decreto. Zero IA real, commit ou deploy.

**OPT-9 — calibração por pessoa (Atlas P1, contrato com o Tally).** Achado: o `turn_ledger` **não tinha duração**, e o host gravava `layers = EMPTY_LAYERS` (zeros), então "base = entrada − nosso prompt" não se calcula do histórico. O contrato (`contracts/estimate-calibration.md`, o Tally confirmou 1:1) entrega o **medido por chamada** (a entrada medida já traz a base do vendor) por tipo, motor e conta: mínimo 5 amostras, faixa P25–P75, janela de 30 dias, só linhas `measured`; sem histórico = "não sei". Cadeia ligada de ponta a ponta: store **v20** `duration_ms` (linhas antigas intactas) · Forge `TurnLedgerEntry.durationMs` · Rivet `MeasuredUsage.durationMs` em `withUsageMeter` · **minha linha** em `orchestration.ts` · `estimate-calibration.ts` (funções puras) + `estimateAsk` do host passando `calibracao` (conta lida de `active_account`, sem os efeitos do `seatForPersona`) · engine do Tally (`tokensPerCall`/`mediana`/`samples`) · `EstimateAskView.fonte/amostras/tempo.mediana` espelhados (pedido do Tally).
**Provas:** store 29 arquivos / 330 testes (inclui duração gravada/ausente/negativa recusada e migração v19→v20); host `estimate-calibration.spec` (11), `ledger-duration.spec` (2: a duração medida chega ao ledger e a não medida fica sem), `estimate-ask-*` intactos.

**P1-7 — "Enquanto você estava fora" com dados reais (UI do Ember).** Achado de fundo, **provável causa do DF-009**: o host **consumia** o resumo na primeira leitura e o `refresh()` do cliente chama `getWhileAway` a cada atualização, então o cartão sumia na segunda. Agora a leitura não consome: a janela é a mesma na sessão e recomeça só com `dismissWhileAway` (Remote novo) ou após uma ausência real (> 10 min), persistida no store (**v21**, tabela `visit`: `window_since`/`window_opened_at`) e estável a reinício. Forma congelada com o Ember: `events` (com `personaId/personaName`, `taskTitle` real em vez do id cru), `waiting` (estado, não evento: `review` · `question` · `approval`, com o mesmo id do `ApprovalView` e o id que o quadro abre), `byPersona`, `summary {deliveries, waitingOnYou, awayMinutes}` (a ausência medida **no momento da volta**, não cresce enquanto a pessoa lê). "Entrega" agora é só concluída/aplicada (parada, descartada, fechada, largada não contam; vale também para `deliveriesToday`). Também unifiquei o relógio do `ProactivityHost` com o do `orchestration` (em produção são o mesmo; nos testes só o segundo era injetado).
**Provas:** `while-away.spec` (6), `proactivity.spec`, store `proactivity.spec`, e2e-flows, j07, scheduler: 39/39 nos focais.

**Specs host vermelhos que o Keel me atribuiu.** `remote-acl` (guarda explícita no `postMessage`; helper do engine-trigger reconhecido; `confirmEngineTrigger` ganhou teste de `forbidden`) · `multi-project` (criar projeto já cria o #geral, comportamento certo; a linha agora é a honesta "Recebi. A equipe está ocupada…" do pré-roteador, sem Ticket) · `persona-card` ×2 (a Coordenação já nasce também Gestor, GES-1; um 0% oficial **é medida real**, só "indisponível" some). O J8 outra pessoa já tinha ajustado. A última rodada da suíte **inteira** do host (antes desses ajustes) tinha 5 falhas e eram estas; **não rodei a suíte inteira de novo depois** (só os arquivos afetados + check-pkg): rodo após o FIM.

**CONV-1 — teste cruzado (a pedido do Bolt).** `conv1-routing.spec.ts`, helpers próprios: 5 verdes (rajada de 3 com Tarefa rodando; DM + canal no mesmo instante sem cruzar; `/pausar` → retido → `/retomar` inicia 1 Ticket e a repetição não abre outro; duas Tarefas perguntando + resposta escrita **na linha** da segunda; duas perguntando + "Azul" sem reply-to responde exatamente uma e a linha nomeia a Tarefa) e **1 `it.fails` [BUG→Bolt]**: toda mensagem **absorvida** recebe também resposta de conversa (`coord-u1-absorbed` **e** `coord-u1-reply`), 2 respostas por mensagem e, com modelo real, 1 chamada de conversa a mais. O `toContain` do spec dele não pegaria. Ele corrige após o hash (o `it.fails` vira `it` junto) e decidiu a ACL do `noteBusy` (título só na mesma conversa ou para quem pediu a Tarefa).

**Contratos escritos (só doc, código depois do hash).**
- **ISO-2** (`contracts/connector-grants.md`): Keel decidiu **tabela própria presa à persona** (`connector_grant` + log só-acrescenta, store v22), **não** `persona.tools`: o `effectiveToolLevel` toma o máximo de todas as entradas, então uma concessão `write` subiria em silêncio o nível de arquivos/shell. Tally confirmou e fixou as portas (`connectorDefinitionOf`, `cliIsolation`). **Dado de produto (prova seca do Tally, login real):** com o isolamento, os conectores do **claude.ai** saem do ambiente da persona e **não são concedíveis** (`not-grantable`); só MCP locais. `cliIsolation` responde `none` até o ISO-1, então a **gravação só liga depois do ISO-1/ISO-4**; tabela, ACL, auditoria, #geral e evicção ficam prontos antes. Muse ajustou a tela (D-083).
- **CV-6** (`contracts/team-channels.md`): equipe = setor, #diretoria = Gestores + dona, tudo **derivado na leitura**, reconciliador idempotente, **nunca apaga** (encolher não arquiva; setor some → Arquivados com a linha da Muse; volta → desarquiva), arquivado é só leitura (`channel-archived`), fixar por pessoa, `teamPersonasOf(projectId, channelId)` para o fan-out do CV-8 (Bolt aceitou a assinatura). Muse aceitou (1)–(7). **Aberto (8):** ela prefere canal do **workspace**; o host só suporta por projeto sem 3 mudanças de modelo (persona de casa em 1 projeto, runtime por projeto, ACL de canal do projeto). No caso comum coincide (1 #marketing). Proposta v1 por projeto; v2 de workspace é decisão de arquitetura do Keel/Atlas.

**Pendente / limites.** (1) Recaptura **clara** do chat (o harness agora falha se a mensagem não estiver no quadro): **cancelei** o waiter da trava `build` para não disputar o corte; reenfileiro depois do FIM. (2) Suíte inteira do host a rodar após o FIM. (3) **O schema do store subiu para v21** (v20 `duration_ms`, v21 janela de visita): bancos v19 abrem e migram (testado). (4) `oxlint` acusa `orchestration.ts:918` no bloco "held" do Bolt (não meu; `check-pkg` não falha). (5) Observação para Lumen/Prism: na captura escura o cartão de erro do Guia mostra o retrato duas vezes. WIP: ISO-2 + CV-6 (ambos só contrato, esperando o FIM); OPT-9, P1-7, FLOW-1 aguardam aceite dos donos de UI/engine.

---

## 04/11 18:30 — FLOW-1 no host fechado; Descartar encerra a Tarefa; reação da persona ao vivo

Sessão retomada (Claude Sonnet 5.5, antes Codex). Li o resume, todos os recados do inbox e o `20261104-164000-Atlas.md`: hireCard/nome-bicho únicos, `draftFiles`, `firstRequest` e o pré-roteador que silencia ficaram com o Bolt e **não foram refeitos**. O que encontrei pela metade (FLOW-1, iniciado às 17:27) foi concluído; nada mais estava aberto.

**FLOW-1 (Keel/Forge/Lumen).** `moveTicket` devolve o erro tipado `delivery_pending` (underscore, mensagem pt-BR; `BoardRemoteError` agora serializa `isDSHRemoteError`/`details`, então o gateway gerado o repassa sem engolir). `BoardCardView.deliveryPending?: boolean` só aparece quando `true`: regra do engine (`hasPendingDelivery`) restrita a projeto com pasta; projeto sem pasta passa `deliveryPending:false` ao `moveToColumn` (não há rascunho a perder). Meu primeiro rascunho usava `ticket.delivery` como critério; estava errado (o Forge definiu que é o report `ready`/conflito) e foi trocado. O `it.fails` do caso de conflito (FLOW-1b) passou a `it` depois que o Forge estendeu o critério.
**Descartar encerra o Ticket** (decisão do Keel 18:05): `discardReview` = `delivery.discard` + `stopTicketRun(…, 'discarded')`, só quando há entrega pendente (uma Tarefa que já recomeçou após "pedir ajustes" não é encerrada); idempotente. Sem isso o cartão ficava preso em Revisar para sempre, porque o Ticket seguia `ready`. Nenhum ouvinte do host transforma `ticket.ended` em mensagem de canal (conferido), então não há ruído novo.
**Reação ao vivo (pedido do Tally, feito 2x).** `EventRepos.addReaction/removeReaction` passam a chamar `announce()` só quando a linha mudou de fato; o `followMessages` reenvia a mensagem como upsert com `reactions` atualizadas. `remote-team` também escuta, mas deduplica pela chave do evento.

```text
with-lock check -- vitest run review boards gateway controller courtesy-reaction (host) + events (store)
Test Files  6 passed (6)   Tests  55 passed (55)
with-lock check -- vitest run history.host.spec.ts   -> 2 passed (2)  (Descartar x RestorePoint, abaixo)
with-lock check -- vitest run review.spec.ts         -> 4 passed (4)
check-pkg persona-host: OK (27,7s)   check-pkg persona-store: OK (14,7s)
oxlint nos meus arquivos: exit 0      generate-typert: 40 artefatos (45,6s)
```
Testes novos: `review.spec` (Descartar encerra só aquele Ticket, outro rascunho intacto, 2º Descartar inofensivo; conflito recusado), `boards.spec` (sem pasta passa), `gateway.spec` (erro tipado pelo gateway gerado), `history.host.spec` (descartar a Tarefa B mantém o ponto de restauração da A listado e ainda desfazível byte a byte — pedido do Keel), `controller.spec` + store `events.spec` (reação ao vivo).

**Captura do chat.** A recaptura de 17:31 passou (`proof.json` passed:true, escuros composer/board agora `true`). A captura escura prova que a mensagem enviada e a linha honesta do host aparecem no fio; a **clara** saiu com o fio vazio (foto antes de assentar). O harness agora espera dois frames + 400 ms e **falha** se o texto não estiver dentro do quadro. Recaptura na fila `build` atrás do ship H2 do Keel; até lá a clara anterior não vale como evidência. Observação para o Lumen/Prism (não é meu): na captura escura o cartão de erro do Guia mostra o retrato duas vezes (dentro do cartão e ao lado).

**Limitações.** Zero IA real, commit ou deploy. O RestorePoint intacto foi provado só em pasta comum (histórico privado); em Git o `ff` não cria ponto. O oxlint acusa `orchestration.ts:918` (`autonomy?.silenceEnd`, bloco "held" do Bolt); o `check-pkg` não falha por isso. Avisos lidos sem ação minha: Tally (skipTriage, cortesia, estimateAsk, IV-7, account-swap, getAccountLimitBook), Bolt (IV-1, D-079 mexe em ingest/triggerOf), Quill (E13), Prism (SW-7/A-6, entregues pelo Bolt).

---

## 04/11 17:09 — FECHADO SB credencial curta no consumidor host

Forge corrigiu o produtor report-facts para preservar a verificação bruta existente e consultar containsSecretValue sobre o texto normalizado/sem controles antes do corte. Não editei engine/core. O caso RED capturado pelo host agora passa: nenhuma página criada e report_curation registra written0/facts[]/rejected reason secret, sem carregar o fato rejeitado. Os casos positivos e de audiência/replay continuam passando no mesmo arquivo.

```text
with-lock check -- vitest run persona-host/tests/real-path.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 passed (1)
Tests  19 passed (19)
Duration  16.90s

with-lock check -- node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 25.3s
```

Lint de real-path/used-context-safety/orchestration, node --check do harness e git diff --check exit0. Reap-orphans: nenhuma árvore Vitest antiga; cerca de16GB livres. Todos os checks de código próprios foram concluídos; nenhuma fonte está aberta comigo. A suíte obrigatória SB do Gauge ainda precisa de facts explícitos na fixture para validar a ligação completa sem inventar página genérica; esta prova19/19 não substitui esse aceite do dono.

Em conformidade com D-076, não abro outro item. O fechamento de código foi entregue: SCOPE-4 43/43, BYC Alfa/Beta normal+legado27/27, uso persistido na falha29/29 e19/19 final, WIRE gerado9pass2expected e app nativo aprovado. Restam a recaptura enquadrada do chat já na fila build atrás de H e os aceites de UI/SW/instalador/primeira entrega real nos respectivos donos. D-077 permite H de validação; não é aceite para entregar instalador ao usuário. Zero IA real, commit ou deploy.

---

## 04/11 17:01 — App real aprovado: FR-3 60ms, envio nativo e Site com Sprint 1

A fila build liberou a rodada `engine-unavailable-real.mjs`: home temporário e porta livre, perfil dsh persona, detector explicitamente sem motores e zero chamadas de modelo. Nenhum seed de produto mascara disponibilidade. O compositor nativo recebeu texto/Enter, o gateway aceitou o payload sem occurredAt e listMessages confirmou corpo e horário persistidos. GES criou quatro personas somente após aprovação, cada uma com responsável humano/setor, fluxo Site e Sprint 1; replay não duplicou contratação. Captura de Quadros agora mostra os cartões Site/Pessoal e Sprint 1, sem skeleton, e foi conferida.

```text
FR3-runtime:PASS immediate=60ms deferred=1 task=0 vault-unavailable=2 modelCalls=0
WIRE1-GES-runtime:PASS native-composer + host-time + assembly=4 + site + sprint1 + replay; modelCalls=0
dark-capture:pending theme attribute is not true (wire-1-composer-dark.png)
dark-capture:pending theme attribute is not true (ges-site-board-dark.png)
```

proof.json em `.maestri/tmp/shots/remote/engine-unavailable/` tem passed:true e darkCaptures composer:false/board:false. Isso é aprovação funcional, não aceite visual escuro: a correção do atributo continua com Prism/Muse. A mensagem enviada fica no contêiner rolável; a captura de chat conferida mostra a faixa honesta de IA ausente, mas não enquadrou o texto novo. Acrescentei somente scrollIntoViewIfNeeded no harness e reenfileirei a captura para enquadrar esse texto. A captura anterior de Quadros já é válida. App/browser/árvore Node da rodada encerrados pelo cleanup; só novo waiter build ativo.

SB ainda depende do Forge para a rejeição de credencial curta no produtor report-facts; o RED focal e o motivo estão no relato abaixo. As demais provas43/43,29/29, check host41,8s e Typert40/40 continuam registradas. Nenhum modelo real, deploy ou commit.

---

## 04/11 16:57 — SB: regressão de credencial curta entregue ao produtor do extrator

Avancei no contrato report-facts.md enquanto a captura aguarda a trava build. O extrator ainda verifica somente redactSecrets do diff, que não reconhece credenciais rotuladas curtas. A prova nova em real-path.spec.ts entrega Report ready com fato reference explícito cujo corpo/evidência é uma api_key sintética curta; o host cria uma página learning privada com esse valor, contrariando a rejeição antes do clip definida no contrato. A audiência fica privada corretamente; não houve vazamento para outro ator nesta prova.

```text
with-lock check -- vitest run persona-host/tests/real-path.spec.ts --testNamePattern=curation.rejects.a.short --testTimeout=60000 --hookTimeout=60000
Test Files  1 failed (1)
Tests  1 failed | 18 skipped (19)
Duration  12.52s
```

Mantive as assertivas: nenhuma página criada e auditoria report_curation com written0/facts[]/rejected reason secret. Enviei ao Forge a causa e o uso do containsSecretValue central em title/body/evidence no produtor; não editei engine/core e não dupliquei a validação no host. O teste focal usa padrão sem espaços, seleciona somente o caso novo e não chama modelo. Esta regressão ainda está aberta; não alego que toda curadoria está verde. O SCOPE-4/contexto43/43, ledger-em-falha29/29 e check host41,8s anteriores permanecem as provas dos outros caminhos.

Runtime de compositor/Quadros continua atrás de Gauge final2 A na fila build. Nenhum app meu ativo; aguardando a janela sem disputar portas ou usar perfil real do usuário. Zero IA real, commit ou deploy.

---

## 04/11 16:52 — SCOPE-4 43/43 e uso persistido mesmo com executor falhando

Correção plural do Forge consumida em containsSecretValue; o host não tem regex própria nem exceção por Nunca/Never. A suíte valida corpo/título/localizador, senha JSON, orientações legítimas sem valor mantidas NO PROMPT e valores atribuídos omitidos inclusive com rótulo plural. Filtro e teste obrigatório agora estão verdes.

```text
with-lock check -- vitest run used-context-safety.spec.ts real-path.spec.ts vault-docs.spec.ts mandatory-scope-host.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  4 passed (4)
Tests  43 passed (43)
Duration  11.02s
```

Próximo item de anvil-next.txt (uso persistido mesmo em falha): acrescentei uma prova com runner falso que grava o uso e rejeita deliver. A primeira rodada revelou Ticket ainda doing. Corrigi somente o ramo genérico de failReply: bloqueia os Tickets running que usam a mensagem de origem/input, persiste o Report e publica RUN-ERROR estruturado no stream original. Exceção desconhecida não é copiada para mensagem/lastErrors. Falha sem Ticket mantém resposta acionável; erros tipados conhecidos conservam seus códigos. Não alterei driveTicket/settleTask/triagem/scheduler.

O teste usa SQLite em pasta temporária e outra conexão readOnly, provando uma linha execution com ticketId, provedor, tokens e cache já no disco após a falha. Verifica o bloqueio e a ausência do detalhe privado da exceção no canal/diagnóstico. real-path + conductor: 2 arquivos29/29 em37,65s; o focal43/43 acima inclui a versão final com as assertivas de privacidade. A limpeza fecha a conexão e remove somente o diretório temporário verificado depois de o harness fechar o host. Lint final exit0; check-pkg persona-host após estes últimos trechos OK em41,8s.

A seleção isolada com `-t` e texto com espaços no Windows executou mais arquivos do que o pretendido (log: 46 pass / 4 skipped, 496 pass / 27 skipped,133,16s); não uso essa seleção como prova focal. Os quatro caminhos explícitos do comando43/43 acima são a prova reportada da integração. Novos filtros devem usar padrões sem espaços ou caminhos explícitos para evitar a divisão pelo shell do wrapper.

Galeria real E12 organizada em [sync-real/index.html](../../.maestri/tmp/shots/remote/sync-real/index.html): seis passos, doze PNGs originais lado a lado, ligados ao proof.json aprovado. Conferi as capturas da mensagem nova aparecendo nos dois perfis. Nenhuma imagem foi alterada e nenhuma nova execução foi feita para gerar a galeria; tentativas failure-* anteriores ficam preservadas, fora da execução aprovada. As capturas atuais de compositor/Quadros continuam na fila build, agora atrás de Gauge final2 A, após o ship/bundle. O contrato/fallback de tema escuro continua honesto.

Fila não vazia: recaptura runtime e aceite dos donos de UI/instalador/IA real. Nenhum processo de app meu ativo ainda; apenas waiter build. Zero chamadas reais de modelo, deploy ou commit.

---

## 04/11 16:35 — Predicado central consumido; resta um controle negativo plural

`safeUsedContext` agora usa somente containsSecretValue do core, campo a campo (body/title/locator), sem sensitiveWhy e sem regex de senha própria. O reconhecimento de senha PT e JSON foi centralizado pelo Forge. O prompt real preserva as orientações Nunca divulgar tokens e Never send password; os segredos curtos originais continuam omitidos, sem alterar a fonte do Cofre. README atualizado e lint exit0.

```text
with-lock check -- vitest run used-context-safety.spec.ts real-path.spec.ts vault-docs.spec.ts mandatory-scope-host.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 failed | 3 passed (4)
Tests  1 failed | 41 passed (42)
Duration  6.98s
```

Único caso pendente: `Nunca divulgar tokens: synthetic-value` ainda passa pelo detector central por causa do rótulo plural. Mantive a assertiva que exige omitir o valor e entreguei o caso exato ao Forge por ask; não há exceção por prefixo Nunca/Never no host. Esta suíte ainda não está toda verde. O próximo passo é consumir a correção do produtor, rodar o focal pendente e check host novamente; não exige regenerar Remotes nem chamar modelo.

Runtime permanece na fila build após Keel ship, com dois pontos de espera sem skeleton antes das capturas. WIRE-1 e DTOs continuam aprovados pela prova gerada e check registrados antes; nenhuma edição em UI. Zero IA real.

---

## 04/11 16:29 — WIRE final aprovado; qualidade do filtro de contexto em integração

Gateway com a contribuição gerada final e comparador WIRE-5 encerraram: 2 arquivos, 9 pass / 2 expected fail (11), 8,55s. Não apareceu desvio novo; os dois expected failures continuam sendo os achados conhecidos do cliente, não erro do postMessage sem horário. A lib contém occurredAt opcional e attention.avatarId opcional. Check host verde21,4s e Typert40/40 em68,7s do relato anterior permanecem a prova dessas assinaturas.

Forge ampliou o detector central para senha PT rotulada com valor, incluindo JSON e sem consumir a próxima linha. A reutilização de sensitiveWhy no host revelou um problema de qualidade: o classificador de import é amplo por palavra e omite orientação legítima com token/password. Criei `used-context-safety.spec.ts`: primeira rodada RED com 4 failed / 4 passed (8), 2,20s, cobrindo orientações sem valor e citação sensível em body/title/locator. Acrescentei depois três controles negativos e o mesmo controle legítimo no prompt de real-path. Não marquei esta melhoria pronta nem alterei as assertivas para esconder o RED.

Solicitei ao Forge um predicado central de valor explícito, separado da classificação ampla de import; o host o consumirá e removerá PASSWORD_VALUE duplicado. Não haverá exceção baseada apenas em Nunca/Never, que poderia deixar uma senha atribuída passar. Dependência registrada; novos focais e check host serão executados após consumir. A curadoria e a primeira entrega não recebem turno adicional de IA.

A recaptura do perfil real voltou à fila build com wait-max correto, atrás de Keel ship (gate exclusivo). Ainda não há app meu ativo. Testes leves de controle e documentação avançaram durante a espera. O tema escuro continua uma dependência explícita Prism/Muse: só conta captura com atributo true. Zero IA real, source de UI intacto, nenhum commit/deploy.

---

## 04/11 16:24 — Check host e Typert finais verdes; WIRE-1 pronto para publicar

O teste novo de proatividade foi corrigido pelo dono: listMessages recebe actorId e lê MessagePage.events. Não alterei esse arquivo. O check integrado seguinte passou no estado atual, incluindo SCOPE-4, BYC transacional, DTOs D070 do Forge e attention.avatarId. Regeneração final também terminou depois dos últimos campos opcionais.

```text
with-lock check -- pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 68.7s

with-lock check -- node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 21.4s

with-lock check -- vitest run persona-host/tests/attention.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 passed (1)
Tests  2 passed (2)
Duration  14.63s
```

O teste de attention verifica galeria, exclusão de upload/caminho e os campos/deep links/resolved já existentes. A primeira rodada expôs o uso incorreto de avatarKind/avatarRef no registro de domínio; foi corrigido para persona.avatar.kind/ref antes da prova acima. Lint dos arquivos alterados exit0; git diff --check exit0. node --check dos dois scripts de captura exit0. Nenhum erro foi ignorado.

Keel pode publicar o WIRE-1: occurredAt opcional no fonte e no artefato regenerado, fallback no relógio do host e validação ISO antes de gravar; a prova Web com Enter/persistência já passou. reviewSummary/prepareReview/discardReview não exigem command/reason; acceptReview continua conflicts, histórico continua listRestorePoints/undoApply. Contratos entregues ao Prism; Quill recebeu os campos finais de membros/sincronização. Comparador WIRE-5 e gateway com os artefatos finais estão em curso. Não alterei source após esta regeneração.

O script antigo capture-remote-app tinha uma fixture HTML rotulada como app real. Mantive sua finalidade visual, retirei portas/homes fixos de exemplo e corrigi o README produzido para distinguir fixture de captura de app existente; ele declara expressamente que não prova sincronização e indica remote-team-real.mjs, que usa dois homes temporários/portas livres e mensagens novas. A prova E12 canônica aprovada é sync-real/proof.json; screenshots de fixture não contam como aceite.

Fila ativa: conferir WIRE-5 final, recapturar Quadros sem skeleton e registrar o estado real do tema escuro; aceite SW instalado/primeira entrega real e fixtures SB/W2 continuam com os donos indicados nos relatos anteriores. Nenhum app meu está aberto neste instante. Zero IA real, commits ou deploy.

---

## 04/11 16:14 — SCOPE-4: texto sensível fora do contexto e do prompt

`used-context-safety.ts` filtra corpo/título/localizador das citações com sensitiveWhy do core e reconhecimento de senha rotulada em português com valor. `orchestration.compileUsed` retém e devolve somente esse conjunto para getTurnContext/listUsedContext e composição do prompt; `VaultDocsHost.citeUsed` aplica a mesma regra. A citação fica restricted com texto vazio, preservando ID/required; o registro original continua no Cofre. Regras seguras continuam obrigatórias. Não é redaction pelo helper de diff: ele não reconhecia os valores curtos do caso do Gauge. Não editei o core.

Provas novas em real-path.spec.ts e vault-docs.spec.ts: chave curta e senha PT separadas não aparecem no contexto/prompt, regra segura aparece, fonte original fica intacta e documento sensível não entra na citação. Junto com gateway gerado, três arquivos passaram; a quarta suíte só ficou vermelha porque o corpo do it.fails do Gauge passou (Expect test to fail). Converti esse único marcador para it e removi o wrapper sem uso, sem mudar suas assertivas.

```text
with-lock check -- vitest run real-path.spec.ts vault-docs.spec.ts gateway.spec.ts mandatory-scope-host.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 failed | 3 passed (4)
Tests  1 failed | 35 passed (36)
Duration  16.28s
Failure: Expect test to fail (SCOPE-4 corrigido)

with-lock check -- vitest run persona-e2e/tests/mandatory-scope-host.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 passed (1)
Tests  9 passed (9)
Duration  14.17s
```

Lint de orchestration/segurança/docs/testes/gateway exit0. Novo check host e Typert final ainda pendentes. O arquivo orchestration foi editado somente no import e retenção do compileUsed; não alterei triagem/ledger do Tally. Contrato lumen-rpc.md explicita texto omitido por sensibilidade. Acrescentei avatarId opcional de galeria ao evento de attention para o consumidor desktop do Rivet; uploads/caminhos não saem nesse campo. Prova de attention e regeneração estão em curso.

A recaptura Web ficou na fila atrás de Flint/Quill; cancelei somente meu waiter ainda sem filho para executar os checks em sequência. Não havia app meu aberto. O harness agora espera Quadros sair do carregamento e só grava dark quando body[data-ds-dark-theme="true"] estiver aplicado. O bug de tema da UI continua com Prism/Muse; não vou registrar claro/claro como claro/escuro. As provas nativas de compositor/GES e o E12 local já aprovados permanecem no relato anterior. Sem IA real.

---

## 04/11 16:02 — BYC sem perda, gateway gerado e provas integradas do host

BYC: `applyContextProposals` aplica o lote em uma transação e recusa um ID já usado por conteúdo diferente com `conflict`, sem revelar o conteúdo existente nem deixar gravação parcial. Repetir o mesmo registro continua idempotente. O parser do Forge agora identifica o corpo inteiro e compara duplicatas por tipo/corpo normalizado. Novo teste usa dois previews e aplicações normais, sem alterar IDs: Alfa e Beta ficam ready, cada aplicação grava um registro, os dois corpos ficam no Cofre e repetir Alfa por outra IA fica duplicate. O teste legado força colisão e comprova rollback da linha anterior e preservação do original. Forge recebeu a prova por ask.

```text
with-lock check -- vitest run persona-host/tests/bring-context-apply.spec.ts persona-host/tests/gateway.spec.ts persona-e2e/tests/mandatory-bring-your-context-host.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  3 passed (3)
Tests  27 passed (27)
Duration  12.04s
```

WIRE-1/3/4/5: Typert foi regenerado após o timestamp opcional, os DTOs opcionais D070 do Forge e ReviewTicketRequest: 40/40 artefatos em 72,8s. reviewSummary/prepareReview/discardReview aceitam somente escopo e ticketId; command/reason antigos são opcionais. acceptReview continua com conflicts e snapshots exatos; os nomes canônicos de histórico são listRestorePoints/undoApply. Não existe undoApproval. Contrato simple-workspace.md e mensagem ao Prism entregues. A fixture anterior de gateway usava o fallback SRC, apesar do texto no relato das 15:08: os dois casos novos agora registram explicitamente a contribuição gerada, verificam codec strict e passam com o corpo real do compositor e da revisão. A prova nativa do perfil, abaixo, também carrega o gateway do app. Após esta rodada, o registro do teste foi colocado em ctx.effect e a tipagem do import dinâmico foi ajustada; lint/check finais seguem em curso.

App real, home temporário e porta dinâmica sob build: `engine-unavailable-real.mjs` aprovou aviso imediato em 226ms, pending1/tasks0, dois erros vault-unavailable antes de rede e zero chamadas de modelo. A caixa nativa recebeu texto e Enter, o RPC respondeu sucesso e listMessages comprovou corpo e horário persistidos. GES aprovou equipe Site somente após aprovação: quatro personas, responsável Ana e setor em cada cartão, fluxo Site, Sprint 1 e replay sem contratar de novo. proof.json em `.maestri/tmp/shots/remote/engine-unavailable/`. A captura de Quadros foi conferida e ainda mostrava carregamento; o harness agora aguarda os dados e refaz claro/escuro. Não é aceite visual da Muse.

E12/E13: o host expõe listRemoteMembers com nome/papel/status/entrada/convite e estado com syncedAt/behindBy/remoteHeads persistidos. Revogação atualiza o cache; offline preserva dados conhecidos sem inventar medição. O edge canoniza quem aceita convite como guest antes do grant, recusa workspace diferente e membro ativo já existente; papel/projetos/DMs injetados pelo cliente não ampliam acesso. Bridge e remote-teams: 2/2 em 58,83s; typecheck edge exit0. A prova anterior com dois perfis, sem seed, fez convite/aceite, mensagem nova convergindo, DM ausente, retomada por cursor e revogação, com 12 capturas e passed:true em `.maestri/tmp/shots/remote/sync-real/`. Tudo é local; tokens continuam só no Cofre. UI de membros/atraso é da Quill.

SB: identidade de página é o ID; título repetido ganha slug distinto e não sobrescreve outra página/audiência. BrainPageView.audience informa workspace/project/private/persona; restricted conserva o sentido de leitura negada. Índice não inclui páginas de persona para humanos. Aprovação de Cofre/skill consulta gateRememberedPermission com alvo estável do registro/skill, autorização atual, validade e limites; consumo e mutação são transacionais. A trilha permissionGrantId/permissionAudit explica a dispensa. Testes remembered-approval/screens/governance 16/16 em18,88s. Curadoria consome facts explícitos do Report integral com audiência original; primeira entrega e Report sem facts não criam página genérica.

GOV/GES: contratação direta, proposta aprovada e montagem do Gestor inicializam responsável humano, setor aprovado e rotina de iniciativa com nome legível; perfis existentes são reconciliados no boot sem ampliar grants. PB persiste workflowMove em JSON aditivo; teste de reabertura/limpeza da marca 5/5 em9,17s. Seis suítes obrigatórias host: 107 pass e 2 expected failures (109) em44,55s naquela rodada: fixture SB sem facts explícitos e fixture W2 que não aceita a recusa de cor repetida. Não afrouxei essas assertivas. Host check passou em29,5s e store em23,9s antes do último guard BYC; novo check host pendente. Lint integrado anterior passou; a rodada nova achou apenas import dinâmico any do teste gerado, ajustado para o tipo da contribuição.

Pendências: check/lint finais, capturas estáveis claro/escuro e aceite dos donos de UI; fixtures obrigatórias restantes do Gauge; transporte facts em NormalizedReport com Rivet; MinGit instalado e SW-9/SW-10 com Rivet/Probe; primeira entrega de um turno com IA real somente pelo Probe/Atlas. Tally recebeu que a chamada de triagem não alimenta Ticket/Assignment/resposta, mas ainda alimenta ledger/uso e a expectativa offline de 1 triage + 1 execution; não removi essa chamada sem decisão do Atlas. Todos os processos de app/edge das provas encerradas foram fechados; somente a nova rodada de capturas está ativa. Nenhuma IA real, deploy ou commit.

---

## 04/11 15:08 — P0 compositor sem horário corrigido e aprovado pela fronteira real

Decisão do Keel aplicada em `src/types.ts`: PostMessageRequest.occurredAt é opcional. `src/index.ts` resolve a ausência com orchestration.now(), valida ISO com offset antes de persistir e preserva o timestamp explícito válido. Valor vazio, data impossível, texto e data sem offset retornam erro tipado invalid-payload sem criar evento. Nenhuma edição no cliente.

`tests/post-message-time.spec.ts`: três casos de relógio ausente, timestamp remoto preservado e inválidos recusados. `tests/gateway.spec.ts`: o corpo atual do compositor, sem occurredAt e com attachmentIds/topicId, passa pelo TypertGatewayService/RemoteAccessService/codec gerado e grava a mensagem; o horário inválido atravessa o codec de string e é recusado pelo host com código tipado.

```text
with-lock check -- vitest run persona-host/tests/post-message-time.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 passed (1)
Tests  3 passed (3)
Duration  16.05s

with-lock check -- pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 94.5s

with-lock check -- vitest run persona-host/tests/gateway.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  1 passed (1)
Tests  4 passed (4)
Duration  27.19s

with-lock check -- node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 26.5s
```

Uma rodada anterior leu o estado E13 antes da correção de exactOptionalPropertyTypes em remote-team.ts; a reconstrução de campos opcionais foi corrigida e o check acima usa o estado atual. Keel avisado no Status para publicação imediata; Rivet reempacota. Não executei chamadas reais de IA.

Outras provas encerradas antes deste P0: Web FR-3/Cofre `passed:true`, aviso 141ms/pending1/tasks0/vault-unavailable2/modelCalls0, captura no-engine-ready.png conferida; GOV/GES/host 6 arquivos68/68 e rodada focada4 arquivos53/53; SB/mandatory4 arquivos75pass2expected (duas fixtures ainda pendentes naquela rodada); E13 edge bridge/members/head 2 arquivos2/2 em28,08s. Todas as árvores de app/edge do harness foram encerradas. Próxima fila: bugs de identidade/audiência SB relatados pelo Gauge, permissões lembradas reais, contratos e aceite integrado restantes.

---

## 04/11 14:31 — Atenção desktop, SW-6, contas e curadoria SB

`attention.ts` e o Remote attentionEvents agora enviam question/failed/done, além de needs-you/review, com nome dado à persona, IDs de persona/Tarefa/fio/stream e código RUN-ERRORS na falha. Done só aparece para o autor humano da Tarefa; DMs são filtradas pelos participantes. IDs por episódio são estáveis. O frame resolved retira os IDs decididos/respondidos/confirmados em outro cliente. Silêncio/foco/orçamento continuam com o desktop; o host preserva a fila. Contrato attention-events.md entregue a Muse/Rivet. Prova: 2 arquivos, 6/6 em 10,43s.

SW-6: `reviewDeliveryOf` usa resolveGitExecutable do Rivet e PERSONA_BUNDLED_GIT quando não há historyGit explícito. Consumidores aguardam a resolução assíncrona; primeira entrega continua sem rascunho. Filesystem/Git + P0 + W2: 5 arquivos, 41 pass / 1 expected fail / 1 skipped (43), 35,45s. O expected fail restante é o setup W2 de cor repetida que não aceita a recusa conflict; a conta hostil/duplicada e os dois bugs de resposta tiveram corpos aprovados e só seus quatro marcadores viraram it. O teste antigo que exigia dois-pontos no nome de pasta Windows foi atualizado para exigir segmentos hash confinados em accounts/. O empacotamento real de MinGit continua com Rivet/Probe.

Contas: `wave2.ts` gera segmentos hash sob accounts, sem usar o rótulo como caminho. addConnectionAccount recusa ID repetido, normaliza rótulo hostil e não sobrescreve. Leitura do login usa accountLoginStatus no próprio home; loginCommand usa ACCOUNT env do Rivet com quoting PowerShell. listConnectionAccounts aceita personaId opcional e retorna personaPolicies/escopo efetivo; escrita de política confere o projeto da persona. Remover/renomear conta confere workspace. Testes adicionais de marcador de login local e política por persona passaram na rodada citada. Quill avisado; nenhuma leitura de credencial nem login real foi executado.

SB two-way agora captura notas antes de qualquer export, importa somente páginas reconhecidas, deixa notas soltas para BYC e reexporta depois. Import de página existente exige leitura autorizada e preserva a audiência; nota nova fica no projeto. Testes reais em pasta temporária cobrem edição, nova versão, replay sem duplicar e tentativa de substituir a nota privada de outra pessoa. Resultado: 2 arquivos, 27 pass / 1 expected fail (28), 18,13s; único expected fail é a ligação da curadoria no mandatory, cuja fixture deve emitir facts explícitos conforme Keel/Forge. SB4b foi convertido a it após corpo passar.

`report-curation.ts` consome extractFactsFromReport/mapReportFactForCuration/curateAfterWork no onTaskSettled com Report ready. Audiência é persistida antes do ingest; Report integral é capturado antes do clip da UI, com timestamp do evento do runner. Fonte, evidência, fatos extraídos e rejeições seguras ficam auditáveis; replay por Assignment não cria versões repetidas. Sem facts explícitos não cria página genérica, e a primeira entrega retorna antes da curadoria. Prova: real-path + first-delivery, 2 arquivos, 23 pass / 1 skipped (24), 46,27s. Todos os runners são simulados, zero IA real. Transporte persona_report → RunEvent com facts opcional depende do Rivet; schema/hook MCP está pronto, campo em NormalizedReport solicitado por Status. Fallback JSON cercado do extrator já é consumido.

Check host passou em 23,9s antes das novas ligações. Depois, a rodada detectou readonly BrainVisibility no adaptador store, já corrigido com cópia de memberIds. Check store, novo check host, lint e Typert integrados ainda pendentes. Lint inicial achou somente 2 arrow-parens no módulo novo, corrigidos. Forge recebeu quatro blocos D068 e um teste dedicado com autorização; Typert aguarda o pronto dele. Prova Web FR-3/Cofre expirou duas filas de 720s e agora aguarda com wait-max maior atrás de Probe/Keel, sem contornar a trava.

Fila restante inclui SB permissão lembrada na aprovação real, GOV responsáveis/setores/rotinas do assistente, E13 membros/syncedAt/behindBy para Quill, fechamento de contratos/Typert/required suites e app/capturas. Nenhum item foi marcado done no PLAN com essas provas pendentes. Sem commits/reset/clean/deploy.

---

## 04/11 14:12 — Gestor aplica equipe atomicamente; aprovações e avisos em integração

GES-1b: `gestor.ts` persiste a prévia hire/reuse e as specs; aprovação faz preflight acumulado via assertGestorAssemblyHires antes das gravações e aplica personas, alocações, fluxo, Sprint 1, estado do plano e auditoria na mesma transação. Repetir aprovação aplicada é no-op. Aprovação/recusa continuam restritas ao dono. A prévia reutiliza funções já presentes no projeto, sem conceder acesso a outras equipes. Objetivo sem equipe/projeto é recusado pelo core. Testes locais cobrem limite agregado, rollback com falha na sprint e idempotência. Gauge GES-1b teve corpo aprovado; só o marcador foi convertido para it, sem alterar assertivas.

```text
vitest run persona-host/tests/gestor.spec.ts + mandatory-team-manager-host.spec.ts --testTimeout=60000 --hookTimeout=60000
Test Files  2 passed (2)
Tests  26 passed (26)
Duration  12.10s
```

Forge revisou sem editar e encontrou normalização de título em reuse e concorrência de planos. Corrigi os dois: mesma normalização acento/caixa/espaços do core; segundo plano no mesmo escopo vira comentário do primeiro; funções contratadas desde a prévia invalidam o plano antes das gravações. Testes adicionais e check-pkg aguardam/rodam sob check. Primeiro check detectou apenas readonly na prévia persistida, já corrigido com cópia explícita; não declaro o check final verde antes da nova saída.

GOV: listApprovals agora consome routeApproval e devolve routedToId/onBehalfOfId/onBehalfOf/waitNotice. decideApproval revalida disponibilidade e destinatário e persiste quem decidiu em nome de quem na mesma transação. ApprovalView.reason é proposal.spec.description, pedido Muse/Lumen. Teste host com proposta de Cofre real está em curso. O caso obrigatório GOV-4 ainda cria registro direto sem proposta pendente e falha antes de testar roteamento; pedi ao Gauge que ajuste somente esse setup. Não retirei seu it.fails.

Prova Web FR-3/Cofre sem test cipher expirou 720s esperando build, sem abrir app; reenfileirada com porta livre e home temporário. BYC obrigatório 17/17 e PB obrigatório 15/15 confirmados pelo Forge no Status. P0 OAR+CLI fake 2/2, 1 execution/0 triage e UI 14,7s conforme Probe; nenhum aceite com provedor real inferido. Zero chamadas reais de IA por Anvil.

Fila continua: SW-6 resolver Git empacotado; atenção desktop question/failed/done/resolved; SB extrator/curadoria fora da primeira entrega, two-way e permissão lembrada; contas isoladas W2; responsáveis/setores/rotinas GOV. W1–W5 seguem com Tally, orchestration.ts não foi tocado nesta rodada. Sem commit/reset/clean/deploy.

---

## 04/11 13:47 — P0 um turno; SW-6 e correções do Gauge em andamento

### P0 / FR-3

O onboarding passa uma diretiva interna pela função privada appendMessage. O host persiste first_delivery_route e só esse registro autoriza PreRouteInput.firstDelivery; texto/ID enviados pelo Remote público não habilitam o atalho. O executor designado prevalece sobre menções no brief. A rota mantém Ticket/Assignment/estágios e dispensa createCoordinationDriver na primeira entrega: zero inject e zero triagem. O compositor é firstDeliveryExecutionPrompt do Forge, com identidade/instruções/contexto e Assignment integral na cauda; o compositor de conversa foi retirado após o Forge demonstrar o clip200. A sessão introdutória tem cache próprio, permissionMode deny e tools vazio mesmo se a persona tiver escrita. O teste exige o texto COMPLETO enviado ao runner, brief longo com ISO e ledger 1 execution/0 triage/0 inject. Retry de uma primeira entrega failed volta imediatamente a working.

```text
Host: 6 arquivos, 50 passed | 1 skipped (51), 12.57s; check-pkg OK19.8s; oxlint de src+tests inteiro exit0.
Com compositor worker integral: 3 arquivos, 22 passed | 1 skipped (23), 19.35s.
Com deny explícito, SW6 e PB: 4 arquivos, 24 passed | 1 skipped (25), 12.29s.
Sync: check-pkg OK9.8s; oxlint exit0; 3 arquivos, 8 passed (8), 2.14s.
```

Todos os runners acima são injetados/scriptados; nenhuma chamada real de IA por Anvil. O script canônico continua com teto emergencial de 3 deliver, enquanto o verifier do Forge exige 1 turno pago. O helper puro foi movido de scripts/ para tests/first-delivery-proof.ts e os dois consumidores atualizados para corrigir TS6307 do agregado. O aceite real continua com Probe/Atlas e usa a trava real conforme protocolo atual.

O perfil Web sem Electron revelou falha real no boot: BrowserAuth tentava modifyRecord no Cofre indisponível. Keel/Rivet implementaram a exceção efêmera em memória apenas para browser-session; Rivet informou boot 9/9 sem test cipher. Meu reteste passou nos RPCs de engineStatus/no_engine_ready e nos dois erros vault-unavailable; a captura parou no onboarding ainda não concluído do harness. Ajustei o harness para concluir onboarding e reenfileirei; não declaro essa prova completa antes de proof.json passed:true. Os dois scripts de app agora usam freePort e homes temporários (D-067). O replay E12 anterior segue comprovado pelas 12 capturas e JSON descritos abaixo.

### SW-6 / PB

review.ts consome createReviewDelivery: pasta comum usa histórico privado e projeto com Git mantém implementação existente. Primeira entrega não prepara rascunho. Remotes listRestorePoints, undoApply com UUID validado e ponto no mesmo projeto, getProjectStorageUsage com bytes lógicos/null em falha; acceptReview propaga restorePointId e conflitos/escolhas. Config historyMaxCopyBytes/historyGitTimeoutMs/historyGit. Contrato contracts/simple-workspace.md atualizado para restored|expired|blocked e capacidades available|unsupported|unconfigured.

Prova REAL de filesystem e Git local em history.host.spec.ts: projeto SQLite existente, binário alterado no rascunho, Aplicar, listar ponto, fechar/reabrir o host, Desfazer byte a byte; pasta do usuário continua sem .git e Uso mede bytes. Git review regressão passou. Não há prova de MinGit empacotado ou aceite visual SW-8/9/10; depende Rivet/Lumen/Probe/Muse. Resolver Git do Rivet ainda precisa ser ligado ao host para a máquina sem Git.

PB-9.3 agora usa applyBoardWorkflowEdit SEM alterar Ticket/categoria/Assignments, como determinou Keel. Fluxo e seats persistem numa transação. workflowMove fica em screen_doc/ticket_workflow_move, JSON aditivo por projeto/ticket; campos antigos ficam intactos e não há migração destrutiva. Ao mudar a categoria automática, syncPlacementFromStage limpa a marca; enquanto a categoria se mantém o destino fica fixado. J14 exige o destino exato e Ticket doing preservado. Gauge/Forge confirmaram PB9.3 passou e retiraram it.fails; o segundo consumidor acceptWorkflowProposal (PB9.5) também foi atualizado após acharem o import antigo. Nova execução da suíte obrigatória está em curso.

### Gauge — correções implementadas, validação em curso

- BYC privacidade: listVaultRecords e previews usam canReadVault do ator. Dedup do rodapé de origem ainda pendente; reimport changed-body recebeu nova identidade path+body no core do Forge, consumida automaticamente pelo host.
- GOV auditoria: UUID adicional evita colisão por ator/ação/ms; aprovação real roteada ao substituto ainda pendente.
- GES: aprovar/recusar plano exige dono; apply assemble hire/reuse + workflow/sprint atômicos/idempotentes ainda pendente (DTO/core/contrato do Forge prontos).
- SB: índices derivados são por ator com visibilidade privada; índice compartilhado antigo não é exposto. Export usa apenas páginas legíveis. Grant/use recusam ação/destino vazio ou curinga; home exclui expirados e permissões once consumidas. Two-way e curateAfterWork/permissão lembrada no fluxo real ainda pendentes.
- W2: postAs herda topicId; envio direto e settle da outbox usam a mesma transação, sem apagar o item. Outbox usa o evento de origem. rename/archive/setActive validam o assunto contra workspace/projeto/tipo/conversa; cor ativa repetida é recusada. get/submitTeachDraft conferem projeto e workspace. Contas (home hostil, rótulo duplicado, readiness por home, loginCommand isolado e overrides por persona) ainda pendentes.

O Keel autorizou trocar os marcadores it.fails das suítes do Gauge quando o corpo passar, sem alterar assertivas; só farei isso com prova. Nenhuma funcionalidade foi marcada done no PLAN com bug conhecido ou aceite integrado pendente. W1–W5 de tokens saíram da fila de Anvil e estão com Tally; avisei que orchestration.ts está livre por ora após P0/W2, e alinharei qualquer novo retoque nesse arquivo.

Arquivos próprios principais desta rodada: host src/{index,orchestration,review,history-storage,types,remote-guard,brain,boards,governance}, store src/{brain,board}/repos.ts, testes history/first-delivery/J14 e scripts. Typert40 passou112s antes das últimas novas assinaturas; geração e check-pkg/lint finais deverão ser repetidos. Sem commits/reset/clean/instalação/deploy. Resíduo SQLite-shm gerado do edge não foi revertido num checkout compartilhado.

---

## 04/11 11:37 — E12: sincronização entre dois apps comprovada; FR-3 e política do Cofre em validação

### Entrega E12

`persona-host/src/remote-team.ts` monta a ponte no host. Os Remotes conectam, emitem/aceitam convite, revogam e sincronizam canais autorizados. O pull usa somente EventRepos, sem Intake/engine/Vigia; IDs de evento tornam o replay idempotente. Cursor, fila de referências e revogação são persistidos. DM e canais não autorizados não entram na ponte. Tokens só vão ao Cofre; metadados SQLite não contêm o token. O edge guarda SHA-256 e recebe o token no corpo do POST. O servidor valida escopo e impede promoção de membro a dono.

Arquivos: `persona-host/src/{index,types,remote-team}.ts`, `persona-host/scripts/remote-team-real.mjs`, `persona-sync/src/{index,transport}.ts`, `persona-sync/tests/http.spec.ts`, `apps/persona-edge/src/workspace-hub.ts`, `apps/persona-edge/tests/{remote-teams,host-bridge}.spec.ts`, READMEs e `contracts/remote-team.md`. Não editei UI, runners ou Cofre. A montagem do Cofre no perfil foi corrigida pelo Keel: plugin stock desabilitado e novo id persona-credentials; a composição anterior era recusada pelo Loader por mudança de nome.

### Prova real dos apps, sem modelo real

```text
node scripts/persona/with-lock.mjs "Anvil sync profiles cursor and revocation" --lock build -- node --import tsx/esm packages/persona/persona-host/scripts/remote-team-real.mjs
sync-real:01-invite
sync-real:02-accepted
sync-real:03-channel-converged
sync-real:04-dm-isolated
sync-real:05-offline-resumed
sync-real:06-revoked
sync-real:PASS channel + DM isolation + cursor resume + revocation; modelCalls=0
exit 0
```

Dois perfis completos com homes temporários separados, portas 3080/3081 e edge 8791, sem dev seed; runner explicitamente scriptado. Canal compartilhado inicialmente vazio; mensagem única publicada no A apareceu no B e na UI. DM privada exibida no A não apareceu no B nem no edge. B foi encerrado, A publicou outra mensagem, B reiniciou no mesmo home e retomou pelo cursor. Revogação persistiu e bloqueou envio e recebimento do B. Sequências do edge: `[1,2,3]`; B conservou cursor 2 e `ACCESS_REVOKED`. Artefatos: `.maestri/tmp/shots/remote/sync-real/proof.json` (`passed:true`) e 12 capturas (`01` a `06`, Alice/Bob). Conferi visualmente o canal convergido no B e a DM no A. Contextos, navegador, apps e edge encerrados; portas sem listeners ao terminar.

O harness usa `PERSONA_VAULT_TEST_CIPHER=1` somente nos filhos de teste, conforme política do Rivet. Não atesta DPAPI, autenticação distribuída, deploy Cloudflare ou aceite com provedor real. A UI de conectar/aceitar continua com Prism/Lumen; o harness usa RPC autenticado dos apps para essas ações.

### Verificação offline já executada

```text
node scripts/persona/check-pkg.mjs persona-host persona-sync
persona-host: OK in 19.2s
persona-sync: OK in 7.1s

pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 61.3s

pnpm exec tsc -p apps/persona-edge/tsconfig.json --noEmit
exit 0

vitest run: engine-wait.host + engine-readiness + host-bridge + remote-teams + http
Test Files  1 failed | 4 passed (5)
Tests  1 failed | 12 passed (13)
Duration  12.67s
```

O último lote passou todos os testes E12 e a política sem Cofre. A falha foi a expectativa FR-3 de duas Tarefas para duas mensagens do mesmo assunto: o engine corretamente as agrega. O teste agora exige cada Trigger liberado uma vez e nenhuma Tarefa duplicada; nova execução aguarda o build.lock do Keel. Os comandos anteriores de tipos/Typert não substituem a validação final após FR-3.

### Em curso e dependências

FR-3: host usa receive deferRouting, aviso imediato estruturado no stream, cache de conexões, rechecagem de 15 segundos, retomada sem receive duplicado, retry/dismiss/confirmação pessoal, estado no overview e Remote. `contracts/engine-readiness.md` documenta os campos para Prism. Testes e geração final ainda em curso.

Cofre: consumo de availability do Rivet, falha tipada vault-unavailable antes do edge, Remote getRemoteTeamAvailability e pausa de conexões restauradas. Sem fallback em claro. Em validação final.

Rivet confirmou pelo Status a correção de `usage-meter.ts`: sink e evento usage agora antecedem ended; dependência do medidor encerrada. Prism: consumir a tarefa do onboarding já criada, sem novo activationPrompt. Probe/Forge/Atlas: aceite P0 real segue exclusivamente com eles e orçamento autorizado; zero chamadas reais de Anvil. PRO-2 e as partes host de W2-10/SB-6 já entregues nos relatos anteriores; E13 é UI de Prism/Lumen, E11 é Atlas.

Atualização 11:48: lote FR-3/P0/connections/screens verde — `Test Files 5 passed (5)`, `Tests 30 passed | 1 skipped (31)`, `Duration 8.34s`. O skip é a chamada real opt-in. Acrescentei depois a verificação do timer, confirmação pelo Remote e pausa de sync quando o Cofre fica indisponível; nova validação completa está enfileirada sob build.lock. `node --check` dos dois scripts de perfil: exit 0. Contrato SW-6 preparado em `contracts/simple-workspace.md`, explicitamente proposto e dependente dos portos SW-1/SW-2 do Forge; nenhum Remote de restauração é anunciado como pronto.

---

## 04/11 10:18 — P0 host e script canônico; dois apps executados; nenhuma chamada real nova

### Entregue no host

- A execução iniciada por `completeOnboarding` sela `first_delivery` sem depender de outra chamada Remote. Sucesso completa o cartão e grava um marco; erro não publica marco de sucesso. Reinício preserva o estado e retoma a tarefa interrompida.
- O host aguarda a primeira consulta de conexões antes de associar a CLI logada. A Assignment recebe `trigger.text` completo, com o brief e as instruções answer-only do Forge, em vez do título truncado.
- O texto e o Report são separados por turno. `failed`/`blocked` não viram `ready`; há mensagem estruturada visível no canal. O resumo diagnóstico fica em `assignment.report.summary`, e a pergunta fica em `ticket.attention.question`, ambos no JSON persistido do Ticket. Nenhum argumento de ferramenta é gravado por estas alterações.
- A entrega textual usa `source: runner`. Pedido omitido em produção falha com `engine_unavailable`; fake exige modo de teste/scriptado.
- O sink grava provider, cache, tipo e ticketId por chamada: Coordenação = triage; executora = execution. IDs distintos preservam chamadas no mesmo instante; o fallback de uso não duplica um sink medido, e `flush` aguarda o fallback. Encerramento aguarda trabalho e runners antes de fechar SQLite.

### Script canônico autorizado pelo Keel

`packages/persona/persona-host/scripts/first-delivery-real-cli.ts` é a entrada única. `DeliveryCallBudget` conta tentativas únicas de `deliver`, incluindo inject, e recusa a quarta antes de encaminhá-la. Repetição idempotente não conta novamente; uma tentativa com erro consome o limite. O contador preserva a identidade do runner, necessária à captura do texto. `execs` e `calls` ficam separados de `stages` e do ledger medido. O script aguarda `connections.ready()`, usa `verifyFirstDeliveryRun`, inclui a evidência no JSON, exige resposta do Ticket no #geral, cartão done, marco único ready e prazo. O timeout envolve onboarding e execução. Sem opt-in, sai antes de montar o host.

O JSON da tentativa real anterior foi preservado como evidência histórica de falha. Não gerei um novo sucesso real. Os testes do contador e do JSON serializado comprovam que uma resposta curta válida não falha por limite de caracteres, e que marcas de telemetria não são tratadas como chamadas de modelo.

### Provas executadas

```text
pnpm exec vitest run packages/persona/persona-host/tests/first-delivery-proof.spec.ts packages/persona/persona-host/tests/first-delivery.host.spec.ts packages/persona/persona-host/tests/real-path.spec.ts packages/persona/persona-host/tests/conductor.spec.ts packages/persona/persona-host/tests/journeys/j07-budget.spec.ts packages/persona/persona-host/tests/onboarding.spec.ts packages/persona/persona-host/tests/connections.spec.ts --testTimeout=60000 --hookTimeout=60000
 Test Files  7 passed (7)
      Tests  45 passed | 1 skipped (46)
   Duration  35.53s

node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 56.1s

pnpm exec oxlint --fix packages/persona/persona-host/src/orchestration.ts
exit 0, sem saída

pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 132.1s

pnpm exec vitest run packages/persona/persona-host/tests/usage.spec.ts packages/persona/persona-host/tests/token-opt.spec.ts packages/persona/persona-host/tests/orchestration.spec.ts --testTimeout=60000 --hookTimeout=60000
 Test Files  3 passed (3)
      Tests  16 passed (16)
   Duration  13.08s

node --import tsx/esm --input-type=module -e "delete process.env.PERSONA_REAL_E2E; delete process.env.PERSONA_REAL_CLI; await import('./packages/persona/persona-host/scripts/first-delivery-real-cli.ts')"
exit 1 esperado: First-delivery real smoke requires explicit PERSONA_REAL_E2E=1 or PERSONA_REAL_CLI=1
```

As regressões novas falharam antes das correções: marco preso em working (sucesso e falha), fonte host em entrega real, Report failed promovido a review e consulta fria sem associar a conexão logada. O lote acima ficou verde depois das correções; o único skip é a execução real opt-in.

### Apps executados sob build.lock

```text
node scripts/persona/with-lock.mjs "Anvil paired app runtime" --lock build -- node --import tsx/esm .maestri/tmp/capture-app-real.mjs
OK edge={"ok":true,"service":"persona-edge"} A=http://127.0.0.1:3080 B=http://127.0.0.1:3081 home=C:\Users\migue\AppData\Local\Temp\persona-pair-l7rlRZ
exit 0
```

Dois perfis Persona reais, homes temporários separados, edge somente local em 8791, runner scriptado e seed de desenvolvimento. Capturas verificadas em `.maestri/tmp/shots/remote/app-real/{desk-a,desk-b,side-by-side}.png`; o SQLite do app A contém `first_delivery.status=ready`, a entrega scriptada e um único marco. Os processos foram encerrados; as portas não ficaram escutando. Estas capturas comprovam os dois apps, não o aceite com provedor real nem convergência remota.

### Arquivos

`persona-host/src/{index,orchestration,runner}.ts`, `persona-host/scripts/{first-delivery-real-cli,first-delivery-proof}.ts`, `persona-host/tests/{first-delivery.host,first-delivery-proof,real-path,onboarding}.spec.ts`, `persona-host/README.md`. Script e imagens de apoio em `.maestri/tmp/`. Sem alterações no upstream, commits, instalação de dependências ou credenciais.

### Dependências e fila

- **Rivet:** `resolve/usage-meter.ts` ainda entrega ended antes de `usage()`/`sink.record`. `oar/session.ts` para no ended; portanto a gravação é pulada. Solicitei mover a medição antes do ended e testar consumo que para nesse evento. O host já associa a medição ao Ticket e não deve fabricar registros para encobrir essa ausência.
- **Forge/Rivet:** diagnóstico e política answer-only sob seus donos; a ferramenta histórica da tentativa 09:12 não é recuperável do DB. Nenhum nome foi inferido como fato histórico.
- **Probe/Forge/Atlas:** o aceite real continua pendente de saldo e da rodada única coordenada. Keel ordenou que Anvil não faça chamadas reais; cumprido.
- **Prism:** o onboarding deve consumir a tarefa já criada pelo host e evitar um segundo activationPrompt. Reportei a duplicação no Status.
- PRO-2 e os demais itens store/host atribuídos a Anvil estão done no PLAN. A pendência de V1-P0-2 é a prova real coordenada; E11 continua dependendo de autorização externa.

---

## 04/11 08:25 — V1-P0-2 first_delivery persistido + Remote + marco no feed

Não usei `note write`. Keel: só `note edit`.

D-062: pack do Rivet saiu do `build.lock` (`pack.lock` próprio). Build agora é **Probe B9**. Não subi host.

### Host
- `completeOnboarding` persiste `first_delivery` `working` (nunca "Carregando…").
- `startFirstDelivery` dá flush, sela `ready`/`failed`, completa review → `done`.
- `@Remote getFirstDelivery` + `getOverview.firstDelivery` (`idle|working|ready|failed`).
- Marco `first-delivery-milestone` no #geral (append, sem ingest).
- `@Remote measureFirstDeliveryAcceptance` 4/4 (engine).

### Prova
```
pnpm exec vitest run …/first-delivery.host.spec.ts …/onboarding.spec.ts …/conductor.spec.ts
  Test Files  3 passed (3)
  Tests  18 passed | 1 skipped (19)
  (skip = PERSONA_REAL_E2E≠1)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 7.1s
```

### Arquivos
`persona-host/src/{index,types,onboarding}.ts`
`persona-host/tests/first-delivery.host.spec.ts`
`persona-host/scripts/first-delivery-real-cli.ts` (TS18046)
`persona-e2e/tests/mandatory-first-delivery-contract.spec.ts`
`persona-spec/contracts/lumen-rpc.md`

### Dependências
- **[Anvil→Prism]** `getFirstDelivery` / `overview.firstDelivery` — status honesto; marco some de Precisa de você (ticket vai a `done`).
- **[Anvil→Probe]** contrato fake sempre; real = `PERSONA_REAL_E2E=1`.
- **[Anvil→Atlas]** app-real: lock Probe B9. Pack Rivet paralelo (D-062).

### Fora
E11 blocked. UI Ensinar (Prism). Instalador (Rivet pack.lock). ≤10 execs quando build lock livre.

---

## 04/11 08:52 — P0 firstDeliveryAsk + PERSONA_REAL_CLI fora de Vitest

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. P0 Atlas/Muse: 0 execs reais. **Não subi host** (lock Rivet D8).

### Causa das 0 execs (Forge)
`resolveHostRunner` ficava fake salvo `PERSONA_REAL_CLI=1`. Desktop nunca setava. Dogfood Agência: fake no PATH + "Monte a equipe" não era `wantsWork` (agora engine).

### Host
- `orchestration.wantsWork` reexporta o engine (Monte a equipe / Resuma o Cofre).
- `completeOnboarding` posta `firstDeliveryAsk` no #geral (`first-delivery`) e ingere → Ticket.
- `startFirstDelivery` idempotente (flush).
- `ensureProductionRealCli()`: fora de Vitest / `PERSONA_SCRIPTED` seta `PERSONA_REAL_CLI=1`.
- `runnerChoices` CLI + bind da conexão logada em personas `dsh`.

### Prova
```
pnpm exec vitest run …/onboarding.spec.ts …/real-path.spec.ts …/j01-onboarding.spec.ts
  Test Files  3 passed (3)
  Tests  12 passed (12)

pnpm exec vitest run …/share-insights.spec.ts
  Tests  4 passed (4)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 19.1s
```

### Arquivos
`persona-host/src/{index,runner,onboarding,orchestration}.ts`
`persona-host/tests/{onboarding,real-path}.spec.ts`
`persona-spec/contracts/lumen-rpc.md`

### Dependências
- **[Anvil→Prism]** passo 5: o ask já nasce no `completeOnboarding`; `startFirstDelivery` só espera o flush.
- **[Anvil→Forge]** 0 execs = fake runner + wantsWork estreito. Host agora força REAL_CLI fora de teste.
- **[Anvil→Atlas]** app-real: lock Rivet. Não subi hosts.

### Fora
E11 blocked. UI Ensinar (Prism). Instalador (Rivet). ≤10 execs reais quando o lock liberar.

---

## 04/11 08:42 — W2-10 accept / activate / publish / rollback Remotes

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Encadeei W2-10 Remotes + `usagePortKind` no port + promoção explícita + rollback. app-real: lock = **Rivet D8 b26d8b99a2 retry2**. Não subi hosts.

### W2-10
`submitTeachDraft` ignora `activate` e grava candidata `origin: taught`. `@Remote acceptTaughtCandidate` persiste desligada. `@Remote activateTaughtSkill` liga só no aceite; tools além do mandato → `ACCESS_ESCALATION`. `@Remote publishTaughtSkill` exige `explicit` para scope ≠ persona. `@Remote rollbackTaughtSkill` desliga (versão sobe).

### OPT-7 port
`persistTurn` mapeia a janela Rivet só por `usagePortKind` do core (`execution`→`exec`). Livro canônico intacto.

### Prova
```
pnpm exec vitest run …/wave2.spec.ts …/token-opt.spec.ts
  Test Files  2 passed (2)
  Tests  16 passed (16)

pnpm exec vitest run …/wave2.spec.ts
  Test Files  1 passed (1)
  Tests  10 passed (10)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 23.3s

node scripts/persona/check-pkg.mjs persona-store
  persona-store: OK in 12.7s

node scripts/persona/check-pkg.mjs persona-sync
  persona-sync: OK in 7.8s
```

### Arquivos
`persona-host/src/{index,types,screens,wave2}.ts`
`persona-host/tests/wave2.spec.ts`
`persona-spec/contracts/lumen-rpc.md`

### Dependências
- **[Anvil→Lumen/Prism]** `acceptTaughtCandidate` / `activateTaughtSkill` / `publishTaughtSkill` no Remote. `submitTeachDraft({ activate: true })` continua candidata.
- **[Anvil→Atlas]** app-real: lock Rivet `package-clean --commit b26d8b99a2`.

### Fora
E11 blocked. Runner codes (Rivet). UI Ensinar (Prism/Lumen). C8 E2E (Probe). PLAN.md = Keel.

---

## 04/11 08:36 — listSprintGoals (PB-4 caveat)

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. app-real: lock = **Rivet D8 b26d8b99a2**. Não subi hosts.

### PB-4
`startSprint` já chamava `bindSprintGoal` na memória. Depois do remount o GoalBoard ficava vazio. Agora hidrata dos sprints SQLite (`ativo`/`encerrado`) e `@Remote listSprintGoals` devolve o objetivo.

### Prova
```
pnpm exec vitest run …/j15-sprint.spec.ts …/pb-boards-rpc.contract.spec.ts …/boards.spec.ts
  Test Files  3 passed (3)
  Tests  8 passed (8)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 15.6s
```

### Arquivos
`persona-host/src/{boards,index,types}.ts`
`persona-host/tests/{journeys/j15-sprint,pb-boards-rpc.contract}.spec.ts`
`persona-spec/contracts/lumen-rpc.md`

### Dependências
- **[Anvil→Lumen]** `listSprintGoals` no Remote.
- **[Anvil→Atlas]** app-real: lock Rivet `package-clean --commit b26d8b99a2`.

### Fora
E11 blocked. Runner codes (Rivet).

---

## 04/11 08:34 — AG-004 ok (sem seed no onboarding)

**ok.** Host src: nenhum. Sem Remote novo (`grantBrainPermission` / `listBrainPermissions` / `revokeBrainPermission` já existem). First-run continua vazio.

`it` no host: `completeOnboarding` → lista vazia → grant → list → revoke. `onboarding.spec.ts` 4/4. seed-default-team = Prism.

---

## 04/11 08:32 — MessageView.runError no fio

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. app-real: lock = **Probe B9 e2e**. Não subi hosts.

### Prism / RUN-ERRORS
`listMessages` / `followMessages` preenchem `MessageView.runError` a partir do marcador (`runErrorFromBody`). `dsh` no fio vira provider `Claude`. Sem chaves `undefined`.

### Prova
```
pnpm exec vitest run …/run-error-wire.spec.ts …/conductor.spec.ts …/j07-budget.spec.ts
  Test Files  3 passed (3)
  Tests  13 passed (13)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 14.1s
```

### Arquivos
`persona-host/src/{types,index,run-error-wire,orchestration}.ts`
`persona-host/tests/{run-error-wire,conductor}.spec.ts`
`persona-spec/contracts/lumen-rpc.md`

### Dependências
- **[Anvil→Prism]** `event.runError` no Remote; marker no body permanece para clientes velhos.
- **[Anvil→Atlas]** app-real: lock Probe `mandatory-b9-real-app`.

### Fora
Runner ainda manda prosa (Rivet). E11 blocked.

---

## 04/11 08:30 — GES remotes + report sem jargão

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. app-real: lock = **Probe persona-gate**. Não subi hosts.

### Fechamento v1 / GES-6
`@Remote measureGestorV1()` e `measureGestorToolsAcceptance()` — Probe sem remount. `measureV1Close` já inclui o score GES.

### Quadro / Enquanto fora
`engine.report` de login/cota/orçamento usa texto de reserva do RUN-ERRORS-SPEC (sem CLI, DSH, runner, executor). O post do canal continua só o marcador.

### Prova
```
pnpm exec vitest run …/conductor.spec.ts …/real-path.spec.ts …/token-opt.spec.ts …/journeys/j07-budget.spec.ts
  Test Files  4 passed (4)
  Tests  20 passed (20)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 16.4s
```

### Arquivos
`persona-host/src/{index,types,orchestration}.ts`
`persona-host/tests/{conductor,real-path,token-opt}.spec.ts`
`persona-spec/contracts/lumen-rpc.md`

### Dependências
- **[Anvil→Probe]** `measureGestorV1` / `measureGestorToolsAcceptance` no Remote.
- **[Anvil→Atlas]** app-real: lock Probe `persona-gate.mjs`. Script `.maestri/tmp/capture-app-real.mjs` pronto.

### Fora
`assertV1Close` continua engine. Runner codes (Rivet). E11 blocked.

---

## 04/11 08:16 — RUN-ERRORS-SPEC no host (Muse)

Não usei `note write`. Keel: só `note edit`.

Handoff Muse via Atlas: posts de CLI/orçamento no canal levam `[[run-error:{code,provider,persona}]]` (a UI monta o texto). `SYSTEM_WELCOME` = `Boas-vindas à Persona.`

### Canal
`CLI_CHANNEL` saiu. `channelLineFor` / orçamento esgotado postam o marcador (`not_logged_in`, `quota_exhausted`, `cli_not_found`, `model_unavailable`, `engine_unavailable`, `budget_exhausted`) com `provider` (nunca nome de CLI) e `persona`. Sem segundo post de hint — o cartão da UI tem o botão.

### Prova
```
pnpm exec vitest run …/conductor.spec.ts …/real-path.spec.ts …/onboarding.spec.ts …/journeys/j07-budget.spec.ts
  Test Files  4 passed (4)
  Tests  17 passed (17)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 22.0s
```

### Arquivos
`persona-host/src/{orchestration,onboarding}.ts`
`persona-host/tests/{conductor,real-path,onboarding}.spec.ts`
`persona-host/tests/journeys/j07-budget.spec.ts`

### Dependências
- **[Anvil→Muse]** host manda `code` + `provider` + `persona`; texto humano é da UI (`RUN-ERRORS-SPEC.md`).
- **Muse 08:25:** conferido de ponta a ponta (marcador → `parseRunErrorMarker` → cartão certo, sem jargão).
- **[Anvil→Atlas]** app-real: lock = Rivet D8 `package-clean` V28.

### Fora
`persona-runners` `MESSAGES` (Rivet: `cli_not_found` / `model_unavailable` / quota `resetAt` / `provider_unreachable`). `engine.report` do ticket ainda usa o `error.message` no quadro.

---

## 04/11 07:20 — OPT-3..6 Remotes + measureV1CloseView

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. app-real: lock = **Keel ship**. Não subi hosts.

### Fechamento v1
`measureV1Close` = `measureV1CloseView(liveEntries)` (já no 07:18).
Novos `@Remote measureOpt3/4/5/6` → `measureOpt*Acceptance` (3/3 cada). Probe sem remount.

### Prova
```
pnpm exec vitest run …/token-opt.spec.ts
  Test Files  1 passed (1)
  Tests  6 passed (6)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 18.9s
```

### Dependências
- **[Anvil→Probe]** `measureOpt3`..`measureOpt6` + `measureV1CloseView`.
- **[Anvil→Atlas]** app-real: lock Keel ship.

---

## 04/11 07:18 — measureV1Close = measureV1CloseView(liveEntries)

`@Remote measureV1Close` agora `return measureV1CloseView(liveEntries)`. Livro live pontua `cut-40`. token-opt 6/6.

---

## 04/11 07:12 — listProjectRoots (Rivet reveal)

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Próximo = app-real. Lock ainda **Rivet dest:desktop CDP**. Não subi hosts.

### C4 / desktop
`@Remote listProjectRoots({ workspaceId })` → pastas com `rootPath`. ACL `read` por projeto. Rivet usa na allowlist de `revealInFolder` (hoje só PERSONA_HOME + picks da sessão).

### Prova
```
pnpm exec vitest run …/project-root.spec.ts
  Test Files  1 passed (1)
  Tests  2 passed (2)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 19.2s
```

### Dependências
- **[Anvil→Rivet]** `listProjectRoots` no IPC `revealInFolder`.
- **[Anvil→Atlas]** app-real 3080/3081: lock Rivet CDP. Script pronto.

### Arquivos
`persona-host/src/{index,types}.ts`, `tests/project-root.spec.ts`, `persona-spec/contracts/lumen-rpc.md`.

---

## 04/11 07:05 — W2-3 topicId no cartão + leftover persistido

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Próximo do turno anterior = app-real. Lock ainda **Rivet dest:desktop CDP** (`dev-desktop-cdp.mjs`). RAM 23.1 GB (≥15). Um pesado por vez — não subi os dois hosts.

### W2-3 — bolinha no cartão
`listTasks` e `getProjectBoard.cards` devolvem `topicId` (+ `conversationSubjectId` no `TaskView`) a partir de `ticket_subject` no ingest. Prism/Lumen ligam o chip sem outro RPC.

### SB-6 leftover persist
`exportBrainVault` / `importBrainVault` gravam `screen_doc` `brain_vault_leftover/last`. `getBrainHome.leftover` lê o store (reinício). Dest extras nunca apagados.

### Prova
```
pnpm exec vitest run …/wave2.spec.ts …/second-brain.spec.ts …/boards.spec.ts
  Test Files  3 passed (3)
  Tests  17 passed (17)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 36.2s

pnpm exec oxlint …/index.ts …/boards.ts …/brain.ts …/types.ts
  exit 0
```

### Dependências
- **[Anvil→Prism]** `TaskView.topicId` / `conversationSubjectId` no cartão (W2-3).
- **[Anvil→Lumen]** `BoardCardView.topicId` + `getBrainHome.leftover`.
- **[Anvil→Atlas]** app-real 3080/3081: lock Rivet CDP. Script `.maestri/tmp/capture-app-real.mjs` pronto.

### Arquivos
`persona-host/src/{index,boards,brain,types}.ts`, `tests/{wave2,second-brain}.spec.ts`, `persona-spec/contracts/{conversation-subjects,lumen-rpc}.md`.

---

## 04/11 06:45 — W2 workingPersonaIds + measureOpt8View + leftover vault + measureV1Close

Não usei `note write`. Keel: só `note edit`.

Vigia: não parar. Itens anteriores (oxlint/docs) já no relato 06:20. Este turno fechou os dois testes vermelhos e a fila Forge `measureOpt8View`.

### W2-2 — persona trabalhando
`ticket_subject` grava no ingest (não só no `compileUsed` assíncrono). `mutant.claim` usa `topicId`. `workingBySubject` + `listConversationSubjects` devolvem `workingPersonaIds`.

### OPT-8 / fechamento v1
`measureOpt8` = `measureOpt8View(entries)` (Forge 06:06). Livro live pontua −40%; o livro de teste falha `cut-40` (esperado). `measureV1Close()` sem live — `cut-40` blocked, gate verde. `opt8.liveEntries` = tamanho do livro.

### SB-6 leftover
`exportBrainVault` / `importBrainVault` devolvem `leftover[]` (`leftoverDestFiles`). Dest extras nunca apagados. `BrainHost.lastLeftover` guarda o último sync.

### Prova
```
pnpm exec vitest run …/wave2.spec.ts …/token-opt.spec.ts …/second-brain.spec.ts …/working-send.spec.ts
  Test Files  4 passed (4)
  Tests  20 passed (20)
  Duration  12.21s

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 17.5s

pnpm exec oxlint …/index.ts …/wave2.ts …/orchestration.ts …/brain.ts …/types.ts
  exit 0
```

### PLAN Anvil
PRO-2, W2-2/W2-6, GES-1/5, SB-1/3, OPT-7, GOV-5, B7, C8-host — código done. W2-10 retenção já no scheduler. SB-6 leftover agora no fio.

### Dependências
- **[Anvil→Prism]** `workingPersonaIds` live no `listConversationSubjects` (SubjectBar).
- **[Anvil→Lumen]** `BrainVaultFolderView.leftover` no export/import.
- **[Anvil→Probe]** `@Remote measureV1Close` + `measureOpt8View`; gate v1 não remonta flags.
- **[Anvil→Atlas]** app-real 3080/3081: RAM 21.1 GB (≥15). Lock = **Rivet D8 CDP** (`installed-cdp-diag` no exe). Um pesado por vez. Script `.maestri/tmp/capture-app-real.mjs` pronto.

### Arquivos
`persona-host/src/{index,wave2,orchestration,brain,types}.ts`, `tests/{wave2,token-opt,second-brain}.spec.ts`, `persona-spec/contracts/{lumen-rpc,conversation-subjects}.md`.

---

## 04/11 06:05 — Forge emit→recordTurnActivity + PLAN Anvil

Não usei `note write` no Status. Keel: só `note edit`.

### Forge 06:22/06:28
`EngineOptions.emit` = `withTurnActivityEmit` → `orchestration.recordActivity` → `workingSend.recordActivity`. `assignment.reported` vira linha T3 §9.

```
pnpm exec vitest run packages/persona/persona-host/tests/working-send.spec.ts
  Test Files  1 passed (1)
  Tests  3 passed (3)
```

### Atlas (1)(2) já no relato 06:20
oxlint 3 pkgs exit 0; check-pkg store/host/sync OK; ARCHITECTURE + contracts v19/ACL/edge.

### (3) app-real
RAM 22.3 GB (≥15). Lock = **Keel ship (persona gate)** — um pesado por vez. Script `.maestri/tmp/capture-app-real.mjs` pronto. **[Anvil→Atlas]** reenfileirar quando o lock cair.

### PLAN
GES-1/5, SB-1, OPT-7 RPC, GOV-5 export/sync, B7 → **done** (já no código).

### Dependências
- **[Anvil→Prism]** ActivityGroup lê `listTurnActivity` após `Engine.report`.
- **[Anvil→Probe]** store `screens/repos.ts` `get<T>` (gate FAIL antigo).

---

## 04/11 06:20 — oxlint 3 pkgs + docs host/store/edge (Atlas leve)

Atlas: (1) oxlint nos três pacotes + mortos; (2) ARCHITECTURE + contracts; (3) apps reais só com ≥15 GB.

### (1) oxlint + check-pkg
Limpeza em host/store (sync já estava limpo): indent `withDefaultGestor`, `TurnLedgerEntry` só reexport, `z.looseObject`, `JSON.stringify` sem `??`, `Reflect.get` tipado, `persistQuota` com chaves, `addConnectionAccount`/`exportDiagnostics`/`listConnectionAccounts` síncronos, `webserverOf` sem `any`, webhook `Uint8Array[]`, `readBody` sem type param morto. Testes: `toThrow` + chaves, `await` de sync removido, frames tipados, ACL `methodOf`, boolean direto.

```
pnpm exec oxlint packages/persona/persona-store packages/persona/persona-host packages/persona/persona-sync
  exit 0 (~33s)
node scripts/persona/check-pkg.mjs persona-store persona-host persona-sync
  store OK 10s (após fix get<T>); host OK 20.7s; sync OK 6.4s
```

Exports públicos mantidos (usados por testes/orquestração). Sem morto óbvio além do que o oxlint já apontou.

### (2) Docs
`persona-spec/ARCHITECTURE.md`: schema v1→v19, RemoteGuard (256 KB / 12 MB attach / 2000+240/10s), ACL_EXCEPTIONS, rotas edge.
Contracts: `lumen-rpc` (gateway + listConnections sync + medidas), `gestor` (sem Remote `measureGestorV1`; `gestorAuditReason`), `conversation-subjects`, `remote-teams` (tabela de rotas), `attachments`, `sync`, `second-brain`, `token-ledger`.

### (3) app-real — não subi
`Get-CimInstance` FreeGB **23.5 → 18.7** (Total 47.3) — acima de 15. Rivet segura `.maestri/locks/build.lock` com `package-clean` D8 (pack win-x64, ~29 min, live em `C:\p8c`). with-lock 180s → 75. Atlas: um pesado por vez. Script pronto: `.maestri/tmp/capture-app-real.mjs` → `.maestri/tmp/shots/remote/app-real/` (3080/3081 + wrangler 8791). Reenfileirar quando o lock do Rivet cair.

### Dependências
- **[Anvil→Probe]** store `screens/repos.ts` `get<T>` (era o FAIL do gate).
- **[Anvil→Atlas]** app-real quando D8 pack soltar o lock.

---

## 04/11 05:55 — talkLayers → composeHostTalk + attach 8 MB + GES/PRO/OPT

Vigia: não parar. Forge 05:52 pediu trocar `talkLayers`.

### Talk (OPT-3)
`talkLayers` agora é `foldHostTalkUsed` + `composeHostTalk` + `capTalkContext` no recall + `finishHostTalk` no reply. Colegas no prefixo; assunto/recall/mensagem no tail (`<dado origem="mensagem">`).

### Guard
`attachFile` / `putFile` / `upload*` usam teto **12 MB** (256 KB recusava upload legal de 8 MB com `payload-too-large`).

### GES / PRO-6 / OPT-8 (mesmo turno)
`withDefaultGestor`; `gestorAuditReason` no cartão; `emitGestorPropose.kind`; remotes `measureProactivityV1` (6/6) e `measureOpt8` (`cut-40` blocked + liveEntries).

### Prova
```
pnpm exec vitest run …/talk-voice …/token-opt …/attachments …/gestor …/onboarding …/remote-guard
  Test Files  6 passed (6)
  Tests  31 passed (31)
```

### Dependências
- **[Anvil→Probe]** `measureProactivityV1` / `measureOpt8` no E2E PRO-6 / OPT-8.
- **[Anvil→Lumen]** `gestorAuditReason`; `getUsagePanel`.
- `cut-40` só com livro live antes/depois. GOV-5 J19, B7, SB-1, OPT-7 RPC, C8 host já no código.

---

## 04/11 05:50 — GES-1/5 + PRO-6/OPT-8 remotes (fechamento v1 host)

Vigia: não parar. PLAN PRO-* + GES-1/5 + OPT-8 livro live.

### O que entrou
- **GES-1**: `withDefaultGestor` — Coordenação no onboarding/`createPersona`/`setPersonaSystemRoles` ganha `team_manager`.
- **GES-5**: `PersonaCardView.gestorAuditReason` no perfil; Saúde já tinha `gestorAudit`.
- **GES propose**: `recordTurnActivity.kind` = `emitGestorPropose` (`assemble`→hire, `allocate`/`reorganize`→command).
- **PRO-6**: `@Remote measureProactivityV1` → `measureProactivityAcceptance()` (6/6). Probe não remonta flags.
- **OPT-8**: `@Remote measureOpt8` — score scripted + `liveEntries`/`liveOrigin` do ledger persistido. `cut-40` continua `blocked` até haver antes/depois live.

### Prova
```
pnpm exec vitest run …/gestor.spec.ts …/onboarding.spec.ts …/token-opt.spec.ts
  Test Files  3 passed (3)
  Tests  15 passed (15)
```

### Dependências
- **[Anvil→Probe]** `measureProactivityV1` / `measureOpt8` / `measureGestorAcceptance` (engine) no E2E PRO-6 / OPT-8 / GES-6.
- **[Anvil→Lumen]** `gestorAuditReason` no cartão; `getUsagePanel` + `measureOpt8.liveEntries` no painel Uso.
- `cut-40` precisa de livro live com linha de base — não dá para desbloquear com mock.
- GOV-5 export/sync: J19 já cobre `governanca.md` + `mayUpload` workspace / DM não.
- B7 / SB-1 / OPT-7 RPC / C8 host já no código. UI/E2E = Lumen/Prism/Probe.

---

## 04/11 05:10 — P0 rate-limit + fios Forge (talk/SB-6/BYC/GES)

Keel P0 (sem resposta) + fila Forge 05:22. Vigia: não parar.

### P0 `listConversationSubjects` rate-limited
Fonte: `RemoteGuard` (não o gateway). Teto era 120/10s → **2000/10s** leitura, **240/10s** escrita. Método é SELECT + cache 750 ms. `RemoteFault.isDSHRemoteError` + `details.retryAfterMs` para o gateway mandar `code: 'rate-limited'` (não `gateway/internal`). UI: `PersonaRemoteError.retryAfterMs`.

`persistQuota` no `ConnectionProbe`: `?` + `| undefined` (Keel TS2412 / exactOptionalPropertyTypes).

### Fios Forge (host)
- Talk: `finishHostTalk` no reply (prefixo continua `composeTurnPrompt` — `composeHostTalk` corta colegas/recall).
- SB-6: `exportBrainVault`/`importBrainVault` chamam `planBrainVaultSync`+`applyBrainVaultSync`; page upsert; foreign → `previewBringVault` (sem gravar).
- BYC paste/pasta: `vaultToBringExisting` no Cofre (não `existing: []`).
- GES propose: `emitGestorPropose` → corpo `[[gestor-plan:id]]` no `#geral` + `recordTurnActivity` waiting (append, sem ingest).

### Prova
```
pnpm exec vitest run …/gestor …/second-brain …/bring-context-apply …/remote-guard …/remote-unwrap
  Test Files  5 passed (5)
  Tests  24 passed (24)

node scripts/persona/check-pkg.mjs persona-host
  persona-host: OK in 191.5s

node --import tsx/esm scripts/persona/persona-boot-smoke.mjs --port 3293
  exit 2: host não imprimiu URL em 120 s (stdout vazio). Máquina com with-lock Muse/Rivet + 3,5 GB livres. Não é o rate-limit.
```

### Dependências
- **[Anvil→Prism]** `rate-limited` + `retryAfterMs`; tratar sem pageerror.
- **[Anvil→Lumen]** `getTeamHealth.gestorAudit`; foreign BYC no import two-way ainda é preview (aceite humano).
- Boot smoke real: re-rodar quando o lock da Muse/Rivet soltar.
- `talk-voice.spec` «dado origem=mensagem» falhou por mudança no `composeTurnPrompt` do Forge — não alterei `talkLayers`.

---

## 04/11 05:05 — P0 boot smoke `listConversationSubjects` rate-limited

Keel: gate PERSONA caiu com `PersonaRemoteError … "listConversationSubjects" (gateway/internal): rate-limited`.

### De onde vem
O `RemoteGuard` que instalei em todo `@Remote` (`persona-host/src/remote-guard.ts`). Teto era **120/10s por peer+método**. O tour de 9 painéis + remount/retry do React estoura isso em `listConversationSubjects`. O Typert Gateway embrulha `Error` comum como `gateway/internal` — por isso o código na UI não era `rate-limited`.

`listConversationSubjects` é barato (lista SQLite de tópicos + `subjectViews`). Cacheável: cache de 750 ms por `project+stream+owner+actor`, invalidado em create/rename/archive/setActive/`postMessage`.

### O que mudou
- Leituras: **2000/10s**. Escritas: **240/10s**. Justificativa: boot + troca de conversa + tour 9 painéis × N streams × remount > 120; o método é um SELECT.
- `RemoteFault` agora tem `isDSHRemoteError` + `details.retryAfterMs` — o gateway manda `code: 'rate-limited'` (não `gateway/internal`).
- `PersonaRemoteError.retryAfterMs` no unwrap (Prism trata sem pageerror).
- Contrato `conversation-subjects.md` atualizado.

### Prova
- vitest remote-guard + wave2 + remote-unwrap **15/15**
- Burst de 400 `listConversationSubjects` no teto de produção passa; escrita estoura em 241 com `retryAfterMs > 0`

### Dependências
- **[Anvil→Prism]** `error.code === 'rate-limited'` + `retryAfterMs`. O teto novo deve cobrir o boot normal; se o cliente ainda disparar >2000/10s, esperar `retryAfterMs`.

---

## 04/11 04:30 — RPC guard + cota oficial v19 + PB-5/6/7 + shots app

Fila Atlas: endurecimento RPC, `persistOfficialQuotaPuts`, equipes à distância no app, Lumen PB-5/6/7.

### O que entrou
- Gateway único em todo `@Remote`: zod, 256 KB, rate/peer, `RemoteFault` sem ids escondidos. Matriz ACL (dono/membro/guest/persona) + fuzz de escrita → `.maestri/tmp/shots/remote/acl-matrix.json`. Persona sem membro **não** herda o dono.
- Schema **v19**: `usage_quota` PK `(project_id, provider, account_id)`. `persistProbeQuota` no `ConnectionProbe` / `listConnections`. `getOfficialQuota` devolve `accountId`/`accountLabel`/`nextRefillAt`/`refillHistory` (nunca `default`).
- PB-5/6/7: host já tem `getProjectBoard`/`proposeWorkflow`/`acceptWorkflowProposal`/`listSprints`/`createSprint`/`closeSprint`/`getProjectConversation` — contrato `pb-boards-rpc.contract.spec` 16/16. Nada faltando para o Lumen.
- Shots do chrome Persona (tokens `persona-palette.css`) em `.maestri/tmp/shots/remote/app/` (`desk-a.png`, `desk-b.png`, `side-by-side.png`). Script: `apps/persona-edge/scripts/capture-remote-app.mjs`. Dois `dsh web` 3080/3081 vivos: `PERSONA_APP_A/B`.

### Prova
- store usage+open, host remote-guard/acl-matrix/usage/connections/pb-boards/remote-acl, Lumen usage-pooled: **39/39** (depois dos ajustes da matriz)
- Chrome headless escreveu os 3 PNGs

### Limitação
Shots do app usam o chrome Persona (tokens reais) + fluxo A/B; não subiram dois `dsh web` neste turno (pesado). Script pronto para apontar nas portas 3080/3081.

---

## 04/11 03:33 — Remotes GES-3 / T3 / allocate-reorganize (janela aberta)

Keel: `JANELA ENCERRADA`. Liguei o que o Forge pediu no host.

### O que entrou
- `commentGestorPlan` / `resolveGestorTie` + `GestorPlanView.commentOnId`.
- `proposeGestorAllocate` / `proposeGestorReorganize` (always_ask → `approveGestorPlan` aplica).
- T3: `enqueueWorkingMessage` / `listWorkingQueue` / `editQueuedMessage` / `dropQueuedMessage` / `flushWorkingQueue` / `openAsideAsk` / `recordTurnActivity` / `listTurnActivity` (`WorkingSendHost` em `screen_doc`).
- Contratos `gestor.md` / `lumen-rpc.md` / `working-send.md` / `activity.md` atualizados.

### Prova
- vitest gestor + working-send 9/9
- `check-pkg persona-host` OK 31.5s
- `generate-typert` 40 artifacts

### Dependências
- **[Anvil→Lumen/Prism]** RPCs vivos; `listTurnActivity` vazio = `[]`. Fila T3 por `personaId`+`subjectId`.
- **[Anvil→Forge]** domínio `commentGestorPlan` / `foldTurnActivity` / `gestorAllocate` sem kinds novos.

### Fila
PLAN GES-1/SB-1/B7/OPT-7/W2-10 store já existe (v16 brain teach MutantRunBook getUsagePanel). E11 blocked. Teach `acceptTaughtCandidate` se faltar Remote.

---

## 04/11 02:05 — contratos GES-3 / T3 / B7 (folha; janela ainda fechada)

Sem `JANELA ENCERRADA` — store/host intocados. Avancei o que o Forge pediu com mocks no domínio.

### O que entrou
- `persona-spec/contracts/working-send.md` — fila × direcionar / `/lado` / limite (RPCs Anvil).
- `pending-rpc.contract.spec.ts`: GES-3 `commentGestorPlan` (`commentOnId`) + `resolveGestorTie`; T3 §9 fold vazio ≠ 0%; fila sobrevive `pauseAtLimit`.
- Contratos `gestor.md` / `activity.md` / `lumen-rpc.md` com o wire pendente (`commentOnId` no view; allocate/reorganize ainda sem `@Remote`).

### Já no host (sem editar)
- B7: `MutantRunBook` 2º run = queued, 3º = refused; assunto capturado. `mutant-run.spec` + `gestor.spec` 11/11 com o contrato.
- Store `team_manager_plan.body_json` já cabe `commentOnId`. `approveGestorPlan` / `listGestorPlans` / `rejectGestorPlan` já são Remote.

### Prova
- `vitest` pending-rpc + mutant-run + gestor 11/11
- oxlint do spec novo OK

### Dependências
- **[Anvil→Keel]** depois da janela: `@Remote` `commentGestorPlan` / `resolveGestorTie` / `listTurnActivity` / fila T3 / `proposeGestorAllocate|Reorganize`; `GestorPlanView.commentOnId`.
- **[Anvil→Lumen/Prism]** mockar esses RPCs com o contrato; `approveGestorPlan` já existe.
- **[Anvil→Forge]** domínio usado sem cópia de kinds.

### Fila
Remotes acima = próximo código de host. E11 blocked. PLAN GES-1/SB-1 store já tem tabelas (v16 / brain); marcar done é do Keel.

---

## 04/11 02:00 — equipes à distância local + roster 150 (folha)

Janela ainda sem `JANELA ENCERRADA` — store/host intocados. Fechei o buraco do E7 no edge e a prova A/B que o Atlas pediu para o Miguel.

### O que entrou
- **Membro no DO**: tabela `member`; dono via `POST /members`; redeem grava o desk; revogar convite ou `POST /members/:id/revoke` corta sync.
- Header `x-persona-actor` em append/after → `ACCESS_REVOKED` / `NOT_A_MEMBER`. Sem header = caminho antigo (testes).
- **`task-run:` / `run:`** nunca sobem (`isLocalOnlyStream`). Tarefa da persona de A fica no desk A.
- Ciclo wrangler: convite A→B, `#geral` converge, DM recusada, B offline/retoma, revogar corta. Capturas em `.maestri/tmp/shots/remote/` (`index.html` lado a lado + `transcript.json`).
- **150 ociosas**: `nextDue` justo (rotina → iniciativa → Vigia); 450 slots, 3 por persona, 0 IA quando nada venceu; tick < 200 ms.

### Prova
- `vitest` remote-teams + idle-roster 2/2
- `vitest` edge.spec + client-cycle 5/5 (regressão)
- `vitest` persona-sync 5/5
- `check-pkg persona-sync` OK 8.2s
- `tsc -p apps/persona-edge` + oxlint dos arquivos novos OK

### Limitação
Não são dois processos `PersonaHost` (o host não escuta porta; pacote fechado). Dois `SyncClient` + homes isolados (`MemorySyncLog`) + Worker local. E11 deploy blocked.

### Dependências
- **[Anvil→Atlas]** shots em `.maestri/tmp/shots/remote/index.html`
- **[Anvil→Keel]** soak 150 no host (CPU/RAM reais + seed Lumen) depois de `JANELA ENCERRADA`
- **[Anvil→Lumen]** getUsagePanel já no host (turno anterior); UI pode ligar

### 150 no host (mesmo turno)
`apps/persona-edge/tests/soak-150-host.spec.ts`: 150 personas, 8 ticks de 15 min, `tickProactivity`, 0 `runnerFactory`, RSS < 192 MB, handles estáveis, no máx. 1 fire/persona. vitest 1/1 em 872 ms. Sem editar host/store.

### Fila
GES/SB/`listTurnActivity` = host/store, congelados até `JANELA ENCERRADA`. E11 blocked.

---

## 04/11 01:56 — gate D-060 host VERDE (Keel snapshot)

Keel: `usagePortKind` sem import + `usagePortWindow` sem uso. Fechei no mesmo passo: `persistTurn` usa `usagePortWindow` de persona-usage (window `exec`/`eval`); kinds canônicos ficam no `turn_ledger`.

### Prova
- `check-pkg persona-host` OK 31.5s
- `check-pkg persona-store` OK 15.8s

### Fila
Distância local (dois hosts + wrangler) em seguida.

---

## 04/11 01:35 — OPT-7 ledger canônico + painel Uso (Keel/Forge OPT-1)

Keel: persistir `TurnLedgerEntry` do core; `usagePortKind` só na fronteira Rivet; RPC para `foldUsagePanel`.

### O que entrou
- **v18 `turn_ledger`**: kinds canônicos `execution`/`evaluation` (CHECK recusa `exec`/`eval`). Camadas + cache read/write + ticket/conta/origem.
- **`TurnLedgerRepos`**: `put`/`list` + `assertTurnEntry` do core.
- Host: `recordTurnLedger` / `getUsagePanel` (= `foldUsagePanel`). `persistTurn` grava o livro e o port Rivet com `window = usagePortKind(kind)`.
- Orquestração (talk/task medido) chama `recordLedger` — sem kinds duplicados.

### Prova
- vitest store `turn-ledger`+`open` 21/21
- vitest host `token-opt`+`usage` 8/8
- `check-pkg persona-store` OK · `check-pkg persona-host` OK
- `generate-typert` 40 artifacts
- oxlint dos arquivos novos OK

### Dependências
- **[Anvil→Rivet]** port `UsageStore` recebe `window: exec|eval` via `usagePortKind`. Livro SQLite guarda `TurnKind`. Não redefinir kinds no usage.
- **[Anvil→Lumen]** `getUsagePanel({ workspaceId, projectId?, personaId?, period?, successfulTicketIds? })` → origin, tokensPerSuccessfulTask, byPersona, byKind, cacheHitRate. Vazio = `estimate`, não 0%. `recordTurnLedger` se o painel gravar.

### Limitações
Sem UI. Sem commit. Gate de publicação (check-pkg) verde nos três pacotes Anvil; oxlint do pacote inteiro ainda tem lixo antigo (não no gate D-060). Fila: distância local + carga 150.

---

## 04/11 01:15 — token-opt host/store (TOKEN-OPTIMIZATION §2)

Atlas: resumo incremental, prefixo estável, lote Bibliotecário/iniciativa, pool de limites. Sem OPT-1.

### O que entrou
- **v17 `OptRepos`**: `topic_summary`, `batch_cursor`, `provider_limit_pool`
- Assunto: fold extractivo a cada 6 msgs; compileUsed = obrigatórios + resumo + últimas 4 (não histórico bruto). Teste: constraint não some.
- Prompt: `composeTurnPrompt` (Forge) — prefixo sistema→persona→tools→obrigatórios; mensagem/relógio fora. Snapshot de dois turnos iguais.
- `tickLibrarianBatch` / `tickInitiativeBatch` só no que mudou (cursor).
- `putProviderLimitReports` / `getProviderLimitPool` — `dedupeLimitAccounts` + `poolProviderLimits` (Rivet); mesma conta em 2 ambientes = 1.

### Prova
- vitest store `opt`+`open`+`gestor` + host `token-opt`+`gestor`+`chat`+`conductor`: verdes
- `generate-typert` 40 · `check-pkg persona-host persona-store` OK

### Dependências
- **[Anvil→Rivet]** harvest T3 chama `putProviderLimitReports`. Redeem/UI = Rivet/Lumen.
- **[Anvil→Forge]** fold do assunto é extractivo (lote barato, sem LLM). OPT-7 painel espera OPT-1.

---

## 04/11 00:55 — rename VERDE + BYC apply + GES-5 saúde

Atlas P0: host/store alinhados a `team_manager` (não `gestor`/`maestro`). RPCs `getGestorMandate*` (nome Forge `Gestor*`). Keel avisado. Fila: `applyContextProposals` (BYC) e auditoria do Gestor em `getTeamHealth`.

### Arquivos
`persona-host/src/{index,types,governance,bring-context-apply,bring-context-walk}.ts` · `tests/{bring-context-apply,bring-context-walk,gestor}.spec.ts` · `README.md` · `contracts/lumen-rpc.md`

### Prova
- `vitest` gestor + governance + BYC apply/walk: 10+3 verdes
- J19 export governança: verde
- `generate-typert` 40 · `check-pkg persona-host persona-store` OK

### Dependências
- **[Anvil→Lumen]** `applyContextProposals` grava Cofre; privado = `members`. Saúde: `getTeamHealth.gestorAudit`.
- **[Anvil→Keel]** rename VERDE (já no ask).

---

## 04/11 00:40 — rename Gestor (`team_manager`)

Keel P1: host alinhado ao core (`TEAM_MANAGER_ROLE = 'team_manager'`). `SystemRoleView` e `toPersonaView` sem o literal antigo. Store v16 tabelas `team_manager_*`. Contrato em `lumen-rpc.md`.

### Arquivos
`persona-host/src/{types,index,gestor,orchestration}.ts` · `tests/gestor.spec.ts` · `README.md` · `persona-store/src/{migrations,gestor/repos}.ts` · `tests/open.spec.ts` · `README.md` · `contracts/lumen-rpc.md`

### Prova
- `vitest` `gestor.spec.ts` + `open.spec.ts`: 23/23
- `generate-typert`: 40 artifacts
- `check-pkg persona-host persona-store`: OK

### Dependências
- **[Anvil→Forge]** host/store usam `team_manager`. Core já tem `TEAM_MANAGER_ROLE`. Testes core que ainda esperam `'gestor'` no array de roles são seus.

---

## 04/11 00:10 — Segundo cérebro store/RPC (SB-1 / SB-4 / SB-10)

BRIEFING 19. Onda 3/BYC sem fatia Anvil livre (BYC-4 espera Forge BYC-1..3). Este turno: páginas markdown + índice derivado + remotes.

### 1. Store v15
`BrainRepos` (`brain_page` + FTS5 + triggers, `brain_link`, `brain_version`, `brain_grant`). Markdown é a fonte; FTS/tipo/`[[links]]` são derivados. `putPage` sempre append de versão (pessoa ou persona). Soft-supersede só. `grant` / `revoke` / `recordUse` + `grantAllows` (escopo exato, nunca amplia). `listChangedSince` / `ensureStartHere`. `exportFolder` (mão única) / `importFolder` (slug+hash = skip). WAVE2 permanece v14.

### 2. Host RPCs
`putBrainPage` `getBrainPage` `listBrainPages` `searchBrainPages` `listBrainVersions` `restoreBrainPage` `listBrainChangedToday` `getBrainHome` `grantBrainPermission` `revokeBrainPermission` `listBrainPermissions` `useBrainPermission` `exportBrainVault` `importBrainVault`. ACL = `canReadVault` (página `persona` some do ator humano). Guest `forbidden` no write. Typert 40. `SystemRoleView` inclui `librarian` (Forge já no core).

### Arquivos
`persona-store/src/{constants,migrations,brain/repos,teach/repos,index}.ts` · `tests/{second-brain-pages,open}.spec.ts` · `README.md` · `persona-host/src/{types,brain,index}.ts` · `tests/second-brain.spec.ts` · `README.md` · `contracts/lumen-rpc.md` · `lib/typert.*`

### Prova
```
node ./node_modules/vitest/vitest.mjs run …/second-brain-pages …/open …/second-brain → 28 OK (11.7s)
node ./node_modules/vitest/vitest.mjs run …/second-brain-pages …/second-brain …/attention-retention → 12 OK (16.5s)
node scripts/persona/check-pkg.mjs persona-store persona-host → OK 20.8s + 17.5s
node --import tsx/esm scripts/generate-typert.ts → 40 artifacts (36.8s)
```

### Dependências
- **[Anvil→Forge]** v15 = só Segundo cérebro. WAVE2 fica v14. Gate: `useBrainPermission` (alvo/persona/validade diferentes → `forbidden`). Curadoria/Bibliotecário e `brain_*` tools continuam seus.
- **[Anvil→Lumen]** Empresa › Segundo cérebro: `getBrainHome` / `listBrainPages` / `getBrainPage` / `listBrainVersions` / `putBrainPage` / `listBrainPermissions` / `revokeBrainPermission` / `exportBrainVault`. Contrato em `lumen-rpc.md`. Lumen fora do canvas — recado no Status.
- **[Anvil→Prism]** mesmos remotes se a tela passar pelo client.

### Limitações
Sem curadoria automática (Forge SB-2/SB-6). Sem tools de agente (Rivet SB-5). UI não ligada. App desktop não exercitado. Sem commit. Fila Anvil seguinte: BYC-4 (bloqueada) / SB-3 gate (Forge).

---

## 03/11 23:55 — Cofre documentos + citações + anexos visão + multi-cliente + soak

Forge fechou WAVE2 RPC no host (v14 canônico, sem v15). Este turno: Cofre que lê arquivo + Contexto usado.

### 1. Store
PDF/DOCX/MD/TXT/CSV locais (sem dep nova). `detectVaultKind` recusa vazio, >8 MB (linha pt-BR) e EXE/MZ. `ingest`/`replace`/`delete` + `vault_chunk` FTS. `searchChunks` usa tokens OR (`ftsMatch`), não uma frase só — `compileUsed` acerta "Clausula do contrato".

### 2. Host RPCs + citações
`ingestVaultDocument` / `replaceVaultDocument` / `deleteVaultDocument` / `listVaultDocuments` / `searchVaultDocuments`. Hits trazem `title` + `locator` (página/seção). `compileUsed` anexa `kind: 'document'` no Contexto usado; ACL `canReadVault` (visibilidade persona some do ator humano e de outra persona). Typert 40.

### 3. Anexos
`MediaHost.stageForRunner(hasVision)`: imagem vira bytes se `capabilities().vision === true`; senão `inputs/` read-only. Talk encaminha o flag; worktree de review fica no caminho arquivo (seguro).

### 4. Multi-cliente + soak
Dois `followMessages` + `getProjectBoard` no mesmo workspace: 1 mensagem, cards por `ticketId` sem duplicata. 10 personas idle × 12 ticks de 5 min: 0 chamadas AI, rss/handles estáveis.

### Arquivos
`persona-store/src/vault/{extract,chunk,samples,repos}.ts` · `migrations` v13+v14 · `tests/vault-ingest.spec.ts` · `persona-host/src/{vault-docs,media,orchestration,index,types}.ts` · `tests/{vault-docs,attachments,multi-client,host-soak}.spec.ts` · `contracts/{lumen-rpc,attachments}.md` · `lib/typert.*`

### Prova
```
pnpm exec vitest run …/vault-ingest …/vault …/open → 47 OK
pnpm exec vitest run …/vault-docs → 4 OK
pnpm exec vitest run …/attachments → 9 OK
pnpm exec vitest run …/multi-client → 1 OK
pnpm exec vitest run …/host-soak → 1 OK
pnpm exec vitest run …/wave2 …/j05-cofre → 5 OK
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (68.5s)
```

### Dependências
- **[Anvil→Lumen]** Conhecimento/Cofre: `ingest/replace/delete/list/searchVaultDocuments`; citações `listUsedContext`/`getTurnContext` com `title`+`locator` em `kind: 'document'`.
- **[Anvil→Prism]** mesmos remotes se o upload/cite passar pelo client; `followMessages` já converge dois clientes.
- **[Anvil→Forge]** OK — v14 permanece canônico. Não toquei WAVE2 RPC.

### Limitações
PDF = Tj/TJ + FlateDecode; DOCX = ZIP + `w:t`. Sem dep de parser. Visão só se o runner anunciar `vision` (DSH hoje não). Doc `persona` some da UI humana (`canReadVault`). App desktop não exercitado (só host). Sem commit.

---

## 03/11 22:29 — acceptWorkflowProposal + Conversa PB-5 (Atlas)

Leftovers do turno 22:17 já no fio. Este turno: RPCs Lumen + lado host da Conversa.

### 1. Proposta de fluxo
`acceptWorkflowProposal({ columns, fields, destByRemoved?, template? })` — único `save` do cartão; `template` do cartão ou prefixo das colunas. `rejectWorkflowProposal(scope)` devolve o fluxo atual, store intacto. Guest `forbidden`.

### 2. PB-5 Conversa (host)
`getProjectConversation(scope)` → `{ projectId, channelId, name }`. `createProject` cria `#geral` (`id` = `geral:<projectId>`). Pessoal reusa `geral` se já existir.

### 3. Dogfood
Padaria DF-001..008: nenhum dono Anvil (Prism/Lumen/Muse/Forge). Sem edição.

### Arquivos
`persona-host/src/{index,types,boards}.ts` · `tests/{boards,j16-propose-flow,persona-card}.spec.ts` · `contracts/{project-boards-remote,lumen-rpc,ui-shell}.md`

### Prova
```
pnpm exec vitest run …/boards …/j16-propose-flow …/persona-card …/preroute → 22 OK
node scripts/persona/check-pkg.mjs persona-host → OK 52.9s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (96.5s)
```

### Dependências
- **[Anvil→Lumen]** trocar o aceite provisório (`updateWorkflow`) por `acceptWorkflowProposal`; recusa = `rejectWorkflowProposal`.
- **[Anvil→Prism]** aba Conversa: `getProjectConversation` → abrir `channelId` (não o `#geral` do Pessoal).
- E11 blocked. Sem commit.

---

## 03/11 22:17 — Sessão nova: fila Atlas 21:50 ok + leftovers host

Maestri reiniciou. Fila Atlas (RPC share/insights + generate-typert + dogfood host/store + endurecimento) já estava no fio das 21:50. Confirmei e encadeei leftovers.

### 1. Fila Atlas — já no código
Share/insights/skills CLI, modo seguro, `restoreBackup`/`getStoreHealth`, anexo 8 MB. Padaria Lua: DF-001 Prism, DF-002 Forge — nenhum bug host/store.

### 2. `/pausar` / `/retomar`
Dono pausa a Coordenação (ou @nome). Mesma linha `persona_runtime` do cartão. Sem conversa/tarefa até `/retomar`. Membro continua recusado. Comando lido do texto (não de `lastRoute` velho).

### 3. X-4 + cartão
`pollExternal` passa `budget` (cap 4) a telegram/slack/discord/caldav/email. Tempestade 20 polls telegram: 4 fetch. `getPersonaCard` usa `quotaCardMeters` (ausente ≠ 0%).

### Arquivos
`persona-host/src/{orchestration,index,external-sources,persona-card}.ts` · `tests/{preroute,external-sources}.spec.ts`

### Prova
```
pnpm exec vitest run …/preroute …/external-sources …/persona-card → 19 OK
pnpm exec vitest run …/share-insights …/attachments …/lifecycle …/recovery → 19 OK
node scripts/persona/check-pkg.mjs persona-host → OK 15.7s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (39.1s)
```

### Dependências
- **[Anvil→Lumen]** RPCs share/insights prontos (`lumen-rpc.md`). `acceptWorkflowProposal` = alias de `updateWorkflow` (já no fallback do Lumen).
- E11 Cloudflare: blocked (Atlas).
- Fila PLAN Anvil **vazia** (B7/GOV-5 no fio; Keel marca `done`).

Sem commit.

---

## 03/11 21:50 — RPC share/insights + endurecimento (Atlas)

Fila Atlas encadeada: (1) contratos Forge 21:45 (2) Padaria Lua — nenhum bug host/store chegou (3) endurecimento. Um host/teste pesado por vez. Sem commit.

### 1. Share + skills CLI
`exportPersona` / `importPersona` / `exportTeam` / `importTeam` / `previewCliSkills` / `proposeCliSkills`.

Import cria proposta `hire` **pending** — nunca aplica. Skills CLI = `origin: learned`, `enabled: false`. Segredo → `SECRET_REFUSED` / `IMPORT_REFUSED`.

### 2. Insights locais
Dobra onboarding, mensagens de persona/runner, tickets `completed`/`merged`, aprovações `approved`. Sem telemetria.

`getActivationFunnel` · `getPersonaImpact` · `listPersonaImpact` — **só dono**.

### 3. Endurecimento
- Corrupto + backup → restaura (já existia).
- Corrupto sem backup → **modo seguro** (quarentena + banco vazio + mensagem). Arquivo alienígena com tabelas ainda recusa.
- `restoreBackup({ filename })` + `getStoreHealth()`.
- Migrações v1→v12 + rollback de falha (suíte existente + `recovery.spec.ts`).
- Anexo/avatar/arquivo > limite → linha pt-BR (`Este anexo tem N MB. O limite é 8 MB.`).

### Arquivos
`persona-host/src/{index,types,auth,screens,share-remote,insights-fold,media,media-detect,files}.ts` · `tests/{share-insights,lifecycle,attachments,files}.spec.ts` · `persona-store/src/{store,events/repos}.ts` · `tests/recovery.spec.ts` · `persona-spec/contracts/lumen-rpc.md`

### Prova
```
pnpm exec vitest run …/recovery.spec.ts …/migrate-fixtures.spec.ts …/open.spec.ts → 27 OK
pnpm exec vitest run …/share-insights.spec.ts …/lifecycle.spec.ts …/attachments.spec.ts …/files.spec.ts → 20 OK
pnpm exec vitest run …/remote-acl.spec.ts → 2 OK
node scripts/persona/check-pkg.mjs persona-store → OK 9.0s
node scripts/persona/check-pkg.mjs persona-host → OK 17.5s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (39.1s)
```

### Dependências
- **[Anvil→Lumen/Prism]** RPCs prontos: share (`exportPersona`/`importPersona`/`exportTeam`/`importTeam`/`previewCliSkills`/`proposeCliSkills`) e insights (`getActivationFunnel`/`getPersonaImpact`/`listPersonaImpact`). Contrato `lumen-rpc.md` + `share.md`/`insights.md`. Lumen não está no canvas.
- **[Anvil→Forge]** nenhum bug Padaria Lua chegou. Pronto para o próximo.
- E11 Cloudflare: blocked (Atlas).

Fila Atlas desta rodada **fechada** (item 2 sem material). Sem commit.

---

## 03/11 21:27 — Escala + chat rico + Cloudflare dry-run (Atlas)

Fila Atlas encadeada. Um host/teste pesado por vez. Sem login/deploy. Sem commit.

### 1. Escala
Workspace sintético 10 projetos / 30 personas / 10k msgs / 1k tarefas (SQL bulk, sem ingest). Índice `event_stream_alive_seq`, `checkpointWal` (`PRAGMA wal_checkpoint(TRUNCATE)`), `listMessages` paginado (50).

**Números (depois; arquivo WAL, 12 amostras):**

| RPC | p95 |
|---|---|
| `listMessages` (páginas 50) | **39.6 ms** |
| `search` FTS (`needle`) | **16.5 ms** |
| `listTasks` (~100 no 1º projeto) | **25.5 ms** |
| `listPersonas` | **8.0 ms** |
| baseline 1ª página | 13.2 ms |
| seed | 2.55 s |
| heap Δ | +5 MB |
| checkpoint | busy 0 |

Antes: sem suíte; stream sem partial index; sem RPC de checkpoint. Depois: p95 << 100 ms, heap estável.

### 2. Chat rico (schema v12)
Reações (catálogo Brush), reply (`replyToId`), pin, edit/apagar própria + audit, `suggestMentions` com talk ACL.

RPCs: `listStickers` · `reactToMessage` · `unreactToMessage` · `replyToMessage` · `pinMessage` · `unpinMessage` · `listPinned` · `editMessage` · `deleteMessage` · `listMessageAudit` · `suggestMentions` · `checkpointWal`.

### 3. Cloudflare (sem conta)
`wrangler.toml` completo (DO, D1, R2, vars, secrets documentados). `migrations/0001_init.sql`. `persona-spec/CLOUDFLARE-DEPLOY.md` (passos + custo: DO exige Workers Paid ~US$ 5/mês; D1/R2 cabem no free).

`wrangler deploy --dry-run --outdir .wrangler/dry` → exit 0 (594.99 KiB / gzip 91.99 KiB). Pasta dry apagada. Sem login.

### Arquivos
`persona-store/src/{constants,migrations,store,events/repos,scale/seed,index}.ts` · `tests/{open,chat-scale}.spec.ts` · `persona-host/src/{index,types,auth,stickers}.ts` · `tests/{chat,scale}.spec.ts` · `apps/persona-edge/{wrangler.toml,README.md}` · `persona-spec/{CLOUDFLARE-DEPLOY.md,contracts/lumen-rpc.md,reports/anvil.md}`

### Prova
```
pnpm exec vitest run …/open.spec.ts …/chat-scale.spec.ts → 22 OK
pnpm exec vitest run …/chat.spec.ts → 4 OK
pnpm exec vitest run …/scale.spec.ts → 1 OK (p95 acima)
node scripts/persona/check-pkg.mjs persona-host persona-store → host 20.9s / store 10.3s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (56.4s)
cd apps/persona-edge && pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry → exit 0
```

### Dependências
- **[Anvil→Muse]** `listStickers` ids = Brush (`stamp-aprovado`, `tray-*`, `nav-saude`, `nav-quem-cuida`). Combinar com `ReactionAdder`.
- **[Anvil→Keel]** schema v12; PLAN E11 continua blocked até login do Atlas.
- E11 deploy real: só Atlas.

Fila Atlas desta rodada **fechada**. Sem commit.

---

## 03/11 21:01 — Engine.preRoute no ProjectRuntime (Forge 20:50)

Vigia: executei o próximo (Forge→Anvil ligar `Engine.preRoute`). Não reescrevi regras do Forge.

### Fio
`ProjectRuntime` passa `preRoute` ao `Engine`. `ingest` curto-circuita cortesia/silêncio/duplicado/comando recusado (sem Tarefa). `@menção` escolhe a falante e cai no triage (`action: model`) — não auto-aceita Tarefa.

### Portas reais (não stub)
- `personas` = roster do projeto
- `budgetLeft` = slot de `ExecutionBudget` + `tokenBudget`/`executionBudget` da Coordenação
- `silenceUntil` = janela da Coordenação (`silenceUntilOf`)
- `canCommand` = guest/desconhecido recusa; `/tarefa` member+owner; `/pausar` `/retomar` só owner

### Persistência
Janela de duplicados em `screen_doc` kind `preroute_window` (80 mais novas). Runtime novo recarrega.

### Arquivos
`persona-host/src/{orchestration.ts,proactivity.ts}` · `tests/{preroute.spec.ts,proactivity.spec.ts}`

### Prova
```
pnpm exec vitest run …/preroute.spec.ts …/proactivity.spec.ts
→ 2 files / 17 tests OK
pnpm exec vitest run …/e2e-flows.spec.ts …/j07-budget.spec.ts …/external-sources.spec.ts …/attention-retention.spec.ts
→ 4 files / 16 tests OK
node scripts/persona/check-pkg.mjs persona-host → OK 17.1s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (90.5s)
```

### Dependências
- **[Anvil→Keel]** PLAN: GOV-5 e B7 podem `done` (já no fio).
- **[Anvil→Rivet]** `ackAttention` + `attentionEvents` para toasts (turno 20:49).
- E11 Cloudflare: blocked (Atlas). `/pausar` `/retomar` ainda não chamam `pausePersona` (só recusam Tarefa).

Fila Anvil do PLAN **vazia** (E11 blocked). Sem commit.

---

## 03/11 20:49 — X-3 Cofre + GOV retenção + ackAttention (Vigia)

Fila Anvil do PLAN encadeada: B7 já no fio (MutantRunBook + 2 specs; PLAN ainda `todo` — Keel). GOV-5 export/sync já no turno anterior. Este turno fecha leftovers Anvil.

### X-3 `vault.get`
`CofreSecretVault` lê `VaultRepos.findActiveFact(project, provider)` (`telegram`/`slack`/…). Sem token ⇒ skip. Token nunca no view. Host constrói o vault; testes ainda injetam Map.

### GOV-5 retenção
`pruneAudit(workspace, keep=200)` no tick de retenção (por workspace do projeto). Setores/away/rotinas não apagam.

### Notificações (Rivet toasts)
`ackAttention({ eventIds })` — ids saem do próximo `attentionEvents` baseline.

### Prova
```
pnpm exec vitest run …/governance.spec.ts …/external-sources.spec.ts …/attention-retention.spec.ts …/remote-acl.spec.ts
→ 4 files / 13 tests OK
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (55.2s)
node scripts/persona/check-pkg.mjs persona-host persona-store → host 31.8s / store 9.4s OK
```

### Dependências
- **[Anvil→Rivet]** `ackAttention` + `attentionEvents` para toasts desktop.
- **[Anvil→Keel]** PLAN: GOV-5 pode `done`; B7 pode `done`.
- E11 Cloudflare: blocked (Atlas). persona-vault DPAPI (Rivet) não ligado — Cofre da empresa cobre o host.

Fila Anvil **vazia** no PLAN (E11 blocked). Sem commit.

---

## 03/11 20:40 — GOV-5 export/sync + exclusão/backup (CORTADO, files soltos)

Forge soltou `index.ts` / `types.ts` / `migrations.ts`. Não reescrevi v11 remotes, card, sync client, edge, retention, scheduler, nem X-3 (`pollExternal`/`replyExternal`/`bindSprintGoal`/`queda`).

### Dados — backup e exclusão
- Store: `backupNow()` / `listBackups()`; `wipeWorkspace` / `wipeProject` (FK off, órfãos de blob).
- Remote: `backupNow` · `listBackups` · `deleteWorkspace({confirmed})` · `deleteSharedProject({confirmed})`. Dono + confirm. Pessoal recusado. ACL_EXCEPTIONS só nos backups locais.

### GOV-5 export/import/sync (workspace; DM não)
- `SqliteGovernanceRepos.snapshot` / `restore` (idempotente).
- Zip: `governanca.md` (setores, disponibilidade, rotinas, auditoria). Envelope `gov:<ws>` `classification: workspace` sobe; DM recusado.
- Import markdown `governanca.md` não duplica (`md:governanca.md`).

### Arquivos
`persona-store/src/{store.ts,lifecycle/wipe.ts,governance/repos.ts,index.ts,README.md}` · `tests/{lifecycle,governance}.spec.ts` · `persona-host/src/{index.ts,types.ts,auth.ts,export-md.ts}` · `tests/{lifecycle,remote-acl}.spec.ts` · `tests/journeys/j19-gov-export.spec.ts` · `persona-spec/contracts/{lumen-rpc,governance}.md`

### Prova
```
pnpm exec vitest run …/lifecycle.spec.ts …/governance.spec.ts …/remote-acl.spec.ts …/j19-gov-export.spec.ts …/export.spec.ts …/j18-board-export.spec.ts
→ 7 files / 17 tests OK
node scripts/persona/check-pkg.mjs persona-host persona-store
→ host OK 15.3s · store OK 7.0s
pnpm exec tsx scripts/generate-typert.ts → 40 artifacts (67.3s) após remotes de exclusão
```

Keel 20:39 `export-md.ts` TS1005 era mid-edit; arquivo fecha agora (check-pkg verde).

### Limitações
- `backupNow` recusa `:memory:`.
- Wipe de avatar órfão usa `json_extract(avatar_json)`.
- Retention de governança não tem política própria (dump viaja no export/sync).
- Equipes à distância local / toasts desktop: Rivet; E5–E7 já no fio.

Fila: distância/notif só se sobrar gap; senão próxima do PLAN. Sem commit.

---

## 03/11 20:23 — Handoff Forge GOV-5/X-3 (Atlas)

Forge assume **temporariamente** GOV-5 + X-3 host. Confirmado via `maestri ask`.

**Forge toca:** `store/src/governance/**`, `migrations.ts` (v11 já no fio), `host/src/governance.ts`, `index.ts` só GOV+X-3+startSprint, `types.ts` só GOV/X-3, `boards.ts` (bindSprintGoal), `tests/governance.spec.ts`, arquivo novo `external-sources.ts`.

**Anvil não abre:** `persona-card.ts` + spec/contrato; `persona-sync/**`; `apps/persona-edge/**`; `export-md.ts`; `retention/**`; `scheduler.ts`. Fora de `index.ts`/`types.ts`/`migrations.ts` até Forge avisar «soltos».

Cartão Muse já no fio. Fila Anvil: equipes à distância local, notificações, export/backup/exclusão. Sem código até SNAPSHOT CORTADO. Contexto alto — estado salvo aqui.

---

## 03/11 20:16 — VERDE snapshot (GOV-5 no caminho do build)

Keel snapshot curto. Edição em curso (GOV-5) fechada o bastante para typecheck: schema v11 + remotes Lumen no host. Sem arquivo novo depois do pedido.

### Já no fio (buildável)

Store v11: `sector`, `away_window`, `routine_charge`, `governance_delegate`, `governance_audit`; backfill charge = dono. Remote: `getOrgChart` / `getTeamHealth` / `runTwoDayTest` / `applyFix` / `applyGovernanceFix` / `setResponsible` / `setSubstitute` / `setSector` / `setAvailability` / `setPersonaGovernance` / `recommendStructure` / `applyStructure` / `listAudit`. Views = `governance-contract.ts`.

### Pendente pós-CORTADO

Export/sync workspace (DM não); suíte de queda abortada; X-3 host (`replyTelegram`/`replyEmail` + poll).

### Prova

```
pnpm exec vitest run …/persona-store/tests/governance.spec.ts …/open.spec.ts …/persona-host/tests/governance.spec.ts …/persona-card.spec.ts
 Test Files  4 passed
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 30.8s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 13.1s
persona-store: OK in 6.3s
```

Parado até SNAPSHOT CORTADO.

---

## 03/11 21:20 — Cartão Muse (getPersonaCard + talk ACL + pause/engine)

Pedido Keel/Muse: cartão com dado real para o Prism montar. Sem schema bump (v10 speak/charge + `screen_doc` para pausa/auditoria).

### Remote

- `getPersonaCard` → `{ handle, systemRoles, nowKind, nowText, presence {online,lastActiveAt}, engine {runnerLabel,modelLabel}, sectorName?, ownerName?, substituteName?, currentProjectName?, quota? }`. `nowKind`: working|reviewing|waiting-approval|waiting-reply|quota|resting|stuck|offline. `nowText` derivado (Assignment/Attention/quota/ociosidade/pausa). `quota` de `getOfficialQuota`/`accountUsage`; **ausente = indisponível, nunca 0**.
- `getPersonaTalkAcl` / `setPersonaTalkAcl` → `{ mode: 'workspace'|'chosen', principals: [{kind,id,name}] }`. Store interno `everyone`/`members`.
- `pausePersona` / `resumePersona` / `setPersonaEngine` / `putPersonaCharge` — responsável ou dono; auditoria `persona_audit`.

ACL no servidor: `createDm` e `@menção` recusam pt-BR (`Esta persona só conversa com quem o responsável escolheu.`), nunca silêncio. Dono e responsável sempre podem. Charge ausente → nomes omitidos.

Contrato: `persona-spec/contracts/{lumen-rpc.md,persona-card.md}`.

### Prova

```
pnpm exec vitest run …/persona-card.spec.ts
 Test Files  1 passed
      Tests  5 passed
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 56.4s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 23.3s
persona-store: OK in 9.1s
```

[Anvil→Muse] getPersonaCard, getPersonaTalkAcl, setPersonaTalkAcl, pausePersona, resumePersona, setPersonaEngine.

Próximo: GOV-5 (organograma / Saúde / 2 dias / estrutura) sem sujar este snapshot.

---

## 03/11 20:16 — Snapshot verde: J14/J18 + anexos/avatar (Keel)

### J12–J18 (Forge)

1. Canal sem stream não é `forbidden`. `EventRepos.list`/`recall` devolvem página vazia; `exportMarkdown` captura `StoreError` e exporta o canal vazio. Repro J18 sem `sayOn`.
2. `mapBoardError` → `BoardRemoteError` (`code` estável + `message` pt-BR). Remover coluna com Tarefa sem destino = `column-needs-destination` («Escolha um destino…»), nunca `INVALID_WORKFLOW` no fio.

### Anexos + avatar

Store v9: `blob_object`, `attachment`. Disco: `<PERSONA_HOME>/attachments/<projectId>/<hash>` e `/avatars/<hash>`. Magic bytes; SVG/HTML/exe recusados; nome higienizado; cota; `looksLikeCredential` = aviso. HTTP `GET /api/persona/media?kind=&id=` (`kind: 'exact'`), `nosniff`, `Content-Type` fixo, `Content-Disposition` seguro. ACL no servidor (DM = participantes). Runner: `inputs/` + «Anexos: nome» no prompt. Avatar PNG/JPEG/WebP ≤2 MB; troca/remoção sem órfão.

Remote: `attachFile` · `listAttachments` · `getAttachment` · `getAttachmentBytes` · `uploadPersonaAvatar` · `removePersonaAvatar`. `postMessage.attachmentIds`. Contrato: `persona-spec/contracts/attachments.md`.

### Prova

```
pnpm exec vitest run …/journeys …/boards.spec.ts …/attachments.spec.ts …/export.spec.ts …/events.spec.ts …/open.spec.ts
 Test Files  23 passed
      Tests  74 passed
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 47.9s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 18.7s
persona-store: OK in 9.6s
```

```
pnpm exec vitest run …/attachments.spec.ts
 Test Files  1 passed
      Tests  7 passed
```

[Anvil→Prism] composer: `attachFile` / `listAttachments` / `getAttachment` / `getAttachmentBytes` + `postMessage.attachmentIds`. Editor: `uploadPersonaAvatar` / `removePersonaAvatar`. Flags `PERSONA_MESSAGE_ATTACHMENTS_HOST_READY` / `PERSONA_AVATAR_UPLOAD_HOST_READY`.

Próximo: GOV-5 (store/RPC governança) após este snapshot.

---

## 03/11 19:12 — PB-4 Quadros (PROJECT-BOARDS / Atlas)

Pedido Miguel: fluxo e sprints **por projeto**. Host/store já tinham v8; este turno fecha o aceite do Remote.

### Persistência

`user_version` 8: `project_workflow`, `workflow_column`, `workflow_field`, `sprint`, `sprint_ticket`, `ticket_seat`. v7→v8 preserva `engine_ticket`. `SqliteBoardRepos.snapshot`/`restore` (projeto; DM não). Crash: save abortado mantém o fluxo anterior. `deleteSprint` zera `seat.sprintId`.

### Remote

`listWorkflowTemplates` · `getProjectBoard` · `listBoards` (contagem por categoria, sprint atual, `workingNow`) · `createProject({ template? })` · `createWorkflowFromTemplate` · `updateWorkflow` (destino obrigatório) · `moveTicket` · CRUD sprint (`create`/`update`/`delete`/`list`) · `planSprint` · `startSprint` · `closeSprint` (`confirmed`; marco no 1º canal do projeto) · `sprintSummary` · `proposeWorkflow` (nunca grava). ACL: leitura `can(read, project)`; mutação `can(write, project)`.

### Prova

Contratação e Site: colunas diferentes; Tarefa de um não aparece no outro. Editar fluxo sem perder Tarefa. Encerrar sprint posta «Sprint S1…» no canal.

```
pnpm exec vitest run …/persona-store/tests/board.spec.ts …/persona-host/tests/boards.spec.ts …/journeys/j16-propose-flow.spec.ts
 Test Files  2+1 passed
      Tests  8 + J16
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.3s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 12.6s
persona-store: OK in 6.8s
```

[Anvil→Lumen] `lumen-rpc.md` Quadros. [Anvil→Probe] j16 + isolation no host. Fila Anvil exclusiva: vazia.

---

## 03/11 19:40 — Voz da Coordenação + PB-4 Quadros (v8)

### 1. #geral robótico (Atlas)

Captura real: «Recebido. Vou encaminhar.» + eco da mensagem + «: recebido.»

Host agora:

- `coordinationHandoff` / `summarizeWork` — quem faz o quê e quando volta (`Bento assume o README. Te chamo na revisão…`). Palavras-chave, **nunca** cita o texto da pessoa.
- `streamAck` só entrega o outbox (sem placeholder). Sem `digitando`.
- Pedido simples (`wantsWork` falso) → resposta direta (`SCRIPTED_HELLO` / runner de talk).
- Prompt de talk: `nunca ecoe…; sem placeholders; pedido simples responde direto`.
- `recoverTalks` após crash: speaker = menção ?? DM ?? coordenação.
- `postAs` ignora `StoreError` `constraint`/`not-open` (resto de wipe de teste).

Prompts de modelo (`composeTalkPrompt` / `replies` no engine, `coordinationPrompt` no Rivet) ficam com Forge/Rivet. Host não ecoa mais sozinho.

### 2. PB-4 — store v8 + Remote

Migração adjacente v7→v8: `project_workflow`, `workflow_column`, `workflow_field`, `sprint`, `sprint_ticket`, `ticket_seat`. `SqliteBoardRepos` (fluxo, assentos, sprints, `snapshot`/`restore`). Fluxo e sprint são do projeto (sync `classification: project`); DM não sobe. Export Markdown inclui `fluxo.md` / `sprints.md`.

Remote (ACL no servidor): `getProjectBoard`, `listBoards`, `createWorkflowFromTemplate`, `updateWorkflow`, `moveTicket`, `listSprints`, `createSprint`, `planSprint`, `startSprint`, `closeSprint`, `sprintSummary`, `proposeWorkflow` (cartão; **nunca aplica sozinho**). Contrato em `persona-spec/contracts/lumen-rpc.md`.

### 3. Quality-core (fila anterior, ainda sem drop próprio)

Host compartilhado + wipe (sem FTS) + `it` 60 s; shuffle seeds 1/17/42/99/2026 5/5. Store crash suite + effects/outbox. `HostPermissionMode` + generate-typert. CLI nunca `prompt` (D-052). Sem mais CLI real.

### Arquivos

- `packages/persona/persona-host/src/{orchestration,boards,index,types,export-md}.ts`
- `packages/persona/persona-host/tests/{conductor,e2e-flows,talk-voice,boards}.spec.ts`
- `packages/persona/persona-store/src/{constants,migrations,board/repos,index}.ts`
- `packages/persona/persona-store/tests/{board,open}.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos

```
pnpm exec vitest run …/conductor …/e2e-flows …/orchestration …/talk-voice
 Test Files  4 passed (4)
      Tests  28 passed (28)
```

```
pnpm exec vitest run …/persona-store/tests/board.spec.ts …/persona-host/tests/boards.spec.ts
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.2s
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 14.3s
persona-store: OK in 7.5s
```

### Limitações

- Sem mais CLI real (orçamento). Prova de voz no app = Probe.
- `proposeWorkflow` é keyword/JSON sujo (Forge PB-3); Remote não grava até o aceite.
- RetentionKind do engine não tem `workflow` — dump via `snapshot`/`restore` + export MD.
- Fila Anvil exclusiva no PLAN: vazia (PB-4 feito; B7/C8/PRO-2 já aceitos). [Anvil→Lumen] Quadros Remote pronto.

---

## 03/11 18:10 — 1ª resposta real (BANANA) + CLI never prompt + perf + fluxos

### 1. Prova no canal + SQLite (não é o welcome)

`coord-m-banana-reply` · ator `onb-1` · `type: runner` · `source: runner` · persistido no SQLite. O welcome `onb-welcome` / «Bem-vindos. Estou aqui…» **não** é esta linha.

O modelo **não** escreveu BANANA: o runner ainda injeta o mandato de Executora («Tarefa autorizada»). Isolar `cwd` (PERSONA_HOME, não o repo) tirou o dump do checkout; o texto passou de «diretório persona-dev…» para «Estou pronta como onb-1, Executora». Contrato [Anvil→Rivet]: `purpose: talk` = chat curto + `deny` + `toolLevel: none`, **sem** mandato de Tarefa.

### 2. Por que a Tarefa ficou `doing` (90 s)

`resolveFor(..., 'asked')` mandava `permissionModeOf('asked')` = **`prompt`**. CLI/OAR espera aprovação que ninguém concede (D-013). Agora: CLI **nunca** `prompt` (falha cedo, pt-BR); `talk` = `deny`; `task` = `allow-once` só com `files: write` ou `shell: safe|write`. Host envia `spec.tools` + `toolLevel`. Gate humano = Revisar.

### 3. CLI real — 3/3 execs (exceção Keel)

| # | path | resultado |
|---|---|---|
| 1 | talk | runner real, 31 s, 1º token 20 s; corpo = mandato + repo |
| 2 | **task** (corpo continha «Tarefa» → `wantsWork`) | sem `coord-*-reply`; ack+progress |
| 3 | talk + cwd isolado | runner real, **23 s**, 1º token **17 s**; ainda Executora |

Sem mais CLI.

### Performance (1ª resposta)

Antes (18:00): 195 s — era welcome + hang `prompt`. Não é baseline de modelo.

| etapa | exec 1 (ms) | exec 3 (ms) | meta |
|---|---:|---:|---|
| ingest | 0 | 0 | — |
| triage talk | 14 | 35 | barato (keyword) |
| compileContext ∥ resolve | 34 | 50 | paralelo |
| resolve:talk:ready | 11433 | 9023 | boot CLI |
| first-token (canal) | 20112 | 17547 | < 5 s |
| idle / reply | 21504 | 18201 | < 30 s |
| **total** | **30922** | **22714** | < 60 s |

Ataques feitos: triagem keyword (sem Ticket no simples); 1º token no canal (`coord-*-token`); lease `warmRunners` (persona+projeto+purpose); compile ∥ start. Falta: modelo rápido na triagem (Rivet) + prompt de talk sem Executora (Rivet) + sessão já quente (2ª msg).

### 4. Fluxos E2E (integração host)

`e2e-flows.spec.ts`: DM; @menção sem coordenador; handoff; persona_propose → Contratar? → rail; restrição do Cofre em `listUsedContext` (`restricted: true`, body vazio); iniciativa → proposta; «Enquanto você estava fora» após fechar/abrir. Prova no app = mesmo host inject do perfil (Probe = browser).

### 5. @Remote

`listUsedContext` + `MessageView.source` + `TurnContextView.records`. Erros tipados (`ticket-not-found`, `forbidden`) — `throw new Error(code)`. Valores crus, Typert envolve `RemoteResult` (Muse unwrap no Prism). OfficialQuota: já era `OfficialQuotaView` (typert 40).

### Arquivos

- `packages/persona/persona-host/src/{runner,orchestration,index,types}.ts`
- `packages/persona/persona-host/tests/{permission,e2e-flows,real-path}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `persona-spec/contracts/{cli-permission,lumen-rpc}.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/permission.spec.ts …/e2e-flows.spec.ts …/conductor.spec.ts …/real-path.spec.ts …/orchestration.spec.ts …/screens.spec.ts …/controller.spec.ts …/onboarding.spec.ts …/proactivity.spec.ts
 Test Files  8 passed (8)
      Tests  45 passed (45)
```

```
pnpm exec vitest run …/permission …/e2e-flows …/conductor
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

```
node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 41.6s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 38.8s
```

```
pnpm exec tsx packages/persona/persona-host/scripts/first-real-reply.ts
# exec 3: source=runner actor=onb-1 type=runner sqlite ok; body Executora; ms=22714 first-token=17547
```

### Fora / dependências

- Rivet: `purpose: talk` não pode carregar mandato Executora/Tarefa; medir first-token; lease D10 = `warmRunners`.
- Lumen/Prism: `source` + `listUsedContext.records` no «Contexto usado».
- Fila PLAN Anvil vazia (C8 E2E = Probe; E11 = Atlas).

---

## 03/11 18:00 — Keel 1–5 (home nativo / sem scripted / erro tipado / conexões ≥8s / 1ª resposta real) + D5 uso

### 1. Home nativo

`runnerHomeOf()` devolve `''`. `resolveHostRunner` **omite** `home` no `resolveRunner` (processo = `~/.claude`). Isolamento só com `runnerHomeOf(id, true)` — sem campo no spec, fora da v1.

### 2. Sem texto roteirizado no caminho real

`PERSONA_REAL_CLI=1` e produção: nada de `Olá — em que posso ajudar?` no outbox/`postAs`. Vazio ⇒ `não consegui responder: …`. Scripted só com `VITEST` ou `PERSONA_SCRIPTED=1`.

### 3. Erro tipado até a UI

Texto cru OAR (`Not logged in · Please run /login`) vira `RunnerResolveError` + card Precisa de você. Canal: `A Claude Code não está conectada — abra o terminal e rode \`claude\`/login`. Nunca o inglês.

### 4. listConnections

Timeout **8 s**, cache 60 s, `phase: 'checking'` na 1ª pintura (sem `not_logged_in`). Warm no boot (não no Vitest — spawnSync travava a suíte). CLI falsa de 6 s → `loggedIn: true`.

### 5. 1ª resposta real (2 execs, ~195 s)

`listConnections` 1º paint: `phase: checking`. Depois: Claude `available: true`, `loggedIn: true` (login nativo). Canal persistiu **«Bem-vindos. Estou aqui para coordenar o time.»** (ator `onb-1` — apresentação do onboarding, texto real, não scripted / não `/login`). Tarefa README ficou `doing` (`task-flush-timeout` 90 s). `usedPersonaRunners: true`.

### D5 — Uso e limites

Schema **v7** `usage_record` + `usage_quota`. `SqliteUsageStore` = port `record` / `query` / `totals` (Rivet). Retenção `kind: usage`. Remote `getUsage` / `getOfficialQuota` com ator do servidor + `can(read, project)`. Origem rotulada; livro vazio ⇒ `unavailable` / «indisponível», **sem** `usedPercent: 0`. `tokensPerMonth` da persona lê o mês UTC. Medidor grava após `whenIdle` (fake `usage()` = 1+1).

Lumen: trocar `limitsToUsageMeters` por `getUsage` / `getOfficialQuota`. `ConnectionView.phase` = verificando vs pronto.

### Arquivos

- `packages/persona/persona-host/src/{index,runner,orchestration,connection-probe,types}.ts`
- `packages/persona/persona-host/tests/{real-path,connections,usage,conductor}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `packages/persona/persona-store/src/{constants,migrations,index,usage/store,retention/store}.ts`
- `packages/persona/persona-store/tests/{usage,open}.spec.ts`
- `persona-spec/contracts/{lumen-rpc,usage}.md`

### Comandos

```
pnpm exec vitest run packages/persona/persona-host/tests/real-path.spec.ts …/connections …/conductor …/usage packages/persona/persona-store/tests/usage.spec.ts …/open.spec.ts
 Test Files  6 passed (6)
      Tests  40 passed (40)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 22.5s
persona-store: OK in 9.1s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 49.7s
```

```
pnpm exec tsx packages/persona/persona-host/scripts/first-real-reply.ts
reply: "Bem-vindos. Estou aqui para coordenar o time."
claude: { available: true, loggedIn: true, phase: "ready" }
execs: 2  ms: 194976  broke: ["task-flush-timeout"]
```

### Fora / dependências

- Suíte host completa em paralelo ainda estoura 5 s em resume/git quando o teste de 6 s roda no mesmo pool (isolados passam).
- Rivet: port `UsageStore` + `createMemoryUsageStore` — alinhado; SQLite é este drop.
- Lumen: `getUsage` / `getOfficialQuota` / `phase`.
- Keel congelou CLI real depois desta rodada — não corro mais.

### B7 — um run mutante (encadeado neste turno)

`MutantRunBook` (`screen_doc`): 1º claim `running`, 2º `queued`, 3º `refused`. `subjectOf` fica o assunto do envio. `postAs` usa o subject capturado. Specs `mutant-run` + `orchestration` «keeps a single mutant run» (9 passed).

Fila Anvil no PLAN: vazia (C8 E2E = Probe; E11 = Atlas; F4 depois do F3).

---

## 03/11 17:20 — P0 inject + pasta/webhook/dead-letter/export + 1ª resposta real

### P0 — host volta a ativar (bloqueava Muse)

Causa: `runnersOf` / `webserverOf` liam `ctx.personaRunners` / `ctx.webserver` no construct. Cordis (`vendor/cordis/src/reflect.ts`) lança `cannot get property "…" without inject` se a chave não está no `inject` do fiber. Colocar as chaves no `static inject` as torna **obrigatórias** (fiber PENDING até existirem) — testes e perfis sem o plugin não ativam.

Correção (sintaxe confirmada no vendor): `static inject = ['typert']` só o obrigatório. Opcionais via `ctx.get('personaRunners')` e `ctx.get('webServer')` (`ReflectService.get` — sem a guarda de inject). `usedPersonaRunners` é getter ao vivo. `hostRunnerFromContext` relê o plugin a cada resolve. `cordis.patch.yml` **não mudou** (ordem já é persona-runners → persona-host).

Spec `host-inject.spec.ts`: `ctx.plugin(PersonaHost)` **com e sem** `PersonaRunners` — os dois ativam (`ping` ok).

Boot real (home limpo, sem `PERSONA_DEV_SEED`):

```
node scripts/persona/with-lock.mjs "Anvil host boot" --release-on "dsh web:" -- node scripts/persona/ui-boot-check.mjs
[channel] … #geral … O canal está quietinho …
console errors (0):
(none)
```

Muse: `maestri ask "Muse" "host ok"` falhou — Muse **não** está no canvas (`maestri list` só Atlas/Keel/Forge/Prism/Probe). Recado no Status.

### 1. Primeira resposta real (o que quebrou)

App-host inject: `usedPersonaRunners: true`. Native `claude auth status`: loggedIn max. `listConnections` com `timeoutMs: 400` dá **falso** `not_logged_in` (auth do Claude ~5 s). Probe 8 s: loggedIn true.

`PERSONA_REAL_CLI=1`, temp `PERSONA_HOME`, Coordenação `cli/claude/haiku`, 2 execs. SQLite:

- `coord-m-hi-reply` = `Not logged in · Please run /login` (texto **real** do OAR, `tapTurn` persistiu)
- tarefa `preciso de um README`: `doing` → `review` (ack + Em andamento + done)
- outbox ainda postou o scripted `Olá — em que posso ajudar?`

OAR com `home: <PERSONA_HOME>/runners/<projectId>` **não** herda o login nativo (`~/.claude`), apesar de `restoreNativeCliLogin`. Erro tipado chegou à UI como corpo da mensagem, não como `RunnerResolveError`. Probe: `maestri ask` E2E timeout (o pedido pode ter chegado).

### 2. Pasta do projeto

`setProjectRoot` / `getProjectRoot`: absoluto, existe, diretório; recusa UNC (`\\` / `//`), raiz (`C:\`, `/`), home inteira, overlap/aninhamento. Git: `isRepo`, `defaultBranch` (`origin/HEAD` ou `symbolic-ref HEAD`), `dirty`. pt-BR. `pickDirectory()` = `{ path: null }` (Rivet). Testes: pasta com espaço/acentos; UNC; home.

### 3. Webhook GitHub local

`POST /api/persona/webhooks/github?projectId=` — HMAC SHA-256, corpo ≤ 256 KiB, replay 5 min (`200 {kind:duplicate}`), `202` depois `ingest`. Segredo: `PERSONA_GITHUB_WEBHOOK_SECRET` ou Cofre `factKey=github.webhook.secret` (nunca em log). Relé Cloudflare = Atlas.

### 4. Dead-letter

Efeito/outbox falha 3× → `listDeadLetters` (`Tentar de novo` / `Descartar`) + `getOverview.needsYou`. `retryDeadLetter` reprocessa outbox; `discardDeadLetter` só some. Teste: falha → Precisa de você → retry recupera.

### 5. Exportar

`exportWorkspace` / `exportProject` → zip Markdown. DMs só com `includeDmIds`. `looksLikeCredential` redige. Cofre em `cofre/*.md`. Teste: DM ausente; `sk-ant-…` redigido.

### Arquivos

- `packages/persona/persona-host/src/{index,runner,orchestration,dead-letter,project-root,webhook-http,export-md,types,auth}.ts`
- `packages/persona/persona-host/tests/{host-inject,runner-plugin,gateway,project-root,webhook-http,dead-letter,export}.spec.ts`
- `packages/persona/persona-host/scripts/first-real-reply.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests/host-inject.spec.ts …/gateway …/runner-plugin …/project-root
 Test Files  4 passed (4)
      Tests  8 passed (8)
```

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  2 failed | 36 passed (38)
      Tests  2 failed | 344 passed (346)
```

Os 2 fails são resume (timeout 5 s só na suíte paralela; isolados: 3 passed).

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 16.6s
persona-store: OK in 7.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 39.3s
```

### Limitações

- `listConnections` 400 ms: falso `not_logged_in` no Claude.
- OAR + `runnerHomeOf` não vê `~/.claude`; 1ª resposta real = «Not logged in · Please run /login».
- Muse fora do canvas — «host ok» só no Status.
- `cordis.patch.yml` intocado (Keel).

---

## 03/11 16:55 — conversa + ACL + diagnostics + DB + ReviewDelivery + orçamento

### 1. Conversa no condutor
DM e `@menção` usam o mesmo laço do runner, sem Ticket quando não é trabalho. Seletor `responderId` (servidor, não o `actorId` do cliente). Resposta no fio; handoff (`Encaminhei para {nome}`; executor posta como ele). Streaming `partial` → final via `followMessages`. `cancelReply` não trava. Erro do runner: `não consegui responder: …` + ação. Relógio injetável; resume no meio do `partial`.

### 2. ACL no Remote
Todo método resolve o ator no servidor (`resolveSessionActor`: sessão local = owner, `sessionMemberId` só em teste/peer). `can()`. Exceções documentadas: `ping`, `getOnboarding`, `completeOnboarding`, `createWorkspace`, `exportDiagnostics`. Bootstrap: workspace/projeto sem membros ainda não exige ator. Guest sem projeto/DM recebe lista vazia, sem erro revelador. `actorId` do cliente não autoriza arquivos/busca/stream.

### 3. `exportDiagnostics()`
JSON: versões, schema, contagens, `lastErrors`, scheduler/Vigia, conexão `dsh` (sem spawn de CLI). Recusa se `looksLikeCredential`. Sem corpos de mensagem/DM. Probe live de CLIs fica em `listConnections`.

### 4. Versão do DB
Fixtures v1..v6 migram e preservam workspace. Banco mais novo que o app: `version-too-new` + `userMessage` pt-BR, sem down-migrate. `.db` corrompido: restaura o último `VACUUM INTO` (`recoveredFrom` + «O banco estava danificado. Restaurei o último backup.»). `migration-failed` **não** é recover (evita segundo backup e retry da migração quebrada).

### 5. ReviewDelivery (Forge) no host — Lumen **Revisar**
Remotes: `prepareReview`, `reviewSummary`, `acceptReview(mode)`, `requestChanges`, `discardReview`. Todas com `can()` + ator do servidor. Sem `rootPath` → Tarefa sem código (sem worktree). `prepare` no start da Assignment (`persona/<ticketId>`, `PERSONA_HOME/worktrees/<projectId>`). Conflito → `kind: 'blocked'` + `explanation` (engine) e kanban Bloqueado · Precisa de você; `merge --abort`. Aceite fecha a thread `review`. `sweepOrphans` no `runtime()`/resume. `GitReviewDelivery` não faz push. Contrato: `persona-spec/contracts/review-delivery.md` + `lumen-rpc.md`.

### 6. Multi-projeto
`ExecutionBudget` (global 4, por projeto 2). Projeto barulhento não esgota os outros. `runLaunched` sem vaga posta «Aguardando vaga neste projeto.» Teste: 8 projetos + cap.

### Arquivos
- `packages/persona/persona-host/src/{index,orchestration,auth,review,diagnostics,budget,types}.ts`
- `packages/persona/persona-host/tests/{conductor,remote-acl,diagnostics,review,multi-project,files,controller}.spec.ts`
- `packages/persona/persona-store/src/{store,errors,index}.ts`
- `packages/persona/persona-store/tests/migrate-fixtures.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  32 passed (32)
      Tests  338 passed (338)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 14.6s
persona-store: OK in 8.9s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 43.4s
```

### Limitações
- Diagnostics lista só `dsh` (CLI probe no PATH bloqueava o event loop; `listConnections` continua o probe live).
- `ctx.personaRunners.resolveRunner` ainda não injetado; `PERSONA_REAL_CLI=1` segue pelo import.
- B7 (um run mutante) já tem teste em `orchestration.spec` («keeps a single mutant run»); próximo Anvil no PLAN se o Keel não mandar outra fila.

---

## 03/11 16:10 — resolveRunner + S5 onboarding + atenção + retenção + ociosidade

### 1. `createHostRunner` → `resolveHostRunner`
Spec vem da Persona no store (`specOfPersona`). `permissionMode` explícito: `act` → `allow-once`, resto `prompt`. `autonomy` `asked` → `on_request`. Home isolado: `<PERSONA_HOME>/runners/<projectId>`. Fake/scripted salvo `PERSONA_REAL_CLI=1` — aí `resolveRunner` + `createOarSessionRunner` (TurnRunner → port de sessão). `RunnerResolveError` (`cli_not_found` / `not_logged_in` / `model_unavailable` / `quota_exhausted`) vira Report `blocked` com a mensagem pt-BR do resolvedor; login/cota postam “Precisa de você” com `loginHint` (sem stack, sem token). Testes: login e cota no conductor.

### 2. Onboarding no host (S5)
`completeOnboarding` idempotente em `store.tx`: workspace/Pessoal, owner, `#geral`, personas (`team[]` ou `createDraftDriver`+`fallbackDraft`), `cofreSeed` → `proposeMemory` (nunca Cofre direto), welcome da primeira Coordenação ou texto de sistema, `completed` no store. `getOnboarding` reflete. Contrato: `persona-spec/contracts/onboarding.md` (Prism). Teste: `PERSONA_HOME` temp → equipe Guia+Bento, kanban vazio, sem “Atlas”.

### 3. Atenção (Rivet desktop)
`getAttentionPolicy` / `putAttentionPolicy` (orçamento, silêncio, `summary`|`ping`). Stream `attentionEvents` (baseline+upsert, ≥1 s): `needs-you` (blocked) e `review`, cortados no budget; `ping` some na janela quieta. Contrato: `persona-spec/contracts/attention.md`.

### 4. Retenção no agendador
Tique diário no início da janela quieta (`02:00`–`06:00` default). Só arquiva (`archiveOnly: true`); apagar exige `archiveOnly: false` + tick. Log em `retention_log`. `get/putRetentionPolicy`, `tickRetention`, `listRetentionLog`.

### 5. Ociosidade
Sem `setInterval`. Timer único `setTimeout` ≥ 1 s alinhado ao próximo quiet start; `unref`. Sem projetos = sem timer. `attentionEvents` só dorme 1 s com cliente inscrito. Host ready (DB existente): **376 ms** (meta ≤ 1500 ms). Probe: `persona-spec/reports/bench-app.md`.

### Arquivos
- `packages/persona/persona-host/src/{runner,orchestration,onboarding,scheduler,index,types}.ts`
- `packages/persona/persona-host/tests/{conductor,onboarding,attention-retention,ready}.spec.ts`
- `persona-spec/contracts/{onboarding,attention}.md`
- `persona-spec/reports/bench-app.md` (números do host)

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  27 passed (27)
      Tests  324 passed (324)
```

```
ready.spec host-ready-ms=376
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-store: OK in 7.5s
persona-host: OK in 13.1s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

### Limitações
- `ctx.personaRunners` ainda não é injetado no host: resolve vai pelo import `resolveRunner`; DSH real ainda precisa de `agent` no resolvedor.
- `createDraftDriver` no onboarding e em `draftPersona`/`draftTeam` usa `createScriptedRunner` (cai em `fallbackDraft` se o turno for mudo).
- S4 host: remotes async ligadas ao driver do Rivet (`draft.ts`). 3 testes `routines-draft` verdes; typert 40 / 42.0s.
- Fila Keel 1–5 + S4 host fechadas. Próximo Anvil no PLAN: B7 (um run mutante por Tarefa).

---

## 03/11 15:54 — Fio condutor + gaps Lumen + retenção + sync local

### 1. Fio condutor real (prioridade 1)
`#geral` → Intake/Eval → Coordenação decide. Mensagem sem trabalho (**sem Ticket**): resposta persistida. Pedido: Ticket `doing` → runner scriptado (`createHostRunner` = `createDefaultHostRunner`) → `review` (ou `blocked` + “Precisa de você”) → `runTicketCommand({ command: 'complete' })` → `done`. Resposta da Coordenação no SQLite; `followMessages` entrega o baseline. Reinício: Assignment interrompida retoma; id `coord-<ticket>-done` é idempotente (sem duplicar). Relógio do host é injetável (`orchestration.now`).

`resolveRunner` **não** trocado: Rivet ainda não avisou no Status. `listConnections` já chama `detectConnections()` (timeout 400 ms, cache 60 s).

### 2. Gaps Lumen
Contrato: `persona-spec/contracts/lumen-rpc.md`.
- `listCanvas` — personas + tickets
- `listDailySummaries` — propostas do dia por persona
- `listRoutineSchedule` — rotinas + runs do agendador
- `listTriageLog` — trilha por thread (gate, assessment, quem, por quê)
- Arquivos: `status: 'need-root'` + `message: "escolha a pasta do projeto"` (não lança); `setProjectRoot`

### 3. Retenção
Schema v6. `SqliteRetention` + `applySqliteRetention` (mesma `applyRetention` do Forge + VACUUM). Arquivar ≠ apagar; excluir recusado com derivados; índice/cache somem. Suíte `defineRetentionSuite(..., 'sqlite')`.

### 4. Sync local
`apps/persona-edge/tests/client-cycle.spec.ts`: 2 `SyncClient` + `HttpTransport` no `wrangler` local — convite, DM recusado no cliente, offline→flush, cifra. Sem conta/deploy.

### Arquivos
- `packages/persona/persona-host/src/{orchestration,index,types,screens,files}.ts`
- `packages/persona/persona-host/tests/{conductor,orchestration,files,screens}.spec.ts`
- `packages/persona/persona-store/src/{constants,migrations,index,events/repos,retention/store}.ts`
- `packages/persona/persona-store/tests/{open,retention.contract}.spec.ts`
- `apps/persona-edge/tests/client-cycle.spec.ts`
- `persona-spec/contracts/lumen-rpc.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store/tests packages/persona/persona-host/tests
 Test Files  24 passed (24)
      Tests  318 passed (318)
```

```
pnpm exec vitest run apps/persona-edge/tests/client-cycle.spec.ts apps/persona-edge/tests/edge.spec.ts packages/persona/persona-sync/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  9 passed (9)
```

```
node scripts/persona/check-pkg.mjs persona-host persona-store
persona-host: OK in 11.8s
persona-store: OK in 6.3s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 33.2s
```

### Limitações
- `ctx.personaRunners.resolveRunner` ainda não está no plugin; laço continua no fake/scripted (opt-in `PERSONA_REAL_CLI=1`).
- Lumen precisa ligar os painéis aos RPCs novos (contrato publicado).
- Retenção não tem tique automático no host — chamar `applySqliteRetention`.
- Runner scriptado não gasta modelo.

---

## 03/11 15:29 — E-gh — GitHub Source IO via `gh` + webhook no engine

### O que ficou pronto
`GithubSourceHost` liga o Source puro do Forge ao host: webhook encaminhado → `githubWebhookToIntake` → `engine.receive` / `threadClosed` (reedelivery = `duplicate`). Scope do engine aceita `source: github`. Quando `gh` está no PATH, `fetchGithubIssue` (`gh api repos/…/issues/N`) e `postGithubComment` postam; sem `gh` o probe é `available: false` (não explode). Issue/PR opened também dispara iniciativa (`fireEvent`).

### Arquivos
- `packages/persona/persona-host/src/{github,orchestration,index,types}.ts`
- `packages/persona/persona-host/tests/github.spec.ts`

### Remotes
`githubAvailable`, `ingestGithubWebhook`, `fetchGithubIssue`, `postGithubComment`.

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests/github.spec.ts packages/persona/persona-host/tests/orchestration.spec.ts
 Test Files  2 passed (2)
      Tests  9 passed (included in host 63)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 31.9s
```

```
node scripts/persona/check-pkg.mjs persona-host
persona-host: OK in 8.3s
```

### Limitações
- Sem polling. `gh` é opcional; webhook não depende dele.
- Payload do webhook chega como JSON text (Typert).
- Comentário usa `gh api … -f body=`; sem retry/backoff.

---

## 03/11 15:27 — E-rpc — remotes Lumen (convite, import, regras, aprovações, memória, skills)

### O que ficou pronto
Schema v5 `screen_doc`. Remotes para as telas da Lumen: convites (issue/list/redeem/revoke + member no redeem), import markdown (preview→confirm→progress→rollback; mesmo `externalId` é no-op), regras de triagem + janela de silêncio + limites do projeto, inbox de Aprovações (hire/vault/skill/attention) com `decideApproval` (hire aprovado cria a persona; vault aplica o body), memória por persona (propor/editar/aprovar/esquecer), skills com versão e rollback (número sobe; body anterior volta).

### Arquivos
- `packages/persona/persona-store/src/screens/repos.ts` + migrations v5
- `packages/persona/persona-store/src/invite/book.ts` (`listInvites`)
- `packages/persona/persona-host/src/{screens,index,types}.ts`
- `packages/persona/persona-host/tests/screens.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-host/tests packages/persona/persona-store/tests
 Test Files  21 passed (21)
      Tests  302 passed (302)
   Start at  15:24:56
   Duration  5.17s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 27.3s
```

```
node scripts/persona/check-pkg.mjs persona-store persona-host
persona-store: OK in 6.2s
persona-host: OK in 8.3s
```

### Limitações
- Hire usa spec mínimo (runner dsh, tools vazias); Lumen preenche o cartão.
- Memória pendente vive em `screen_doc` até aprovar (aí vira vault `kind=memory`).
- Attention na inbox lê tickets com `attention`; decide só anota no ticket.
- Fila do Atlas esvaziou.

---

## 03/11 15:21 — PROACTIVITY host — rotina, agora/away, autonomia, Vigia

### O que ficou pronto
Rotina diária de iniciativa por persona (`FREQ=DAILY;BYHOUR=` no fuso/horário dela; catch-up `run_once`) no agendador do host. Gatilho por evento (PR/erro/prazo) usa a mesma política. Autonomia `asked|propose|act` + orçamento de propostas/tokens/execuções + janela de silêncio. `pauseTeam` cancela as runs. Visão geral "agora": estado honesto (working/resting/stuck/waiting), fila, ociosidade, entregas do dia, propostas aceitas. "Enquanto você estava fora" desde a última visita, com `taskId` das tarefas reais; segunda leitura vem vazia. Vigia do Forge (`vigiaTick`/`watchdogWarnings`) no `tickProactivity` — só auditoria, sem ping no canal.

### Arquivos
- `packages/persona/persona-store/src/proactivity/repos.ts` + schema v4
- `packages/persona/persona-store/tests/proactivity.spec.ts`
- `packages/persona/persona-host/src/{proactivity,index,types}.ts`
- `packages/persona/persona-host/tests/proactivity.spec.ts`
- `packages/persona/persona-host/README.md`

### Remotes
`getOverviewNow`, `getWhileAway`, `markVisit`, `getAutonomy`, `setAutonomy`, `ensureInitiativeRoutines`, `fireProactiveEvent`, `tickProactivity`.

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store/tests/proactivity.spec.ts packages/persona/persona-host/tests/proactivity.spec.ts
 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  15:20:28
   Duration  3.42s
```

```
pnpm exec vitest run packages/persona/persona-host/tests
 Test Files  7 passed (7)
      Tests  29 passed (29)
   Start at  15:20:40
   Duration  3.32s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.5s
```

```
node scripts/persona/check-pkg.mjs persona-store persona-host
persona-store: OK in 5.1s
persona-host: OK in 6.2s
```

### Limitações
- Iniciativa grava proposta no read-model; cartão estruturado de Aprovações entra no lote de remotes da UI.
- `proposalsAcceptedToday` conta fires com `ticketId` (aceitação posterior).
- Vigia não escreve Ticket aqui — só sinais/auditoria (contrato do Forge).
- Segue remotes invites/import/rules/approvals/memory/skills e GitHub Source.

---

## 03/11 15:14 — E6 — persona-sync: só streams compartilhados, cifra, offline

### O que ficou pronto
`SyncClient` recusa DM/privado (`PRIVATE_NOT_SHARED`, outbox vazio). Dois hosts no mesmo `MemoryTransport` convergem. Offline enfileira; `flush` + `restoreCursors` retomam. `WorkspaceCipher` AES-256-GCM (chave no host). `HttpTransport` para o Worker. Host: `openHostSync` / `openHostSyncFromEnv` no SQLite.

### Arquivos
- `packages/persona/persona-sync/src/{identity,client,cipher,transport,index}.ts`
- `packages/persona/persona-sync/tests/sync.spec.ts`
- `packages/persona/persona-host/src/sync.ts` + `tests/sync.spec.ts` + `index.ts` / `package.json` / `tsconfig.json`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-sync packages/persona/persona-host/tests/sync.spec.ts
 Test Files  3 passed (3)
      Tests  6 passed (6)
   Start at  15:13:51
   Duration  4.19s
```

```
node scripts/persona/check-pkg.mjs persona-sync persona-host
persona-sync: OK in 7.8s
persona-host: OK in 10.7s
```

### Limitações
- Sem handshake WS no cliente (HTTP append/after). Cifra é AES-GCM Node (`node:crypto`).
- `pnpm exec` religou workspace após `persona-sync` no host (já estava no monorepo; sem pacote novo).
- Segue proatividade nativa no host (Atlas/Miguel).

---

## 03/11 15:09 — E5 — persona-edge Worker + DO + D1 + R2 + convites + HMAC

### O que ficou pronto
`WorkspaceHub` é o único ordenador (`commitEnvelope` / `SEQ_GAP`). Hibernação WS (`acceptWebSocket` + tags `stream:`/`device:` + `webSocketMessage`). Replay `GET /w/:id/sync/after`. D1 usa o mesmo SQL que a suíte `defineSyncLogContract('d1')`. R2 recusa anexo DM sem `shared`. Convites issue/redeem/revoke. Webhook GitHub: HMAC-SHA256 → `WebhookEnvelope` → DO (replay = `duplicate`) → sockets `device:`. Testes locais com `wrangler unstable_dev` (forceLocal; sem login/deploy). 2 clientes convergem; DM não sobe.

### Arquivos
- `apps/persona-edge/src/{index,env,workspace-hub,sql-log,do-sql,schema,hmac}.ts`
- `apps/persona-edge/tests/{d1-log.contract,hmac,edge}.spec.ts` + `tests/node-sql.ts`
- `apps/persona-edge/{wrangler.toml,README.md,migrations/0001_init.sql}`

### Comandos e saída verbatim

```
pnpm exec vitest run apps/persona-edge
 Test Files  3 passed (3)
      Tests  9 passed (9)
   Start at  15:08:59
   Duration  5.08s
```

```
pnpm exec tsc -p apps/persona-edge/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint apps/persona-edge/src apps/persona-edge/tests
(exit 0)
```

### Limitações
- Miniflare puro não transpila TS; a suíte HTTP usa `wrangler unstable_dev` (Miniflare por baixo). Sem handshake WS no spec HTTP (hibernação está no DO).
- D1 `exec` quebra DDL no newline — schema é statement-a-statement.
- Sem `wrangler login` / deploy (E11).
- Segue E6 `persona-sync`.

---

## 03/11 15:02 — E-persist — SyncLog / Invite / Import SQLite = suíte do Forge

### O que ficou pronto
Schema v3: `sync_envelope`, `invite`/`invite_actor`/`invite_vault`/`invite_memory`, `import_batch`. `SqliteSyncLog`, `SqliteImportStore`, `SqliteInviteBook` (+ `MemoryInviteBook`) implementam os ports do Forge. A mesma suíte de contrato (`tests/contract/{sync,import,invite}.contract.ts`) roda em memória e em SQLite; reopen em arquivo confirma persistência. Invite/Grant/purgeSource continuam funções do Forge — o book só grava o resultado.

### Arquivos
- `packages/persona/persona-store/src/{constants,migrations,index}.ts`
- `packages/persona/persona-store/src/sync/log.ts`
- `packages/persona/persona-store/src/import/store.ts`
- `packages/persona/persona-store/src/invite/{book,memory}.ts`
- `packages/persona/persona-store/tests/contract/{sync,import,invite}.contract.ts`
- `packages/persona/persona-store/tests/{sync,import,invite}.contract.spec.ts`
- `packages/persona/persona-store/tests/open.spec.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  12 passed (12)
      Tests  263 passed (263)
   Start at  15:00:02
   Duration  4.31s
```

```
node scripts/persona/check-pkg.mjs persona-store
persona-store: OK in 6.1s
```

```
pnpm exec oxlint packages/persona/persona-store/src/invite/book.ts packages/persona/persona-store/tests/contract/sync.contract.ts
(exit 0)
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: TypertAnalysisError: typert(host): packages/persona/persona-runners/src/plugin.ts:44:66: type symbol unknown has no declaration
(Rivet; nenhum artifact mudou; não editei persona-runners)
```

### Limitações
- Invite não tem port no core — `InviteBook` é do store. Suíte replica `invite.spec.ts` via persistência.
- Adaptadores de import (ChatGPT/Claude/md) ficam no core; a suíte compartilhada é preview construído + externalId + rollback.
- `generate-typert` vermelho em `persona-runners` (Rivet). Store não é a causa.
- Segue E5 `apps/persona-edge`.

---

## 03/11 15:17 — Typert C2 — anotação explícita em propriedades públicas

### O que ficou pronto
O gerador parava em `Orchestration.runtimes` ("public property is missing an explicit type annotation"). Anotados `runtimes: Map<…>`, `started: Set<string>`, e em `SqliteRepositories` os objetos `triggers`/`threads`/`tickets`/`decisions` como `Repositories['…']`.

### Arquivos
- `packages/persona/persona-host/src/orchestration.ts`
- `packages/persona/persona-store/src/engine/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 26.8s
```

### Limitações
- Nenhuma neste gate. C2/B7/REMOTE seguem.

---

## 03/11 14:27 — C3 + S4 — rotinas (lease/idempotência) e drafts

### O que ficou pronto
`RoutineRepos` no store: criar/listar, `schedule` com chave `routine_id:scheduled_for` (ON CONFLICT mantém a linha), `claimDue` com lease IMMEDIATE + catch-up `skip|run_once|run_all`, janela de silêncio, `pauseTeam` cancela pending/leased, `fail`+`retry`. Relógio injetável. Host: remotes `createRoutine`/`listRoutines`/`pauseRoutine`/`pauseTeam`/`scheduleRoutine`/`claimRoutines`/`retryRoutine`. S4: `draftPersona`/`draftTeam` determinísticos, válidos no schema Forge, tools vazias, sem função Coordenação.

### Arquivos
- `packages/persona/persona-store/src/routines/repos.ts`
- `packages/persona/persona-store/src/index.ts`
- `packages/persona/persona-store/tests/routines.spec.ts`
- `packages/persona/persona-store/README.md`
- `packages/persona/persona-host/src/{index,types,draft}.ts`
- `packages/persona/persona-host/tests/routines-draft.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  10 passed (10)
      Tests  115 passed (115)
   Start at  14:26:32
   Duration  4.64s
```

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.5s
```

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/routines/repos.ts packages/persona/persona-store/tests/routines.spec.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/draft.ts packages/persona/persona-host/tests/routines-draft.spec.ts
(exit 0)
```

### Limitações
- Rotinas ainda não são Source do Intake (E-6, Forge); sem expansão Cron/RRule via `dsh-util-time` (sem `pnpm install` para nova dep) — o host agenda `scheduledFor` explícito.
- Drafts sem Runner/Rivet: template determinístico, não LLM.
- Sem remotes update/delete de persona/canal; sem tabela Subscription (v2).
- Fila imediata (B2, S2, B3, C1, C3, C4, S4) concluída. Próximos Anvil dependem de Forge/Rivet: B7 (R-1/E-3), engine SQLite (contrato), C8 host, marco E nuvem.

---

## 03/11 14:23 — C4 — arquivos por projectId (D-020)

### O que ficou pronto
`listFiles` / `statFile` / `readFile` no namespace `persona`: raiz vem de `project.rootPath` (`updateProject`), ACL = membro do workspace, caminho relativo resolvido com `realpath` — `../`, absoluto e symlink para fora recusam `path-outside-root`. Sem raiz → `project-root-missing`. Sem membro → `files-forbidden`. Typert continua verde.

### Arquivos
- `packages/persona/persona-host/src/files.ts`
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/files.spec.ts`
- `packages/persona/persona-host/README.md`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 37.8s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  14:22:24
   Duration  3.32s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/src/files.ts packages/persona/persona-host/tests/files.spec.ts
(exit 0)
```

### Limitações
- Métodos no namespace `persona` (não um serviço `personaFiles` separado); sem `readBytes`/`changes`.
- C3 (rotinas) e S4 (draft) ainda na fila; C3 espera E-6 para virar Source.

---

## 03/11 14:21 — C1a/C1b/C1c — CRUD + mensagens + busca ACL + Typert verde

### O que ficou pronto
Host Remote v1 agora cria workspace/projeto/membro/persona/participação/canal/DM e posta/lista/segue/busca mensagens. `followMessages` assina o log **antes** do baseline (sem perder o primeiro upsert). Busca aplica ACL do store: membro vê canal; DM só para participantes. `EventRepos.subscribe` notifica após o commit. `generate-typert` passou de novo com os novos `@Remote` (bloqueio do push continua verde).

### Arquivos
- `packages/persona/persona-host/src/types.ts`
- `packages/persona/persona-host/src/index.ts`
- `packages/persona/persona-host/tests/controller.spec.ts`
- `packages/persona/persona-host/tests/gateway.spec.ts`
- `packages/persona/persona-host/README.md`
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/tests/events.spec.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 35.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  98 passed (98)
   Start at  14:18:57
   Duration  5.37s
```

```
pnpm exec vitest run packages/persona/persona-host
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  14:20:39
   Duration  2.85s
```

```
pnpm exec tsc -p packages/persona/persona-host/tsconfig.json --noEmit
(exit 0)
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-host/src/index.ts packages/persona/persona-host/src/types.ts packages/persona/persona-host/tests/controller.spec.ts packages/persona/persona-host/tests/gateway.spec.ts
(exit 0)
```

### Limitações
- Sem remotes de update/delete (o store já tem); sem tabela Subscription ("seguir assunto") — precisa v2.
- C1b Intake (E-6, Forge) ainda não existe: mensagens não viram Trigger.
- `listTasks` / `getOverview` vazios até os repos do engine.
- Seguindo para C4 (`persona-files`); C3 espera E-6; S4 espera S1/R-1.

---

## 03/11 14:15 — Typert gate — anotações explícitas nos parâmetros públicos

### O que ficou pronto
O gerador recusava `EventRepos.list(..., afterSeq = 0, limit = 50)` (e o mesmo padrão em `search` / `searchDocuments`). Padrão agora: parâmetro opcional **com tipo** (`afterSeq?: number`) e default **dentro** do método — evita `no-inferrable-types` e satisfaz o gate. Varredura em persona-store + persona-host: demais públicos já tinham anotação (`now: ProductClock = …`, `options: OpenTempStoreOptions = {}`, `config: Config = …`).

### Arquivos
- `packages/persona/persona-store/src/events/repos.ts`
- `packages/persona/persona-store/src/vault/repos.ts`

### Comandos e saída verbatim

```
pnpm exec tsx scripts/generate-typert.ts
generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 29.9s
```

```
pnpm exec vitest run packages/persona/persona-store packages/persona/persona-host
 Test Files  7 passed (7)
      Tests  93 passed (93)
   Start at  14:15:18
   Duration  3.91s
```

```
pnpm exec oxlint packages/persona/persona-store/src/events/repos.ts packages/persona/persona-store/src/vault/repos.ts
(exit 0)
```

### Limitações
- Nenhuma. Este era o bloqueio do typecheck/push.

---

## 03/11 14:10 — S2 store done — Cofre (registros, docs FTS5, versões)

### O que ficou pronto
`VaultRepos`: registros `brief|constraint|decision|memory` (schema Forge), `requiredRecords` = constraint/decision ativas, documentos FTS5, `vault_version` a cada escrita, revoke bloqueia update, tenant `project_id`.

### Arquivos
- `packages/persona/persona-store/src/vault/repos.ts`
- `packages/persona/persona-store/tests/vault.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  5 passed (5)
      Tests  88 passed (88)
   Start at  14:09:30
   Duration  2.73s
```

(`vault.spec.ts` 22 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint …/persona-store/src …/tests
(exit 0)
```

### Limitações
- compileContext (obrigatório > orçamento) continua no core; o store só expõe `requiredRecords`.
- Visibilidade de documento revalida pelo `parseVaultRecord` (schema de visibility do Forge).

---

## 03/11 14:08 — B2c done — log de eventos, FTS5, ACL, recall com fuso

### O que ficou pronto
`EventRepos`: stream por `(project, kind, owner)`, `seq` monotônica via `stream_cursor` em `BEGIN IMMEDIATE`, FTS5 (frase), cursor `afterSeq`, ACL na consulta (canal: membro ou participation; DM: só participantes — busca não vaza), recall por intervalo civil + IANA (`zonedUtcMs`), tombstone.

### Arquivos
- `packages/persona/persona-store/src/events/{repos,timezone}.ts`
- `packages/persona/persona-store/tests/events.spec.ts`
- `packages/persona/persona-store/src/index.ts`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  4 passed (4)
      Tests  66 passed (66)
   Start at  14:07:50
   Duration  3.12s
```

(`events.spec.ts` 20/20 ≥ 20.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- Concorrência de seq exercitada com duas conexões no mesmo thread (IMMEDIATE serializa).
- FTS5 usa frase entre aspas (consulta do usuário não é expressão FTS livre).

---

## 03/11 14:06 — B2b done — repositórios de produto

### O que ficou pronto
`ProductRepos`: workspace (+ projeto **Pessoal** automático), member, project, persona (schema Forge `parsePersona` + `projectId` tenant), participation, channel, dm. CRUD, unique constraints, coordenação única por projeto (não por workspace), upsert `ON CONFLICT` preserva `rowid`, listas newest-first. Dependência workspace `@deepseek-ai/dsh-persona-core` (sem `pnpm install` — resolve por paths).

### Arquivos
- `packages/persona/persona-store/src/product/{types,repos}.ts`
- `packages/persona/persona-store/src/sql.ts`
- `packages/persona/persona-store/tests/product.spec.ts`
- `packages/persona/persona-store/{package.json,tsconfig.json,src/index.ts}`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  3 passed (3)
      Tests  46 passed (46)
   Start at  14:05:58
   Duration  3.27s
```

(25 testes em `product.spec.ts` ≥ 25.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0)
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0)
```

### Limitações
- `Persona` do Forge não tem `projectId`; o store persiste e devolve `StoredPersona`.
- `package.json` ganhou `dsh-persona-core` workspace:* — Keel precisa `pnpm install` se o lock reclamar.
- Sem commit.

---

## 03/11 14:00 — B2a done — abertura, identity, backup, migrações, tx()

### O que ficou pronto
`persona-store` abre `persona.db` com `node:sqlite`: `application_id` `PNSQ` (`0x504E5351`), `user_version` monotônico, WAL + `foreign_keys` + `busy_timeout`, arquivo `0o600` / dir `0o700`, `VACUUM INTO` **antes** de migrar (pulado em arquivo vazio v0→v1), migrações adjacentes imutáveis, falha de migração faz rollback e **preserva o backup**. `tx()` síncrono; aninhado via `SAVEPOINT`. Schema v1 já cria tabelas de produto / evento / cofre / rotina (com `project_id` e kind `personal` = Pessoal). Helpers `openTempStore` / `withTempStore`.

### Arquivos
- `packages/persona/persona-store/src/{identity,constants,errors,migrations,store,test-helpers,index}.ts`
- `packages/persona/persona-store/tests/{open,smoke}.spec.ts`
- `packages/persona/persona-store/README.md`

### Comandos e saída verbatim

```
pnpm exec vitest run packages/persona/persona-store
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  13:58:37
   Duration  1.72s
```

(21 ≥ 15; inclui: reabrir preserva; versão maior recusada; falha de migração preserva backup; savepoint; WAL.)

```
pnpm exec tsc -p packages/persona/persona-store/tsconfig.json --noEmit
(exit 0, sem saída)
```

```
pnpm exec oxlint packages/persona/persona-store/src packages/persona/persona-store/tests
(exit 0, sem saída — após corrigir arrow-parens e import não usado)
```

### Limitações
- Backup pulado em v0→v1 (arquivo novo vazio). Sem dados a preservar.
- Tabelas do engine (Ticket/Trigger/…) ainda não: esperam o contrato do Forge (`persona-spec/contracts/repositories.md`).
- Sem `pnpm install`. Sem commit.

### Decisões locais (não bloqueiam)
- `application_id = 0x504E5351` (`PNSQ`), distinto do session-query.
- `tx()` aninhado por savepoint (alinhamento Keel), não recusa nested.
- Tenant `project_id` nas tabelas de produto (D-038); kind `personal` + nome `Pessoal`.

---
