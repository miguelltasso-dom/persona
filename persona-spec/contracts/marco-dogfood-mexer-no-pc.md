# D-117 "A persona que mexe no computador" (M9) — a parte do Prism (telas), compartilhada com o Cobalt — rascunho 12/11 15:10

Escopo: SÓ as telas. A permissão, o laço (W3-1..6), a prova viva (W3-5) e o remoto são do Zinc, do Forge, do Rivet e do Bolt; o desenho e o texto são da Muse; o Cobalt faz a casca do celular e IMPORTA os componentes abaixo (sem largura de desktop, alvos de 44 px, "Parar" de 52 px no toque). Tudo em staging até o "candidato validado". HONESTIDADE (HONEST-1): nenhuma tela mostra computador, cursor, passo ou tempo que o host não mandou.

## 1. "Onde vai trabalhar" (criar e editar a persona; junto do passo do D-116)
Duas perguntas simples, nesta ordem:
- **Quem pode usar?** — `Só eu` (padrão) | `A equipe`. Com `A equipe` aparece, logo abaixo, **Quem pode mandar** (só pessoas que o dono listar; começa só com o dono): "um colaborador só comanda a persona se o dono o incluiu" (regra 5). Sem ninguém mais na equipe a lista nem aparece (item 23: pessoas reais).
- **Pode mexer no computador?** — um interruptor, DESLIGADO por padrão, com uma linha fixa: "Ela usa mouse, teclado e janelas desse computador. Você pode parar a qualquer momento." É a permissão explícita da regra 2 (dada por quem é dono do computador; no computador da equipe, por quem o cadastrou).
- **A combinação proibida não é uma opção (regra 1):** `A equipe` + computador PESSOAL + "mexer": o interruptor não fica cinza e morto; ele é SUBSTITUÍDO por uma linha ("Para a equipe mexer no computador, {persona} precisa morar num computador da equipe.") com o link "Escolher um computador da equipe" (que leva ao "Onde roda" do D-116). O app também impõe isso no host (o cliente só espelha).

## 2. "Parar", sempre visível (regra 3)
- Componente `StopPersonaButton`: sempre na tela enquanto a persona mexe no computador. No PC: o botão + "Esc" (a dica fica no title e no texto). No celular: botão de 52 px, largura toda na folha "Ao vivo". Um clique PARA (sem confirmação: é o freio); o estado volta com a frase do host ("Parou. O que já foi feito fica no histórico.").
- Também no cabeçalho da conversa, no lugar do chip de estado, enquanto ela mexe ("Mexendo no PC da padaria · Parar").

## 3. Acompanhar ao vivo (PC e celular; regra 4)
- Componente `LiveComputerView`: a imagem do computador (quadros que o host manda) com o cursor da persona por cima (`PersonaCursor`, o do W3-3), a linha do passo atual (a frase do host), o tempo/passos usados contra o teto (só se o host mandar os números) e o `StopPersonaButton`. No celular abre como FOLHA por cima da conversa; no PC, no painel lateral do fio.
- **Senha nunca pelo celular (D-115):** quando o passo pede senha/Cofre, a tela mostra "Senha só pelo PC" + "Me lembrar no PC" (aviso no PC); nenhum campo de senha.
- **Ação sensível:** o cartão de aprovação do fio com o "segure" (item 5), 52 px no toque; a persona espera.
- **Pausa imediata por humano (W3-2):** se alguém mexer no mouse do PC, a tela diz "Parada porque alguém usou o computador" e oferece "Continuar" (só no PC).
- **Sem sinal:** "Sem imagem agora" + o último quadro com a hora; nunca um quadro velho passando por ao vivo.

## 4. Histórico (regra 5)
O que ela fez fica no histórico da equipe: o replay do W3-3 (`ActionReplay`), no fio e no perfil, com quem mandou.

## O que peço ao host (nomes provisórios; Zinc/Rivet/Bolt decidem)
`watchComputerSession({ personaId })` -> fluxo de `{ frame (ref/dataURL), cursor: { x, y, state }, step?, elapsedMs?, steps?, ceilings? }` (relido a ~2 quadros/s no celular); `stopComputerSession({ personaId })` -> ok/erro; o estado "mexendo no computador" em `PersonaView.home`/presença; `computerUse: { allowed, who: 'owner'|'team', canCommand: personId[] }` na ficha. Sem esses campos as telas 2 a 4 não aparecem.

## Componentes (Prism, em staging; o Cobalt importa)
`WhereWorksField` (1, junto do `WhereRunsField` do D-116), `StopPersonaButton` (2), `LiveComputerView` (3), a fita "Mexendo no PC · Parar" do cabeçalho (2). Alvos de 44 px; nada que suponha a largura do desktop.

---

# D-117 (M9): a parte da Muse (desenho e texto final), 12/11 15:30

**A prancha** (claro e escuro) está em `.maestri/tmp/shots/design/mexer/`:
- `criar-*`: as 2 perguntas e o caso proibido;
- `desktop-*`: a fita, o cartão vivo, o painel ao vivo e os estados;
- `celular-*`: o fio com a barra Parar, a folha ao vivo, "senha só pelo PC" e "parou".

A fonte é `.maestri/tmp/muse/casa-equipe/mexer.html?tela=…`. Quando o texto daqui divergir do texto do Prism ou do Cobalt, **vale o daqui**: eles desenharam a estrutura, eu fecho as palavras.

## X0. Texto
- **Sem pronome para a persona** (regra do Keel): "Ela usa mouse…" vira `{Persona} usa o mouse…`; "Ver o que ela fez" vira `Ver o que {Persona} fez`.
- **Sem particípio com gênero:** `Parada às 15:22` vira `{Persona} parou às 15:22.`
- **"Mexer no computador"** é o nome da coisa em todo lugar. Nunca "computer use", "controlar" ou "automação".

## X1. Ao criar (no mesmo passo "Onde {Persona} vai trabalhar?" do D-116)
| Peça | Texto e forma |
|---|---|
| Pergunta 1 | `Quem pode usar {Persona}?`, com 2 ChoiceCards lado a lado (um sobre o outro abaixo de 520 px). Os cartões são **`Só eu`** (padrão; `Só você conversa com {Persona} e pede coisas.`) e **`A equipe`** (`Quem você escolher conversa com {Persona} e pede coisas.`). |
| Pergunta 1b (só com `A equipe`) | `Quem pode pedir coisas a {Persona}?`. As pessoas aparecem em chips de 36 px com o rosto de 24, e o `Você` é fixo e sem ×. Fecha com `+ Adicionar` e a linha muted `Toda a equipe lê o que {Persona} fez. Só quem está aqui pede.`. Sem mais ninguém na equipe, a 1b não aparece. |
| Onde (com `Só eu`) | Não pergunta. É a linha fixa `Neste computador · {nome}` + `Uma persona só sua trabalha no seu computador, com a sua conta Claude.` |
| Onde (com `A equipe`) | O campo do D-116 (M1). |
| Pergunta 2 | `Pode mexer no computador?`, com um interruptor **DESLIGADO por padrão**. O título é `Mexer no {computador}` e a linha `{Persona} usa o mouse, o teclado e as janelas, como você. Você vê ao vivo e pode parar a qualquer hora (Esc).` |
| Ligado | A nota com o glifo `hold` embaixo: `Antes de enviar, pagar ou apagar, {Persona} pede a sua aprovação. Senha, só você digita.` |
| **Proibido** (equipe + computador pessoal) | O interruptor não aparece. No lugar dele vai a caixa tracejada com `lock`: **`Aqui, {Persona} não mexe no computador`** + `O {computador} é pessoal. Uma persona da equipe só mexe num computador da equipe, nunca no de alguém.`, e o botão secundário `Escolher um computador da equipe`, que abre o "Onde" na escolha "Num computador da equipe". |
| Computador da equipe que **outra pessoa** cadastrou | No lugar do interruptor, a linha `Quem cadastrou o {computador} ({nome}) liga isso, no próprio PC. Até lá, {Persona} conversa e trabalha sem mexer na tela.` Sem `enrolledBy` do host (Zinc 15:41: ainda não está no contrato), a frase fica sem o nome: `Quem cadastrou o {computador} liga isso, no próprio PC.`. Sem botão "pedir": o pedido não existe (Zinc Z8, D-117 regra 2). |

## X2. O Parar (o freio)
- **A forma:** uma variante **sólida** nova do `Button`, `stop`. O fundo é `--persona-danger`, a tinta branca no claro e ameixa `#2a1020` no escuro, a borda e a sombra de pressão ameixa, e um quadrado cheio de 12 px antes do texto.
  - O `danger` de hoje (tinta clara) é para "Tirar permissão" e não serve de freio.
  - Eu entrego a variante pelo meu stage. O nome no código é `variant="stop"`.
- **Os tamanhos:**
  - no desktop, 32 px na fita e 48 px no painel (`Parar {Persona}` + a tecla `Esc`);
  - no celular, 52 px na barra e na base da folha (`Parar` na barra, `Parar {Persona}` na folha).
- **Um toque e nada de confirmar.** O botão vira `Parando…` (o texto muda; não há spinner) e só passa a `{Persona} parou às 15:22.` quando o host confirmar.
  - Na falha: `O Parar não chegou ao PC. Pare no PC (Esc) ou toque de novo.`, e o botão volta.
- **A fita do cabeçalho** (desktop): a pílula verde `success-tint` com a bolinha e `Mexendo no {computador}`, mais o Parar de 32 px. Ela fica no lugar do chip de estado.
- **A barra do celular:** 64 px sob a barra de topo, `success-tint`, com `{Persona} está mexendo no {computador}` e o `Parar` de 52 px (largura mínima 96 px).
  - Com 2 ou mais: `2 personas mexendo no computador` + `Ver` (abre a lista, cada linha com o seu Parar).

## X3. O cartão vivo e o painel ao vivo
- **O cartão no fio** (`ComputerRunCard`):
  - à esquerda, o glifo cursor num quadrado de 40 px;
  - a ação do host em verde, 14,5 px e 650 (`Digitando "Pão de queijo" na coluna Produto`);
  - a linha `Mexendo no {computador} · passo 4 de 12 · 2 min` em 13 px muted;
  - o botão `Assistir` (desktop) ou `Assistir ao vivo` (celular, 44 px, largura toda).
- **O painel** (desktop, 560 px à direita) **e a folha** (celular, quase tela cheia, com o puxador):
  1. o topo `AO VIVO` + o computador + o chip `Mexendo`;
  2. **a imagem da tela**, com a borda de 1,5 px, raio de 14 e 16:10 (4:3 no celular). **A imagem não ganha tema**: é a tela do PC.
  3. **o cursor da persona** (`PersonaCursor`): a seta branca com o contorno ameixa e a pílula na cor do bicho, com o rosto de 20, o nome e o verbo (`digitando`, `clicando`). No celular, só o nome.
  4. a ação em verde;
  5. **os medidores** `Passos 4 de 12` e `Tempo 2 de 10 min` (barras de 6 px), **só com os tetos do host**. Sem os tetos, só `passo 4`.
  6. o Parar;
  7. o link `Ver o que {Persona} fez até agora` (o replay W3-3).
- **Privacidade do ao vivo (Atlas 15:36; vale para o Zinc e o Bolt):**
  - (1) **A imagem é SÓ a janela em que a persona trabalha** (o recorte da janela ativa dela), nunca a área de trabalho inteira: sem notificações, outras janelas ou e-mails. A linha muted sob a imagem diz `Só a janela em que {Persona} trabalha. O resto da tela do PC não aparece.`.
  - Com outra janela na frente, o estado é **`{Persona} está esperando a janela voltar.`** (`Abriram outra janela por cima. Ela não aparece aqui.`), e nenhum quadro da outra janela é mostrado.
  - (2) **Só assiste ao vivo quem está em "Quem pode pedir coisas a {Persona}"** (e o dono). Os outros da equipe veem o cartão e o histórico, sem `Assistir`.
- **No celular, sob a imagem:** `Só aparece a janela em que {Persona} trabalha. Tocar nela não mexe no PC: daqui você só assiste e para.` em 12,5 px muted. A imagem não responde a toque.
- **Sem quadro novo por 4 s:** o selo escuro `de 15:21` no canto de baixo à direita da imagem e a linha `Sem imagem agora`. Nunca um quadro velho como ao vivo.
- **Movimento reduzido:** o cursor pula de lugar, a bolinha não pulsa, e o resto é igual.

## X4. Os estados (a frase vem do estado do host; o cliente não deduz)
| Estado | Texto |
|---|---|
| `preparando` | `{Persona} está se preparando…` |
| `rodando` | a ação do host + `passo N de M` |
| `precisa-de-voce`, aprovação | o cartão de aprovação do fio, com o "segure" (52 px no toque) |
| `precisa-de-voce`, senha | a caixa com `lock`: **`{Persona} precisa de uma senha`** + `O {site} pede senha. Senha só se digita no próprio PC: {Persona} espera até lá.`, e o botão `Me lembrar no PC` (52 px). Na imagem, o campo vem **coberto pelo host** (faixa listrada `coberto pelo PC`). |
| `pausada-humano` | **`Alguém usou o {computador}. {Persona} espera.`** No próprio PC entra `Devolver para {Persona}` (Ctrl+Shift+Espaço); fora dele, `Para continuar, use o PC.`. Vale tanto para "você" quanto para outra pessoa: o host não sabe quem mexeu. |
| `janela-coberta` | `{Persona} está esperando a janela voltar.` (e nenhum quadro de outra janela) |
| `parando` | `Parando…` |
| `parada` | `{Persona} parou às 15:22.` + `Parou no passo 5 de 12. O que já foi feito fica no histórico.`, e os botões `Ver o que {Persona} fez` e `Fechar`. A imagem fica apagada (cinza), com o selo da hora. |
| `concluida` | `{Persona} terminou.` + `Ver o que {Persona} fez` |
| `falhou` / `limite` | a frase do host + `Fechar` |

## X5. Arte
Não falta nada:
- o rosto R2 e a pílula do `PersonaCursor`, que já existem;
- os glifos `lock`, `hold`, `estacao`, `stop` e `eye`;
- `cursor` e `replay`, que **pedi ao Brush** no traço da casa. Até eles chegarem, o código usa `eye` e `repeat`.

## X6. Aceite
O Ember faz o pré-check e a Muse faz a captura do app real, claro e escuro, com o host falso mandando quadros. A captura cobre:
- X1, nos 3 casos;
- a fita e o painel;
- a barra do celular a 390 px;
- a folha ao vivo;
- "senha só pelo PC";
- "parou";
- o movimento reduzido.
