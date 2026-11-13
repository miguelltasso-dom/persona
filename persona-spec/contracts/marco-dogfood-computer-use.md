# D-117 "Persona que mexe no computador" — contrato do marco (partes por dono)

Esta página é dividida por dono; cada um escreve só a sua parte e as outras só leem. Terreno: staging até o "candidato validado" (~15:40); revisor independente do Atlas antes de ligar. Base já existente: `computer-use.md` (laço, ports, controle compartilhado, replay) e `computer-use-desktop.md` (overlay, atalho, W3-5).

---

# A parte do Cobalt — o celular: comandar, assistir ao vivo e Parar (12/11 15:10)

Só o que o cliente web e celular faz, dentro da Casa única (não é um app à parte). O modelo "Só eu / da equipe", a regra dura e o gate são do host (Flint, Bolt, Rivet); a tela de escolha ao criar é do Prism.

## K1. O que o celular é, e o que não é
- **É** uma janela para ASSISTIR e para PARAR. A persona mexe no computador; a pessoa pede (por mensagem, como hoje), acompanha e interrompe.
- **Não é** controle remoto: nenhum toque do celular vira clique, tecla ou movimento de mouse no computador. Não existe "assumir pelo celular" nem "retomar pelo celular" na v1: devolver o controle DEPOIS DE UM HUMANO ASSUMIR é só no PC (botão ou `Ctrl+Shift+Espaço`, como no W3-2). Única exceção, do Bolt (§13, a trela): se a execução pausou sozinha porque ESTE celular sumiu por 60 s, este mesmo celular pode `Continuar`.
- **Senha nunca pelo celular** (D-115): um passo que pede senha ou credencial pausa e mostra o cartão `🔒 Senha só pelo PC` com `Me lembrar no PC`. O quadro da tela que o host manda já vem com os campos de senha cobertos (`digitando ••••`, W3-5); o cliente nunca pede a imagem sem a cobertura e não guarda quadro nenhum.

## K2. O que o celular mostra
1. **A barra "Parar", sempre visível.** Enquanto QUALQUER persona está mexendo no computador num contexto que a pessoa vê, uma barra de 56 px fica fixa logo abaixo da barra de topo, em TODA tela do celular (fio, Esta noite, Espera você, quadro, gaveta aberta): `● Bia está mexendo no PC da padaria` + botão **Parar** (52 px, largura mínima 96 px, um toque, sem confirmar). Fora do conjunto "inerte" da gaveta e acima da cortina: com a gaveta aberta o Parar continua tocável. Com 2 ou mais execuções: `2 personas mexendo no computador` + `Parar` abre a lista, cada linha com o seu `Parar` (nunca um "parar tudo" escondido).
2. **O cartão vivo no fio** (`ComputerRunCard`), na conversa com a persona: o rosto dela, o computador (`PC da padaria`, o chip de D-116), a frase da ação em verde (`Clicando em Salvar`), `passo 4 de 12` e o tempo. Um toque abre a **folha "Assistir ao vivo"**.
3. **A folha "Assistir ao vivo"** (`ComputerLiveSheet`, folha de baixo, quase tela cheia): o quadro da tela do computador com o cursor da persona por cima (um círculo com o rosto), a ação em texto embaixo, `Parar` sempre na base, e `Ver o que ela fez` (o replay do W3-3: o que viu, o que fez, a expectativa e o resultado de cada passo; só leitura). O quadro se ajusta à largura (360 a 430 px) sem rolagem horizontal; toque no quadro NÃO faz nada (nem foco): não há como clicar por engano.
4. **Os estados** (todos em português simples; vêm do host, o cliente não deduz):
   | `status` do host (§13 do Bolt) | O que a pessoa lê | Botões |
   |---|---|---|
   | `rodando` | a frase da ação e `passo N de M` | Parar |
   | `esperando-aprovacao` | `{Persona} precisa da sua aprovação` + o cartão (o "segure" de 52 px **e o 2º toque**, `approveStep { confirm: true }`) ou, com senha ou segredo (`needsPc`), `🔒 Senha só pelo PC` com `Me lembrar no PC` | Parar |
   | `pausada`, `paused: 'humano'` | `Você assumiu no PC. {Persona} espera.` e `Para devolver, use o PC.` | Parar (a persona só espera: a execução está viva; sem Continuar) |
   | `pausada`, `paused: 'celular'` | `O celular ficou 60 s sem falar com o PC: {Persona} pausou sozinha.` | Continuar, Parar |
   | (a ação pedida, ainda sem `status`) | `{Persona} está se preparando…` | Parar |
   | (depois do toque em Parar) | `Parando…` | desligado |
   | `parada` | `Parada às 15:22.` (o host confirmou) | Fechar |
   | `terminou` | `{Persona} terminou.` + `Ver o que ela fez` | Fechar |
   | falha ou limite (o host diz o motivo) | a frase do host (`Passou do tempo`, `Passou do teto de passos`, `Não deu certo: …`) | Fechar |
5. **O Parar é honesto.** Toque → `Parando…` → só vira `Parada` quando o HOST confirma. Se o pedido não chegar (sem ligação, 401, 5xx): `O Parar não chegou ao PC. Pare agora no PC (Esc) ou toque de novo.` e o botão volta. Nunca "Parada" por palpite. Sem ligação com o PC, a barra fica visível e diz `Sem ligação com o PC · o computador pode continuar mexendo`.

## K3. Quem pode comandar e o que a regra dura vira na tela
- **Persona "Só eu"** (privada): só aparece para o dono, roda e mexe só no computador dele. No celular do dono, o mesmo cartão.
- **Persona "da equipe"**: o colaborador só a comanda se o dono o incluiu em "Quem pode usar". Sem permissão, o host recusa com `computer-not-allowed`; o cliente mostra `Você não pode pedir isso a {Persona}. Peça a quem cuida do computador.` e o fio segue como conversa comum. A persona da equipe NUNCA mexe num PC pessoal: o cliente só desenha o computador que o host mandou em `home`; se `home.kind` for o PC pessoal de alguém, nenhum cartão vivo nem Parar de "mexer" é desenhado para uma persona da equipe, e o cliente registra o erro (é bug do host, não da tela).
- A folha "Onde {Persona} trabalha" (D-116) ganha UMA linha, só se o host disser que ela mexe no computador: `Mexe neste computador, com a sua permissão.` / `Mexe neste computador da equipe.`

## K4. O que o cliente pede ao host (nomes provisórios; o Bolt veta e fecha `PHONE_ALLOW`)
- **Nomes fechados com o Bolt (`marco-dogfood-remoto.md` §13; Zinc/Forge decidem os do laço):** ler `getComputerUseState({ runId })` → `{ runId, personaId, status: 'rodando'|'pausada'|'esperando-aprovacao'|'parada'|'terminou', step, of, paused?: 'humano'|'celular', needsPc? }`, `getComputerReplay({ runId })`, o stream `computerWatch`; escrever `approveStep({ runId, stepId, confirm: true })` (o "segure" + o 2º toque) e o **Parar por rota própria**: `POST /remote/computer/stop`, idempotente, que não passa pelo funil dos outros Remotes e não depende do stream (401 = volta a `Ligar ao PC`). Para listar as execuções ativas (a barra Parar) peço ao Bolt `listComputerRuns()` só leitura.
- **Continuar** (só após a trela de 60 s, `paused: 'celular'`): `resumeComputerUse({ runId })` (nome provisório; o Bolt confirma).
- **Nunca pelo celular** (recusa `pc-only` ou `remote-not-allowed`): qualquer clique/tecla/rolagem ou coordenada, `takeControl`, `resume` de pausa de HUMANO, ligar ou desligar "pode mexer no computador", escolher "Só eu / da equipe", listar janelas ou arquivos do PC.
- **O quadro** (`computerWatch`): `{ seq, runId, at, w, h, jpeg, cursor: { x, y, persona: true }, step, paused }`, até 2 por segundo e 150 KB cada; **o mais novo vence** (o cliente descarta o velho e não faz fila). Pergunta ao Bolt: `cursor.x/y` é em pixels do quadro (`w`×`h`)? O cliente trata como pixels do quadro e limita à caixa. O `jpeg` vira um Blob URL trocado a cada quadro (o anterior é revogado); a CSP do Lumen E precisa de `img-src 'self' blob: data:`. Os campos de senha vêm cobertos DO HOST. Só a execução que o aparelho pediu para seguir; o stream reconfere a sessão do aparelho (revogado = cortado, ≤ 2 s, Lumen C).
- Cada Parar entra no histórico da equipe como "parado pelo celular de {membro}" (o host grava; §13).

## K5. Bateria, rede e privacidade (regras do cliente)
- Só pede quadros enquanto a folha ao vivo ou o cartão estão VISÍVEIS e a aba está em primeiro plano (`visibilitychange`); fechou ou foi ao fundo: para o stream na hora e liga de novo ao voltar. A barra Parar segue lendo só o ESTADO (leve, sem imagem) a cada 5 s.
- Guarda só o ÚLTIMO quadro, em memória; nunca em disco, cache, `localStorage` nem service worker (não há service worker no v1). Revogado, `401` ou sair da tela: o quadro é apagado.
- Quadro velho ou fora de ordem (`seq` menor) é descartado. Sem quadro novo por 4 s o cliente diz `Sem imagem agora` e mostra a última com a marca `de 15:21`, nunca a apresenta como ao vivo.
- Movimento reduzido: o cursor pula de lugar, sem interpolar. Alvos de toque de 44 px; o Parar de 52 px.

## K6. Módulos do cliente (NOVOS, em `client-ui-persona/src/client/mobile/`)
Puros: `computer-run.ts` (`readComputerRun(wire)` falha fechada: estado desconhecido = `falhou` sem Parar fantasma; `canStop(run)`; `stopBarModel(runs)`; `runLine(run)` com chaves de locale), `live-feed.ts` (`createLiveFeed({ follow, visible })`: ordena por `seq`, guarda só o último, para quando oculto, volta quando visível, marca "sem imagem" em 4 s, limpa ao descartar), `stop-flow.ts` (`stopOutcome`: `parando → parada | falha`, nunca `parada` sem confirmação), `frame-model.ts` (`cursorPosition(frame, box)` normalizado, limitado à caixa; `fitFrame(w, h, boxWidth)`).
Visuais: `ComputerStopBar.tsx`, `ComputerRunCard.tsx`, `ComputerLiveSheet.tsx`, `ReplayList.tsx`. Texto em `persona.mobile` (`computer.*`).

## K7. Testes vermelhos (staging: `.maestri/staging/cobalt-web/tests/computer-*.spec.*`)
- U1 `readComputerRun`: cada estado do host vira o seu; fio ruim (sem `runId`, estado estranho, número) vira `falhou` e `canStop` é falso.
- U2 `canStop` verdadeiro em `preparando | rodando | esperando-aprovacao | pausada` (as duas pausas); falso em `parando | parada | terminou | falhou`.
- U3 `stopBarModel`: 0 execuções = sem barra; 1 = a frase com o nome e o computador; 2+ = a contagem e a lista com um `Parar` por linha (nunca um parar-tudo).
- U4 `stopOutcome`: o `POST /remote/computer/stop` aceito (200) só leva a `parando`; vira `parada` quando `getComputerUseState` ou o stream dizem `status: 'parada'`; 401 volta a `Ligar ao PC`; 5xx ou rede → `falha` com a frase `O Parar não chegou ao PC…` e o botão volta; 200 sem `parada` NÃO é `parada`.
- U4b trela: `paused: 'celular'` mostra a frase dos 60 s e `Continuar` (chama `resumeComputerUse`); com `paused: 'humano'` não há `Continuar`; com a execução ativa e o celular sem ligação a barra avisa `Se o celular ficar 60 s sem ligação, {Persona} pausa sozinha.`
- U5 `live-feed`: quadros fora de ordem (`seq` menor) descartados; só o último fica; oculto = para o stream e não guarda; volta visível = liga de novo; 4 s sem quadro = `sem imagem` com a hora do último; `dispose` apaga o quadro.
- U6 `frame-model`: cursor normalizado vira pixel na caixa de 360, 390 e 430; fora da caixa é limitado; `fitFrame` nunca passa da largura.
- U7 (jsdom, 390 px) a barra Parar fica FORA do que é `inert` quando a gaveta está aberta e tem ≥ 52 px; com a gaveta aberta o Parar chama `stopComputerRun`.
- U8 toque no quadro da folha ao vivo não chama nada (nenhum handler de ponteiro no quadro); nenhum texto oferece clicar, digitar ou assumir pelo celular.
- U9 `precisa-de-voce` com senha mostra `Senha só pelo PC`, nenhum campo de texto e nenhum `input[type=password]`; com envio, pagamento ou exclusão pede o 2º gesto antes do `decideApproval`.
- U10 `pausada` por `humano` mostra Parar (a execução está viva) mas nem Continuar nem Retomar: só `Para devolver, use o PC.`
- U11 `computer-not-allowed` mostra a frase e mantém o fio como conversa; persona da equipe com `home` pessoal NÃO desenha cartão vivo.
- U12 revogado (`{type:'revoked'}` ou 401) apaga o quadro e volta a `Ligar ao PC`.

## K8. O que preciso dos outros
- **Bolt:** `PHONE_ALLOW` com K4 (ler, `stopComputerRun`, nunca o resto); o stream de quadros pelo portão (mesma cerca, limite de quadros e de tamanho); `followComputerRun` reconferindo a sessão. O `stopComputerRun` por celular precisa chegar ao laço mesmo com o app ocupado (W3-2: o Parar é prioridade, não entra na fila de turnos).
- **Rivet e Forge:** o quadro já coberto (senha), o cursor, `step/of`, os estados da tabela K2 no `projectReplayForUi`; o `stop` do laço (`runComputerUse`) por `runId`.
- **Flint:** `PersonaView.computerUse?: { allowed, scope: 'private'|'team' }` e `computer-not-allowed`; `listComputerRuns`.
- **Prism:** `ComputerRunCard` é uma linha do fio (mesma árvore das mensagens); me diga se prefere que eu a desenhe dentro do `MessageRow` ou como cartão próprio que ele monta. A tela de escolha "Só eu / A equipe" é dele (D-117 UX).
- **Muse:** o desenho da barra Parar, do cartão vivo e da folha ao vivo, a 360 a 430 px, claro e escuro, mais os textos finais da tabela K2.

## K9. Fora desta fatia
Controle remoto de verdade (clicar pelo celular), voz para comandar, notificação push de "Bia terminou", gravação do replay no celular, VPS (fase 2). Cada um é item próprio se o Miguel pedir.

---

# D-117 — REVISÃO DE SEGURANÇA (parte do Lumen), 12/11 15:15

Revisei o desenho do Cobalt (K1–K9), o laço (`persona-engine/src/computer-use.ts`), o gateway (`persona-runners/src/mcp/gateway.ts`), a ponte do desktop (`apps/desktop/src/computer-use-bind.ts`) e a tabela de autoridade. **Veredito: o desenho do celular (assistir e parar, nada de clique remoto) está certo. Mas 3 coisas que o D-117 pressupõe NÃO existem no código de hoje e precisam ser construídas antes de ligar:** (1) a regra "da equipe nunca mexe em PC pessoal" não tem onde ser imposta (não há "tipo do computador" nem "tipo da persona" no host); (2) as ferramentas `persona_computer_*` **não passam pela tabela de autoridade**; (3) o app da Persona roda no mesmo computador e **a persona poderia clicar no próprio "Aprovar"**.

## D0. As quatro perguntas do Keel
| Pergunta | Resposta curta |
|---|---|
| Persona da equipe nunca controla PC pessoal, **no código** | Só vale se o **executor** (o processo que mexe no mouse) checar, a cada passo, uma matriz (§D2) cujo "tipo do computador" é **declarado pelo próprio computador** e nunca pela persona nem pela tela. Hoje não existe esse dado (F2). |
| O Parar sempre funciona | Caminho próprio, fora da fila de turnos e do modelo, com interruptor de segurança se o link cair (§D3). |
| Passa pela tabela de autoridade | Hoje **não** (F1). Precisa de uma linha `computer` na tabela: `person: ask`, `routine: deny`, `unattended: deny` (inclui o laço do quadro e o M2) (§D4). |
| PC pessoal nunca entra no D-116 | Só se "ser da equipe" for um estado **do computador**, escolhido nele, com confirmação, e mutuamente exclusivo com "pessoal" (§D5). |

## D1. Achados no código de hoje (lidos, não supostos)
- **F1 · P1 — o gateway MCP ignora a autoridade.** `classifySensitive` devolve `computer_act` para `persona_computer_click/type` e o gateway abre um cartão de aprovação para QUALQUER turno. A tabela diz `interact` = **negado** para `routine` e `unattended`, mas essas ferramentas nunca a consultam: um turno do laço do quadro (M2, `unattended`) ou de uma rotina às 3 da manhã geraria um cartão que alguém aprova meio dormindo, em vez de ser negado. Requisito: o gateway recebe a autoridade do turno (como o `native-gate` já recebe) e nega `computer` fora de `person`.
- **F2 · P0 se o D-117 for ligado assim — não há dado de "tipo do computador" nem "tipo da persona" no host.** A regra 1 do D-117 ("o app impõe") hoje só poderia ser uma tela. Sem um campo que o executor consulte, qualquer cliente ou o `updatePersona`/casa (D-116) contorna a tela.
- **F3 · P0 — o app da Persona é alvo.** O laço age por UIA em qualquer janela do Windows. O cartão "Aprovar", o `approvePair` (parear aparelho), o Cofre, o botão **Parar** e as configurações são janelas do próprio Persona **neste mesmo computador**. Uma persona que mexe no PC pode aprovar o próprio envio, parear o aparelho de um atacante, ou desligar o Parar.
- **F4 · P1 — o quadro ao vivo carrega a tela inteira.** "Campos de senha cobertos" não cobre notificações, o e-mail aberto ao lado, o gerenciador de senhas, o extrato do banco, as janelas pessoais de quem usa o PC. Num computador da equipe isso vai para o celular de colaboradores; o replay guarda tudo.
- **F5 · P1 — o Parar remoto depende de a rede e o app estarem de pé.** Se o celular perde o Tailscale no meio, a persona segue mexendo, sem ninguém vendo.

## D2. A matriz que o EXECUTOR impõe (a regra dura, em código)
Quem checa: o processo que realmente move o mouse (a ponte do desktop), **antes de cada ação**, com dados que **o próprio computador guarda** (`computerKind`) e que a ficha assinada da persona carrega (`audience`, `computerUse`):

| persona \ computador | **PC pessoal** (`kind: personal`, dono X) | **PC da equipe** (`kind: team`, cadastrado, certificado do D-116) |
|---|---|---|
| **Só eu** (`audience: private`, criador X, `computerUse: on`) | **permitido** só se `criador == dono do PC == quem comanda` | **negado** (a privada só mexe no computador do dono) |
| **Da equipe** (`audience: team`, `computerUse: on`) | **NEGADO SEMPRE** (a regra 1) | permitido só se o certificado do PC liga `caps.computerUse` (por quem o cadastrou) **e** quem comanda está em "Quem pode usar" |
| qualquer uma com `computerUse: off` | negado | negado |

Requisitos: (1) `computerKind` é gravado **no computador**, nasce `personal` em toda instalação e só vira `team` pelo cadastro do D-116 (`enrollThisComputer` + confirmação do dono); nunca vem do cliente, da ficha ou da casa; (2) a checagem roda **a cada passo** (a casa, o tipo, a permissão e a lista "Quem pode usar" podem mudar no meio); (3) trocar a casa da persona (D-116, "Levar") **zera** `computerUse` em B até o dono de B ligar de novo; (4) `createPersona`/`updatePersona`/`HomeRecord` **recusam** a combinação proibida no host (a tela só esconde a opção), e uma ficha adulterada com `audience: team` num PC pessoal é recusada pelo executor mesmo assim.
**Testes:** `matrix-exhaustive` (todas as células, incluindo as proibidas, para cada autoridade); `team-persona-never-personal-pc` (por API direta, por ficha adulterada, por casa forjada, por transferência); `kind-comes-from-computer-not-persona`; `recheck-every-step` (muda o tipo/permissão/lista no passo 3: o 4 recusa); `move-resets-computer-use`.

## D3. "Parar sempre funciona"
1. **Caminho próprio:** o Parar (Esc, botão do PC e `stopComputerRun` do celular) chega ao laço por um canal **fora da fila de turnos, do modelo e do gateway MCP**; cancela o passo em voo, solta o mouse e o teclado, fecha o lease e **não rearma sozinho** (retomar é gesto humano no PC, como o "Devolver" do W3-2).
2. **Nunca bloqueado:** `stopComputerRun` está em `PHONE_ALLOW` sempre, **sem `confirm`, sem teto de taxa que o impeça**, idempotente, qualquer membro em "Quem pode usar" para aquela persona pode parar (não só quem começou), e a confirmação só volta como `parada` quando o host cessou o último passo (o Cobalt já pede isso em K2.5).
3. **Interruptor de segurança (dead-man's switch):** uma execução comandada à distância **pausa sozinha** se nenhum aparelho autorizado a acompanha por N segundos (padrão 15 s; o stream do portão reconfere a sessão a cada segundo): "comandada e assistida ao vivo" tem de falhar para o lado seguro quando a assistência some.
4. Os tetos de tempo, passos e cota são **constantes no código** com teto absoluto (a configuração só pode baixar), e o `Esc`/hook físico (W3-2) segue valendo.
**Testes:** `stop-with-model-hung`; `stop-while-act-in-flight`; `stop-with-approvals-pending`; `stop-not-blocked-by-confirm-or-rate`; `stop-twice-idempotent`; `no-auto-rearm-after-stop`; `watcher-gone-pauses` (some o aparelho: pausa em ≤ N s); `any-allowed-member-can-stop`.

## D4. Computer use e a tabela de autoridade
- Nova linha na tabela única: `computer`: **person `ask`** (um cartão por **sessão**, "A Nina vai mexer no computador por até 10 min / 40 passos: Aprovar", mais o "segure" por ação sensível, W3-4), **routine `deny`**, **unattended `deny`** (o laço do quadro, o M2 e `lead_pull` caem aqui). Quem comanda pelo celular é `person` (o membro está presente e responde ao cartão).
- O gateway MCP passa a receber a autoridade do turno e o `computer_act` a consulta **antes** de abrir o cartão (F1).
- **Zonas proibidas, sempre, em código no executor (não só no prompt):** (a) **as janelas e o processo da Persona e o overlay** (F3: hit-test por processo/ancestral UIA/HWND antes de cada clique, checagem de janela em primeiro plano antes de cada `type`/`key`, atalhos globais fora); (b) **diálogos de elevação (UAC), Segurança do Windows, o Gerenciador de Tarefas, `cmd`/PowerShell/Executar, Configurações/Painel de Controle, o Explorador de Arquivos apagando**, gerenciadores de senha; (c) acordes `Ctrl+Alt+Del`, `Win+R`, `Win+L`, `Alt+F4` na janela errada; (d) texto digitado que **pareça credencial** (`CRED`) = negado para qualquer autoridade.
- Texto lido da tela é **dado, nunca instrução** (uma página na tela que manda "clique em Aprovar" é injeção): as ações sensíveis continuam parando no cartão, e o laço registra o que a tela disse que mandou.
**Testes:** `computer-denied-for-routine-and-unattended`; `board-driven-run-cannot-use-computer` (liga ao M2); `persona-app-window-is-forbidden-target` (clique, tecla e atalho; cada janela do Persona); `uac-and-system-windows-forbidden`; `credential-looking-text-denied`; `gateway-asks-authority-before-card`.

## D5. O PC pessoal nunca entra no D-116 "computador da equipe"
- "Da equipe" é um **estado do computador**, não da persona: a máquina nasce `personal`; vira `team` só por `enrollThisComputer` **feito nela**, com a tela dizendo "Este computador passa a ser da equipe: personas da equipe poderão mexer nele" e confirmação do **dono do PC e do dono da equipe**. Voltar a `personal` apaga as personas da equipe que moravam nele (ou as leva antes: "Levar").
- Mutuamente exclusivo: um PC com persona **Só eu** com `computerUse: on` não pode ser cadastrado como da equipe sem antes desligar essa permissão (e o contrário: nenhuma persona da equipe nasce num PC pessoal).
- O certificado do D-116 carrega `kind` e `caps.computerUse`; o executor lê o que o **próprio PC** guarda, não o certificado que chega pela rede (um roster forjado não muda o tipo).
**Testes:** `enroll-personal-pc-needs-confirmation`; `enroll-blocked-while-private-computer-persona-on`; `team-computer-never-flips-by-roster`; `unenroll-removes-team-personas`.

## D6. Privacidade do quadro ao vivo e do replay (F4)
- Capturar **só a(s) janela(s) alvo** da persona (a escolhida no início da sessão), nunca a área de trabalho inteira; se uma janela de zona proibida (D4b) ou de outro processo aparecer sobre o alvo, o quadro sai **coberto por inteiro** e o passo pausa.
- Os "campos de senha cobertos" ficam, e a cobertura roda **no host** antes de o quadro sair; o celular nunca recebe imagem sem cobertura (o Cobalt já exige).
- O replay (W3-3) é dado sensível: acesso só a quem comanda aquela persona, TTL curto (ex.: 7 dias), cifrado em repouso no PC onde rodou e **não** sincronizado para outros computadores; no histórico da equipe vai o **texto** do que ela fez (alvo, ação, resultado), não os quadros.
- Num PC da equipe, o aviso fixo na tela ao cadastrar: "personas da equipe veem e mexem em tudo o que está aberto neste computador: use um computador dedicado".
**Testes:** `frame-only-target-window`; `foreign-window-covers-whole-frame-and-pauses`; `frame-masking-happens-on-host`; `replay-access-only-for-commanders`; `replay-ttl-and-not-synced`.

## D7. O que NÃO aceito como candidato
persona da equipe com qualquer caminho até um PC pessoal (inclusive ficha adulterada, casa forjada, transferência); o tipo do computador vindo de fora dele; `computer` fora da tabela de autoridade (um turno `unattended` ou de rotina com cartão em vez de recusa); a persona podendo clicar, digitar ou usar atalho na janela do próprio Persona; quadro da tela inteira indo ao celular; Parar que passa pela fila de turnos, pelo modelo ou por `confirm`; execução remota que continua sem ninguém assistindo; credencial digitada pela persona.

## D8. Ordem de construção (cada passo com vermelho → verde, depois do "candidato validado")
1. Linha `computer` na tabela + o gateway consultando a autoridade (D4) — é pequeno e fecha F1 já.
2. `computerKind` no computador + a matriz do executor, a cada passo (D2/D5) — é o que torna a regra 1 verdadeira.
3. Zona proibida das janelas do Persona (F3) — antes de qualquer prova viva do W3-5.
4. Parar fora da fila + interruptor de segurança (D3).
5. Quadro só da janela alvo + replay restrito (D6).

## D9. Perguntas para o Keel/Atlas
1. **Persona "Só eu" num computador da equipe:** a matriz nega (a privada só mexe no PC do dono). Confirma? (A alternativa, permitir com aviso, mistura "só meu" com máquina compartilhada.)
2. **Interruptor de segurança:** pausar em 15 s sem ninguém assistindo é o padrão que o Miguel quer, mesmo para a noite inteira com 2 projetos? (A noite do dogfood usa o quadro autônomo, que é `unattended` e **não mexe no computador**: este item só vale para comando remoto.)
3. **Zona proibida do app da Persona:** hoje a persona com computer use não pode operar o próprio app, nem para "ajudar a pessoa a configurar". Mantemos (recomendado)?


---

# D-117 — a parte do Flint (modelo `audience`/`computerUse` e a recusa no host), 12/11 15:45

**Só isto é meu** (o que o Lumen deixou para o host, D0/D2/D5): o MODELO (quem é a persona e se ela pode mexer no computador), a RECUSA da combinação proibida no host (a tela só esconde), e "Levar" zerando o uso do computador. **Não é meu:** a matriz do executor a cada passo e o `computerKind` gravado no computador (Rivet/desktop e Bolt, `enrollThisComputer`), o gateway MCP consultar a autoridade do turno e negar `persona_computer_*` fora de `person` (Lumen: `boardDriven` lê o doc `lead_pull` que o meu laço grava ANTES de iniciar o turno — já combinado), o Parar, o quadro ao vivo. Staging até o "candidato validado"; a superfície que liga o computer use fica DESLIGADA no produto até o revisor independente do Atlas.

## H1. O modelo
- **`audience`** — `private` (só o criador) | `team` (a equipe toda): quem a persona SERVE. Nasce na criação (`createPersona({ audience })`); persona de projeto Pessoal = `private`; compartilhada com a equipe = `team`. Mudar é `updatePersona` e passa pela mesma recusa. Doc `persona_scope` por persona na KV de telas (sem migração) `{ audience, computerUse, setBy, at }`; a FICHA ASSINADA do criador (H23, lei 3) carrega os mesmos dois campos e o host de B só aceita a ficha cujo `audience`/`computerUse` batem (o `sheetGate` do Bolt compara; eu guardo e exponho).
- **`computerUse`** — `on` | `off` (padrão `off`): a OFERTA do criador de a persona mexer num computador. Efetivo = oferta `on` E a concessão LOCAL do dono do computador onde ela roda (doc local `persona_computer_grant`, que NÃO viaja com a ficha nem com o pacote). Mexer de fato é decisão do executor a cada passo (matriz D2).
- **`computerKind`** — `personal` | `team`: fato do PRÓPRIO computador (nasce `personal`; só vira `team` pelo cadastro do D-116, com a confirmação do dono do PC e do dono da equipe). O host o LÊ por uma porta (`computerKindOf(computerId)`, que o Bolt/Rivet entregam); nunca vem do cliente, da ficha, da casa ou do roster da rede. Desconhecido = recusado (fail closed).
- Persona da equipe com `computerUse: off` PODE morar no PC pessoal do criador (D-116 — só conversa); o que a regra 1 proíbe é mexer nele.

## H2. A recusa no host (`placementVerdict`, puro, testado)
**Regra (confirmada pelo Lumen, 15:15):** persona **privada** só pode ter como casa o **PC pessoal do PRÓPRIO criador**, com `computerUse` ligado OU desligado (o que ela recebe numa DM fica decifrado no banco do computador onde roda); persona **da equipe** em PC pessoal só com `computerUse: off` (D-116: mora lá, não mexe), e com `on` só em PC da equipe. **Recusado** com código estável: `team-persona-on-personal-pc` (a regra 1), `private-persona-on-team-pc`, `private-persona-on-others-pc`, `computer-kind-unknown` (privada, ou `on`, num computador cujo tipo o host não conhece). Se isso quebra o fluxo "criar persona só minha e escolher PC da equipe", a tela não oferece a opção (a Muse só mostra "Onde roda" quando a persona é compartilhada).
**Um escritor só:** o espelho `persona_scope` só muda por `PersonaScopeBook.set`, que pergunta o veredito contra a casa ATUAL; mudar `audience` private→team ou `computerUse` off→on num PC pessoal passa pelo MESMO veredito, e uma recusa não grava nada. A casa passa pelo mesmo veredito em `PersonaHomeBook.set` (o `HomeRecord` do Bolt e a transferência: `placement-refused` com o código) e um registro de epoch maior que o veredito recusa é IGNORADO pelo fencing (um registro forjado nunca para uma persona que está rodando). O executor recusa de novo a cada passo (defesa em profundidade). A falha chega ao cliente como falha tipada com a frase pronta (nunca `gateway/internal`).

## H3. "Levar" zera o computer use
`PersonaHomeBook.set` avisa o host quando o COMPUTADOR da casa muda (`onHomeChanged(personaId, de, para)`; epoch maior no mesmo computador não avisa). A concessão local (`persona_computer_grant`) tem chave `(computerId, personaId)`: uma concessão em outro computador não vale aqui, então na casa nova ela nasce DESLIGADA (`COMPUTER_USE_AFTER_MOVE = 'off'`) até o dono daquele computador ligar de novo. O pacote da transferência nunca carrega a concessão (nem credencial). **Exigências do Lumen (15:15):** a concessão só é dada NO PRÓPRIO PC pelo dono dele (ou por quem o cadastrou, no PC da equipe) e o Remote que a dá é `pc-only` (nunca pelo celular/remoto, fora do `PHONE_ALLOW`); mudar a `audience` da persona, desligar o `computerUse` ou descadastrar o computador REVOGA a concessão (`PersonaScopeBook` chama `onRevoke`; o descadastro é gancho do Bolt/D-116).

## H4. Provas (vermelho primeiro)
`persona-scope.spec` (9, na raiz de staging; o Lumen confere a tabela por `placement matrix (exhaustive)`: 2 audiences × computerUse × tipo do PC (pessoal | equipe | desconhecido) × dono = criador | outro, 24 células contra uma tabela explícita), mais: um escritor só (recusa não grava; privada→equipe com `on` em PC pessoal recusada; `off`→`on` passa pelo mesmo veredito), revogação ao mudar audience/desligar, casa forjada, concessão por (computador, persona), uso efetivo = oferta E concessão local E colocação permitida. `persona-home.spec` (+3): trocar de computador avisa; casa que a regra recusa é recusada ANTES de gravar; registro de epoch maior recusado não faz fencing. Host real (depois do aviso): `team-persona-never-personal-pc` por API direta (`createPersona`, `updatePersona`), por ficha adulterada e por casa forjada/transferência (`PersonaHomeBook.set`) — todas recusadas e NADA gravado; `kind-comes-from-computer-not-persona` (o host ignora qualquer `computerKind` que venha no pedido); `move-resets-computer-use`.

## H5. Perguntas ao Lumen
**Respondidas pelo Lumen (15:15): (1) conferido** — "team + PC pessoal" só é recusado com `computerUse: on` (cuidados dele: o que ela faz lá sem computer use segue confinado pela tabela de autoridade, e a recusa vale também no EXECUTOR a cada passo); **(2) ok** — a concessão local fica no host do computador, não viaja, nasce OFF depois de "Levar", só no PRÓPRIO PC e `pc-only`, chave `(computerId, personaId)`, revogada ao mudar a audience ou descadastrar; **(3) NÃO** — persona PRIVADA em PC da equipe é negada também com `computerUse: off` (feito no `placementVerdict`; o teste de conferência é o `placement matrix (exhaustive)` em `persona-scope.spec.ts`).

---

# A parte do Forge — o laço: como a persona que mexe no PC entra no ciclo sem furar a autoridade (12/11 15:2x, desenho; staging)

Cobre turnos, admissão (M2/M3), Parar e a regra dura NO CÓDIGO do laço. O modelo "Só eu / Equipe" e a recusa da combinação proibida são do Flint (H1/H2) e a tela de escolha do Prism; a prova viva W3-5, do Zinc com o Rivet; o bind do desktop (gate, `held`, overlay), do Rivet; o celular, do Cobalt (K1..K9 acima); `PHONE_ALLOW`, do Bolt. Eu só leio os nomes deles e fecho o ciclo.

## L0. Uma ideia
Mexer no computador **não é um segundo motor ao lado do ciclo**: é uma Tarefa comum da persona, pela mesma porta de tudo (admissão do projeto → vaga justa → faixa do projeto → runner da persona). O que muda: o runner dessa Tarefa recebe as ferramentas `persona_computer_*` **só se existir uma execução autorizada (`ComputerRun`)**. Sem execução = a ferramenta nem está na lista (ausência, não recusa em tempo de execução). `runComputerUse` (W3-1) continua sendo o laço de plano confiável (roteiro, prova viva com fake, rotinas de plano fixo); não é o caminho do pedido de uma pessoa.

## L1. A regra dura em UMA implementação (`computer-scope.ts` do Zinc, persona-engine; ninguém copia)
```ts
// o que o laço usa (Zinc, persona-engine/src/computer-scope.ts):
createComputerScopeGuard({ persona: () => ComputerUsePersona, computer: () => ComputerDescriptor, allowedIds: () => readonly string[] }).check(commanderId)
  → { allow: true } | { allow: false, reason: ComputerScopeReason }
```
Decisão do Keel (15:33): a matriz é UMA só, a do Zinc, a única implementação; o `computerAccessOf` do Flint (colocação + concessão local do dono do computador + "Quem pode usar") **importa dela**, e o executor do Rivet e o meu laço chamam o mesmo guard. Os motivos são os do Zinc, todos **fail-closed**: `invalid`, `unreadable`, `computer-use-off`, `not-owner`, `private-persona-on-team-pc`, **`team-persona-on-personal-pc`** (a regra 1, vale até para o dono e com qualquer flag), `team-computer-not-enabled`, `commander-not-allowed`. O laço acrescenta UM motivo só dele, conferido ANTES do guard: **`computer-not-here`** (a casa da persona não é este computador: o app só mexe na máquina onde roda; pedido remoto é EXECUTADO aqui). `persona`, `computer` e `allowedIds` são **funções** que leem o host de novo a cada chamada, nunca valores guardados na execução; o tipo do computador vem do registro da PRÓPRIA máquina (`readComputerKind`), nunca do pedido, da ficha ou do roster.
Chamada em **3 momentos**: (a) ao criar/atualizar a persona e ao mudar a casa (Flint, H2); (b) ao abrir a execução (eu); (c) **antes de CADA passo** (eu), lida de novo do host, nunca guardada na execução: persona que mudou de computador no meio, ou computador removido, termina a execução na hora (`falhou`: `O computador mudou; parei.`).

## L2. A execução (`ComputerRun`, doc de tela durável + memória)
`{ runId, projectId, personaId, computerId, ticketId, requestEventId, requestedBy, via: 'pc'|'phone', state, startedAt, steps, of }`. Estados = os da tabela K2 do Cobalt (`preparando · rodando · precisa-de-voce · pausada-humano · parando · parada · concluida · falhou · limite`) + `na-fila` (espera o computador) + `interrompida` (reinício do app) + `expirou`. Quem decide é o host; o cliente só mostra.
Nasce **na admissão do pedido**, escrita pelo host ANTES de abrir o runner, a partir de uma **mensagem humana**. O pedido de runner da Tarefa leva `computer: { runId }`; o gate do Rivet (`gateComputerActing`) lê a execução e `computerAccessOf` a cada chamada.
Leitura e parada (eu implemento no host o que o Bolt fechar em `marco-dogfood-remoto.md` §13: `listComputerRuns`, `getComputerRun`, `followComputerRun`, `getComputerReplay`, `stopComputerRun`; o Cobalt K4 ainda diz `getComputerUseState`/`computerWatch`: **decidido pelo Keel (15:33): um nome só, `getComputerRun` (Bolt); o Cobalt ajusta o K4**). Os estados do fio: **uma tabela só (decidida pelo Keel): a do Cobalt K2 (separa `parando`, `falhou`, `limite`) e o `paused: 'humano'|'celular'` do Bolt como atributo das pausas. **Não existe Remote que comece execução**: ela nasce da mensagem, como qualquer pedido.

## L3. Quem pode começar: só a pessoa (origem `person`)
`quadro`, `routine`, `initiative` e `handoff` abrem turno normal da persona **sem** ferramentas de computador; se o trabalho precisa da tela, a Tarefa vira cartão `Espera você: a Bia precisa mexer no computador; peça a ela` (`computer-needs-person`). Por quê: D-117 é "comandada e assistida ao vivo"; sem ninguém olhando não há mouse, e texto lido na web ou num e-mail nunca inicia o uso do PC. A autoridade da execução é o **evento humano gravado** (como a marca `lead_pull` da Lumen), nunca um prefixo de gatilho nem o `TurnOrigin` da admissão. Trabalho noturno na estação = v2, com revisão.

## L4. Admissão, vaga e turnos (M2/M3)
- **O cartão da sessão** (Lumen D4: `computer` = `person: ask`, "A Nina vai mexer no computador por até 10 min / 40 passos: Aprovar") segue a regra do cartão de ação: **não ocupa vaga e não conta turno** enquanto espera; aprovado, a Tarefa continua pelo laço normal (turno de continuação contado, abaixo).
- **1 turno contado por pedido** (chave = id do evento, idempotente). Continuar depois de `você assumiu` ou de uma aprovação = turno novo, contado (chave `computer:<runId>:<n>`), pedido pela pessoa (origem `person`).
- A execução ocupa **1 vaga** (fila justa do M3) enquanto roda e **1 uso do computador** (L6). `precisa-de-voce` e `pausada-humano` **soltam a vaga e não contam turno**; o computador fica preso até 10 min e depois a execução vira `expirou` e solta.
- **Teto do projeto:** em `full` o pedido novo recebe a linha honesta que já existe; no meio da execução o gate consulta `projectAdmission.loadOf` (só lê, não conta) antes de cada passo: `full` → termina `limite` (`O projeto atingiu o limite de hoje; o último passo já tinha saído`). A cota entra pelo livro-caixa como qualquer turno (imagem conta como entrada).
- Os limites do W3-4 (20 passos · 120 s · 8000) valem **por execução**.

## L5. Parar é prioridade e nunca espera na fila
- Entradas: Esc/botão no PC (hook), `POST /remote/computer/stop` e `stopComputerRun` do celular (Bolt §13: rota própria, sem o funil dos outros Remotes), o Parar do fio. Todas chegam a UMA função, `ComputerRuns.stop(runId, by: { memberId, via })`, **síncrona e fora da faixa do projeto e da fila de vagas** (não espera turno de ninguém; funciona com o projeto em `full`).
- Passos: (1) estado `parando` e o MESMO freio do "você assumiu" (`SharedControlPort` em `human` + a bandeira de parada que o gate lê): a PRÓXIMA chamada de ferramenta é recusada, o evento em curso não é entregue (meta do Bolt: ≤ 300 ms); (2) aborta o turno do runner (mesma via do Parar de Tarefa); (3) espera a ação em voo voltar (≤ 3 s; travada: mata o runner e tranca a porta de ação); (4) só então `parada`, solta vaga e computador e grava no histórico (`origem: pc|celular`, aparelho). **`parada` só depois do passo 3**; o que já saiu (um clique) não se desfaz e a linha diz isso.
- Idempotente (parar duas vezes = o mesmo resultado); parar uma execução `na-fila` cancela sem ruído; **qualquer** membro de "Quem pode usar" pode parar, não só quem começou (Lumen D3).
- **Sem ninguém assistindo** (a "trela": Lumen D3.3 e Bolt §13): execução `via: phone` cujo aparelho que a comanda some por mais de N s **pausa sozinha** (`pausada`, `paused: 'celular'`: o mesmo estado que o Bolt e o Cobalt já usam), tratada como `pausada-humano` (solta a vaga, segura o computador por até 10 min). **N = 15 s** (decisão do Keel, 15:33; só vale para comando remoto); o laço lê N de uma constante com teto absoluto. Retomar: no PC sempre; pelo celular **só** uma pausa `paused: 'celular'` e **só** com o aparelho de volta (stream reconectado e sessão reconferida); a pausa `paused: 'humano'` nunca retoma pelo celular. Pausa, não parada: nada se perde.

## L6. Um computador, uma persona por vez
`ComputerLease` por computador (irmão do lease do navegador): FIFO; quem espera fica `na-fila` (`O computador está com a Bia`), **sem vaga e sem turno**; Parar cancela. Solta em `concluida · falhou · limite · parada · expirou · interrompida`. Vive no host do computador: fim do host = fim do lease.

## L7. Reinício e queda
Ao subir, toda execução `preparando|rodando|precisa-de-voce|pausada-humano` vira `interrompida`, **nunca retoma sozinha** (nenhum mouse mexe depois de um reinício), com uma linha (`O app fechou no meio; não continuei sozinha. Peça de novo.`); os usos do computador são limpos.

## L8. Pelo celular
O pedido entra como mensagem humana (mesma porta) e a execução leva `via: 'phone'`. Para `phone` o gate recusa `credentials` (senha só pelo PC, D-115) e `resume` (só no PC), e as aprovações de envio, pagamento e exclusão pedem o 2º gesto (Lumen D.4). Replay e quadro saem de `ReplayEntry` já mascarado (senha `••••`; nomes da árvore passam pelo mesmo mascaramento da DM privada).

## L9. Testes vermelhos primeiro (staging `.maestri/tmp/forge/marco/computer/`; host real + runner falso que segura o turno, relógio do host)
1. **Matriz da regra** (`computer-scope.ts`, a do Zinc): cada recusa de L1 pelo seu motivo; `team` + `pessoal` recusa até com o dono pedindo; dado ausente recusa.
2. **Re-checagem por passo:** persona muda de computador no meio → o próximo passo é recusado e a execução termina `falhou`; nenhuma ação depois.
3. **Origem:** `quadro/routine/initiative/handoff` abrem o runner **sem** ferramentas de computador e a Tarefa vira o cartão `computer-needs-person`; `person` abre com elas.
4. **Admissão:** 1 turno por pedido (idempotente); `precisa-de-voce` não segura vaga nem conta turno; `full` recusa com a linha; `full` no meio termina `limite`.
5. **Parar:** com a faixa do projeto ocupada por outra Tarefa longa, o `stop` fecha em < 500 ms; com ação em voo vira `parando` e só depois `parada`; a próxima chamada de ferramenta é recusada; vaga e computador soltos; idempotente.
6. **Exclusão mútua:** 2 personas, 1 computador: a 2ª fica `na-fila` sem vaga e sem turno; Parar cancela; a 1ª termina e a 2ª começa sozinha.
7. **Reinício:** execução `rodando` + host novo no mesmo arquivo = `interrompida`, nenhum passo a mais, nenhuma retomada.
8. **Humano assumiu:** `pausada-humano` solta a vaga; `resume` pelo celular recusa `pc-only`; pelo PC começa um turno novo contado.
9. **Celular:** `via: 'phone'` + passo `credentials` recusa; envio/pagamento sem o 2º gesto não passa.
Prova no fim: o mesmo fluxo da prova viva (Bloco de Notas, fake) rodando por essa porta no host real, com o app aberto.

## L10. O que preciso dos outros
- **Zinc:** `computer-scope.ts` (a matriz e os negativos da regra 1) e a prova viva usando a mesma. **Flint:** `computerAccessOf` (colocação + concessão local + "Quem pode usar") **importando** do Zinc, e o `PersonaView.computerUse` que o Cobalt usa. **Prism:** a tela de escolha lê o mesmo veredito, sem uma cópia.
- **Rivet:** o executor chamar `computerAccessOf` antes de cada ação e as zonas proibidas (Lumen D4a); `held()` do gate ler a execução (`runId`) e o estado `parando`; `release()` ao soltar o último uso; me dizer o limite da ação em voo (quanto leva um clique a voltar).
- **Flint (laço do quadro):** nenhum pedido do quadro leva `computer` (L3); o `lead_pull` que ele grava antes do turno é o que o gateway da Lumen lê para negar (D4).
- **Lumen:** revisar L1, L3 e L8 (autoridade) antes de ligar.
- **Bolt:** `PHONE_ALLOW` = ler + `stopComputerRun`; `stopComputerRun` com prioridade (não entra na fila do app).
- **Keel:** nada de `packages/**` até o "candidato validado"; as mudanças do host são pequenas e em arquivos novos (`computer-scope.ts` é do Zinc e `computer-access` do Flint, que importa dele; `computer-runs.ts` e `computer-lease.ts` são meus), mais 3 ganchos pequenos em `orchestration.ts`/`index.ts` depois do M2 e do M3.

## L11. Contrato fechado de alvo (`HWND`/`PID`), `AbortSignal` e fecho do Z11 (12/11 19:08, implementado na árvore)
- **Engine (`persona-engine/src/computer-use.ts`, re-exportado em `index.ts`):** `ComputerUseTarget` (`{ windowHandle: string; processId: number; title?: string }`), `DesktopPortContext` (`{ target?: ComputerUseTarget; signal?: AbortSignal }`) entregue em todo `DesktopObservePort.observe(context?)` e `DesktopActPort.act(action, context?)`, `ScreenObservation.target?`, `ComputerUsePlan.target?`, `ComputerUseReport.target?`, `runComputerUse` com `{ target?, requireTarget?, signal? }`, `isValidComputerUseTarget` / `assertComputerUseTarget` / `sameComputerUseTarget` (compara `windowHandle` + `processId`), e `ComputerUseStatus` / `ReplayResult` com `'stopped'` (`STOPPED_COMPUTER_USE = 'Parado a pedido.'`).
  - **Falha fechada no laço:** `target` malformado ou ausente com `requireTarget` ⇒ `denied` `target:no-target`; divergência entre `input.target` e `plan.target` ⇒ `denied` `target:mismatch`; `obs.target` ausente com `requireTarget` ⇒ `denied` `target:unverified`; `obs.target` de outra janela ⇒ `denied` `target:outside-window` antes de agir; recusa de escopo no `act` (`scope:*`, `persona-app`, `forbidden-target`, `outside-window`, `no-target`, `forbidden-chord`, `forbidden`) encerra `denied` na 1ª tentativa (sem retentar); `AbortSignal` abortado encerra `stopped` antes/durante/depois de passo sem novo `act` nem `observe` de verificação.
- **Host puro (`persona-host/src/computer-runs.ts`, ainda sem ligar nos arquivos quentes):** `ComputerRun.target?`, `TargetVerdict`, `ComputerRunsDeps.{ requireTarget?, targetVerdict? }`, `ComputerRuns.signalOf(runId)`.
  - **`open()`** valida forma (`no-target`) e chama `targetVerdict(target)` (sem gravar nada se negar; com `requireTarget` e sem juiz ⇒ `no-target-judge`).
  - **`beforeStep(runId, kind, observedTarget?)`** com `requireTarget` e sem `observedTarget` fecha `falhou` (`target-unverified`, `Não consegui confirmar a janela; parei.`); com deriva fecha `falhou` (`outside-window`, `A janela alvo mudou; parei.`); reconsulta `targetVerdict(observedTarget ?? run.target)` a cada passo.
  - **`stop(runId)`** (inclusive `na-fila`), `interruptOnBoot()` e fechamentos não-`'concluida'` abortam `signalOf(runId)` de forma síncrona ANTES de `deps.abort`.
- **Provas (engine + host puro, 12/11 19:08):** `computer-use-target.spec.ts` (11/11), `computer-use.spec.ts` (10/10), `computer-use-scope.spec.ts` (8/8), `computer-runs-target.spec.ts` (8/8), `computer-runs.spec.ts` (15/15); `check-pkg persona-engine` OK; `oxlint` 0 erros nos 5 arquivos.
- **Acting / MCP (`packages/persona/persona-runners/src/mcp/{acting-tools,gateway,turn-tools}.ts` + `index.ts`, 12/11 19:21, aguardando parecer de autoridade do Lumen e aceite do Keel):**
  - `ComputerActingContext` (`{ readonly runId?: string; readonly target?: ComputerUseTarget; readonly signal?: AbortSignal }`, reexportado em `persona-runners/src/index.ts`).
  - `ActingPorts.{ computerScreenshot?, computerClick?, computerType? }` aceitam `context?: ComputerActingContext` no último argumento. Sem `computer` em `actingMcpTools` / `openTurn` / `openTurnTools`, a chamada preserva a aridade legada (`()` / `(x, y)` / `(text)`); com `computer`, envia apenas o contexto do host (ignora `args.target`/`args.runId` vindos do modelo).
  - `actingPortsFromComputerUse` e `gateComputerActing` mantêm `computerScreenshot` só quando definido (preservando `onlyWired` no gateway), repassam `context` e devolvem `'parado a pedido'` quando `context?.signal?.aborted === true`.
  - `McpGateway.openTurn` e `OpenTurnToolsInput` aceitam `computer?: ComputerActingContext`. Em `invoke`, `authorityCell(turn.authority, 'computer') === 'deny'` continua rodando PRIMEIRO; em seguida, se `COMPUTER_TOOL` e `turn.computer?.signal?.aborted === true`, falha fechado com `{ content: 'parado a pedido', refused: true }` antes de abrir cartão (`onApproval`) e antes de chamar a porta.
  - **Provas:** `acting-target.spec.ts` **3/3**, `acting-gate.spec.ts` **2/2**, `computer-authority.spec.ts` **7/7**, `tool-binding.spec.ts` **14/14** (**4 arquivos / 26 testes passed** sob `--lock check`); `oxlint` nos 5 arquivos **0 warnings / 0 errors**. **Restam:** revisão do Lumen + aceite do Keel, e ligações M8/M9 no host na janela do Keel após Flint.


---

# A parte do Rivet: o EXECUTOR no desktop e a prova viva do W3-5 (com o Zinc), 12/11 15:31

**Só isto é meu:** o processo que de fato mexe no computador (`apps/desktop/src/computer-use-*.ts`): escopo, zonas proibidas, hook, captura, Parar, e o que o instalador precisa. A matriz e a autoridade (Lumen D2/D4), o laço (Forge), o modelo `audience`/`computerUse` (Flint) e o celular (Cobalt) são dos donos. Ordem do Keel: a prova viva só DEPOIS da zona proibida (Lumen D8-3). Tudo em staging até o "candidato validado".

## X1. O que o executor faz hoje (lido no código, 4 fatos que mudam o desenho)
1. **O hook "o humano mexeu" é local, não global.** `subscribeHook` do `main.ts` (~1087-1100) escuta `before-input-event` da JANELA PRINCIPAL do Persona: só vê teclado e mouse quando o foco está no Persona. Se a pessoa mexe no Bloco de Notas, onde a persona age, nada pausa (`computer-use-hook.ts:3` diz "until a global uiohook"). O W3-2 "humano mexeu, pausa imediata" não vale fora do app.
2. **A busca por nome é no DESKTOP INTEIRO.** Os scripts de UIA fazem `RootElement.FindFirst(Descendants, nome)` (`computer-use-uia.ts:187,207`): o primeiro elemento do Windows com aquele nome, em qualquer janela. Um "Aprovar" ou "Parar" do próprio Persona casa com o nome (é o F3 do Lumen, confirmado no código), e "Salvar" pode cair na janela errada.
3. **As chamadas de UIA BLOQUEIAM o processo principal.** O `spawn` injetado no `main.ts` (~1058) é `spawnSync` com timeout de 8 s: durante um passo de UIA a interface e os IPC do desktop (inclusive um Parar) ficam parados até 8 s. Isso contradiz o D3 do Lumen ("Parar sempre funciona").
4. **A persona não move o mouse real.** As ações são `InvokePattern` e `ValuePattern` por nome (nunca coordenada, nunca SendInput); o cursor da persona é só o overlay. Bom: não disputa o mouse com a pessoa. Mas o `synthesized` do hook hoje nunca dispara e a ideia "ignorar input sintético" não tem o que ignorar.

## X2. O que construo no executor (vermelho primeiro, em staging)
- **a. Escopo por janela alvo.** A sessão escolhe a janela (HWND e processo) no início; toda busca de UIA começa NELA (nunca em `RootElement`). Antes de cada ação: o elemento pertence ao processo do alvo? Não pertence à árvore de processos do Persona (Persona.exe, filhos, overlay)? Não é zona proibida (Lumen D4b: UAC/`consent.exe`, Segurança do Windows, Gerenciador de Tarefas, `cmd`/PowerShell/Terminal/Executar, Configurações, gerenciadores de senha, diálogos de apagar do Explorador)? Se não, recusa com código estável (`forbidden-target`). Testes: `persona-app-window-is-forbidden-target` (um "Aprovar" do Persona com o mesmo nome do alvo nunca é clicado), `uac-and-system-windows-forbidden`, `search-never-starts-at-desktop-root`.
- **b. A matriz a cada passo** (Lumen D2): o executor lê `computerKind` do PRÓPRIO computador, nunca da persona nem da rede. Proposta de fonte: `kind = 'team'` só se `station.json.team` existe (o cadastro do D-116, R2 do `marco-dogfood-onde-roda.md`) e o certificado liga `caps.computerUse`; caso contrário `personal`. Recheck em cada passo.
- **c. UIA assíncrono e cancelável.** `spawn` assíncrono com `AbortSignal` e prazo por passo; o Parar aborta o passo em voo e mata o PowerShell filho; o processo principal nunca espera. Teste: com um filho pendurado de 8 s, um IPC de Parar responde em < 200 ms e o filho morre.
- **d. Hook global (W3-2).** Duas rotas: (1) **helper de PowerShell com C# inline** instalando `WH_MOUSE_LL` e `WH_KEYBOARD_LL` (a mesma técnica dos scripts de UIA; zero módulo nativo novo no pacote), vivo só enquanto há sessão (mesmo ciclo do overlay), reportando SÓ `{ kind, injected, ctrl, shift, espaço, esc }`, nunca o texto da tecla, nunca gravando; (2) `uiohook-napi` (nativo: asarUnpack, `runtime-file-policy`, assinatura, pnpm do Keel). **Recomendo (1)**. Risco honesto: um hook de teclado de baixo nível por PowerShell tem forma de keylogger e pode ser marcado por antivírus; vou medir no Defender do pack e, se marcar, caio na (2). Regra de "sintético": só é sintético o input que leva a NOSSA marca em `dwExtraInfo`; input injetado por outra ferramenta (acesso remoto, AnyDesk, RDP) É humano e pausa. (Como a persona não injeta input, hoje nada é sintético.) Esc durante a sessão = Parar, e Ctrl+Shift+Espaço continua sendo o "Devolver" (retomar nunca é automático).
- **e. Captura só da janela alvo** (Lumen D6): `desktopCapturer` com a fonte da janela, nunca a tela; se uma janela de zona proibida ou de outro processo cobre o alvo, o quadro sai coberto e o passo pausa; senha coberta NO host antes de o quadro sair. Teste com a janela do fixture e uma janela estranha por cima.
- **f. Parar fora da fila.** `stopComputerRun` e o Esc chegam ao `control` do bind por canal próprio (nem fila de turnos, nem modelo, nem MCP); abortam o passo e não rearmam sozinhos. A parte do laço por `runId` é do Forge.

## X3. O que o INSTALADOR e o PC precisam
- Com o helper PowerShell (recomendado) NENHUM módulo nativo novo entra no pacote; o verificador do pack passa a conferir que o script do hook está no asar com hash fixo. Se cair na rota (2): `uiohook-napi` desempacotado do asar, na lista do `runtime-file-policy` e assinado.
- Windows PowerShell 5.1 (já vem no Windows 10/11). Modo de linguagem restrito (AppLocker/WDAC) quebra `Add-Type`: falha FECHADA com uma frase ("este computador não deixa a Persona usar o computador"), nunca age sem o hook.
- UIPI: sem elevação o Persona não enxerga nem clica janelas de administrador; a persona recebe "essa janela é de administrador" e pausa. Tela bloqueada, UAC e o desktop seguro devolvem UIA vazio: o passo pausa em vez de insistir. **PC dedicado:** o guia da Estação (`marco-dogfood-24h.md`) passa a dizer também "bloqueio de tela desligado"; a tela pode apagar, mas não bloquear.
- Nenhuma permissão nova a pedir ao usuário no Windows (diferente do macOS). Instalador sem mudança.

## X4. A prova viva do W3-5 (app instalado, sem IA paga)
**Fixture:** uma janela WinForms aberta por PowerShell (determinística, sem depender de idioma do Windows): botão "Salvar" (mostra "Salvo!"), campo de texto, campo de SENHA, um botão "Aprovar" falso. **Caminho de produto, sem gancho de teste novo:** CLI falso roteirizado (como os e2e com `PERSONA_SCRIPTED=1`) emite `persona_computer_click/type` pelo gateway MCP até `desktopComputerUseActions(bind)`, com a superfície ligada só por flag de teste (D-113: desligada no produto). Passos e o que cada um prova:
1. clique em "Salvar" → o fixture mostra "Salvo!" (lido por UIA, não por captura) e o overlay mostra o cursor da persona (captura para a Muse);
2. o fixture tem um "Aprovar" e o Persona também (cartão): a persona NUNCA clica o do Persona (escopo);
3. campo de senha: UIA devolve `digitando ••••` e o SetValue é recusado;
4. um helper manda input real injetado (sem a nossa marca) no meio do passo: a persona PAUSA em < 300 ms, mesmo com o foco no fixture e não no Persona (prova o hook global); Ctrl+Shift+Espaço retoma; sem isso nunca retoma;
5. um passo preso de 8 s + Parar: o Parar responde em < 200 ms e o passo morre (prova o UIA assíncrono);
6. "Sair" com o overlay aberto termina em ≤ 5 s sem processo fantasma (o medidor existente, `scripts/persona/bug-quit/validate-exe.mjs`);
7. janela de UAC/Gerenciador de Tarefas aberta por cima: recusa com `forbidden-target`.
Evidência: relatório em `.maestri/tmp/rivet/w35-proof/` (tempos, capturas claro/escuro, log do hook sem texto de tecla).

## X5. Ordem e dependências
Primeiro o que é só meu e não depende de ninguém (staging, com `spawn` falso): X2-c (UIA assíncrono), X2-a (escopo + zona do Persona), X2-d (hook, com um `SetWindowsHookEx` real só na prova). Depois, quando Lumen D8-1..3 e o `stop` por `runId` do Forge existirem: X2-b e X4. O Zinc (Atlas 14:59) toca a prova viva comigo; eu entrego a ele o estado acima e o fixture.

## X6. Em aberto
- **Lumen:** o hook global por helper PowerShell (só `kind` e flags, nunca texto) é aceitável, ou exige a rota nativa? E "injetado por outra ferramenta = humano" (acesso remoto conta como a pessoa) está de acordo?
- **Forge:** `AbortSignal` por passo no port `ActingPorts` e o `stop` por `runId`.
- **Keel/Flint:** `computerKind` = `station.json.team` (cadastrado) ou outra fonte local.


---

# A parte do Zinc — o modelo "Só eu / Da equipe" e a regra dura (12/11 15:30)

Implementa a matriz D2 do Lumen e fecha o passo 2 da ordem do Keel. Módulo puro, sem Electron: stage em `.maestri/tmp/zinc/marco/packages/persona/persona-engine/{src/computer-scope.ts,tests/computer-scope.spec.ts}` (espelho em `.maestri/staging/zinc-computer/`). **16 testes verdes**, vermelho registrado antes (módulo inexistente, 15:19). Decisões do Keel já aplicadas: "Só eu" em PC da equipe = negado; o tipo do computador vem da MÁQUINA.

## Z1. O modelo (três dados, três donos)
| Dado | Quem guarda | Quem pode mudar |
|---|---|---|
| `persona.audience` (`private` = Só eu, `team` = Da equipe) | a ficha assinada | o dono da persona |
| `persona.computerUse` ("Pode mexer no computador", padrão `false`) | a ficha assinada | o dono do computador onde ela mora; zera ao "Levar" |
| `computer.kind` (`personal` \| `team`) + `teamComputerUse` | **a própria máquina** (`ComputerEnrollmentRecord`) | só o cadastro D-116 feito NELA, com o dono do PC E o dono da equipe confirmando |

## Z2. A função e onde ela é chamada
- `decideComputerUse({ persona, computer, commanderId, allowedIds })` → `{ allow } | { allow:false, reason }`. A regra 1 vem ANTES de qualquer lista, permissão ou dono: persona `team` + PC `personal` é recusada sempre.
- `createComputerScopeGuard(...).check(commanderId)`: o executor (ponte do desktop) chama **a cada passo**, relendo o estado; leitura que lança = `unreadable` = recusa.
- `readComputerKind(registro)`: `personal` por padrão; `team` só com `enrolledAsTeam`, `confirmedByComputerOwner` e `confirmedByTeamOwner` todos `=== true`. Campo `kind` vindo de fora é ignorado.
- `validatePersonaComputerConfig({ persona, home })`: o host chama em `createPersona`/`updatePersona`/`HomeRecord`; a tela só esconde a opção (D-117 UX).
- `personaAfterMove`: "Levar" zera `computerUse`. `canEnrollComputerAsTeam`: PC com persona Só eu mexendo não vira da equipe antes de desligar.
- Razões (códigos estáveis para o cliente e o histórico da equipe): `computer-use-off`, `not-owner`, `private-persona-on-team-pc`, `team-persona-on-personal-pc`, `team-computer-not-enabled`, `commander-not-allowed`, `invalid`, `unreadable`.

## Z3. O que já existe da Onda 3 vs. o que falta
| Peça | Estado | Onde |
|---|---|---|
| Laço (`runComputerUse`, limites 20 passos/3 tentativas/120 s/8000 tokens, expectativa por passo) | **existe** (Forge) | `persona-engine/src/computer-use.ts` |
| Controle compartilhado + pausa por humano (W3-2) | **existe** | engine + `apps/desktop/src/computer-use-control.ts`, `-hook.ts` |
| Replay (W3-3), gate "segure" (W3-4) | **existem** | engine (`projectReplayForUi`), gateway MCP |
| Overlay, cursor, UIA, atalho `Ctrl+Shift+Espaço` (W3-5/6) | **existe em fakes + COM injetável**; sem prova no instalado | `apps/desktop/src/computer-use-*.ts` |
| **Matriz Só eu / Da equipe + regra dura** | **NOVO, verde no stage (este módulo)**; falta ligar no executor e no host | Z4 |
| `computerKind` guardado na máquina | **falta** (só o tipo e o leitor puro; o registro vem do cadastro D-116, Bolt/Rivet) | |
| Linha `computer` na tabela de autoridade + gateway consulta antes do cartão (F1) | **falta**, passo 1 do Keel | `persona-runners` (`contract.ts`, gateway) |
| Zona proibida: janelas do Persona, UAC, Cofre, gerenciador de senhas (F3) | **falta**, ANTES da prova viva | `computer-use-bind.ts` |
| Parar por canal próprio + interruptor de 15 s (só comando remoto) | **falta** | engine + Bolt (`/remote/computer/stop`) |
| Quadro só da janela alvo, replay restrito (F4) | **falta** | Rivet |
| Comando e tela ao vivo no celular (Cobalt K1-K9) | **falta**, depende do host acima | Cobalt/Bolt |
| VPS | fase 2 | |

## Z4. Ligação (na liberação; cada item 1 mudança por vez, nasce DESLIGADO com `surface-gates`)
1. **Executor** (`computer-use-bind.ts`, dono Rivet): antes de cada ação do laço chamar `guard.check(commanderId)`; recusa vira `ReplayEntry` com `result: 'denied'` e o motivo. O guard lê `computer` do registro local, nunca da persona.
2. **Host** (Flint): `PersonaView.computerUse?: { allowed, scope: 'private'|'team' }` (o que o Cobalt K8 pede), `validatePersonaComputerConfig` nos pontos de escrita, `computer-not-allowed` para a recusa no celular.
3. **Cadastro D-116** (Bolt/Rivet): grava `ComputerEnrollmentRecord` na máquina só com os dois consentimentos; chama `canEnrollComputerAsTeam`.
4. **Casa** ("Levar"): chama `personaAfterMove`.

## Z5. Testes que faltam (vermelhos antes de ligar; os do Z2 já estão verdes)
- `executor-calls-guard-every-step` (laço com guard falso que passa a negar no passo 4: o 4 não age) — com Forge/Rivet.
- `host-write-points-refuse-forbidden-combo` (createPersona, updatePersona, HomeRecord, transferência) — com Flint.
- `enroll-record-written-only-on-this-machine` — com Bolt/Rivet.
- Prova viva W3-5 (Bloco de Notas): só DEPOIS da zona proibida do Persona (Lumen F3/D8.3); sem IA real, roteiro fake do engine; vídeo + stills.

## Z6. Coordenação
Rivet: ponte (Z4.1) e zona proibida; Forge: o guard entra no laço como port (`ScopePort`) sem mudar o `runComputerUse` existente; Lumen: revisar o `computer-scope.ts` (matriz e falha fechada) antes de ligar. Prova viva e vídeo: depois do passo 3 da ordem do Keel.

## Z7. O ao vivo: só o recorte da janela da persona, só quem pode pedir (Atlas 15:36) — verde no stage
`persona-engine/src/computer-watch.ts` + `tests/computer-watch.spec.ts` (12 testes; vermelho 15:38, verde 15:40; junto com o computer-scope são 28 verdes).
- **Quem assiste:** `decideWatch` / `createWatchGate.admit(viewerId)` reusam a MESMA matriz do `computer-scope.ts` (o espectador no lugar do comandante): "da equipe" só quem está em "Quem pode usar"; "Só eu" só o dono; equipe em PC pessoal nunca transmite. O portão reconfere A CADA quadro (lista mudou ou aparelho revogado = cortado no quadro seguinte, `device-revoked`); leitura que falha = ninguém assiste.
- **O que sai:** `planWatchFrame` devolve `crop` com SÓ o retângulo da janela alvo (limitado à tela) ou `covered`. Sem janela alvo, fora da tela ou entrada inválida = quadro coberto por inteiro, nunca a área de trabalho. Janela de outro processo ou de zona proibida encostando no recorte = quadro coberto por inteiro e `pause: true` (Lumen D6).
- **Senha:** as máscaras vão em coordenadas do recorte, limitadas a ele; senha inválida cobre o quadro todo. A cobertura roda no host antes de o quadro sair.
- **Quem liga:** o capturador do Rivet passa a ter `planWatchFrame` como único caminho para o quadro do `computerWatch` (Bolt), com o `admit` no stream.

## Z8. Respostas à Muse (15:34)
1. **Quem cadastrou o computador da equipe:** o cadastro D-116 já tem a confirmação do dono (`confirmComputer`), então o host SABE, mas ainda não existe o campo no contrato; peço ao Bolt `enrolledBy: { memberId, name }` no registro do computador da equipe. Até lá a tela usa a frase sem o nome ("Quem cadastrou o PC liga isso").
2. **"Pedir permissão" ao dono do computador:** NÃO existe. A tela só explica, sem botão (D-117 regra 2: a permissão é do dono, no PC dele).

**Atualização 15:46 (Flint 15:39 + Lumen 15:15 (3)):** `validatePersonaComputerConfig` agora recusa a persona PRIVADA fora do PC pessoal do próprio criador, com `computerUse` ligado OU desligado (`private-persona-on-team-pc` / `not-owner`); da equipe desligada mora onde o D-116 mandar; da equipe ligada + PC pessoal = `team-persona-on-personal-pc`. Teste "placement matrix (exhaustive)" com 24 células; 52 testes verdes no stage (vermelho antes: 4 células).

## Z9. Revisão do Lumen (15:50) aplicada no stage — ESCRITA, AINDA NÃO RODADA (16:30)
Memória crítica (Keel 16:21): nenhum vitest até o aviso "memória liberada". Os testes abaixo estão escritos e revisados à mão; o verde/vermelho só vale depois de rodar.
- **P1 not-home:** `ComputerUsePersona.homeComputerId` e `ComputerDescriptor.computerId` (campos NOVOS). `decideComputerUse` recusa `not-home` quando a casa da persona difere do computador, ou falta qualquer um dos dois, ANTES da lista e do tipo. Nova razão: `not-home` (agora 9 `ComputerScopeReason`; o Flint mapeia a frase). Testes `not-home-denied`, `missing-home-denied`, `not-home antes da lista`.
- **P2 (2):** já corrigido às 15:46 (matriz de 24 células).
- **P2 (3) commanderId:** o `commanderId` NUNCA vem do pedido. O executor/host o tira da identidade autenticada da chamada (caller-context do Bolt; `resolveMember` falhando fechado). Fica como requisito do Z4 e teste `commander-from-caller-context` do host (Flint/Bolt), não do módulo puro.
- **P2 (4):** o tipo `ComputerDescriptor` agora diz: é o registro LOCAL desta máquina, nunca o certificado/roster como chegou da rede.
- **P2 (5) TOCTOU:** `ScopePort` no laço (`persona-engine/src/computer-use.ts`, cópia no stage; opcional, ausente = comportamento antigo). Pergunta no começo de cada passo (antes do cartão) e imediatamente antes de CADA ação; recusa = `ReplayEntry` `denied` com `scope:<motivo>` (só o código, nenhum dado) e status `denied`. Testes em `computer-use-scope.spec.ts` (sem scope = igual a hoje; 2 perguntas por passo; nega no passo 3 no começo e antes de agir; cartão demorado em que a permissão some; scope que lança; equipe em PC pessoal = zero ações e zero cartões). **Pendente:** o resultado `allow` ainda não entra na linha de auditoria dos passos que agiram (exigiria um campo novo em `ReplayEntry`: decisão do Forge).
- **P3 (6):** o `catch` do guard já devolve só `unreadable`, sem dado.
- **P3 (7) propriedade:** restringir (desligar `computerUse`, tirar o comandante, trocar para pessoal, apagar o registro) nunca vira deny -> allow; `allowedIds` com itens não-string não quebra e não permite (não-array = `invalid`).
- **Para o Forge:** aplicar no `computer-use.ts` da árvore o diff entre `packages/persona/persona-engine/src/computer-use.ts` e a cópia do stage (`ScopePort` + `refuseByScope` + 2 pontos de chamada + o campo `scope?` na entrada). Hot file: 1 mudança com âncora.

## Z10. Harness da prova viva W3-5 — validado sozinho (Zinc, 12/11 18:25)
`.maestri/tmp/zinc/marco/proof/` (fora da árvore): `fixture.ps1` (janela **WPF** isolada: `Texto`, `Senha` (PasswordBox, `IsPassword`), `Salvar` -> "Salvo!" + `%TEMP%\persona-fixture\saved.txt`, `Aprovar` = isca; `state.json` com `saveClicks/approveClicks/passwordChars`), `verify.ps1` (lê SÓ a janela do fixture por UIA + `state.json` + `saved.txt`; exit 0 = verde; reprova se a isca foi clicada ou se digitou senha), `human-input.ps1` (SendInput real, `dwExtraInfo=0`, `MouseNudge` ou `Esc`; só a sintaxe foi validada, não enviei input ao PC), `selftest.ps1` (age por UIA como a persona e prova que o verificador reprova antes de agir, passa no fluxo certo e reprova com a isca clicada). **AUTOTESTE VERDE.**
- **Achado:** WinForms via PowerShell expõe tudo como `Pane` sem `ValuePattern`/`InvokePattern` (e o rótulo com o mesmo Name da caixa era achado no lugar dela): o fixture virou WPF. Lição para o executor: uma busca por Name pode casar o RÓTULO (`Texto`) em vez do campo; o escopo por janela e a busca por Name + tipo (`Edit`) do Rivet precisam resolver isso.
- **O que falta para a prova com a persona (depende do Rivet):** escopo por janela alvo (hoje o snapshot de UIA parte do `RootElement` do desktop inteiro: eu NÃO rodo o laço real enquanto isso, pois leria janelas do Miguel), zona proibida do app da Persona (Lumen F3/D8.3), hook global, Parar no instalado. Roteiro previsto: `runComputerUse` (fake do engine, sem IA) com `scope` = `createComputerScopeGuard` (persona Só eu, PC pessoal do dono) sobre o fixture, depois o mesmo no Bloco de Notas novo + arquivo em `%TEMP%`.

## Z11. O alvo (HWND/pid) no laço e a zona proibida: o que já existe e os 2 buracos que faltam (Zinc, 12/11 19:10; combinar com Forge e Rivet; nenhum arquivo quente tocado)
**Já existe (conferido na árvore, não refazer):** `ComputerUseTarget` + `DesktopPortContext.target` em todo `observe/act` do laço; `runComputerUse` recusa `target:no-target`, `target:mismatch`, `target:outside-window` e `requireTarget`; `ComputerRuns.open/beforeStep` (Forge) validam o alvo, fecham a execução com `A janela alvo mudou; parei.` e abortam por `runId`; `ScopePort` (meu) é perguntado antes do cartão e antes de CADA ação. Os scripts UIA do Rivet (staging) começam em `FromHandle(HWND)` e respondem `no-target | outside-window | persona-app | forbidden | password`, provado ao vivo no fixture em 12/11 18:57.
**Buraco 1 — ninguém julga se a janela ESCOLHIDA pode ser alvo.** `open()` só confere a forma (`isValidComputerUseTarget`: HWND não vazio, pid > 0); uma janela do Persona, do UAC ou de um terminal passa como "alvo válido". Só o executor sabe o nome do processo. Contrato: (a) o executor escolhe a janela e chama `judgeTargetWindow(scope, { processId, processName })` do Rivet ANTES de montar o `target`; recusa vira `forbidden-target | persona-app | outside-window | no-target` e NENHUMA execução abre; (b) `ComputerRunsDeps` ganha `targetVerdict?: (target) => { ok: true } | { ok: false; why: string }` (o executor injeta o julgamento acima); `open()` e `beforeStep()` o consultam, e com `requireTarget` ligado a AUSÊNCIA da porta recusa (`no-target-judge`, falha fechada). Dono: Forge (campo em `ComputerRunsDeps`, arquivo dele); Rivet injeta.
**Buraco 2 — ausência de observação do alvo passa (falha aberta).** `beforeStep(runId, kind, observedTarget?)` e `checkObservedTarget` do laço só comparam QUANDO `observedTarget`/`obs.target` existe; se o adaptador do desktop esquece de reportar, nada é conferido e o passo age. Contrato: com `requireTarget` ligado e a execução com alvo, `observedTarget` ausente fecha a execução (`target-unverified`, frase `Não consegui confirmar a janela; parei.`), nos dois lugares (host e laço). Dono: Forge (2 linhas aditivas); Rivet garante que o `observe` SEMPRE devolve `target` (HWND + pid lidos do próprio elemento raiz do snapshot, não do pedido).
**STATUS 19:21:** Buracos 1 e 2 FECHADOS pelo Forge na árvore (19:09): `ComputerRunsDeps.targetVerdict` (`no-target-judge` sem juiz com `requireTarget`; `target-unverified` se `observedTarget` falta) e `target:unverified` no laço; `ComputerActingContext { runId?, target?, signal? }` em `ActingPorts` (19:21, com Lumen/Keel para aceite). Falta o lado do Rivet: injetar `targetVerdict` = `judgeTargetWindow`, o `observe` sempre devolver `target`, e a sessão escolher a janela. Prova viva depois disso: Zinc.
**Testes (vermelho primeiro, 1 arquivo por dono, só na hora de ligar):** Forge, `computer-runs-target.spec.ts` +3: `open` recusa alvo julgado proibido (persona-app, terminal, outro pid) sem gravar execução; `beforeStep` com juiz que passa a negar no passo 3 = o 3 não age; `observedTarget` ausente com `requireTarget` = `target-unverified`, nada agiu depois. Engine, `computer-use-target.spec.ts` +1: `obs.target` ausente com `requireTarget` = `denied target:unverified` antes de agir. Zinc (meu `computer-use-scope.spec.ts`): scope + alvo juntos: o scope nega ANTES de qualquer `observe` (nenhuma janela é lida quando a regra 1 nega, nem a do alvo). Rivet: `observe` sempre com `target`, 3 casos do `run-uia-script.mts` viram spec (no-target, outside-window, persona-app).

## Z13. Prova viva W3-5 ponta a ponta SEM IA, no fixture (Zinc, 12/11 ~20:55) — VERDE, 10 verificações
`.maestri/tmp/zinc/marco/proof/run-proof.mts` (fora da árvore; da raiz: `node --import tsx .maestri/tmp/zinc/marco/proof/run-proof.mts`). Junta o laço REAL (`runComputerUse`, com alvo, `requireTarget` e `scope`), os scripts UIA com escopo do Rivet (staging) como portas `observe/act` e o `createComputerScopeGuard`, sobre a janela do fixture (rodando como `pfhost.exe`, nunca janela do Miguel). Resultado: D1-D3 o juiz do Rivet recusa terminal (`forbidden-target`) e o próprio Persona (`persona-app`) como alvo e aceita o fixture; B equipe em PC pessoal = `denied scope:team-persona-on-personal-pc`, 0 observe, 0 ação, fixture intacto; F pid errado = `denied target:outside-window`, fixture intacto; C senha = nunca digitada (`passwordChars` 0, passo termina `failed`); A fluxo certo = `done`, 2 passos verificados, replay com o alvo; V `verify.ps1` independente OK (`saved.txt` confere, isca `Aprovar` intacta). Limpeza ao fim (0 processos, pasta de `%TEMP%` removida). **Limites honestos:** o snapshot do Rivet não devolve o `value` dos campos, então a expectativa do passo de digitar é "o campo existe" (quem confirma o texto é o `verify.ps1`); ainda NÃO prova overlay, hook global de mouse/teclado, Parar em < 200 ms nem Bloco de Notas/vídeo (esperam o Rivet e o aviso de pack do Keel).

## Z14. Prova pelo CAMINHO DO PRODUTO (executor real da árvore) — escrita, aguardando ok do Atlas para rodar (Zinc, 12/11 ~22:30)
`.maestri/tmp/zinc/marco/proof/run-proof-product.mts` troca as portas feitas à mão do Z13 pelo executor real (`apps/desktop/src/computer-use-executor.ts`: `createExecutorObservePort/ActPort`, `createPowerShellRunner` assíncrono com `AbortSignal`) sob o laço real e o guard da regra 1. Cenários: D terminal como alvo; B equipe em PC pessoal (0 observe); P a janela do próprio Persona como alvo (`personaPids` = pid do fixture: nada age); F pid errado; C senha nunca digitada; H humano assume depois do passo 1 (`paused`, Salvar não clicado); **S Parar com passo preso (invoke dorme 8 s): `stopped` em < 200 ms depois do abort e sem PowerShell filho pendurado**; A fluxo certo com o texto conferido por `value` (o snapshot do Rivet agora devolve `value` de campos não-senha); V `verify.ps1`. Imports validados em seco (`PROOF_DRY=1`); NÃO rodei: abre uma janela real minimizada (regra do Atlas 20:46: aviso e ok antes). Resta fora do harness, por depender do app instalado: overlay/cursor, hook global de mouse/teclado, Bloco de Notas + vídeo.

**Z14b (22:50): janela de teste que nunca aparece.** A 1ª tentativa (22:3x) foi ABORTADA pela trava: o fixture "minimizado" nasceu visível (`IsIconic=False`) por alguns segundos. Correção: `proof/placement.ps1` (`Set-FixturePlacement`: Manual, `Left/Top = -32000` antes de existir o HWND, sem ativar, sem barra de tarefas), usada pelo `fixture.ps1`; teste SEM janela visível `proof/placement-test.ps1` (cria só o HWND com `EnsureHandle`, mede com user32): controle negativo sem a função = FALHA (L=673 T=395, pediria barra de tarefas); com a função = OK (invisível, L/T fora da tela, fora da barra). O harness mantém a trava em tempo de execução (aborta se a janela não estiver minimizada nem fora da tela). Atlas (22:31): pode rodar a prova sozinho a partir de 01:00 com as mesmas condições, sem pedir de novo; se a janela ficar visível, abortar.

## Z12. Negativo no INSTALADO: "persona da equipe tentando controlar PC pessoal = recusado" (item extra do Miguel; Lumen revisa) — roteiro, Zinc 12/11 19:10
Roda só DEPOIS do pack do S3/S4 e 1 por vez pela trava, no Persona instalado, sem IA real, sem janela do Miguel. O PC de teste é pessoal por padrão (`readComputerKind`: nasce `personal`). Quatro caminhos, TODOS devem ser recusados com o código estável, sem gravar nada e sem mover o mouse: (1) por API direta: `createPersona`/`updatePersona` com `audience: team` + `computerUse: on` na casa = este PC → `team-persona-on-personal-pc`; (2) ficha adulterada: persona privada gravada e a ficha trocada para `audience: team` → o executor recusa no 1º passo (`scope:team-persona-on-personal-pc` no replay); (3) casa forjada / transferência (`PersonaHomeBook.set` com epoch maior) → `placement-refused` e a persona que roda NÃO é parada pelo registro forjado; (4) pedido de execução (`ComputerRuns.open`) para essa persona, mesmo com o DONO pedindo → `{ ok:false, reason:'team-persona-on-personal-pc' }` e `approveClicks`/`saveClicks` do fixture = 0. Prova: `state.json` do fixture sem mudança + linha `scope:team-persona-on-personal-pc` no replay + nenhuma execução em `active()`. Caso positivo de controle no mesmo PC: persona "Só eu" do dono, com `computerUse: on` e a concessão local, abre e executa o fluxo do fixture. O roteiro depende de: Flint (`computerAccessOf` ligado ao host), Rivet (executor com guard), Probe/Ember (o e2e instalado) e do aviso do Keel.
