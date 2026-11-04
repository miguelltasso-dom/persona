# Revisão do 1º uso no app instalado

Muse, 04/11, 13:35Z. Item 4 da fila do Atlas.
- **Pacote:** `b3a4e5b933` (win-unpacked, com o onboarding novo).
- **Ambiente:** perfil limpo (`startInstalledDesktop` do Probe) e nenhuma IA conectada, como num computador novo.
- **Script:** `.maestri/tmp/muse/first-run.mts`.
- **Capturas e timeline:** `.maestri/tmp/shots/design/first-run/light/`.

## Linha do tempo (ms desde o anexo da janela)

| Momento | Tempo |
|---|---|
| Janela anexada | ~1 s |
| Splash do harness ("HARNESS · Loading plugins…") | 0 a 17 s |
| Onboarding passo 1 visível | 17,5 a 19,2 s |
| Passos 2 a 5 | +1,6 a 1,8 s cada |
| "Pedir agora" (1ª entrega) | 20,3 s |
| No #geral, por trás do modal: pedido postado, a Coordenação aceita e o `RunErrorCard` "O motor de Atlas não está disponível neste computador" aparece | ~21 s |
| O modal do passo 5 **continua igual** (sem "trabalhando", sem erro) | até sair |
| 1ª mensagem no #geral, "Oi, equipe!…" | 34 s |
| Resposta | **nenhuma em 90 s, sem aviso** |

Comparado com o pacote anterior (`b26d8b99a2`, ENOENT, que nem abria), **o boot agora funciona**: o onboarding vai do passo 1 ao 5, com 0 erros de console.

## Achados (com dono)

| # | Severidade | O que a pessoa vive | Causa | Dono |
|---|---|---|---|---|
| FR-1 | **P0** | Por 17 s, a 1ª coisa que vê é a splash do **harness de origem**: "HARNESS", em inglês, "Loading plugins…", fundo branco, spinner genérico. É marca alheia e jargão no 1º contato. | A splash do Persona (BOOT-SPEC) ainda não foi portada. | Rivet (protótipo pronto em `design/boot-prototype/`) |
| FR-2 | **P0** | Ao "Pedir agora", o passo 5 não muda. A 1ª entrega falha no #geral, e o onboarding não diz nada. A pessoa entra no app sem saber que nada vai acontecer. | Faltam as fases `needsEngine` e `failed` (FIRST-DELIVERY-SPEC). O passo 3 deixou seguir sem nenhuma IA conectada. | Prism |
| FR-3 | P1 | No #geral, a 2ª mensagem fica sem resposta e sem aviso por 90 s. | Sem motor, a mensagem nova não gera cartão nem faixa. | Prism + Anvil: com nenhum motor pronto, uma faixa fixa "Falta uma IA para a equipe trabalhar · Conectar uma IA" acima do composer |
| FR-4 | P1 | 17 a 19 s até o passo 1. Dentro do prazo de 1º uso (≤ 60 s), mas longo, e sem dizer nada útil enquanto isso. | Boot do host e dos plugins. | Rivet (a splash com as linhas de status da BOOT-SPEC resolve a parte de UX; o tempo é com Keel e Rivet) |
| FR-5 | P2 | No `RunErrorCard` do fio, o avatar mostra a inicial "A", e não o retrato do Atlas. | O `ConversationRunErrorCard` não recebe `avatarSrc`. | Prism |
| FR-6 | P2 (a11y) | O axe acusa `list` ×1 no passo 3 e `list` + `listitem` ×3 no passo 5 (estrutura de lista inválida); `color-contrast` ×1 na splash do harness. | Marcação das listas do onboarding; a cor da splash de origem. | Prism; o FR-1 resolve o contraste |

**O que funcionou** (prova de ponta a ponta):
- o `RunErrorCard` aparece **no app instalado**, com o texto certo e "Escolher outro motor";
- o glossário: "Boas-vindas! Estou aqui para coordenar a equipe.";
- o passo 5 "Primeira entrega";
- os passos 1 a 5 com axe 0 em 3 de 5.

## Limitação da medição

O app segue o tema do sistema (`nativeTheme`), e não a emulação de CSS. Por isso a rodada "escuro" saiu clara: o tema escuro do app instalado **não** foi testado. Para testar de verdade, é preciso mudar o tema do Windows ou expor um parâmetro de tema.

No 1º script, o "run-error" do passo 5 foi um falso positivo meu: o seletor casou com o cartão no #geral por trás do modal. Já está corrigido na leitura deste relatório.

## Próximo passo sugerido (ordem)

1. **FR-2**, porque decide a ativação: `needsEngine` antes do clique e `failed` com o cartão, dentro do passo 5 (FIRST-DELIVERY-SPEC).
2. **FR-1**: portar a splash da BOOT-SPEC no próximo NSIS.
3. **FR-3**: a faixa "Falta uma IA" no composer.
4. FR-5 e FR-6.
5. Depois, repetir esta revisão **com uma IA conectada**, para medir o tempo até a 1ª entrega aceita.

## Atualização 14:30Z: NSIS `b3a4e5b933` com a correção do Rivet

| Achado | Estado | Prova |
|---|---|---|
| FR-1 splash do harness | **Corrigido.** O 1º quadro é a splash da Persona ("Abrindo a Persona…" → "Chamando a equipe…"). A tela de erro está conforme a BOOT-SPEC; a falha forçada leva a erro → "Tentar de novo" → onboarding. | `first-run/light/00-first-paint.png`, `rivet-d8/*` |
| FR-4 tempo até o passo 1 | **Melhorou:** de 17,5–19,2 s para **14,3 s**. | timeline |
| FR-1b (novo, P2) | Duas coisas. (1) A splash e o erro usam a fonte do sistema (Segoe), não Fredoka e Nunito. (2) O `color-contrast` ×1 vem da **splash antiga do harness, que continua no DOM** por baixo da nova (`Loading plugins…`, #81858c sobre #fff, 3.7:1). Está coberta visualmente, mas o leitor de tela lê "Loading plugins…" em inglês. Correção: não renderizar a splash do harness no perfil persona. | axe com seletor (`first-run.mts`, `MUSE_ONLY_BOOT=1`) |
| FR-2 passo 5 mudo sem IA | **Aberto** (Prism, FIRST-DELIVERY-SPEC) | igual |
| Caminho feliz com o fake | **Bloqueado no teste:** o `mergeLoginShellEnvironment` troca o PATH herdado pelo do login shell, e o fake não chega ao app instalado. A proposta é uma `PERSONA_E2E_EXTRA_PATH` (Probe e Rivet). | `03-onboarding-3.png` |
