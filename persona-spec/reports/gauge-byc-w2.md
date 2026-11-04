# Gauge (fork BYC/W2) — camada de APP REAL de BYC-6 e W2-11

Arquivo novo: `packages/persona/persona-e2e/tests/real-byc-w2-app.spec.ts` (+ helper `src/gauge-byc-w2.ts`).
Como roda: `PERSONA_E2E=1` sob `with-lock` (um host); para iterar contra um host já no ar: `GAUGE_HOST_URL=<url>`. `GAUGE_BUGS_AS_TESTS=1` roda os `[BUG→…]` como testes normais (ver POR QUE cada um falha / confirmar conserto). `check-pkg persona-e2e`: **OK** (61,9 s). `reap-orphans`: limpo.

## Resultado (host persistente, home com onboarding feito, CLI fake no PATH, 0 IA) — vitest verbatim

Última rodada completa do arquivo (antes de virar 1 teste para normal):
`Tests  1 failed | 25 passed | 7 expected fail | 1 skipped (34)` — o "1 failed" foi o `it.fails` "Por persona com nome" cujo corpo PASSOU (o Lumen consertou) → virei para teste normal (corpo idêntico). Esperado agora: **26 passed | 7 expected fail | 1 skipped**.
Rodada dos 7 bugs com `GAUGE_BUGS_AS_TESTS=1`: `Tests  7 failed | 27 skipped (34)` — os 7 falham pelo motivo descrito abaixo (nenhum por seletor/infra).
O 1 skipped é o BYC-1a (só roda com host próprio e home LIMPO: `describe.skipIf(GAUGE_HOST_URL)`), escrito mas **não verificado** — falta a rodada final sob a trava.

## Placar por item

| Item | Estado | Evidência |
|------|--------|-----------|
| BYC-1a onboarding passo 2 (bloco abaixo da descrição) | **falta** (escrito, não rodado: precisa home limpo/host próprio) | teste `[BYC-1a app]` |
| BYC-1b Importadores (bloco, passos 1–2, pasta, privacidade, health/axe) | **verde** | `byc-importadores-{light,dark}.png`, `axe-importar.json` (0 serious/critical; 2 moderate) |
| BYC-1c abas só mudam a dica; pedido idêntico = prompt oficial; Copiar → clipboard | **verde** | teste compara com `bringContextPrompt('pt')` |
| BYC-2a/2b colar → Organizar → tipos, proveniência, (incerto), CPF/cartão bloqueados sem botão Aceitar | **verde** | `byc-revisao-{light,dark}.png` |
| BYC-2c várias colagens (chips por IA) | parcial (1 colagem por rodada no app; acúmulo coberto no host) | host spec |
| BYC-3a/3c vault pelo seletor do app (ponte `personaDesktop.pickDirectory`): "3 notas de <pasta>", ignorados, só .md, proveniência "vault: caminho"; web puro sem botão | **verde** (o laço "Lendo 0 notas…" foi consertado pelo Lumen durante a rodada) | teste `[BYC-3 app]`, `[BYC-3c app]` |
| BYC-3b reimportar sem duplicar (app) | não coberto no app (host cobre) | — |
| BYC-4a aceitar / descartar / editar / bloqueado nunca / aparece no Cofre + confirmação ao gravar | **verde** | `byc-cofre-depois-*`, `byc-revisao-decisoes-*` |
| BYC-4b "Só para mim" (lado do dono) | **verde**; outro membro = host spec | — |
| BYC-4c dedupe/conflito | host spec | — |
| BYC-4d regras pendentes (decisão da Muse) | **bug rastreado** — `[BUG→Muse+Lumen]` com as asserções NOVAS ("Aceitar todas as regras (n)", "Falta n regra(s)…", regra sem escolha nunca grava, decisões/fatos pré-aceitos); passa assim que o bundle exclusivo do Lumen entrar | falha hoje: regra chega `aria-pressed=true` |
| W2-1a 3 assuntos (cor+NOME, aria-selected, roving, cores distintas), "+" cria assunto (consertado pelo Prism), históricos separados | **verde** | `w2-assuntos-barra-*`, `w2-assunto-precos-*`, `w2-novo-assunto.png` |
| W2-1b resposta no assunto da pergunta (consertado) | **verde** | — |
| W2-1b não lido por assunto: chips "N não lidas neste assunto" = host | **verde**; 3 bugs abaixo | `w2-assunto-nao-lido-*` |
| W2-1d cartão no quadro com cor+nome do assunto de origem | **falta** | — |
| W2-1e teclado (setas/Home/End), arquivar persiste no host + histórico, "Mover para outro assunto" focável | **verde**; renomear só verificado como item de menu | — |
| W2-3a 2 contas do mesmo provedor listadas com rótulo | **verde** | `w2-conexoes-2-contas-*` |
| W2-3b/c/d as 4 políticas (fixa/próxima/dividir/perguntar) chegam ao host e SOBREVIVEM a reload | **verde** | `w2-conexoes-politica-dividir-*` |
| W2-3e cartão mostra a política ("Divide o uso entre as contas"); Uso e limites "Por persona" com nome (consertado) | **verde** | `w2-cartao-politica-*` |
| W2-2a/2d Ensinar: consentimento completo (o que grava/onde fica/quem vê/30 dias/dados sensíveis); no web "Escolher o que gravar" DESLIGADO com aviso honesto; Cancelar fecha | **verde** | `w2-ensinar-consentimento-*` |
| W2-2c rascunho aceito = skill CANDIDATA (aparece em Skills, não ativa); publicar p/ time sem confirmar recusado | **verde** | `w2-ensinar-skills-*` |
| axe nas telas testadas (importar, geral, perfil) | **0 serious/critical**; advisory moderate: `region` (barra de assuntos fora de landmark), `heading-order` | `axe-{importar,geral,perfil}.json` |

## BUGS de produto rastreados (`it.fails`) — passos exatos

1. **P0 candidato — a caixa de mensagem do #geral não ENVIA** [Prism+Anvil, cc Keel]. Canais › Geral, digitar + Enter: a mensagem aparece (otimista), mas `persona/postMessage` responde `gateway/input-invalid … wire field "request" failed boundary validation`: o cliente (`persona-live-store.ts:831` canal e `:1028` DM) não manda `occurredAt`, obrigatório no host (`types.ts:240`). Captura: `artifacts/gauge/byc-w2/bug-composer-envio.png`. Teste `[B8/W2 app]`.
2. **BYC — perda silenciosa de dado** [Forge+Anvil]: id da proposta `byc-paste-<n>-<slug 40>`; duas regras que começam igual na mesma posição colidem e a 2ª é descartada (a tela diz "Gravar N"). Teste `[BYC-4a app] duas regras DIFERENTES…`.
3. **BYC — regras pendentes** [Muse+Lumen]: ver BYC-4d acima (aguarda bundle).
4. **Assuntos — unread** [Anvil/Prism]: (a) a PRÓPRIA mensagem do usuário num assunto inativo conta como não lida (host: Preços 6→7 ao postar como dono); (b) abrir o assunto não marca como lido no host (a bolinha só some enquanto o chip está selecionado e volta ao sair; host `Interface:11` depois de abrir e sair); (c) o chip não acompanha o host ao vivo (host=11, chip sr-text "10", visível "9+").
5. **Assuntos — arquivar o ATIVO** [Anvil]: o host guarda `activeSubjectId` apontando para o assunto arquivado e `listConversationSubjects` só cai para o 1º quando NÃO há valor guardado; depois de recarregar, nenhum chip fica selecionado.

Já corrigidos por donos DURANTE a rodada (viraram testes normais): "+" Novo assunto (Prism), resposta da persona sem assunto (Anvil/Forge), laço do "Escolher pasta" e confirmação após gravar (Lumen), "Por persona" com nome (Lumen).

## Armadilhas de teste (para o próximo)
- `page.addInitScript(fn)` com função falha no tsx/esbuild (`__name is not defined`): use script em string (`installDesktopPicker`).
- `hostRpc(page, método, corpo)` (src/gauge-byc-w2.ts) chama o host como o app (mesma origem, mesma auth) — semeia o que a UI ainda não cria e confere o que o host de fato gravou.
- O placeholder do composer é "Mensagem em <assunto ativo>…": use `[data-persona-area="composer"] textarea`.
- Chip com não lido tem texto "Nome\nN\nN não lidas neste assunto": normalize com a 1ª linha.
- Testes que dependem de estado do host usam palavras únicas por rodada (`uniquePaste(TAG)`): o Cofre faz dedupe Jaccard e o id usa só os 40 primeiros caracteres.

## Fora do meu escopo (aviso)
`check-pkg persona-e2e` estava vermelho por `mandatory-governance-host.spec.ts` (`bug` sem uso) e `scripts/sw-engine-acceptance.ts` (`row` sem uso) — de outros donos; na última checagem saiu OK.
