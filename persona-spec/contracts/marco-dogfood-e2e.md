# Marco DOGFOOD: e2e do quadro autônomo (M3) e soak de uma noite (M7)

Dono: Gauge (com Probe no soak em tempo real). Escrito 12/11 14:20. Plano; o código vermelho nasce em staging (`.maestri/tmp/Gauge/marco/`) e só entra na árvore depois do "candidato validado" (~15:15).

## 1. O que isto prova (e o que não prova)

Prova, com IA falsa e relógio acelerado, os critérios 2 e 3 do marco e a tarefa M7:
- 2 projetos com quadros andando sozinhos em paralelo, cartão a cartão até `done`, sem humano mexendo no quadro (critério 2).
- Cobrança de quem parou, resumo do dia no canal, ação de risco que PARA no cartão de aprovação, teto de turnos e cota (pausa aos 95%).
- Cerca entre projetos: a responsável de A nunca lê nem move nada do quadro de B (critério 3, cerca do R2).
- Uma noite inteira (24 h simuladas, passos de 5 min) sem travar, sem vazar, sem perder cartão.

NÃO prova (fica para o pack de ensaio e para o aceite do Miguel): sono do Windows, autostart e volta de queda do app instalado (M4, Rivet), Tailscale e cliente web (M5, Bolt), IA e cota reais, latência de rede, UI, RAM real do Chromium.

## 2. Costuras que JÁ existem (uso como estão; nada inventado)

- Relógio único do host: `host.orchestration.now` é substituível e TODO o host lê dele (scheduler, Vigia, rotinas, aprovações). Soak = mover esse relógio.
- `host.proactivityScheduler.cycle()` roda um ciclo na hora (o timer real só o arma a cada 30 s). Assim o teste avança 5 min e chama `cycle()`.
- IA falsa: `createFakeRunner` + `orchestration.liveText` roteirizado; runner por fábrica capturando prompts e contando chamadas.
- Quadro: `getProjectBoard(projectId)` (colunas com `category`: todo, doing, review, needs_you, done), `moveTicket`, `startOnBoardMove` (flag do host).
- Aprovação: cartão de atenção + gesto de aprovar (item 5/D-108) e ações externas (`external-actions`); contador de efeitos num conector falso.
- Padrões de teste prontos: `bindHostFile`, `openJourney`, `seedJourney`, `seedProject`, marcas únicas do `cross-project-reads.host.spec.ts`, host de produção do `d113-off-for-real.host.spec.ts` (`flagDefaults: 'production'`, banco em arquivo).
- Regra: o e2e do marco sobe o host NO PADRÃO DO PRODUTO (superfícies D-113 desligadas, sharedBrowser ligado). O marco acontece no app instalado; teste com tudo ligado esconderia dependência de superfície desligada.

## 3. Costuras que FALTAM (preciso dos donos; sem isto os vermelhos não têm onde apoiar)

| # | Costura | Dono | Como o teste usa |
|---|---|---|---|
| C1 | `setProjectResponsible` / leitura do responsável por projeto (M1; hoje só existe `setResponsible` de governança por workspace) | Flint | trocar em 1 chamada, só dono; nome em cabeçalho, quadro e Casa |
| C2 | O laço do quadro corre NO MESMO `proactivityScheduler.cycle()` (sem timer próprio, relógio único) e é idempotente por ciclo | Flint | avançar relógio + `cycle()` = o quadro anda; repetir o mesmo instante não duplica nada |
| C3 | O laço deixa rastro legível: evento/linha por ação (puxou, distribuiu, cobrou, moveu, resumiu, pausou, por quê) com projeto, cartão, persona, origem `quadro` | Flint | asserções sem espiar interno; relatório do soak |
| C4 | Teto por projeto: turnos/dia e cota %, pausa aos 95% como evento legível ("pausei: cota 95%"); retoma sozinho na virada da janela. **NOMES (Forge 14:31, `.maestri/tmp/forge/marco/contrato-m2-m3.md`):** `host.projectAdmission.admit(projectId, origin)` / `loadOf(projectId)` / `events(projectId)`; `ProjectCeiling {turnsPerDay (padrão 200), tokensPerDay (0 = sem teto), pausePct 95}` em doc de tela `project_ceiling`; estados `open` / `reserve` (95-100%: só `person`) / `full`; o contador de turnos sobe NO `admit`; cota lida do livro-caixa (`recordLedger`); pausa posta 1 linha no canal com id `project-pause:<projeto>:<dia>:<turns\|quota>` e grava `ProjectPauseEvent {kind pause\|resume\|full, reason turns\|quota, pct, resumeAt}`; E8 depende de cadeia por projeto `workOf(projectId)` + fila de vaga justa (§4 dele; hoje há cadeia global e "Aguardando vaga" sem retomada) | Forge | zero chamadas ao runner com cota ≥95%; teto N+1 não roda; `loadOf().turns.used` alimenta `turnsToday` do soak |
| C5 | Resumo do dia: 1 mensagem por projeto por dia no canal do projeto, com id de evento determinístico (idempotente) | Flint | contar mensagens; rodar o dia 2x não duplica |
| C6 | Cerca: toda ação do laço leva o projeto dele e `origin: 'quadro'`; o host recusa `moveTicket`/cobrar/criar cartão com persona de A em projeto B (código estável de recusa); origem `quadro` NUNCA pré-autoriza enviar, pagar ou apagar | Tally (ACL), Lumen (autoridade) | teste de cerca, teste de autoridade |
| C7 | Contadores observáveis do laço (ciclos, ações por tipo, recusas) por projeto, via API ou rastro de C3 | Flint | invariantes do soak |

Se o desenho dos donos mudar os nomes, adapto os testes aos nomes deles; o que não pode mudar é o COMPORTAMENTO descrito aqui. Peço que cada dono me diga o nome final da sua costura quando a tiver em staging.

## 4. E2E do marco (M3 + critério 2), em processo, sem Chrome nem CLI real

Arquivo: `packages/persona/persona-e2e/tests/marco-dogfood-quadro.spec.ts` (helpers em `persona-e2e/src/marco/`: montagem, relógio, invariantes). Montagem comum: 2 projetos reais em arquivo, A (loja, responsável Nina) e B (obra, responsável Beto), 3 personas em cada, 3 a 4 cartões semeados por quadro, Miguel dono, uma pessoa membro só de A.

| # | Cenário | Prova |
|---|---|---|
| E1 | Os dois quadros andam sozinhos | N ciclos: todos os cartões chegam a `done`; nenhum `moveTicket` humano; colunas só avançam na ordem fila→fazendo→revisão→feito; 1 entrega por cartão |
| E2 | Distribuição | o cartão vai para quem é da equipe do projeto; persona de B nunca aparece em A |
| E3 | Cobrança | cartão que parou além do limite recebe 1 cobrança (idempotente), depois sobe para `needs_you` |
| E4 | Resumo do dia | fim do dia local: exatamente 1 resumo por projeto no canal certo, com as contagens certas (feitos, andando, esperando o Miguel) e só marcas do próprio projeto |
| E5 | Risco para na aprovação | entrega que pede enviar, pagar ou apagar vira cartão de aprovação; efeito no conector falso = 0; +12 h de relógio e continua parado; aprovar pelo gesto = exatamente 1 efeito; origem `quadro` não pré-autoriza |
| E6 | Tetos | turno N+1 do dia não roda; cota 95% = zero chamadas ao runner e motivo legível; janela vira = retoma |
| E7 | CERCA (M3) | (a) hash do quadro de B inalterado por tudo que o laço de A fez; (b) chamada direta "como Nina de A" no quadro de B (mover, criar, cobrar, trocar responsável) = recusa com código e sem efeito; (c) mencionar a persona de A no canal de B não a aciona; (d) membro de A não vê B; só o dono troca responsável; (e) resumo e rastro de B nunca trazem marca de A |
| E8 | Paralelo sem fome | A e B disputam o limite de turnos simultâneos (admissão por RAM falsa): os dois progridem, pico de concorrência ≤ limite, nenhum cartão de nenhum lado parado sem motivo |
| E9 | Trocar o responsável no meio | cartões em andamento seguem; o laço passa a usar a nova; só o dono |
| E10 | Queda no meio do ciclo | fechar o host e reabrir o MESMO arquivo: retoma, 0 cartão perdido, 0 entrega duplicada |

E3, E4, E6 dependem de C3/C4/C5; E7(b) de C6. Cenários sem costura pronta ficam em `.red.ts` no staging (vermelho de verdade) e só entram na suíte quando o dono entrega, como fiz com #8.

## 5. Soak M7: uma noite com relógio acelerado

Arquivo: `persona-e2e/tests/marco-soak.spec.ts` + `persona-e2e/src/marco/soak-driver.ts`. Roda em processo, com IA falsa instantânea; alvo ≤ 5 min de relógio de parede para 24 h simuladas.

Montagem: a mesma de E1 com fila maior (20 cartões por projeto) e chegada de cartões novos durante a noite por roteiro com semente (`PERSONA_SOAK_SEED`, padrão fixo; `PERSONA_SOAK_HOURS`, padrão 24, 6 para o fumaça). Runner falso com latência e falha roteirizadas; conector falso para risco em 1 de cada 7 cartões; janela silenciosa da pessoa à noite.

Laço: `repeat { now += 5 min; await cycle(); await settle(); checar invariantes }` (288 passos). Erro de invariante carrega hora simulada, passo e semente (reproduz com 1 comando).

Eventos injetados na noite: 3 falhas seguidas do runner num cartão; cota a 95% às 02:00 e reset às 04:00; queda do host às 03:30 (fecha e reabre o arquivo); 2 cartões de risco parados a noite toda; mensagem do Miguel às 05:00 que vira cartão novo; virada do dia com resumo.

Invariantes a cada passo:
- I1 nenhum cartão some nem duplica (conjunto de ids = semeados + chegados).
- I2 colunas só avançam na ordem.
- I3 cartão em `doing` sem atividade além do limite tem cobrança registrada.
- I4 efeitos de risco no conector falso = aprovações dadas (nunca mais).
- I5 turnos do dia por projeto ≤ teto; cota ≥95% = zero chamadas ao runner.
- I6 hash do quadro de B inalterado por ações com origem A (e o inverso).
- I7 exatamente 1 resumo por projeto por dia.
- I8 zero `unhandledRejection` e zero erro no console tripwire.

Sem vazar (medido por foto a cada hora simulada): recursos vivos (`process.getActiveResourcesInfo()`: timers, handles), listeners de streams e de eventos do host, tamanho do banco com o WAL e linhas das tabelas de eventos e outbox, heap com `--expose-gc`. Regra: depois da 4ª hora, crescimento limitado (não linear no tempo) e, ao fechar o host, recursos vivos voltam ao valor de antes da montagem. Os limiares NÃO chuto agora: a 1ª rodada mede e grava a curva no relatório; a 2ª rodada trava o limiar com folga.

Fim da noite: fila drenada, exceto o que ESPERA por motivo legítimo (aprovação, `needs_you`, cota); contagens por coluna e projeto fecham com as semeadas + chegadas; mesma semente = mesmo relatório (hash dos eventos).

Relatório: `artifacts/marco-soak/<carimbo>.md` e `.json`: horas simuladas, passos, cartões por coluna e projeto, turnos usados, cobranças, resumos, aprovações pendentes, eventos injetados e o que o host fez, curvas de memória, handles e banco, invariantes passou/falhou, semente.

Com o Probe: ele roda o mesmo roteiro curto em TEMPO REAL com CLI falsa em processo de verdade (30 min) para ver timers reais e RAM do processo, e lê meu relatório como entrada do dele. Eu entrego o driver, as invariantes e o formato; ele, a parte de processo.

## 6. Ordem e prazos

1. Hoje 14:20 a 15:15 (staging): este plano; seção 3 para os donos; helper (relógio, invariantes, hash de quadro, relatório) e vermelhos E7, E5 e I1/I2/I6 que já dependem pouco do laço (escritos contra a API atual onde der).
2. Depois do "candidato validado": aplico helpers e specs na árvore; os que dependem de C1 a C7 só entram quando o dono entrega a costura.
3. Soak 1ª rodada (mede) assim que o laço existir; 2ª rodada (trava limiares) e relatório ao Keel.

Antes de tudo isso: a pré-auditoria do corte 3 (já pronta: `node scripts/persona/pre-audit.mjs`).

## 7. Perguntas ao Keel

1. Posso mandar a seção 3 direto aos donos (Flint, Forge, Tally, Lumen) e receber deles o nome final de cada costura?
2. Teto padrão de turnos por dia e por projeto, e cota máxima por projeto no teste: existe número decidido (Forge)? Se não, uso valores pequenos de teste e o teste não depende deles.
3. A cobrança vira `needs_you` depois de quantas cobranças e quanto tempo parado? (Flint decide; o teste lê da configuração.)
4. Onde roda o soak: só manual/pré-auditoria (recomendo, ~5 min) ou também no gate do corte?
