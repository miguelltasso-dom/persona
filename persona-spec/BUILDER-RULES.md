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
- **Builds pesados, `dev:desktop`/`start:desktop`/`start:web`, empacotamento: sempre sob a trava** (um de cada vez no checkout): `node scripts/persona/with-lock.mjs "<seu nome> <o quê>" -- <comando>` (ex.: `-- pnpm run build:artifacts`). Se a trava estiver ocupada o comando espera e diz quem a tem. Suba apps em segundo plano e **encerre a árvore de processos** ao terminar (`taskkill /T /F /PID <pid>`).
- Use `PERSONA_HOME`/`DSH_HOME` e `DSH_DESKTOP_USER_DATA_DIR` **temporários** e portas distintas em execuções de app; nunca a pasta de dados real do Miguel.
- CLIs reais (Claude Code, Codex, Cursor agent, OpenCode): **somente leitura** (versão/auth/modelos) até o Keel liberar prompts reais (consomem cota do Miguel). Nunca faça login nem imprima/guarde tokens. `agent` no PATH é o Grok; use `cursor-agent`.
- Não faça telemetria/requisição externa nova. Segredos nunca em código, logs, testes ou relatos.

## UI/UX (Prism, Brush, Probe) — obrigatório

`persona-spec/UX-GUIDE.md` (movimento, RCD, barra de qualidade), skill `.agents/skills/revenue-centric-design/` (cite o princípio usado), direção visual **D** (`persona-assets/references/dirD-model-sheet.png`, `dirD-tela.png`, tokens em `persona-assets/references/README.md`). Todo texto de UI em **pt-BR** por dicionários tipados. Toda tela: 1 ação primária, estado vazio com ilustração + 1 ação, carregando (skeleton), erro, cheio; teclado completo; AA; reduced-motion.

## Relato ao concluir (ou ao travar)

Envie com `maestri ask "Keel" "<relato>"` (curto): (1) o que ficou pronto; (2) arquivos tocados; (3) comandos de teste/verificação rodados com a **saída verbatim** do resultado (contagem de testes, erros); (4) edições em código do upstream com 1 linha de justificativa; (5) o que ficou de fora/dúvidas. Se travar > 20 min numa coisa, relate e pergunte em vez de insistir. Mantenha o post-it `Persona · Memória` com armadilhas novas.
