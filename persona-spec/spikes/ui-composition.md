# Spike A7 — composição da UI Persona no roster do Harness

Data: 2026-11-03. Autor: Prism (builder UI). Fontes: `packages/bundle/web-app/cordis.patch.yml`, `packages/persona/persona-app/cordis.patch.yml`, READMEs de `packages/client/{ui-layout,ui-sidebar,ui-workspace,ui-theme,web,ui-conversation,ui-chat,ui-brand-official,ui-settings*}`, `packages/experimental/client-ui-forge/src/client/mount.ts`, `docs/subsystems/slots.md`, D-004/D-005/D-027.

## Pergunta

Como a Persona substitui o shell do DeepSeek Harness sem quebrar boot, RPC `/api`, tema e i18n — e quais rows do bundle podem receber `disabled: true` por `id`?

## Modelo mental

1. **Boot inalterado.** `dsh-client-modules` monta `window.__DSH_BOOT__`; `connection` + `api-remotes` + `cordis-client-runner` sobrevivem. O Electron continua servindo `dist` e proxy `/api` (F6 / D-004).
2. **Um plugin de produto.** `@deepseek-ai/dsh-client-ui-persona` entra no roster (`persona-app/cordis.patch.yml`, id `ui-persona`) e, no padrão Forge, faz `$mount` do Remote Typert de `persona-host` antes de registrar slots/UI (`mount.ts`).
3. **Troca de shell = ocupar `root`.** Só existe um ocupante `single` por slot. Hoje `ui-layout` registra `AppFrame` em `'root'` e declara filhos (`sidebar`, `main`, `rightbar`, `shell.*`). A Persona **desativa `ui-layout`** e registra seu próprio frame em `'root'` com a mesma árvore de filhos (ou subconjunto), mais marca/sidebar Persona nos assentos internos.
4. **`disabled: true` é seguro por id** quando nenhum plugin *required* lista o row desativado em `inject` Cordis **e** nenhum slot declarado por outro plugin ativo exige o ocupante desativado. Rows desativados somem do grafo; dependências não satisfeitas travam boot (com mensagem no boot page).

## Onde registrar o `'root'` Persona

| Hoje | Persona |
| --- | --- |
| `ui-layout` → `AppFrame` + `ctx.layout` + `ThemePresenter` no body | `client-ui-persona` → `PersonaAppFrame` (parte 2) em `'root'` |
| Filhos declarados em `ui-layout/src/client/index.ts` | Re-declarar os mesmos nomes de slot filho no `register({ name: 'root', children: { … }})` da Persona |
| `ui-sidebar` ocupa `sidebar` + `shell.leading` | Persona ocupa `sidebar` com navegação pt-BR (Visão geral, Projetos, …) e **declara filho `sidebar.settings`** + `renderSlot('sidebar.settings', { wide: true })` para `ui-settings-general` |
| `ui-conversation` + `ui-chat` ocupam `main` key `conversation` | Persona ocupa `main` com chaves próprias (`overview`, `project`, `channel`, …) |

**Dependência crítica:** desativar `ui-layout` remove `ctx.layout` e o `ThemePresenter` acoplado. A Persona deve **re-fornecer `ctx.layout`** (copiar/adaptar `LayoutController` + store) **ou** manter `ui-layout` desabilitado só depois que o frame Persona incluir presenter de tema (chama `ctx.theme` como hoje). Recomendação Keel: frame Persona reutiliza `ThemePresenter` importado de `ui-layout` via extrair para pacote compartilhado **ou** duplica mínima no plugin Persona (decisão de detalhe Prism + Keel na parte 2).

## Welcome / onboarding DeepSeek (`ui-settings-account`)

- Row `ui-settings-account` + host `account-controller` implementam bloqueio de primeiro uso (conta/chave DeepSeek, overlay `shell.overlay` id `desktop-onboarding`).
- **Persona:** `disabled: true` em `ui-settings-account` e, no marco A, considerar `account-controller` desativado ou substituído por fluxos `persona-vault` + onboarding Persona (RCD: *Value first, ask later* — pedir CLI só no ponto de uso).
- **Risco:** plugins que injetam `account` ou leem onboarding snapshot (ex. quota notice) deixam de montar; aceitável no perfil `persona`.

## `ui-brand-official`

- Ocupa `sidebar.brand.*` e depende de `DSH_CLIENT_BUILD_PROFILE=official`.
- **Persona:** `disabled: true`; marcas Persona via slots próprios no plugin (`sidebar.brand.mark` / `name`) com assets Brush (D-017 MIT + créditos upstream numa tela About, não na sidebar DeepSeek).

## Sessões e serviços Harness reutilizados vs ignorados

| Serviço / plugin | Persona |
| --- | --- |
| `session-controller` + `ClientSessions` | **Ledger/execução DSH** (runs, agentes Atlas/workers). UI principal **não** usa lista de sessões Harness como navegação. |
| `ui-session` | **Opcional manter:** hooks `useSessionAccess`, `useSessions` se alguma ferramenta DSH aparecer embutida. Shell Persona pode ignorar no curto prazo. |
| `ui-conversation` / `ui-chat` | **Ignorar** para mensagens de produto; stream vem de `persona-host` Remote. |
| `workspace-controller` / `ui-workspace` | **Ignorar** na navegação; projetos Persona vêm do store/host. Reativar só para “abrir pasta do projeto” no desktop. |
| `settings-controller` | **Manter** para preferências genéricas (tema, atalhos) até settings Persona existirem. |
| `terminal-controller`, sidebar terminal/browser/files | **Desativar** no MVP; reintroduzir por feature. |
| `mcp-manager`, plugins settings | **Desativar** no produto Persona inicial (superfície própria depois). |
| `ui-theme` + tokens `--persona-*` | **Manter**; Persona registra override de tema (`client-ui-persona/src/client/theme`) mapeando `--dsw-alias-*` (D-005). |
| `ui-renderer`, `ui-slots`, `locale`, `ui-primitives` | **Manter** (disciplina AGENTS.md). |
| `ui-tool`, `ui-attachment`, Markdown/diff upstream | **Manter** para renderizar ferramentas DSH dentro de runs quando necessário. |
| `product-analytics`, telemetria OTLP | **Desativar** (D-016 / marco A). |

## Rows que **não** devem ser desativados (mínimo boot + RPC + render)

Host (além de `dsh-base`): `session-controller`, `settings-controller`, `persona-host`, `cordis-host-runner`, `webserver`/`web-runtime` (web/desktop), `plugin-inventory` (opcional), `workspace` host service se runners usarem cwd.

Cliente:

- `modules`, `connection`, `file-upload`, `api-remotes`, `cordis-client-runner`, `client-hmr`
- `ui-theme`, `locale`, `ui-renderer`, `ui-slots`
- `ui-persona` (`@deepseek-ai/dsh-client-ui-persona`)
- **`ui-settings`, `ui-settings-general`** (configForms + painel de preferências; ocupam `sidebar.settings`)
- `shortcuts`, `ui-shortcuts` (atalhos globais; Persona pode registrar comandos próprios)
- `resources` (hook `useResource` — regra client AGENTS.md)
- `ui-session` (recomendado manter até provar que nenhum inject residual exige)

## Lista proposta para `persona-app` (Keel)

### Desativar (`disabled: true`, restate config se patch substituir row)

**Shell / produto Harness**

- `ui-layout`
- `ui-sidebar`, `ui-sidebar-right`
- `ui-sidebar-documentpreview`, `ui-sidebar-browser`, `ui-sidebar-terminal`, `ui-sidebar-files`
- `ui-workspace`, `ui-conversation`, `ui-chat`
- `ui-brand-official`
- `ui-settings-models`, `ui-settings-account`, `ui-settings-session-log`, `ui-settings-plugins`, `ui-settings-plugin-inventory`, `ui-settings-shell`, `ui-settings-agent-loop`, `ui-settings-subagent`, `ui-settings-web-search`
- **Correção 03/11 (Keel, perfil `persona`):** manter **`ui-settings`** + **`ui-settings-general` ATIVOS** — `ui-settings` provê `configForms`, exigido por `locale` / `ui-theme` / `ui-shortcuts`. Desativar quebrava boot silencioso ou plugins downstream.
- **Também desativar (órfãos sem ui-conversation/ui-workspace):** `message-quotes`, `ui-secret-mask`, `directory-picker`.
- `ui-plugin-manager`
- `ui-approval`, `ui-deliverables`, `ui-workflow-run`, `ui-agent-team`, `ui-subagent`
- `ui-input-trigger`, `ui-commands`, `ui-skill`, `ui-reference`, `ui-plan`, `ui-goal`, `ui-schedule`, `ui-jobs`
- `ui-model-selection`, `ui-permission`, `ui-agent-preset`, `ui-message-feedback`, `ui-user-questions`, `ui-trajectory`
- `entry-customization`
- `ui-file-actions`, `ui-open-in-app`, `ui-context-menu` (reativar se atalhos de arquivo forem necessários no desktop)
- `ui-cordis` (inspector dev)
- `desktop-product-telemetry`, `product-analytics`
- `message-feedback`, `message-quotes` (opcional desativar)
- `open-in-app` (host row) se não houver “Abrir no IDE” no MVP

**Manter ativos (além do mínimo acima)**

- `ui-theme`, `locale`, `ui-renderer`, `ui-slots`, `ui-session`, `resources`, `shortcuts`, `ui-shortcuts`
- `ui-attachment`, `ui-file-drag`, `ui-tool` (render de ferramentas)
- `office-to-pdf` (preview PDF se files voltar)
- Host rows de sessão/workspace/terminal conforme runners (Keel/Rivet)

### Inserir / já inserido

- `persona-host`, `ui-persona` (existente em `persona-app/cordis.patch.yml`)

Ordem de patch: `persona-app` **depois** de `web-app` para overrides por `id`.

## Padrão Remote (Forge)

`client-ui-persona` deve exportar `mountPersonaUi(ctx, contribution)` análogo a `mountForgePanel`:

1. `await ctx.remote.$mount(personaHostContribution)`
2. `ctx.inject(['remote.personaHost', 'slots', 'locale', 'theme', …], registerUi)`
3. `registerUi` registra `'root'`, dicionários `persona.shell`, tema CSS.

## Go / no-go D-004

**GO** — com condições:

1. Spike confirma que **um** plugin pode desativar `ui-layout` + sidebar/chat e ocupar `root` sem rows obrigatórios restantes apontando para eles.
2. Custo aceitável: reimplementar `ctx.layout` + frame (estimativa Keel: parte 2 protótipo).
3. **No-go trigger** (revisitar D-004): se extrair `layout` + slots filhos + presenter exceder >2 dias **sem** tela estática (critério PLAN R3) **ou** se surgir dependência oculta de `ui-conversation` no boot.

**Decisão:** seguir D-004; Keel aplica lista de `disabled` no bundle; Prism entrega frame falso na parte 2.

## RCD por decisão de UX/composição

| Decisão | Princípio RCD |
| --- | --- |
| Desativar Welcome DeepSeek | *Value first, ask later* — onboarding Persona no primeiro projeto, não bloqueio de API key upstream |
| Shell vazio substituído por Persona root | *Never ship a blank dashboard* — navegação com Visão geral/Projetos desde o dia 1 |
| Manter `ui-theme` + tokens Persona | *Default is the decision* — lilás/âmbar D como padrão, claro/escuro coerente |
| Uma ação primária por área (parte 2) | *Neutrality is omission* |
| Lista de desativação agressiva de settings/plugins Harness | *Expansion is born of usage* — superfícies Persona só quando o fluxo exigir |
| Stream de chat via `persona-host`, não `ui-chat` | *Retention is built* — continuidade do time Persona, não transcript de sessão genérica |

## Próximo passo (parte 2)

Protótipo `PersonaAppFrame` + sidebar fake usando `persona.shell` + dados stub; validar boot desktop com patch Keel e trava `with-lock.mjs`.
