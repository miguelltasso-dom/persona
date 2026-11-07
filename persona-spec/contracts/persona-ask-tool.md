# D-079 (b) — `persona_ask` para o worker de CLI REAL (Bolt, 05/11 01:55)

Antes: uma persona de CLI (Claude, Codex) não tinha como parar para perguntar à pessoa — a pergunta no fim do turno virava ENTREGA e a resposta da pessoa virava conversa nova (achado do Probe, D-079 b). Agora ela pergunta pela ferramenta. Atrás de `PERSONA_PRODUCT_TOOLS=1` (ou `Config.productTools`); desligado, nada muda.

## O caminho

1. O opener do HT-0 (`harness-turn.ts`) oferece `persona_ask` a TODA Tarefa de CLI (além das do harness que o pedido pede).
2. O gateway liga `hooks.ask` a `createAskTool` (`persona-ask-tool.ts`): a identidade vem do RUN (nunca dos argumentos); a Tarefa tem de ser DELA; no máximo **2 perguntas por Tarefa** (`MAX_ASKS_PER_TASK`); a mesma chamada duas vezes devolve a mesma frase e não pergunta duas vezes.
3. A pergunta (simples, com opções, ou uma sequência de até 5) abre na Tarefa pelo `PersonaAsks` do Anvil: cartão no fio (escrito pela persona), orçamento diário, uma aberta por vez, sem repetir.
4. O modelo lê: "Pergunta enviada à pessoa. Termine este turno agora, com uma frase curta: a resposta dela chega no próximo turno desta tarefa, nesta mesma conversa." Recusas são frases com o caminho a seguir (suposição: `persona_ask({ assumption: "…" })` = uma linha honesta no fio, sem pergunta).
5. No fim do turno o host vê a atenção aberta pela ferramenta e NÃO a trata como entrega (sem "Pronto", sem sobrescrever o "esperando").
6. A pessoa responde (cartão ou texto): a MESMA Tarefa segue, na MESMA sessão (`worker-<tarefa>`), e o próximo turno lê a resposta.

## Provas

Host: `persona-ask-tool.spec` 7 (6 de unidade + o ponta a ponta: a CLI chama a ferramenta DURANTE o turno, o cartão vai ao fio, o turno não vira entrega, a resposta volta à mesma Tarefa e sessão) · `harness-turn.spec` 5 (Tarefa simples recebe só `persona_ask`) · processo real `proactivity-live.ts` fase 14. Transporte real: Rivet, `ht0-claude-spike`/`ht0-codex-spike` cenário `ask` (Claude OK, Codex OK em home isolada): o hook recebe a identidade do TURNO e a pergunta, e o 2º turno da MESMA sessão recebe a resposta e o histórico.

## Limites ditos com franqueza

1. Nível: o Rivet passou `persona_ask` para o nível READ (perguntar não escreve nada no mundo); persona com concessão `none` não recebe nenhuma ferramenta.
2. Codex NATIVO (home da pessoa) não recebe ferramentas de produto (Rivet, `ht0-transport.md`): lá a pergunta segue virando entrega.
3. Não provado com modelo real escolhendo a ferramenta no momento certo (isso é prompt); a frase de retorno ao modelo foi provada no host, não na CLI.
4. A oferta é por Tarefa de CLI; conversa, `/lado` e fan-out não recebem ferramentas.
