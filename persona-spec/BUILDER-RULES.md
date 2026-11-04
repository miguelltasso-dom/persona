# Persona — regras dos builders (leia antes de cada tarefa)

Quem manda: Keel (Tech Lead). Plano: `PLAN.md`. Decisões: `DECISIONS.md`. Notas do canvas: `maestri note read "Persona · Memória"` e `"Persona · UX & Animação"` (leia ao começar; registre armadilhas duráveis com `maestri note edit`, curto e datado).

## Ambiente

- Repo: `C:\Users\migue\dev\persona`, branch `persona-dev`. Seu terminal abre em `.maestri\roles\<id>`: use **caminhos absolutos** ou `cd /c/Users/migue/dev/persona`.
- Leia `AGENTS.md` (não `CLAUDE.md`: neste Windows os symlinks viraram arquivos de texto). Convenções de código do upstream valem (TS estrito, `exactOptionalPropertyTypes`, sem `as unknown` novo, ESM, imports locais com `.ts`, comentários/código em inglês, arquivos terminam com **uma** quebra de linha LF).
- Código novo da Persona: `packages/persona/*` (nomes `@deepseek-ai/dsh-persona-*`). **Só edite os diretórios que são seus** (PLAN §4). Edição em código do upstream: só o necessário, no seu diretório-dono, e justifique em uma linha no relato.
- Não rode `pnpm install` (peça ao Keel). Não rode `git commit/push/reset/clean/stash`: **só o Keel comita**. Nunca apague trabalho alheio.

## Rodar, testar, provar (sem revisão de código; aceite = teste + app rodando)

- Teste de pacote (plano-fonte, sem build): `cd /c/Users/migue/dev/persona && pnpm exec vitest run packages/persona/<pkg>` (ou arquivo/`-t nome`). Typecheck de um pacote: `pnpm exec tsc -p packages/persona/<pkg>/tsconfig.json --noEmit`. Lint: `pnpm exec oxlint <arquivos>`.
- Mudou assinatura `@Remote` em `persona-host`: `pnpm exec tsx scripts/generate-typert.ts` (≈30 s).
- **D-065 — três travas, fila justa, ninguém parado:** `check` (2 vagas: `node scripts/persona/with-lock.mjs "<nome> <o quê>" --lock check --slots 2 -- <cmd>`) para `check-pkg`, vitest e typert de UM pacote; `build` (exclusiva) para subir app, E2E, gate, bundle do client e build de app; `pack` só empacotamento (automático no `package-clean`). A espera é **por ordem de chegada**. **Se você está na fila, NÃO fique parado: toque o próximo item da sua fila** e volte quando o comando liberar. `reap-orphans` continua obrigatório ao fim de cada rodada.
- **D-067 — vagas (força total):** `check` tem 3 vagas e `build` tem 2 (o número vem do NOME da trava: não passe mais `--slots`). Subida de app/E2E na `build` usa SEMPRE home temporário + porta livre (`scripts/persona/free-port.mjs`; nunca 3080 fixa). Gate de publicação e empacotamento são EXCLUSIVOS (`--exclusive` / `pack`). O `with-lock` só inicia com >= 6 GB de RAM livre e roda `reap-orphans --kill` ao fim de cada job; se a fila andar devagar, continue o próximo item da sua fila.
- **Builds pesados, `dev:desktop`/`start:desktop`/`start:web`: sempre sob a trava `build`** (um de cada vez no checkout; **D-062: o empacotamento do instalador tem a trava PRÓPRIA `pack` — `package-clean.mjs` a pega sozinho e NÃO deve ser embrulhado na `build`; as duas rodam ao mesmo tempo**): `node scripts/persona/with-lock.mjs "<seu nome> <o quê>" -- <comando>` (ex.: `-- pnpm run build:artifacts`). Se a trava estiver ocupada o comando espera e diz quem a tem. **Rodar um app não deve segurar a trava**: use `--release-on "<regex da linha de pronto>"` (ex.: `node scripts/persona/with-lock.mjs "Probe web host" --release-on "dsh web:|DevTools listening" -- pnpm start:web`) — a trava é liberada assim que o app imprime a linha de pronto e ele segue rodando; build/typecheck/empacotamento seguram a trava até o fim. Suba apps em segundo plano e **encerre a árvore de processos** ao terminar (`taskkill /T /F /PID <pid>`).
- Use `PERSONA_HOME`/`DSH_HOME` e `DSH_DESKTOP_USER_DATA_DIR` **temporários** e portas distintas em execuções de app; nunca a pasta de dados real do Miguel.
- CLIs reais (Claude Code, Codex, Cursor agent, OpenCode): **somente leitura** (versão/auth/modelos) até o Keel liberar prompts reais (consomem cota do Miguel). Nunca faça login nem imprima/guarde tokens. `agent` no PATH é o Grok; use `cursor-agent`.
- Não faça telemetria/requisição externa nova. Segredos nunca em código, logs, testes ou relatos.

## UI/UX (Prism, Brush, Probe) — obrigatório

`persona-spec/UX-GUIDE.md` (movimento, RCD, barra de qualidade), skill `.agents/skills/revenue-centric-design/` (cite o princípio usado), direção visual **D** (`persona-assets/references/dirD-model-sheet.png`, `dirD-tela.png`, tokens em `persona-assets/references/README.md`). Todo texto de UI em **pt-BR** por dicionários tipados. Toda tela: 1 ação primária, estado vazio com ilustração + 1 ação, carregando (skeleton), erro, cheio; teclado completo; AA; reduced-motion.

## Relato e fila (protocolo novo, 03/11) — **nunca fique sem tarefa**

- **Não use `maestri ask "Keel"` para relatar**: o comando bloqueia você até o Keel responder. Use-o só para dúvida bloqueante.
- Ao concluir uma tarefa: (1) escreva o relato em `persona-spec/reports/<seunome>.md` (mais recente no topo): o que ficou pronto; arquivos tocados; comandos de teste/verificação com a **saída verbatim** (contagem de testes, erros); edições em código do upstream com 1 linha de justificativa; o que ficou de fora/dúvidas; (2) acrescente **uma linha** ao post-it `Persona · Status` (`maestri note edit "Persona · Status" "<última linha>" "<última linha>
- 03/11 [<nome>] <tarefa> ✔ <resultado em 1 linha>"`); (3) **siga direto para a próxima tarefa da sua fila** (PLAN.md, linhas com seu nome, na ordem de `DECISIONS.md` D-046). Se a fila acabou ou travou > 20 min, escreva isso no relato e no Status: o Keel designa a próxima por `maestri ask` em segundo plano.
- O Keel lê `persona-spec/reports/*.md` e o Status a cada ~20 min, comita por marco e corrige a rota.
- Armadilhas duráveis vão para o post-it `Persona · Memória` (curto e datado).
- **Testes de cliente em pacotes fora de `packages/client/`** (ex.: `client-ui-persona`) usam o sufixo `*.client.spec.ts(x)`; sem ele entram no typecheck do host (`TS6307`) e o pre-push falha. Antes de relatar rode também `pnpm exec tsc -p packages/persona/<pkg>/tsconfig.json --noEmit`.

## Gate de boot da UI (03/11) — obrigatório antes de relatar qualquer tarefa de UI

`node scripts/persona/with-lock.mjs "<seu nome> ui boot" -- node scripts/persona/ui-boot-check.mjs`: sobe `--profile persona` num home temporário, abre no Chrome (claro/escuro), imprime o console completo e grava `.maestri/tmp/shots/persona-{light,dark}.png`. Critério: **zero** "web boot: warning: N entries did not activate" e **zero** erros de console; abra a captura (Read) e compare com `persona-assets/references/dirD-tela.png`. Rebuild antes: `node scripts/persona/with-lock.mjs "<nome> bundle" -- pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle`. Teste vitest/jsdom sozinho **não** prova que o plugin ativa no app (o primeiro boot real achou 2 defeitos que os previews não pegavam).

## Gate do gerador Typert (03/11) — vale para TODO pacote de packages/persona/*

O `typecheck` do repo roda primeiro `tsx scripts/generate-typert.ts`, que analisa os pacotes de host inteiros (não só controladores). Ele recusa **parâmetro público sem anotação de tipo explícita, mesmo com valor padrão** (ex.: `list(afterSeq = 0)` ⇒ `afterSeq: number = 0`; erro "public parameter is missing an explicit type annotation"). Antes de relatar qualquer tarefa que toque `persona-store`, `persona-host`, `persona-runners`, `persona-vault`, `persona-usage` ou `persona-engine`, rode `pnpm exec tsx scripts/generate-typert.ts` (≈30 s) e garanta que passa.

## Typecheck de pacote COM testes (03/11) — rode antes de relatar

`node scripts/persona/check-pkg.mjs <pacote> [...]` (ex.: `persona-host client-ui-persona`): tsc em `src` + `tests` (+ `scripts`) do pacote, mostrando só os erros dele, em ~5–20 s. O `tsc -p packages/persona/<pkg>/tsconfig.json` cobre só `src`; os erros de teste só apareciam no typecheck agregado (minutos) que bloqueia o push de todo mundo. Vitest não checa tipos. Regra: **seu pacote deve sair OK desse comando** (e `pnpm exec tsx scripts/generate-typert.ts` quando mexer em host) antes de qualquer relato.

## Apps (desktop) — o que o gate de push realmente compila (03/11)

`check-pkg` NÃO cobre `apps/`. O typecheck de push compila `apps/desktop/src` (via `apps/desktop/tsconfig.host.json`) **e** `apps/desktop/tests/**` + `apps/desktop/scripts/**` (via o `tsconfig.host.json` da RAIZ). Quem mexe em `apps/desktop` roda os dois antes de relatar:
`pnpm exec tsc -p apps/desktop/tsconfig.host.json --noEmit` (rápido) e `pnpm exec tsc -p tsconfig.host.json --noEmit 2>&1 | grep "apps/desktop/"` (mais lento, ~1–2 min; saída vazia = ok). Mocks `vi.fn()` precisam de parâmetros tipados quando o teste lê `mock.calls[n][i]` (senão TS2493).
