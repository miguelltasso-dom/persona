# Quill — relatos de implementação UI (mais recente no topo)

Quill = UI nº 3 do `client-ui-persona`. Telas novas: W2-7 (Contas em Conexões), W2-10 (UI do Ensinar: revisão/publicar/reverter), E13 (acabamento), G2 (canvas, modo lista).

## 2026-11-04 13:45 — W2-7 Contas em Conexões · W2-10 Ensinar (revisão/ativar/compartilhar/desfazer) · G2 lista do canvas · E13 acabamento

**Código e testes prontos; aceite visual da Muse AINDA PENDENTE.** As capturas (claro/escuro × 960×640 × zoom 200%) saem em `.maestri/tmp/shots/quill/` quando a trava `build` liberar (fila: "Quill bundle + shots"). Script novo e aditivo: `scripts/persona/quill-shots.mjs <connections|teach>` (pasta do Keel). Nada abaixo está marcado "pronto" até a Muse aceitar.

### W2-7 — Contas em Conexões (`connections/*`, passado pelo Lumen)
- **Adicionar conta com passo a passo** em modal de 3 passos, sem `window.prompt`: (1) nome, validado (vazio, mais de 24 letras, duplicado: o id do host sai do rótulo, então "Meu Trabalho" e "meu trabalho" colidem) com sugestões livres; (2) "Entre na conta X" com o comando de login PRÓPRIO da conta (copiar) e "Já fiz login"; (3) "Pronta". Fechar no meio deixa a conta na lista como "Precisa entrar".
- **Achado de honestidade no host:** hoje ele (a) não manda o comando de login da conta isolada e (b) deriva `loggedIn` do probe do PROVEDOR, então uma conta nova aparece "Pronta" na hora só porque a conta padrão está logada. A UI não mostra "Pronta" sem a pessoa confirmar E sem `loginCommand` próprio; sem comando, avisa "esta versão ainda não gera o comando de login separado… não use o login padrão: ele entraria na sua conta principal". Pedido ao Anvil (campos opcionais que a UI já lê): `ConnectionAccountView.loginCommand?`, status por `accountLoginStatus(homeDir)`, `listConnectionAccounts(personaId?)` + `personaPolicies?`.
- **Renomear e remover** em modais (renomear: pré-preenchido, bloqueia o nome de outra conta; remover: consequência em 1–2 frases, aviso se é a única conta do provedor, botão "Remover conta" explícito).
- **Regra de troca "Uma persona"** de verdade: seletor de personas (retrato + nome), a regra da persona vale antes da da equipe, "{Nome} segue a regra da equipe até você escolher outra aqui". **Trocar de aba NÃO grava mais** (antes gravava a regra atual com escopo persona e sem persona). Salvar fala sucesso/erro (aria-live) e desfaz na falha.
- "Como funciona" era botão morto: só aparece com `onOpenGuide`. Vazio usa `ILLUSTRATIONS['empty-sem-ia']` (aviso do Lumen). Conflito de `role="status"` do teste do Lumen resolvido (a nota da regra é `aria-live` sem role).
- Arquivos: `connections/{ConnectionsView.tsx, AccountDialogs.tsx(+.module.css), account-labels.ts, Connections.module.css}`, `data/adapters/connection-accounts.ts`, `data/lumen-remote-panels.tsx` (RemoteConnectionsPanel: handlers async + recarga silenciosa + lista de personas; troca de trecho exato), `kanban/PersonaSurface.tsx` (+1 chave de ilustração, do Lumen), locale `connections.*` (+43 chaves).

### W2-10 — Ensinar a persona (`teach/*` novo; `profile/TeachPersona{Overlay,Session}.tsx`, passados pelo Prism)
- **Consentimento (passo 1) e escolher o que gravar (passo 2)** no mesmo modal: abas Tela inteira / Uma janela, lista do `desktopCapturer` via `window.personaDesktop.teach`, estados vazio/erro/procurar de novo. Sem a ponte do desktop (navegador) o consentimento diz que "só funciona no app instalado" e o botão fica desligado.
- **Interruptor de microfone removido:** nada transcreve áudio (whisper NO-GO), então o interruptor mentia. A narração é digitada depois de parar ("Quer contar o que você fez?") e há "Não guardar as imagens" (pede `redact` ao desktop). Desvio consciente da WAVE2-SPEC: a Muse avalia.
- **Gravando:** contagem 3·2·1 na pílula; pílula e moldura agora posicionadas (antes não tinham posição e renderizavam no fluxo da página); cronômetro que não conta a pausa; aviso aos 9 min; para sozinho aos 10; pausar/retomar vai ao gravador e ao host.
- **Pós-gravação (não existia):** "Montando o passo a passo" → **revisão em tela cheia** (texto, "o que conferir", subir/descer/remover/adicionar, ampliar miniatura, aviso de passos em branco, descartar com confirmação) → **Salvar como habilidade candidata** → **Pronta**: Ativar para {Nome} (o host recusa ferramentas acima do mandato → mensagem acionável, nunca o código), **Voltar a candidata** (rollback), **Compartilhar** (projeto/equipe só com confirmação escrita). Sem passos: "Escrever os passos" ou "Gravar de novo". Falha com "Tentar de novo" (reaproveita os quadros do 1º stop).
- Gravador: `teach/teach-recorder.ts` (ponte → `getUserMedia` da fonte → amostra a cada 1,5 s → `ingestFrame`) e gravador de EXEMPLO (`localStorage persona.teach.synthetic=1`, não grava nada, 4 quadros SVG) para dev/E2E no navegador.
- Fiação em arquivos do Prism (troca de trecho exato): `mount.ts` (`beginTeachCapture` devolve `Promise<boolean>`; `persona` e `openTeachPersona` no teachCapture; `persona` tirado do overlay de consentimento, que não usava) e `remote/persona-live-store.ts` (`stopTeachSession(..., frames?)`: antes mandava `frames: []` sempre, então o rascunho nunca via os quadros).
- Arquivos: `teach/{teach-model,teach-recorder,teach-handoff,teach-deps}.ts`, `teach/{TeachReview,TeachDone}.tsx`, `teach/TeachFlow.module.css`, locale `profile.*` (+93 chaves `teach.*`).

### G2 — Canvas, modo lista (`canvas/*`, passado pelo Prism)
- A lista diz as **relações em palavras** ("liga a X · vem de Y" / "Sem relações"), tem nome e descrição acessíveis, **seleciona com Enter/Espaço/clique**, e a seleção é a MESMA do mapa. Trocar para a aba Lista **não rouba mais o foco** da aba (o `useLayoutEffect` antigo pulava o foco para a tabela e a pessoa não conseguia voltar com seta para "Canvas").

### E13 — acabamento
- O "Revogar acesso" por membro (`members/MembersView.tsx`) era controle morto: agora só existe com `onRevokeMember` (a revogação real é por convite aceito, em Equipe remota, como diz `remote-team.md`). Teste novo.

### Testes (vitest com timeout, sem watch, `--lock check`)
```
connections-accounts-dialogs + connections-wave2 + connections-next-step + lumen-a11y  → 45 passed (4 files)
teach-model + teach-flow                                                                → 35 passed (2 files)
canvas-list-g2 + canvas-list-keyboard + canvas-labels                                   → 9 passed (3 files)
members-revoke + connected-remote-team + remote-team-panel + lumen-a11y                 → 43 passed (4 files)
node scripts/persona/check-pkg.mjs client-ui-persona                                    → OK
oxlint nos arquivos novos/tocados por mim                                               → limpo
```

### Pendências e limitações
1. **Capturas, aceite da Muse e axe** (fila `build`). O 1º axe achou 3× `color-contrast` em `.searchText | kbd`, a dica de atalho da busca do shell (outro dono: Prism/Muse).
2. **Desktop (Rivet):** a pílula é desenhada DENTRO da janela da Persona; ao gravar OUTRA janela/tela a pessoa não a vê — faltam janela overlay always-on-top e minimizar a Persona ao começar (a WAVE2-SPEC pede). O `imageRef` dos quadros é `file://`, que o renderer web não carrega: a miniatura vira "Sem imagem" até existir um protocolo seguro. "Borrar parte" não existe de verdade no desktop (`addBlur` só marca retângulos durante a gravação e nada os aplica aos PNG), então o botão não aparece; sobra "Não guardar as imagens".
3. **Anvil:** `submitTeachDraft` regrava o título como "Skill ensinada" (a pessoa não consegue nomear a habilidade); e os campos de Contas acima.
4. E13: a captura do fluxo convidar → aceitar → ver o canal, com dois perfis clicando na UI, ainda não foi feita.

## 2026-11-04 12:50 — Entrada na equipe: passagem de arquivos

- **Prism** passou: `canvas/*` (G2 fechado do lado dele), `profile/TeachPersonaOverlay.tsx` + `profile/TeachPersonaSession.tsx` e tudo de W2-10. Ficou com: `onboarding/*`, `chat/*`, `shell/*`, `remote-team/*` (E13 base pronta, 34/34), `profile/PersonaInfoCard`.
- **Lumen** passou: `connections/*`, locale `connections`, `RemoteConnectionsPanel` (em `data/lumen-remote-panels.tsx`, só troca de trecho exato). Ainda edita: `decisions/*`, `approvals/*`, `overview/*`, `shell/PersonaSidebar.tsx`, **`canvas/CanvasView.tsx`** (esperar), `review/*`, `remote/seed-default-team.ts`, `scripts/persona/lumen-viewport-shots.mjs`.
- Arquivos compartilhados (`lumen-remote-panels.tsx`, `kanban/register-lumen-ui.tsx`, `mount.ts`, `shell/register-prism-screens.tsx`): só edição por trecho exato.
- Regras do Keel (D-065/D-066): `--lock check --slots 2` para check-pkg/vitest de UM pacote; `--lock build` para app/gate/bundle.
