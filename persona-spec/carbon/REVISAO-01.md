# REVISÃO-01 · Diagnóstico Crítico, Direção Criativa e Roteiro de Guerra

**Autor:** CARBON (Crítico-Chefe e Diretor Criativo)
**Para:** Miguel (Dono do Produto) e Atlas (CTO)
**Data:** 11/11/2026
**Escopo auditado:** árvore atual (`persona-dev`), `RELEASE-NOTES-v1.1.md`, decisões `D-079..D-099`, contratos e código de `persona-host`, `persona-engine`, `persona-runners`, `client-ui-persona`, `apps/desktop`, artefatos e capturas da `real-attempt-5` e `real-attempt-4`, capturas de aceite em `.maestri/tmp/shots/` e pesquisas `perf/`, `t3code/` e `pi/`.

---

## Tese central em um parágrafo

A Persona tem a melhor tese de produto do mercado de agentes em 2026 — transformar as assinaturas que a pessoa já paga numa equipe visível com rosto, memória da empresa e governança humana —, mas a v1.1 entregue em 09/11 ainda é **um teatro brilhante montado sobre tubulações em conflito e um pacote obeso de 1,18 GiB**. O maior problema hoje não é falta de funcionalidades do T3 Code: é que (1) na rodada real da própria equipe (`real-attempt-5`), o roteador do host e a orientação de prompt das personas entraram em colisão frontal, fazendo o designer criar **dois cartazes concorrentes em paralelo**, gastar **469.479 tokens de entrada em 12 turnos** e terminar **reprovado** (`outcome: "failed"` / `"ran-out-of-turns"`); (2) o adaptador de sessão das Tarefas reais joga fora todos os deltas de streaming e finge ter `steer`; (3) o app parado consome **1,12–1,29 GB de RAM e 21–37% de GPU**; e (4) o processo de "aceite visual" aprovou capturas com controles duplicados, iniciais no lugar de animais, popovers travados sobre o chat e linhas de estado triplicadas. Antes de empilhar 30 itens de uma IDE de código, o Atlas precisa endireitar o eixo do produto.

---

## A. Veredito honesto: Top 10 do que impede a Persona de ser o melhor harness do mundo hoje

Ordenado do mais grave (quebra a promessa central do produto) ao menos grave. Tudo abaixo tem prova material no repositório; onde há inferência, está rotulado como **Hipótese**.

### 1. Colisão estrutural entre o split paralelo do host e o `pass_forward` do modelo: a equipe duplica o mesmo trabalho, revisa a arte errada e estoura turnos
- **O que acontece:** Quando a pessoa pede *"texto e arte"*, `splitByFunction` divide o pedido **em paralelo e sem dependência**, abrindo imediatamente uma Tarefa para a Bia (`split:<msg>:bia`) e outra para o Téo (`split:<msg>:teo`) com a instrução *"não faça a parte deles"*. Porém, no exato mesmo turno, `TeamTools.guidanceFor` injeta depois do pedido o `TEAM_GUIDANCE_CORE` dizendo literalmente: *"isso vale mais que as normas de dono acima: o que é da função de outro colega, passe a ele (pass_forward) ... faça a sua parte e passe o resto a quem é da função"*. A Bia obedece e chama `pass_forward` para o Téo, abrindo uma **segunda Tarefa de arte** enquanto o Téo já está desenhando a primeira às cegas (sem o texto da Bia).
- **Evidência:**
  - Código: `packages/persona/persona-host/src/orchestration.ts:3396-3448` vs `packages/persona/persona-host/src/harness-team.ts:35` e `:115-135`.
  - Transcrito e prova real: `packages/persona/persona-e2e/artifacts/team10/real-attempt-5-2026-11-09T21-12-08-827Z/proof.json:5,28,505-639`, `verdict-reread.json:3-11` (`"passed": false`, `"outcome": "ran-out-of-turns"`) e `transcript.md:8-34`. O Téo salvou `cartaz-pao-de-queijo.svg` (com texto provisório inventado) às `21:13:35`, depois salvou `arte-cartaz-padaria-lua.svg` (com o texto da Bia) às `21:14:16`, abriu **duas** rodadas de opinião separadas, e a Lia revisou o `cartaz-pao-de-queijo.svg` provisório em vez da arte final, pediu ajustes, o Téo fez `pass_forward` de volta para a revisora Lia, os 12 turnos acabaram e **5 das 7 Tarefas terminaram penduradas em `running`** (`transcript.md:39-45`).

### 2. Falso streaming, falso `steer` e `whenIdle` vazio nas Tarefas reais (`createOarSessionRunner`)
- **O que acontece:** As notas da v1.1 anunciam *"o texto da persona vai crescendo na conversa"* e *"Direcionar agora muda o rumo no meio do trabalho"* (`persona-spec/RELEASE-NOTES-v1.1.md:17,37`). Isso só vale para respostas curtas de conversa (`reply`). Nas **Tarefas de verdade** (onde as personas trabalham via `createOarSessionRunner`), o loop consome o stream num `for await` mudo até `ended`, descartando todos os deltas — a pessoa encara dezenas de segundos sem uma palavra crescer no balão. Pior: o runner anuncia `steer: true`, mas quando `deliver(..., 'steer')` é chamado com turno ativo, ele **não injeta na execução nem aborta o turno anterior** — ele chama `turn.start()` sobre a mesma sessão quente, fecha o conjunto de ferramentas MCP do turno que ainda estava rodando (`closeToolSet(previous)`), sobrescreve `live.handle` (impedindo cancelar o turno original) e dispara um segundo `session.prompt` concorrente. Para completar, `whenIdle` é um no-op que retorna na hora mesmo com `live.status === 'running'`, e "Parar → Continuar" manda apenas a frase `"Continue de onde parou."` numa nova chamada (`RELEASE-NOTES-v1.1.md:76`).
- **Evidência:**
  - Código: `packages/persona/persona-runners/src/oar/session.ts:55` (`steer: true`), `session.ts:76-133` (`deliver` engolindo `options.turn.stream(handle)` sem repassar `delta`/`partial` e atropelando `live.handle`), `session.ts:143-146` (`whenIdle` retornando sem aguardar) e `packages/persona/persona-runners/src/oar/adapter.ts:662-667` (`closeToolSet(previous)`).

### 3. Abertura de 8,8–11,7 s, 1,12–1,29 GB de RAM parado e 21–37% de GPU ociosa num instalador de 1,18 GiB
- **O que acontece:** O produto viola todos os padrões de agilidade de um app desktop moderno. Três causas distintas foram misturadas nos relatórios internos:
  1. **Duas arquiteturas inteiras carregadas no mesmo processo Node:** isolado, `persona-host` sobe em **0,9 s com 93 MB de RSS** (`HOST-BOOT.md:28-30`). Dentro do app instalado, o processo `host` leva **7,5 s e ocupa 412–418 MB** (`MEDICAO.md:134,142-150`) porque `packages/persona/persona-app/cordis.patch.yml:8-174` desliga 48 plugins `ui-*` do browser, mas **mantém ligados quase todos os plugins de backend do DeepSeek Harness** (`dsh-llm`, `dsh-llm-pi-ai`, `dsh-agent`, `dsh-session`, `dsh-mcp-manager`, `dsh-otel`, `dsh-hmr`, `dsh-client-hmr`, controllers de sessão/job/terminal/workspace) que a Persona não usa.
  2. **GPU derretendo bateria com o app parado (21% a 37% de CPU do processo GPU em repouso):** animações contínuas, halos/blurs noturnos, vaga-lumes e elementos vivos mantêm o compositor do Chromium trabalhando sem parar (`MEDICAO.md:123,130,142-145`). Num app que mora na bandeja do Windows o dia inteiro, isso liga a ventoinha do notebook sem o usuário tocar no teclado.
  3. **Gordura bruta de disco:** 182 MiB de LibreOffice, 144,5 MiB de Python, 91,8 MiB de MinGit, 48,3 MiB de locales do Chromium, 44,8 MiB de pacotes experimentais (`sherpa-onnx`, `inspector`) e 20,5 MiB de `pnpm` empacotados para todo mundo (`DIETA.md:20-35`).

### 4. Hemorragia de tokens da assinatura em trabalho em equipe + bug de contabilidade por modelo
- **O que acontece:** Para produzir **um cartaz simples de pão de queijo com 4 frases e 1 SVG**, a tentativa 5 consumiu **12 turnos pagos, 469.479 tokens de entrada e 23.046 tokens de saída** (`proof.json:59-65`), com três turnos individuais do Téo batendo **85.345**, **112.100** e **82.063** tokens de entrada (`proof.json:115,149,182`) porque o SVG inteiro e o histórico da tentativa vão sendo reempilhados turno após turno. Numa conta Claude Pro (ou mesmo Max com Opus/Sonnet em vez de Haiku), 3 ou 4 pedidos desses secam a janela de 5 horas da pessoa. Além disso, o host **corrompe o registro do modelo usado** ao gravar no serviço de uso: passa `model: stored.engine` (`'claude'`) no lugar do modelo real (`'haiku'`, `'sonnet'`, `'opus'`).
- **Evidência:**
  - Ledger real: `packages/persona/persona-e2e/artifacts/team10/real-attempt-5-2026-11-09T21-12-08-827Z/proof.json:59-199`.
  - Bug de gravação do modelo: `packages/persona/persona-host/src/index.ts:7757-7763` (`provider: stored.engine, model: stored.engine`).

### 5. Falsa promessa multi-CLI: só o Claude é completo; Codex, Cursor e OpenCode têm buracos graves de equipe e segurança sem aviso na tela
- **O que acontece:** O produto é vendido como uma equipe rodando sobre Claude, Codex, OpenCode e Cursor (`BRIEFING.md:10`), mas:
  - No **Codex** usando a conta nativa do computador (`~/.codex`), a persona **não recebe nenhuma ferramenta de equipe nem do produto** (não passa trabalho, não pede ajuda, não opina por ferramenta, não dá veredito de revisão, não cria rotina) — e a UI não avisa (`packages/persona/persona-runners/src/oar/adapter.ts:578-583`, `RELEASE-NOTES-v1.1.md:96`).
  - No **Codex**, a confirmação antes de **enviar e-mail, publicar, pagar ou apagar** ainda **não foi provada** e o Codex carrega todos os MCPs/plugins pessoais da pessoa sem isolamento (`RELEASE-NOTES-v1.1.md:63`), porque o `PermissionGate` (`packages/persona/persona-runners/src/resolve/permission-gate.ts:188-193`) depende de `hooks.PreToolUse` do Claude.
  - No **Codex**, personas não leem imagens em rodadas de opinião (`RELEASE-NOTES-v1.1.md:77`).
  - **Cursor** e **OpenCode** não recebem `effort` (`adapter.ts:619`), não têm catálogo de reserva (`RELEASE-NOTES-v1.1.md:63`) nem prova E2E real de equipe.

### 6. O rascunho de arquivos quebra justamente em pastas que são repositórios Git
- **O que acontece:** Em qualquer pasta que contenha `.git` (100% dos projetos de software e boa parte dos vaults técnicos), um arquivo novo salvo pela persona no rascunho **não aparece em "Revisar mudanças" nem pode ser aplicado na pasta**, porque o motor exige que a própria persona execute `git commit` dentro do rascunho — ao mesmo tempo em que a `D-099` tirou o shell/bash das personas por padrão!
- **Evidência:** `persona-spec/RELEASE-NOTES-v1.1.md:67` e `:99` (*"o trabalho da persona só chega ao Revisar mudanças (e só pode ser aplicado) quando ela o guarda no Git (commit) dentro do rascunho; um arquivo novo que ela apenas salva, sem guardar, não aparece na lista nem é aplicado"*), combinado com `DECISIONS.md:313` (D-099: rascunho ligado por padrão, sem shell/bash).

### 7. Vazamento de marcadores internos, erros de harness de teste e repetição robótica no fio da pessoa
- **O que acontece:** Três vazamentos diferentes provam que a fronteira entre "cozinha interna do motor" e "conversa humana" continua porosa:
  1. `parseConsolidation` exige quebra de linha antes de `NOVA VERSÃO:` (`/^\s*NOVA\s+VERS[ÃA]O\s*:\s*/imu`). Quando o Téo escreveu na mesma linha, vazou no cartão final: **`NOVA VERSÃO: Texto do rascunho não muda nesta rodada; a alteração`** (cortado no meio da palavra/frase).
  2. O limitador de testes `RealTurnCapError` apareceu duas vezes no chat como fala da coordenadora Lia: *"Precisa de você: o limite de execuções reais desta rodada foi atingido (12 de 12). Nada foi iniciado."*
  3. Na captura oficial aceita do tema escuro no `#geral`, aparecem três balões consecutivos no mesmo minuto dizendo a mesma coisa: **Luna:** *"Pronto: Primeira entrega"* → **Atlas:** *"Concluído: Primeira entrega."* → **Luna:** *"Primeira entrega pronta: Primeira entrega"*.
- **Evidência:**
  - Código: `packages/persona/persona-host/src/opinion-run.ts:195-202`.
  - Transcrito e imagem real: `real-attempt-5-.../transcript.md:14,28,32` e `real-attempt-5-.../m9-fio-final-alto-claro.png`.
  - Captura aceita: `.maestri/tmp/shots/prism-shell-b6/dark-1440-geral.png`.

### 8. Cartões "vivos" e contadores de estado que mentem para o usuário
- **O que acontece:** A UI promete cartões que atualizam no lugar e contadores confiáveis, mas:
  - No fim da `real-attempt-5`, o cartão `DIVIDI ASSIM` exibe `Texto [precisa de você]` e `Arte [precisa de você]`, embora a tarefa de **Texto** da Bia já tivesse terminado com sucesso e recebido o selo `"Revisado por Lia"` (`m9-fio-final-alto-claro.png` vs `proof.json:621-628`).
  - Os dois cartões de opinião do Téo na mesma entrega exibem `Rodada 1 de 2` (`m9-fio-final-alto-claro.png`), porque o contador é por `ticketId` filho e não pelo pedido da pessoa, burlando na prática o teto visual do pedido.
  - Em Aprovações, a barra lateral mostra o selo laranja `1` enquanto a lista aberta ao lado diz `PRECISA DE VOCÊ AGORA 5` (`.maestri/tmp/shots/ember/shell-b6/approvals-v2-action-email-light-1440x900.png`).
  - O contador de não-lidas de Assuntos soma as próprias mensagens do usuário e ressuscita ao recarregar (`RELEASE-NOTES-v1.1.md:110`).
  - O Vigia (`vigiaTick`) emite `nudge` **e** `escalate` simultaneamente em **todo tick** enquanto `waitingOnPersonaId` existir, sem limiar de tempo nem registro de que já cutucou (`packages/persona/persona-engine/src/watchdog.ts:156-159`).

### 9. Regressões visuais óbvias passando pelo crivo de aceite (capturas oficiais com defeitos visíveis)
- **O que acontece:** O ritual de pré-aceite automatizado (`axe 0`, sem overflow) deu falsa sensação de segurança enquanto defeitos gritantes aos olhos humanos passaram batidos:
  1. **Chip `"Decide o rotineiro"` duplicado duas vezes na mesma barra do composer:** renderizado à esquerda como botão âmbar (`ChannelComposer.tsx:995-1020`) e renderizado **de novo** à direita como chip cinza (`ChannelComposer.tsx:1057-1060`), visível em todas as telas da `real-attempt-5` (`m9-fio-final-alto-claro.png`, `m9-fio-final-alto-escuro.png`) — apesar de o `UX-BEYOND-T3.md:62` (P0-29) ter marcado exatamente esse bug como resolvido.
  2. **Popover de onboarding `"A Coordenação distribui o pedido"` congelado por cima das mensagens durante todos os 5 minutos da rodada real** (`m-153s.png`, `m-273s.png`, `m9-fio-final.png`, `m9-fio-final-alto-claro.png`), tampando o texto das personas.
  3. **Balões tracejados da fila cortados ao meio** no topo da área de mensagens logo abaixo das abas de assunto (`m9-fio-final-alto-claro.png`).
  4. **Iniciais `[SR]` em vez de rosto de animal** no cartão do Kanban visível ao fundo de `.maestri/tmp/shots/lumen-viewport/bundle6/revisar-lista-light-1440x900.png` (e letra `"E"` na fila segundo `RELEASE-NOTES-v1.1.md:106`), quebrando a regra repetida 3 vezes nas Release Notes (*"nunca iniciais"*).
  5. **Faixa da equipe vazia sem animais de corpo inteiro no tema escuro** (`.maestri/tmp/shots/prism-shell-b6/dark-1440-geral.png`), violando a Decisão nº 4 do Miguel (`BRIEFING.md:13`).

### 10. Atrito diário em gestos básicos que qualquer usuário faz 20 vezes por dia
- **O que acontece:**
  - **Colar imagem (`Ctrl+V` de print `Win+Shift+S`) não funciona no composer:** `onPaste` só lê `text/plain` (`packages/persona/client-ui-persona/src/client/chat/ChannelComposer.tsx:775`; `TICKETS-UI-DRAFT.md:36`). No Windows, todo mundo tira print com `Win+Shift+S` e dá `Ctrl+V` no chat.
  - **Trocar modelo/esforço exige peregrinação até Configurações:** não há seletor rápido por conversa/turno no composer; o modal em Configurações chama-se erroneamente **"Trocar motor"** quando só troca modelos do mesmo motor, ocupa a tela inteira e mistura português com `low`, `medium`, `high`, `xhigh`, `max` crus (`.maestri/tmp/shots/quill/bundle6b/effort-4-opus-max-light-1440x900.png`).
  - **Sem `Ctrl+F` na conversa e busca global que não rola até a mensagem encontrada** (`TICKETS-UI-DRAFT.md:25-26`).
  - **"Revisão antes de entregar" travada sem controle na UI:** o bloco em Configurações virou texto estático na v1.1 (`RELEASE-NOTES-v1.1.md:69`), obrigando todo projeto a pagar +1 tarefa de revisão por entrega sem poder desligar.

---

## B. A equipe parece gente? Crítica da tentativa 5 e das telas

**Resposta curta: Não.** Na tentativa 5, Lia, Bia e Téo não soam como três colegas talentosos numa agência; soam como **três despachantes de cartório lendo formulários internos em voz alta e falando do cliente na terceira pessoa enquanto ele está sentado na sala**.

### O que soa robótico, burocrático, repetitivo ou frio (com prova literal)

1. **Chamar o usuário de *"a pessoa"* na cara dele (vale da estranheza imediato):**
   - Téo (`transcript.md:11`): *"Opinião sobre a arte ... **antes da aprovação da pessoa**"*
   - Téo (`transcript.md:16`): *"Ainda não aprovei nada: **a aprovação é da pessoa** ... Usei os dados que **a pessoa** passou como texto provisório."*
   - Motivo: os prompts internos do motor (`orchestration.ts:3441` `Pedido da pessoa:`, `harness-team.ts`, `handoffs.ts`) usam o termo técnico *"a pessoa"* para se referir ao usuário humano, e os modelos copiam esse vocabulário para o chat público. Em português humano, colegas dizem **"você"** (quando falam com o dono) ou usam **o nome do dono ("Miguel")** quando conversam entre si!

2. **Bia falando da própria Bia na terceira pessoa (amnésia de identidade no `readerPrompt`):**
   - Bia (`transcript.md:13`): *"Antes de publicar, confirme o WhatsApp (11) 91234-5678, que parece número de teste, **já que o texto final é da Bia**."*
   - **A própria Bia escreveu "já que o texto final é da Bia"!** Isso acontece porque `readerPrompt` (`packages/persona/persona-host/src/opinion-run.ts:141-152`) monta um prompt anônimo de avaliador sem injetar quem está respondendo nem o que ela mesma já entregou no pedido. Nada destrói mais rápido a ilusão de "pessoas reais" do que um personagem esquecer o próprio nome.

3. **Vozes clonadas: três avatares, um único robô Haiku:**
   - Compare as três linhas das `21:13:14` (`transcript.md:12-14`):
     - **Lia:** *"A composição funciona: o título e o círculo de preço são o foco certo, e o azul com amarelo e branco tem bom contraste..."*
     - **Bia:** *"A composição funciona: o título é forte, o círculo vermelho destaca o preço e o contraste branco/azul e azul/amarelo é legível..."*
     - **Téo:** *"A composição funciona e as duas revisões concordam: título e círculo de preço estão no foco certo, e o contraste azul/amarelo/branco é legível..."*
   - Mesma estrutura frasal, mesmos dois-pontos, mesmo vocabulário, zero ponto de vista funcional (a redatora Bia opina sobre kerning tipográfico exatamente igual à coordenadora Lia, e o Téo repete tudo palavra por palavra na consolidação).

4. **Burocracia de prontuário em vez de conversa de trabalho:**
   - Bia (`transcript.md:10`) e Téo (`transcript.md:16,21,26`) postam relatórios cheios de seções de auditoria interna no `#geral`: `**Entrega:**`, `**Opinião do time:**`, `**Decisões que tomei:**`, `**O que fiz nesta rodada:**`, `**O que não fiz e por quê:**`.
   - Em equipe humana, ninguém explica *"Não criei arquivos no projeto, porque a tarefa era só o texto"* (`proof.json:627`) nem *"O texto do rascunho não muda, então não há versão nova a registrar"* (`transcript.md:19`). Isso é o modelo preenchendo checklist de prompt em público.

5. **Síndrome do estagiário medroso (inventar bloqueio sobre dado explícito do cliente):**
   - O cliente escreveu claramente no pedido: `pedidos pelo WhatsApp (11) 91234-5678` (`transcript.md:7`).
   - Em vez de fazer o trabalho e entregar com um aviso leve, a equipe inteira entrou em espiral paranoica com esse número: Bia levantou suspeita, Téo repetiu 3 vezes, abriu um `pass_forward` inteiro para a Lia só com `"falta confirmar o número"` (`transcript.md:25`), e a Lia abriu **dois cartões bloqueantes de múltipla escolha** (`transcript.md:27,30`), incluindo uma pergunta absurda ao cliente sobre o que fazer com um arquivo `cartaz-pao-de-queijo.png` temporário que **o próprio time criou por engano no rascunho**! Equipe boa limpa a própria bancada; nunca pergunta ao cliente se pode jogar fora o próprio rascunho sujo.

6. **Poluição visual das telas (`real-attempt-5/m9-fio-final-alto-claro.png` e `real-attempt-4/m9-fio-final-alto-claro.png`):**
   - Os cartões de opinião **não recolheram** após consolidados (embora a `EQUIPE-REAL-SPEC.md:284` exija recolhimento para 1 linha): dois blocos gigantes dominam toda a altura da conversa.
   - No 1º cartão de opinião, a foto de referência (`foto.png`, 640×400 paisagem) aparece enorme no topo e o cartaz novo (`cartaz-pao-de-queijo.svg`, 1080×1350 retrato) aparece pequenininho embaixo, fazendo parecer que a arte feia de blocos chapados é a entrega principal — e confundindo a própria Bia e a Lia na tentativa 4 e na 5 (*"A primeira imagem é só a arte base..."*).
   - Os retratos 24 px de **Bia** e **Téo** são dois felinos claros quase idênticos em tamanho pequeno: na linha `🐱 → 🐱 Bia passou para Téo`, o olho humano não distingue quem passou para quem.

### Como uma equipe humana excelente faria o EXATO mesmo pedido

| Momento | Como a Persona fez na tentativa 5 (29 linhas, 5m48s, 12 turnos) | Como uma equipe humana excelente faria (7 itens no fio, ≤ 5 turnos) |
|---|---|---|
| **1. Divisão** | Abre Texto e Arte em paralelo sem esperar o texto; Téo inventa texto provisório. | **Lia** abre `Dividi assim`: **Bia** (Texto · fazendo) → **Téo** (Arte · esperando texto da Bia). Ordem lógica respeitada. |
| **2. Texto pronto** | Bia posta 140 palavras com `**Entrega:**` e `**Opinião do time:**` explicando por que não pediu opinião. | **Bia** posta só o copy limpo em 4 linhas + linha discreta: *Bia passou o texto para Téo montar a arte*. |
| **3. Arte + Opinião** | Téo faz 2 SVGs diferentes, abre 2 rodadas de opinião, Bia fala da Bia na 3ª pessoa, Téo repete tudo e vaza `NOVA VERSÃO:`. | **Téo** monta 1 SVG já com o texto da Bia e abre **1 cartão de opinião** mostrando só a arte nova (a referência fica num toggle discreto *"Ver referência"*). **Bia** opina como redatora (*"Destaca mais o 'em dobro'"*), **Lia** como diretora (*"Dá respiro no R$ 9"*). **Téo** ajusta o SVG, mostra o slider **Antes · Depois** e o cartão recolhe para 1 linha expansível. |
| **4. Dúvida não-bloqueante** | Téo passa tarefa para Lia, que bloqueia tudo com 2 perguntas formais sobre o telefone que o cliente deu e sobre lixo de pasta. | Nenhum bloqueio: eles usam o número que o cliente pediu, apagam o rascunho descartado sozinhos e colocam 1 observação humana na entrega. |
| **5. Entrega final** | Estoura limite de 12 turnos, cospe `RealTurnCapError` duas vezes e mostra `DIVIDI ASSIM` travado em `precisa de você`. | **Lia** entrega 1 cartão `Pronto: Cartaz Padaria Lua` com miniatura grande, selo `Revisado por Lia`, botão **Revisar e aplicar** e 1 frase viva: *"Fechamos texto e arte em 1080×1350. Só confirma antes de postar se o WhatsApp (11) 91234-5678 já é o definitivo ou número de teste."* |

---

## C. Apostas criativas: 9 ideias que NENHUM concorrente tem

Nenhuma destas ideias existe em T3 Code, Cursor, Claude Code, Codex, Devin ou Manus. Todas nascem da combinação exclusiva da Persona: **equipe multi-especialista com rosto + assinaturas locais da pessoa + memória da empresa + público além de programadores**.

### 1. Mesa de Luz ("Circule e fale" direto em cima da arte, documento ou site)
- **A ideia:** Pedir ajuste visual por texto (*"afaste o descendente do 'p' da linha branca em y=870"*) é tortura. No cartão de entrega ou em "Revisar mudanças", a pessoa clica na miniatura da imagem/SVG/PDF/página, faz um círculo ou seta âmbar com o mouse sobre o ponto exato e escreve 3 palavras (*"aumenta esse preço"*, *"troca essa cor"*). O app gera uma imagem composta com a marcação numerada + coordenadas normalizadas e entrega como anexo visual direto ao dono daquela parte (Téo), que devolve o slider **Antes · Depois**.
- **Primeiro passo concreto:** Componente `<LightTableCanvas>` em `packages/persona/client-ui-persona/src/client/review/` usando `<canvas>` 2D nativo (zero dependência nova) sobre a imagem renderizada do rascunho, salvando o overlay PNG via `attachFile` e abrindo `answerAttention` / ajuste da Tarefa com `[ imagem_original, imagem_marcada ]`.
- **Como provar que funcionou:** Teste E2E onde um círculo na metade inferior do cartaz + nota `"trocar fundo da faixa para branco"` gera um SVG atualizado com a cor alterada apenas naquela faixa em **1 único turno**, sem o usuário escrever coordenadas nem nomes de elementos.

### 2. Química de Dupla ("Entrosamento real entre colegas")
- **A ideia:** Em todo framework multi-agente do mundo, o agente A chama o agente B hoje exatamente igual ao dia 1 — nunca criam entrosamento. Na Persona, cada par (`Bia ↔ Téo`, `Téo ↔ Lia`) acumula até **5 combinados de dupla** extraídos quando uma revisão pede ajuste ou um handoff dá certo de primeira (ex.: *"De Lia para Téo: sempre manter margem mínima de 48px nas bordas e espaçar R$ do número"*). Esses combinados aparecem no perfil ("Como trabalham juntos", editáveis/apagáveis pela pessoa) e entram apenas nos handoffs daquele par (< 120 tokens). A equipe fica visivelmente mais afiada a cada semana.
- **Primeiro passo concreto:** Tabela/screen_doc `pair_norms` (`projectId`, `fromPersonaId`, `toPersonaId`, até 5 strings de ≤ 140 chars) alimentada deterministicamente (C0, zero tokens extras) a partir dos `points[]` de `review_verdict(changes)` em `packages/persona/persona-host/src/handoffs.ts`, injetada em `noteForColleague` (`persona-engine/src/handoff.ts:203`).
- **Como provar que funcionou:** Rodar duas tarefas seguidas de cartaz: na 1ª, Lia pede um ajuste de margem ao Téo; na 2ª (novo pedido no mesmo projeto), verificar em `turnInputs` que o combinado entrou no bilhete e que Téo acerta de primeira sem volta de revisão (`returns === 0`).

### 3. "Ouvir a Mesa em 20s" (Divergência forçada antes de gastar cota)
- **A ideia:** Antes de mandar a equipe gastar 80 mil tokens executando um pedido aberto (*"Como subimos as vendas de terça-feira da padaria?"*), um botão **Ouvir a mesa (20s)** (`Alt+Enter`) chama até 3 personas do canal em paralelo no modelo mais rápido/barato, mas com **papéis de tensão explícitos** (1. *Visão de Receita/Cliente*, 2. *Ideia Ousada*, 3. *Risco/Pé no Chão*), limitadas a **280 caracteres cada**. Abaixo de cada resposta aparece um botão **[Seguir esta linha]** que transforma aquela tese no briefing completo da Tarefa.
- **Primeiro passo concreto:** Modo `fanout: 'table-pitch'` sobre a infraestrutura já pronta de `fanout-run.ts`, forçando `answer-only`, modelo rápido (`fastest-model.ts`), limite duro de saída e botão de promoção a Tarefa no `FanoutBlock`.
- **Como provar que funcionou:** Medir em teste pareado: 3 perspectivas distintas entregues em < 8 s e < 4.500 tokens totais (≈ 10× mais barato que uma execução errada), com 1 clique convertendo a escolhida em Tarefa com `decisions[]` preenchido.

### 4. Marcapasso de Assinatura ("Zero cota jogada no lixo antes do reset de 5h")
- **A ideia:** Quem paga Claude Pro/Max ou ChatGPT Plus vive dois extremos irritantes: ou estoura a janela de 5 horas às 15h e fica travado, ou a janela reseta às 18h com 60% de capacidade não usada (dinheiro pago que evaporou). Nenhum concorrente gerencia uma fila de trabalho contra o relógio real de `resetsAt` da assinatura! A Persona ganha uma raia **"Quando sobrar fôlego"** no Quadro:
  - Se faltam **< 45 min para o reset** da janela de 5h e sobram **> 30% livres**, a equipe puxa sozinha tarefas dessa raia (pesquisa de concorrentes, higiene do Segundo Cérebro, rascunhos da semana) aproveitando cota que ia expirar em minutos.
  - Se faltam **> 2h para o reset** e restam **< 20% livres**, o host entra em **Modo Econômico Automático**: desliga rodadas de opinião opcionais e desce revisões/triagens para Haiku, guardando a cota nobre para os pedidos diretos da pessoa.
- **Primeiro passo concreto:** Regra pura `computeQuotaPace(officialQuota, now)` em `packages/persona/persona-usage/src/`, ligada ao `proactivity-scheduler.ts` e exibida na pílula do rodapé (*"Modo econômico ativo até 18:00"* ou *"Aproveitando 38% da janela antes de renovar às 18:00"*).
- **Como provar que funcionou:** Teste com relógio simulado no `proactivity-scheduler`: com `usedPercent: 85` e reset em 3h, zero iniciativas rodam e revisões caem para modelo leve; com `usedPercent: 40` e reset em 30 min, 1 tarefa da fila "Quando sobrar fôlego" é concluída antes do reset.

### 5. Banca de Clientes Simulados ("Teste na rua antes de publicar")
- **A ideia:** Todo empresário ou criador sente frio na barriga antes de mandar um e-mail delicado, subir preço ou publicar uma landing page/cartaz. No cartão de entrega, o botão **"Testar com 3 clientes"** lê as páginas `kind: 'Cliente'` / `Pessoa` do Segundo Cérebro da própria empresa (ou gera 3 arquétipos do setor salvo no Cofre: *cliente fiel apressado no celular*, *novo cliente desconfiado de preço*, *cliente idoso*) e simula em 5 segundos a reação brutalmente honesta de cada um olhando a peça renderizada em tela de celular (375 px): *"Não achei onde clica pra pedir"*, *"2 por R$ 9 parece unidade ou pacote?"*.
- **Primeiro passo concreto:** Endpoint `simulateAudience({ projectId, taskId })` no `persona-host` reutilizando o motor de `opinion-run.ts` com 3 prompts curtos parametrizados pelos documentos `Cliente` do `persona-vault`/`second-brain.ts` e screenshot/PNG do entregável.
- **Como provar que funcionou:** Em fixture de cartaz sem preço ou sem telefone visível, pelo menos 2 dos 3 perfis apontam o item faltante em ≤ 6 s, e clicar em **"Pedir ajuste com base nisso"** reabre a Tarefa do autor já com os pontos selecionados.

### 6. Modo Sombra Consentido ("Aprenda me olhando por 10 minutos")
- **A ideia:** O "Ensinar a persona" atual exige parar o que você está fazendo, abrir modo de gravação em tela cheia e narrar por escrito cada clique (`RELEASE-NOTES-v1.1.md:21`). Na vida real, quase ninguém faz isso. O Modo Sombra inverte o esforço: você escolhe *"Bento, me acompanha nesta janela por 10 min"*, trabalha normalmente no Excel/ERP/navegador enquanto `computer-use-uia.ts` registra apenas transições de controle da árvore de acessibilidade do Windows (mascarando automaticamente qualquer campo `IsPassword`, CPF, cartão ou token antes de sair da memória), e no fim o Bento propõe uma Skill pronta com os passos já escritos para você só revisar e ativar.
- **Primeiro passo concreto:** Ligar `apps/desktop/src/computer-use-uia.ts` (em processo filho isolado, já previsto em `T3U-06`) a um filtro local de eventos UIA (`Invoke`, `ValueChange` não-sensível, mudança de janela/aba) que alimenta o mesmo gerador de candidata a Skill já existente em `teach/`.
- **Como provar que funcionou:** Executar 5 cliques reais num app de teste do Windows sem digitar nenhuma legenda manual; ao encerrar, a revisão do Ensinar exibe os 5 passos nomeados pelos rótulos reais dos botões UIA e `0` caracteres de um campo de senha tocado no meio do caminho.

### 7. Imunização em 1 Clique ("Virar regra da casa")
- **A ideia:** O maior cansaço com IA é corrigir o mesmo erro toda terça-feira (*"não use travessão longo"*, *"nunca ofereça desconto acima de 10%"*, *"não pergunte se o meu próprio telefone é real"*). Toda vez que a pessoa clica em **Pedir ajustes**, **Editar ação externa** ou **Recusar**, aparece uma caixinha discreta: `☐ Lembrar como regra para {Bia / toda a equipe}`. Se marcada, o host extrai uma regra canônica curta (C0 determinístico quando editou campo, ou 1 chamada minúscula) e salva no Cofre/Segundo Cérebro com selo imediato no chat: *"📌 Regra salva para Bia: nunca usar emojis corporativos em propostas."*
- **Primeiro passo concreto:** Estender `decideApproval` (`choice: 'edit' | 'cancel'`) e `requestReviewChanges` com `rememberAsRule?: 'persona' | 'project'`, criando documento `Regra` em `second-brain.ts` já aprovado pelo dono no ato.
- **Como provar que funcionou:** Recusar um texto com `"Nunca use a palavra 'imperdível'"` marcando a caixa; abrir nova Tarefa de campanha no mesmo projeto e verificar que a regra entrou no contexto obrigatório da Bia e a palavra não aparece na entrega.

### 8. Portal de Aprovação para Cliente Externo ("Link de 1 toque no WhatsApp, zero login")
- **A ideia:** Agências, designers, advogados, contadores e freelancers não aprovam trabalho sozinhos — eles mandam print no WhatsApp do cliente, recebem áudio bagunçado e copiam de volta para a IA. Em qualquer cartão `Pronto: ...`, clicar em **"Pedir aprovação do cliente"** publica apenas os entregáveis selecionados (imagem/texto Antes · Depois, nunca o fio interno nem os custos) numa página leve em Cloudflare Durable Object + R2 (`BRIEFING.md` item 12) com link de 48h. O cliente da padaria abre no celular, toca em **Aprovar** ou escreve *"troca sexta por quinta"*, e a resposta cai como evento tipado no `#geral` acordando a Coordenação (com trava para não executar nada destrutivo sem o dono).
- **Primeiro passo concreto:** Worker mínimo em `packages/persona/persona-sync/` com rota `/review/:token` estática + webhook assinado que grava `client_feedback` no `persona-host` quando o app está aberto (ou enfileira no D1 até abrir).
- **Como provar que funcionou:** Gerar link a partir de um `DeliveryCard`, abrir em navegador anônimo mobile (390×844), enviar ajuste de texto, verificar que nenhum prompt/conversa interna está no payload HTTP e que o cartão da Tarefa no Persona muda para `Ajuste pedido pelo cliente`.

### 9. Raio-X de Origem ("Por que este arquivo está assim?")
- **A ideia:** Daqui a um mês, ninguém lembra por que `cardapio.md` subiu o pão francês de R$ 12 para R$ 14 nem quem autorizou. Como o `persona-store` já guarda `turn_ledger`, `handoff`, `opinion`, `review_verdict` e `restore_point`, qualquer arquivo na aba **Arquivos** ou em **Revisar mudanças** ganha uma linha do tempo instantânea (**zero IA, 100% SQLite local**): mostra cada mudança com o rosto do animal que escreveu, quem revisou, qual mensagem humana originou o pedido e um botão **Reverter só esta entrega**.
- **Primeiro passo concreto:** Query de junção em `packages/persona/persona-host/src/draft-turn-files.ts` + `history.ts` ligando `filePath → ticketId → rootTriggerEventId + review seal + restorePointId`, exposta em `FilesView.tsx`.
- **Como provar que funcionou:** Após 2 entregas alterando o mesmo arquivo, clicar nele em `Arquivos` lista as 2 entregas com autor, data, link clicável que abre a mensagem original no `#geral` e reversão funcional da última entrega em < 100 ms.

---

## D. Roteiro: crítica da ordem atual e a nova ordem para as próximas 2 semanas

### Crítica direta à ordem atual do Atlas
*(Ordem atual: `1. v1.1.1 desempenho → 2. T3 itens 1–5 → 3. resto do TOP30 → 4. base nova de 11/11`)*

1. **Pula o incêndio nº 1 do produto:** a tentativa 5 real da equipe **não passou** (`outcome: "failed"` / `"ran-out-of-turns"`). Ir colher features do T3 Code enquanto um pedido de cartaz gera duas artes paralelas conflitantes, queima 469 mil tokens e chama o cliente de *"a pessoa"* é decorar a sala com a cozinha pegando fogo.
2. **Ignora que metade dos "itens 1–5 do T3" já está na árvore como fachada, e o buraco real é no `oar/session.ts`:** `Parar`, `fila tracejada`, `LimitBanner` e `ActivityGroup` já foram ligados na UI em `flags.ts:44-60`. O motivo de parecerem quebrados não é falta de UI estilo T3 — é que `oar/session.ts:76-146` engole os deltas de streaming das Tarefas, atropela sessões quentes no `steer` e não mata processos órfãos no Windows. Isso se resolve em cirurgia de 2–3 dias no runner/host, não num ciclo longo de "Onda A".
3. **"Resto do TOP30" na etapa 3 é armadilha de diluição de identidade:** itens como editor completo de `keybindings.json` com `when` (14), terminal PTY embutido (27), PR sync (T3B-19) e worktree sync (T3B-28/29) consomem semanas para transformar a Persona num T3 Code mais pesado — quando o diferencial da Persona é **equipe autônoma para qualquer trabalho**, não IDE de dev. Além disso, `TICKETS-UI-DRAFT.md:42` provou que vários desses blocos já existem prontos dentro do próprio DSH e foram apenas desligados no `cordis.patch.yml`.
4. **Deixar a base open source de hoje (11/11) para o fim (item 4) é erro tático:** ela sai **hoje**. Se ela trouxer uma solução superior para protocolo de CLIs, compactação, computer-use ou runtime leve, descobrir isso *depois* de construir os itens 2 e 3 joga duas semanas de código no lixo. A leitura comparativa tem que durar **4 horas hoje**, em paralelo, para alimentar as decisões antes de escrever código novo.

---

### A Ordem do CARBON para as próximas 2 semanas (11/11 → 25/11)

#### Semana 1 · Consertar o motor, secar a gordura e fazer a equipe parecer humana de verdade

- **Dias 1–3 (11/11 a 13/11) — `v1.1.1` "Leve, Rápida e Sem Mentiras"**
  1. **Abertura e RAM:** aplicar janela/splash antes do host (`main.ts:837-850`) + `NODE_COMPILE_CACHE` pré-semeado no `afterPack` + `gh --version` lazy + warmups de CLI/conectores adiados para depois do 1º quadro útil + **poda dos plugins backend mortos do DSH em `persona-app/cordis.patch.yml`** (meta: derrubar o processo `host` de 414 MB para ≤ 150 MB).
  2. **GPU parada = 0–2%:** pausar todas as animações CSS/canvas decorativas (vaga-lumes, brilho pulsante, poses animadas) quando a janela estiver sem foco/minimizada na bandeja (`visibilitychange` / `blur`) e substituir `filter: blur()` contínuos no escuro por gradientes estáticos pré-renderizados (derrubando os 21–37% de GPU ociosa).
  3. **Dieta do instalador (`DIETA.md` cortes 1–6):** tirar LibreOffice (182 MB), Python (145 MB), experimentais `sherpa`/`inspector` (45 MB), `pnpm` (21 MB), locales extras (46 MB) e usar Git do sistema com MinGit sob demanda (92 MB) → instalador de **330 MiB para ~185 MiB** e instalado de **1,18 GiB para ~730 MB**.
  4. **Varredura de honestidade (os 8 bugs vergonhosos provados hoje):** remover o 2º chip `"Decide o rotineiro"` (`ChannelComposer.tsx:1057-1060`); fechar sozinho o balão `"A Coordenação distribui o pedido"` ao enviar a 1ª mensagem; corrigir rascunho em pasta Git (auto-snapshot do rascunho no fim do turno sem exigir `git commit` da persona); corrigir `persistTurn` (`model: stored.model ?? stored.engine` em `persona-host/src/index.ts:7762`); restaurar animais na faixa escura e remover iniciais `[SR]`/`E`; alinhar badge × lista em Aprovações; habilitar `Ctrl+V` de imagem no composer (`onPaste`); confirmar antes de "Sair" da bandeja se houver Tarefa rodando.
  5. **Em paralelo no Dia 1 (timebox estrito de 4h, 1 agente pesquisador):** inventário da **nova base open source de 11/11** no formato `PEGAR JÁ / DEPOIS / IGNORAR`. Só entra nas próximas 2 semanas o que economizar código dos Dias 4–14.

- **Dias 4–6 (14/11 a 16/11) — `v1.1.2` "Equipe Coesa & Econômica" (O coração do produto)**
  1. **Unificar a orquestração de pedidos multi-parte:** `splitByFunction` deixa de disparar partes dependentes às cegas em paralelo; partes com relação insumo→produto (`texto → arte → posts`) abrem como **cadeia dependente** (a próxima nasce `waiting` pelo bilhete da anterior), e qualquer Tarefa que já faz parte de um plano do host recebe orientação explícita *"O plano já criou as tarefas dos seus colegas; entregue apenas a sua parte, não chame `pass_forward` para partes já listadas no plano"*.
  2. **Cura de voz e identidade das personas:** proibir `"a pessoa"` em toda saída visível (usar *"você"* ou o nome do dono salvo no Cofre); injetar identidade e entregas anteriores da própria persona em `readerPrompt` (`opinion-run.ts:141`, fim do *"a Bia falando da Bia"*); enxugar prompts de worker (`W3` / `leanReport`) para abolir cabeçalhos burocráticos (`**O que não fiz e por quê:**`); trocar regex frágil de `NOVA VERSÃO:` por extração tolerante inline (`/NOVA\s+VERS[ÃA]O\s*:/iu` sem exigir `^`) + recolhimento automático real do `OpinionBlock` após consolidado; nunca exibir `RealTurnCapError` como fala de persona.
  3. **Corte de tokens por Tarefa (do Pi TOP15):** aplicar `terminate` ao chamar `pass_forward`/entrega final (-1 request pago por tarefa), falha fechada em `stopReason: length`, e limitar reenvio de SVG bruto no histórico de revisão (passar diff ou caminho no rascunho + PNG renderizado).
  4. **Gate de saída obrigatório:** rodar **1 tentativa real `TEAM-10` do cartaz da Padaria Lua** e passar de primeira com **≤ 6 turnos, ≤ 120.000 tokens de entrada totais** (corte > 70% contra a tentativa 5), 1 única arte final com o texto exato da Bia, selo `"Revisado por Lia"` e **0** vazamentos.

#### Semana 2 · Turno vivo real, colheita seletiva do T3 e diferenciação exclusiva

- **Dias 7–10 (17/11 a 20/11) — Turno Vivo Real (T3 itens 1–5 de verdade no motor + paridade honesta de CLIs)**
  1. **Streaming real + Parar duro + Steer honesto em Tarefas (`oar/session.ts` + `T3B-1..T3B-4`):** emitir `delta`/`partial` de `createOarSessionRunner` para o `ReplyStream` com orçamento de payload; fazer `stopTurn` matar a árvore de processos (`taskkill /T /F` após 1,5 s se `session.abort()` não encerrar); consertar `whenIdle` com `Promise` real; implementar `steer` sem corromper o turno em voo (cancelar limpo + retomar na mesma `sessionId` com o novo direcionamento, ou enfileirar para a borda do passo atual); recibo idempotente e retomada pós-reinício sem duplicar (`T3B-2`, `T3B-3`).
  2. **Notificações nativas + Cronômetro honesto + Retomada real de cota:** ligar `personaAlwaysOn.attention` + `needsYouCount` no preload (silêncio com janela em foco); duração real `"Trabalhou 22s"` no `ActivityGroup`; `quota-wait.ts` disparando retomada única quando `resetsAt` chega (`T3B-6`); religar o controle de `"Revisão antes de entregar"` por projeto em Configurações.
  3. **Honestidade e segurança no Codex/Cursor/OpenCode:** exibir selo claro das capacidades reais de cada motor/conta em Conexões e no seletor da persona, e bloquear ações externas `send/pay/delete` em qualquer CLI que não passe pelo `PermissionGate` (falha fechada até haver gate equivalente).

- **Dias 11–14 (21/11 a 25/11) — `v1.2` "Acima de Qualquer Harness" (5 joias do T3 + 2 apostas exclusivas)**
  1. **Colher SÓ os 5 itens de maior impacto universal do resto do TOP30** (reusando os pacotes do DSH onde já existem):
     - Seletor rápido de **Modelo · Esforço** direto no composer/cabeçalho + Diagnóstico humano de CLI com "Entrar/Atualizar" (`TOP30 #25` / `T3B-7`).
     - Busca full-text abrindo na mensagem exata + `Ctrl+F` na conversa (`TOP30 #12 e #13`).
     - Paleta `Ctrl+K` como overlay modal rápido (`TOP30 #16`).
     - `@arquivo` e `$skill` no composer (`TOP30 #23`).
     - Checkpoint automático por turno no rascunho (sem exigir Git) + Rewind `"Editar daqui"` (`TOP30 #28 e #7`).
     - *(Fora das 2 semanas por baixo ROI para o público da Persona: editor de atalhos remapeáveis #14, terminal PTY #27, PR watch, worktree sync.)*
  2. **Entregar 2 apostas criativas exclusivas da Seção C** (mais o melhor achado da base de 11/11, se houver):
     - **Aposta #1: Mesa de Luz ("Circule e fale" sobre a arte/entrega)** — transforma o fluxo visual onde a tentativa 5 mais sofreu.
     - **Aposta #4: Marcapasso de Assinatura** + **Aposta #7: "Virar regra da casa" em 1 clique** (ambas pequenas em código e enormes em retenção diária).

---

## E. Arquitetura: riscos estruturais e o que mudar AGORA vs DEPOIS

### 1. Electron, peso, CPU/GPU ociosa e empacotamento
- **Diagnóstico:** Reescrever para Tauri ou Rust/Go agora seria **suicídio de cronograma** (2.100 linhas em `apps/desktop/src/main.ts`, DPAPI, UIA, E2E via CDP) para atacar o alvo errado: o `persona-host` puro usa só **93 MB**. Os 1,18 GB de RAM vêm de (a) **host inchado a 414 MB** por carregar dezenas de plugins backend ociosos do DeepSeek Harness junto com `@botiverse/oar` + `pi-coding-agent` + `@cursor/sdk`, e (b) **processo GPU a 265–434 MB com 21–37% de CPU parada** por efeitos visuais contínuos.
- **Mudar AGORA:** desligar os plugins backend ociosos do DSH no perfil `persona`, pausar animações/efeitos em background ou sem foco, abrir janela com splash antes do host, ligar `NODE_COMPILE_CACHE` no build e tirar LibreOffice/Python/MinGit/locales/experimentais do instalador base.
- **Mudar DEPOIS (v1.3+):** code-splitting agressivo de `client-ui-persona` (`client.js` tem 15,9 MB lógicos / 3,6 MB no asar) por rota/painel; avaliar WebView2/Tauri **somente se**, após os cortes acima, a RAM parada continuar > 450 MB.

### 2. Host (`persona-host` como monólito de ~7.800 linhas e estado partido em três lugares)
- **Diagnóstico:** `packages/persona/persona-host/src/index.ts` chegou a **~7.800 linhas** concentrando RPC, ACL, migração implícita, orquestração, mídia, uso, aprovações e webhooks. Pior que o tamanho é a **tripla fonte de verdade**: o estado de uma Tarefa mora simultaneamente em `Ticket/Assignment` (memória/store do `persona-engine`), em dezenas de coleções JSON soltas em `screen_doc` (`handoff`, `review_state`, `handoff_entrega`, `working_queue_meta`, `external_action`, `message_flags`) e em `events` do fio — gravados **sem transação única nem outbox de efeitos**. Quando um turno falha no meio (ou bate num limite como na tentativa 5), o cartão `DIVIDI ASSIM` diz uma coisa (`precisa de você`), o `ReviewDoc` diz outra (`sealed: true`) e o `Ticket` fica em `running`.
- **Mudar AGORA:** congelar o crescimento de `persona-host/src/index.ts` (regra dura: nenhum método novo entra direto nele; extrair por domínio) e adicionar recibo idempotente + reconciliação transacional no fechamento/falha de Tarefa (`T3B-2` / `T3B-3` / `T3B-5`) para que `TeamPlanCard`, `Ticket` e `Approval` leiam da mesma projeção.
- **Mudar DEPOIS (v1.2/v1.3):** migrar para o padrão **Event + Projection + EffectOutbox** (como `EffectOutbox.ts` do T3 Code, item `G2` do `TICKETS-BACKEND.md`), eliminando `screen_doc` ad-hoc para estado de execução.

### 3. Orquestração da equipe (Top-Down vs Bottom-Up)
- **Diagnóstico:** Hoje coexistem três orquestradores que não sabem direito um do outro: (a) `splitByFunction` (regex determinística de palavras no host), (b) `Gestor` (planos de campanha) e (c) `TeamTools` (`pass_forward` / `ask_colleague` decididos pelo LLM em cada turno). Sem um **grafo explícito do pedido (`OrderGraph`)**, eles criam trabalho duplicado ou loops de passagem (`Bia → Téo → Lia`). Além disso, `vigiaTick` (`watchdog.ts:156-159`) não guarda estado de backoff por `handoff`, gerando tempestade potencial de `nudge`/`escalate`.
- **Mudar AGORA:** dar a todo pedido dividido um DAG simples (`dependsOnTicketId[]`) onde etapas produtoras de insumo (`texto`, `pesquisa`, `dados`) precedem etapas consumidoras (`arte`, `posts`, `código`), e suprimir `pass_forward` para funções que já têm nó aberto no mesmo `split`. Corrigir `vigiaTick` com marca persistida `nudgedAt` (máx. 1 cutucada, depois escala).
- **Mudar DEPOIS:** substituir a tabela estática de radicais em português de `function-route.ts:41-78` (que falha para qualquer profissão fora das 9 famílias fixas, como jurídico, arquitetura, clínica, e-commerce) por um classificador leve baseado nas próprias descrições/skills das personas contratadas + confirmação rápida quando houver ambiguidade.

### 4. Economia de tokens na assinatura da pessoa
- **Diagnóstico:** O isolamento `answer-only` / `needed` (D-085/D-096) salvou 300k tokens de MCPs ociosos no Claude — excelente trabalho do Tally —, mas sobraram **quatro ralos grandes**:
  1. **Re-leitura de artefatos grandes (SVG/código/markdown) em múltiplos turnos de execução e revisão:** custou ~280k tokens só nos 3 turnos do Téo na tentativa 5.
  2. **Baixo reaproveitamento do pool de sessões quentes (`warmKey`):** em `packages/persona/persona-runners/src/oar/adapter.ts:419-424`, a chave inclui `tools:${toolSignature(input.mcpTools)}`. Como cada tipo de turno muda a lista de ferramentas oferecidas, o runner abre processos novos da CLI com frequência e perde o prefixo quente local.
  3. **Sub-chamadas auxiliares rodando no mesmo modelo/peso da persona:** consolidação de opinião (`opinion-run.ts:178`), revisão rotineira e resumo não precisam rodar em Opus/Sonnet `max` quando a persona principal está configurada assim.
  4. **Codex sem isolamento de MCPs pessoais:** toda chamada no Codex carrega tudo o que o usuário configurou globalmente (`RELEASE-NOTES-v1.1.md:63`).
- **Mudar AGORA:** rotear consolidação de opinião e resumos sempre para o modelo rápido da mesma conta (`CHEAP_WORK` em `session-pool.ts:6`); passar arquivos grandes por referência no rascunho em vez de colar no texto do turno; ativar `terminate` nas ferramentas de fim de etapa; corrigir `persistTurn` para medir gasto real por modelo+esforço.
- **Mudar DEPOIS:** implementar `tool_search` sob demanda para ferramentas do próprio harness (`pi/TOP15.md` #8, cortando mais ~1.626 tokens fixos por worker) e `context_edit` append-only para omitir tentativas falhas/abortadas antes do próximo turno (`pi/TOP15.md` #3).

### 5. Segurança, permissões e risco de bloqueio de conta pelos provedores
- **Diagnóstico:**
  1. **Buraco de segurança entre motores:** o `PermissionGate` HTTP (`permission-gate.ts`) protege chamadas MCP e escrita fora do rascunho no **Claude** (via `PreToolUse` + base `dontAsk`). Em **Codex, Cursor e OpenCode**, esse hook HTTP não intercepta ferramentas de conectores da mesma forma (`RELEASE-NOTES-v1.1.md:63`), mas a UI permite ligar personas nesses motores com conectores e autonomia `"Decide o rotineiro"`. **Regra de ouro violada:** segurança nunca pode depender de qual motor a pessoa escolheu no dropdown.
  2. **Risco real de ToS / Rate-Limit Anti-Abuso nas assinaturas pessoais (Hipótese de alto impacto, sustentada por `DECISIONS.md:286` e pelo comportamento de `opinion-run.ts:210`):** disparar `pool` concorrente abrindo 3–5 processos `claude` simultâneos na mesma conta de assinatura no mesmo segundo (fan-out de opinião, split paralelo + warmups + sondas de cota) tem assinatura clássica de automação abusiva para os sistemas antifraude de provedores. Além de arriscar suspensão da conta do usuário, destrói a janela de rate-limit por minuto.
  3. **Privacidade no "Ensinar":** gravação de tela hoje captura senhas/dados bancários visíveis sem redaction (`RELEASE-NOTES-v1.1.md:72`).
- **Mudar AGORA:** (a) **Falha fechada por motor:** bloquear conectores de escrita/envio/pagamento/exclusão em qualquer CLI onde `PermissionGate` não esteja ativo e provado a seco; (b) **Semáforo por conta de assinatura:** limitar a concorrência padrão a **no máximo 2 chamadas simultâneas por conta de assinatura** com espaçamento mínimo (jitter de 400–800 ms no fan-out) em vez de rajada paralela; (c) aviso vermelho claro antes de iniciar gravação do Ensinar + botão de descartar quadro antes de salvar.
- **Mudar DEPOIS:** suporte a máscara/blur de região no editor do Ensinar; isolamento completo de conectores via OAuth/MCP próprio do host para motores que não suportam `--strict-mcp-config`.

### Resumo executivo: Mudar AGORA vs Mudar DEPOIS

| Frente | Mudar AGORA (Dias 1–7 · v1.1.1 / v1.1.2) | Mudar DEPOIS (Semana 2+ · v1.2 / v1.3) |
|---|---|---|
| **Peso / Desktop** | Janela/splash antes do host; `NODE_COMPILE_CACHE`; desligar backend DSH morto no `cordis.patch.yml`; pausar animações/blur sem foco (GPU 0–2%); dieta de 480 MB no instalador. | Code-splitting por painel do `client-ui-persona`; reavaliar Tauri só se RAM parada ficar > 450 MB após a poda. |
| **Host** | Congelar `persona-host/src/index.ts`; corrigir `persistTurn` (`model`); auto-snapshot do rascunho em pastas Git; reconciliar estado `TeamPlanCard` ↔ `Ticket`. | Migrar `screen_doc` soltos de execução para `Event + Projection + EffectOutbox` transacional. |
| **Equipe / Voz** | Cadeia sequencial `texto → arte` no `splitByFunction`; cortar colisão com `pass_forward`; banir `"a pessoa"`; corrigir identidade no `readerPrompt` e regex `NOVA VERSÃO:`; recolher `OpinionBlock`. | Classificador semântico de funções além das 9 famílias fixas; Química de Dupla (`pair_norms`). |
| **Turnos / Cota** | Streaming real + `cancel` com `taskkill /T` + `whenIdle` real em `oar/session.ts`; `terminate` na entrega; `CHEAP_WORK` na consolidação de opinião. | `tool_search` BM25 para ferramentas do harness; `context_edit` omitindo tentativas falhas; Marcapasso de janela de 5h. |
| **Segurança** | Falha fechada para escrita externa fora do Claude; limite de ≤ 2 chamadas simultâneas por conta de assinatura com jitter. | Gate universal via proxy MCP do próprio host para Codex/Cursor/OpenCode; redaction visual no Ensinar. |

---

## F. As 5 decisões que o Atlas precisa tomar HOJE (11/11)

Sem comitê e sem abrir frente nova antes de bater o martelo nestas cinco:

1. **Decisão 1 — Proibir execução paralela cega em pedidos com dependência e eliminar a colisão `splitByFunction` × `pass_forward` antes de qualquer feature do T3.**
   - *Ato concreto hoje:* ordenar ao Forge + Anvil que `splitByFunction` encadeie funções produtoras→consumidoras (`texto → arte → posts`) por dependência (`waiting`) e que `TeamTools.guidanceFor` omita a ordem de `pass_forward` para partes já criadas no plano do host. Meta de aceite: rodar 1 tentativa real do cartaz da Padaria Lua passando em **≤ 6 turnos e ≤ 120k input tokens**, com zero arte duplicada.

2. **Decisão 2 — Cortar o backend morto do DeepSeek Harness em `persona-app/cordis.patch.yml` + matar o dreno de GPU ociosa junto com a Dieta do instalador na `v1.1.1`.**
   - *Ato concreto hoje:* não aceitar `perf-p0.patch` sozinho (que só esconde a demora atrás de uma splash enquanto o app continua comendo 1,2 GB de RAM e 30% de GPU!). Determinar ao Keel + Cobalt + Prism: (a) desligar no perfil `persona` todos os serviços de host do DSH não consumidos pela Persona; (b) congelar animações/halos quando a janela não está focada; (c) aplicar os cortes 1–6 do `DIETA.md` (LibreOffice, Python, MinGit, locales, experimentais, pnpm fora do instalador base). Meta medida no `perf-probe-visible.mjs`: **janela < 1,5 s, shell < 3,5 s, RAM parada < 550 MB, GPU parada ≤ 2%, instalador < 200 MiB**.

3. **Decisão 3 — Consertar `oar/session.ts` (streaming real de Tarefas, `cancel` que mata árvore de processos, `whenIdle` real e `steer` honesto) + rascunho em pasta Git como bloqueadores da `v1.1.2`.**
   - *Ato concreto hoje:* reconhecer formalmente que Tarefas de worker hoje não fazem streaming e que `steer` em `oar/session.ts` corrompe o turno ativo, e atribuir a cirurgia imediata ao Rivet + Bolt + Forge, junto com o auto-snapshot de arquivos não commitados em pastas Git (para que desenvolvedores possam usar "Revisar mudanças" hoje).

4. **Decisão 4 — Decretar falha fechada de segurança por motor, semáforo de ≤ 2 chamadas concorrentes por conta de assinatura e reforma do aceite visual da Muse.**
   - *Ato concreto hoje:* (a) nenhum conector externo executa `send/pay/delete` em motor sem `PermissionGate` provado (Codex fica somente-leitura/bloqueado com aviso claro até passar pelo proxy do host); (b) máximo de 2 execuções simultâneas por conta de assinatura com jitter para proteger a conta do usuário; (c) mudar a regra da Muse: nenhuma captura com chip `"Exemplo"`, iniciais (`[SR]`), controle duplicado ou popover cobrindo mensagens pode aprovar bundle — o script `preaccept.mjs` passa a reprovar qualquer ocorrência de `"a pessoa"` em fala de persona, `"NOVA VERSÃO:"` cru, `"RealTurnCapError"` e duplicidade de chips no composer.

5. **Decisão 5 — Podar o `TOP30` do T3 Code para os 10 itens que servem ao usuário da Persona, abrir timebox de 4h hoje para a base nova de 11/11 e reservar capacidade na Semana 2 para 2 apostas exclusivas (Mesa de Luz + Marcapasso de Cota / Virar Regra).**
   - *Ato concreto hoje:* cancelar a ideia de implementar "o resto do TOP30 inteiro" (cortando da v1.2 terminal PTY, editor de keybindings `when`, PR watch e worktree sync); colocar 1 agente por 4h hoje para dissecar a base open source de 11/11 antes de abrir código da v1.2; e reservar 30% da capacidade da Semana 2 para entregar o que faz os concorrentes parecerem ferramentas mudas do passado: **Mesa de Luz ("Circule e fale")** e **Marcapasso de Assinatura + Imunização em 1 Clique**.
