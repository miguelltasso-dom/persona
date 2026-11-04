# Contrato — a troca de conta no limite (IV-7 2ª fatia + D-078)

Tally, 05/11 (D-076, D-078). Backend pronto e testado. **Forma:** `design/ACCOUNT-SWAP-SPEC.md` (Muse). **Pintura:** Flint (sob o Prism). **Tela da política em Conexões:** Quill. Complementa `quota-resume.md` (a retomada quando a janela reseta).

## A situação

Uma Tarefa parou porque a janela de cota da conta acabou. A pessoa tem **outra conta logada no mesmo motor**. Em vez de esperar o reset, ela pode usar a outra agora e a Tarefa recomeça.

## Regras (decididas pelo Atlas na D-078; a tela não as reabre)

1. **O padrão é "Perguntar antes de trocar"**: nunca troca sozinho. A troca automática **só vale com política que a PESSOA escolheu** em Conexões (W2-7: "Usar a próxima quando esta chegar ao limite" ou "Dividir o uso"); "explícita" = existe linha gravada em `account_policy`. **Mudança de comportamento:** sem linha gravada o host passava a valer `next_on_limit`; agora vale `ask_before_swap` (`storedSwapPolicy`). Conta fixa: nada.
2. **Troca automática = sempre visível**, nunca calada: uma **linha de evento no fio** (`[[account-swap:…]]`, "A Bia passou para a conta Pessoal: a do Trabalho chegou no limite…") **com Desfazer**; o limite e a troca ficam **no livro** (abaixo).
3. **Perguntar** = um **Notice no fio** (`[[account-ask:…]]`) com "Continuar na {conta}" e "Esperar até {hora}". A Tarefa continua bloqueada com a pergunta aberta, então já conta como "Precisa de você".
4. **Só oferece conta que serve:** logada, sem erro, não esgotada. Sem cota publicada = `desconhecida` ("tentativa, não promessa"); com folga conhecida = `livre`. Todas esgotadas, ou só uma conta: **sem proposta e sem troca**; a faixa diz "No limite até {hora}" (`quotaResetsAt`; sem hora do vendor, nunca uma hora inventada).
5. **Desfazer** devolve a persona à conta que ela deixou e **ela espera ali** até o limite voltar: o host guarda um `hold` para a política não a tirar de novo (sem vai-e-volta). Um turno que já está rodando na conta nova termina lá; o Desfazer muda o que vem depois. Só vale enquanto a persona ainda está na conta nova (`stale` se não).
6. A troca é da **persona** (`active_account`, o registro que o host já lia). Outras personas não mudam.

## O livro (nada gravado que ninguém lê)

- `accounts.status = 'limit'` agora **é gravado** quando chega `quota_exhausted` (antes nunca era), com o relógio do vendor em `screen_doc account_limit` (`resetAt` opcional); **limpo** quando o relógio passa, quando a cota oficial da conta volta a mostrar folga, ou (sem relógio) após 6 h. Quando o Rivet entregar o `quota_exhausted` do meio do turno (P0 do H2) ele entra pelo mesmo caminho.
- `account_limit_log` (histórico, uma linha por quebra de limite: conta, hora, `resetAt`, `clearedAt`) e `account_swap` (cada troca: de, para, automática ou confirmada, Tarefa, `undone`/`undoneAt`). **A tabela de auditoria do host só aceita edit/delete/pin/react**, então o "livro" é este par de registros, não a `event_audit`; se o Atlas quis dizer o livro de turnos (`turn_ledger`), é outra coisa (aquele é por turno de modelo) e eu preciso saber.
- `account_ask` (o que `seatForPersona` gravava e ninguém lia) **foi removido**: o fluxo de proposta o substitui.

## Remotes e dados (`persona-host`)

```ts
getAccountSwapProposals(request: ProjectScopeRequest): AccountSwapProposalView[]      // uma por Tarefa parada que tem para onde ir
confirmAccountSwap({ workspaceId, projectId, ticketId, toAccountId }): Promise<AccountSwapResultView>   // "Continuar na {conta}"
declineAccountSwap({ workspaceId, projectId, ticketId }): boolean                     // "Esperar até {hora}": fecha o Notice, a Tarefa espera o reset
undoAccountSwap({ workspaceId, projectId, swapId }): UndoAccountSwapResultView        // "Desfazer" → { undone } | { reason: 'not-found' | 'already-undone' | 'stale' }
getAccountSwaps(request: ProjectScopeRequest): AccountSwapRecordView[]                // trocas das últimas 24 h (subtítulo "na conta Pessoal", `undoable`)
getAccountLimitBook({ workspaceId, projectId, limit? }): AccountLimitBookView          // P1: o histórico auditável para "Uso e limites"
getEngineStatus(request): EngineStatusView   // + quotaWaiting, quotaResetsAt, alternativeEngines ("Usar {outro motor} enquanto isso")
```

**Eventos tipados no fio** (`MessageView`, mesmo molde do `runError`): `accountSwap?: { swapId, personaId, personaName, provider, from:{accountId,label}, to:{accountId,label}, until?, auto, undone }` e `accountAsk?: { ticketId, personaId, personaName, provider, from, to, quota: 'livre'|'desconhecida', until?, resolved?: 'continued'|'waiting' }`. O `body` traz antes a frase simples e verdadeira (sem hora); o cliente monta o texto do spec com `until` e os botões. **`Desfazer` depois do clique:** o mesmo evento volta com `undone: true` (a linha vira "A Bia voltou para a conta do Trabalho e espera até 18:30", sem botão); o Notice volta com `resolved`.

`confirmAccountSwap` só aceita a conta proposta ou uma das alternativas; roda a Tarefa de novo **na outra conta**, uma vez, mesmo com o motor ainda dizendo "limite" para a primeira (o executor confere a cota da nova antes do turno; se falhar, volta a esperar e a proposta reaparece sem ela). Exige escrita e usuário humano.

## O histórico para "Uso e limites" (P1, Atlas D-078)

`getAccountLimitBook` devolve `{ limits, swaps }`, mais novo primeiro (padrão 50, máximo 200 de cada), **só de acréscimo**: `limits[]` = `{ accountId, label, provider, at, resetAt?, clearedAt?, active }` (um limite que passou ganha `clearedAt`, nunca some; `active` enquanto a conta ainda está no limite) e `swaps[]` = as trocas (as mesmas de `getAccountSwaps`, sem o corte de 24 h: de, para, `auto`, `undone`, `undoable`, `at`). Forma: Muse (pedida); pintura: Lumen. Prova: `account-swap-policy.spec.ts` ("o livro lista cada limite e cada troca…").

## O que cada um faz

- **Muse:** a forma já está em `ACCOUNT-SWAP-SPEC.md` (linha, Notice, faixa). Aceite na varredura do instalado.
- **Flint (sob o Prism):** pintar o evento `accountSwap` (com Desfazer → `undoAccountSwap`), o Notice `accountAsk` (Continuar → `confirmAccountSwap`; Esperar → `declineAccountSwap`) e a faixa "No limite" (lê `quotaWaiting`/`quotaResetsAt`/`alternativeEngines`; o botão Retomar chama `retryEngine`); o composer **nunca** desabilita. O subtítulo "na conta Pessoal" por 10 min vem de `getAccountSwaps` (`at`).
- **Quill:** a tela da política em Conexões: **o padrão exibido é "Perguntar antes de trocar"**. O `fallback` do cliente em `client/data/adapters/connection-accounts.ts:236` (`swapPolicy: 'next_on_limit'`) deve passar a `'ask_before_swap'`, senão a tela mente quando o host ainda não devolve nada.

## Provas

`persona-host/tests/account-swap.spec.ts` (9: regra pura), `account-swap-remote.spec.ts` (4: proposta + confirmação ponta a ponta) e **`account-swap-policy.spec.ts` (8, os 4 casos do Atlas + o livro)**: (1) **padrão só propõe** (limite gravado com o relógio, Notice no fio, nada troca, `account_ask` vazio) e "Continuar"/"Esperar"; (2) **política escolhida troca sozinha, com a linha no fio uma vez, Desfazer e o livro** (e depois do Desfazer a persona espera: um novo limite só pergunta); (3) **conta fixa = nada** (sem proposta, sem linha, sem troca; o limite fica gravado); (4) **todas esgotadas = nada**, e `getEngineStatus` diz `quotaWaiting`/`quotaResetsAt`; mais o limite que vence com o relógio (e o `clearedAt` no livro) e `alternativeEngines`. Host: 34 arquivos de orquestração, 253 testes verdes; `check-pkg persona-engine` OK; `check-pkg persona-host`: erros só em arquivos de outros em andamento (rotinas em `index.ts` 5322-5350, `tests/working-control.spec.ts`).

## Limites conhecidos

- O limite no **meio** do turno ainda não vira `quota_exhausted` (Rivet, P0 do H2): até lá este fluxo só dispara para o limite detectado antes do voo; o meio do turno fica no Retomar manual.
- `Desfazer` não interrompe um turno já em andamento na conta nova.
