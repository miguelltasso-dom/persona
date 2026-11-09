# Jade — relato (pesquisa; Pi + equipe proativa)

**Status:** fila vazia desde 07/11 17:44. Missão do Atlas (pesquisa, sem código de produto) concluída; nada em voo, nenhum worktree/branch meu. Nada commitado; nenhuma IA real chamada.

## Entregas (07/11)

- `persona-spec/research/pi/INVENTARIO.md` — 74 itens do harness Pi/omp com `arquivo:linha`, veredito (10 PEGAR, 15 ADAPTAR, 49 IGNORAR) e o que a Persona já tem.
- `persona-spec/research/pi/TOP15.md` — as 15 coisas que valem trazer, ordenadas por valor ÷ custo, com o lugar onde cada uma cai na Persona.
- `persona-spec/research/pi/EQUIPE-PROATIVA.md` — 30 comportamentos de gente numa equipe (gatilho no host, ferramenta de equipe, teto/risco de chatice, teste que prova) + §2b (onde cada um já mora) + §3 orçamento de atenção + §4 lacunas do contrato `team-real` + §5 prioridade.

## Conferência de 09/11 (tree atual)

Símbolos citados na §2b conferidos no tree: todos existem. Três referências corrigidas no próprio documento — B7 (`teamToolsOf` é de `harness-turn.ts`, não `harness-team.ts`), B5 (`vigiaTick` em `watchdog.ts:121`; `nudge`/`escalate` em 156–159) e E1 (`brain-tools` é `persona-runners/src/mcp/brain-tools.ts`). As demais (`pull.ts:51`, `continue.ts:14/30`, `review-step.ts:55`, `handoff.ts:172/203`, `second-brain.ts:35/60`, `opinion-reply.ts:16`, `initiative-quality.ts:104`) conferem.

## Dependência para a v1.1 (registrada, não editada por mim)

Os 3 P0 da retomada de 09/11 são o primeiro pedaço dos comportamentos **B1–B4** do catálogo, e a prova deles é o fake do Probe (asserts a/b/c):

- **P0-1** (Bolt: arquivos do pedido e do bilhete/pass_forward/ask_colleague/opinião no rascunho de quem recebe, mesmo caminho relativo) fecha a lacuna do contrato `team-real.md` §113, que hoje só valida os caminhos do bilhete e não garante a presença no rascunho do receptor.
- **P0-2** (Tally: só a resposta final da persona no fio) é o "sem narração de ferramenta" que a §7 do catálogo já proíbe.
- **P0-3** (Tally: sem jargão de shell, sem pedir PNG) é a regra do D-099 (limite vira frase humana) aplicada ao SVG→PNG que o host já faz.

Não editei contrato nem `src` para não cruzar com os donos (Bolt/Tally/Probe) enquanto o fingerprint da tentativa 5 exige árvore parada.

## Pronto para pegar (tarefa fechada do Keel)

- Os **7 fios** que ainda não têm motor (§2b): B5 `handoff.nudged` + marca de "já cutucou", B6 `offer_help`, C1 checkpoint 70% do `tokenBudget`, C2 imagem no `persona_ask`, D3 nota de saída determinística, D5 `suggestedPersonaId`, E1 gatilho do brain no fim da Tarefa. É trabalho de v1.2 (pós-corte), barato: ligação + teto, não motor novo.
- Medição, script ou leitura de transcrito, se o Keel preferir.

## Achados sem dono da tentativa 5 (diagnóstico, 09/11; leitura, 0 IA)

**1. A mesma foto do pedido entra duas vezes no rascunho, com dois nomes.** Sessão do Téo (`09612a`): `inputs/foto.png` **e** `inputs/425aaacf-5061-48d0-9eb0-cb0e65d9ff0a-foto.png`. Causa: dois caminhos de encaminhamento com nomes diferentes — o P0-1 (`handoffs.ts:536 requestFiles`) chama `media.stageAttachments(…, false)` e copia para `inputs/<nome>` (`media.ts:206`); o TEAM-5 (`media.stageTurnImages`, `media.ts:225`) copia a mesma imagem para `inputs/<id>-<nome>` (`media.ts:236`). O filtro do `requestFiles` só olha `inputs/<nome>`, então não vê a cópia com id. **Conserto barato (v1.1.x):** em `stageTurnImages`, se `inputs/<sanitizeUploadName(name)>` já existe com o mesmo conteúdo, usar esse caminho em vez de copiar de novo; o prefixo de id fica só quando o nome simples estiver ocupado por outro arquivo.

**2. A arte foi feita duas vezes (duas Tarefas para o Téo).** O split já deu a arte ao Téo (`Lia: Dividi assim: Téo — Arte; Bia — Texto`) e a Bia passou a MESMA arte ao Téo (`Bia passou para Téo: Arte do cartaz…`), abrindo uma segunda Tarefa (sessões `09612a` e `7ececa`; dois SVGs: `cartaz-pao-de-queijo.svg` e `arte-cartaz-padaria-lua.svg`). Não é bug de host — ele honrou o `pass_forward` — mas é desperdício de turno no pior lugar (orçamento). **Conserto (v1.1.x):** o host funde o `pass_forward` numa Tarefa já aberta do mesmo destinatário quando a parte é a mesma (mesmo título/função) e o remetente é o dono da outra parte; ou o prompt do worker diz que a parte que já é do colega não precisa ser passada de novo.

**3. A revisora pediu exportação do SVG.** Sessão `ec9daf` (Lia): `Glob **/cartaz-pao-de-queijo.*` achou `.svg` e `.png`; ela pediu "Substituir `cartaz-pao-de-queijo.png` por uma exportação do SVG". O host já gera o PNG irmão ao salvar o SVG; o modelo não confiou. O reforço do Tally (`review-step.ts:294`, 18:29) ataca exatamente isso.

**4. O teto de 12 turnos cortou a revisão no meio.** A Lia fez 2 `persona_ask` (número do WhatsApp e PNG antigo) e cada um gastou turno; o 12/12 chegou antes do selo. Não é defeito (Probe: `ran-out-of-turns`), mas a pergunta 2 (PNG antigo) podia ter ido junto com a 1.

## Pendência de canal

Meu terminal não está conectado ao post-it `Persona · Status` (`maestri note edit` recusa), então o marco não foi escrito lá; o resumo foi para `.maestri/inbox/Keel/20261109-172329-Jade.md`.
