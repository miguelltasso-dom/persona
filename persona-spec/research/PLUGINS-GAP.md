# Conectores, plugins e skills — análise de lacunas (ITEM 26)

Pesquisa só de leitura, 12/11. Pedido do Miguel: "não pode passar batido os MCPs/plugins igual o T3 Code tem, o agentes.chat e outras ferramentas".

**Público:** dono de pequeno negócio no Windows, que não programa e usa a própria assinatura (Claude, ChatGPT) pelas CLIs Claude Code, Codex, Cursor e OpenCode.

**Fontes:**
- **Persona:** o código em `packages/persona/*`, a `design/PERSONA-POWERS-SPEC.md`, a `design/CONNECTOR-GRANT-SPEC.md`, o `contracts/connector-grants.md` e as decisões D-081, D-083, D-084 e D-099.
- **T3 Code:** os inventários do time (`research/t3code/INVENTARIO.md`, `INVENTARIO-BACKEND.md` e `TOP30.md`).
- **agentes.chat:** **só os ADRs em markdown** e a tabela de funcionalidades do README (0015, 0016, 0020, 0038, 0039, 0043, 0099, 0103, 0106, 0107, 0119, 0130 e 0170). Nenhum `.ts`/`.tsx` deles foi aberto, e nenhum texto foi copiado. O que segue é paráfrase de ideia, e não de código.
- **Ferramentas de mercado:** conhecimento próprio, sem consulta à web nesta rodada. O que não tenho certeza vai marcado **(incerto)**.

**As 4 regras que todo ticket abaixo respeita:**
- **R1 · persona ⊆ dono:** uma persona nunca tem mais acesso do que a pessoa dona dela.
- **R2 · a credencial não sai do PC:** fica no cofre DPAPI do Windows. Nada de corretor na nuvem, nem Composio hospedado nem servidor nosso guardando token.
- **R3 · funciona com assinatura:** nenhuma chave de API de modelo é exigida. Token de fornecedor, como o de uma loja, vale só quando não há OAuth.
- **R4 · clean-room:** nenhum código AGPL é usado.

---

## 0. Retrato honesto da Persona hoje (o que o código faz de verdade)

| Peça | Estado | Evidência |
|---|---|---|
| Conectores da **conta claude.ai** (Gmail, Drive, Calendar…) listados e liberados por persona, por URL, sem copiar credencial (ISO-5) | **existe** (só Claude) | `persona-host/src/connector-bridge.ts`: `availableConnectors` devolve `[]` para qualquer CLI ≠ `claude` e só lista `source: 'claudeai'`. Ver também `persona-runners/src/oar/isolation.ts` (`allowedMcpServers` por `serverUrl`) |
| MCP **locais** da pessoa (escopo user/project do Claude, `config.toml` do Codex, `mcp.json` do Cursor) | **faltando** (a D-084 diz "disponíveis", mas a ponte não os lista) | `connector-bridge.ts`: `connectorDefinitionOf` → `'missing'` para tudo que não é conta |
| Concessão permanente por persona, autorização por pedido, classe da ação (`read`/`change`/`send`/`pay`/`delete`), prévia de ação externa | **existe** (host + UI) | `persona-host/src/connector-grants-host.ts`, `connector-policy.ts`, `external-actions.ts`, `connector-asks.ts`; UI em `client-ui-persona/src/client/chat/InitiativeAskCard.tsx` e `settings-personas/PersonasSettingsPanel.tsx` (seção `connectors`, chips com ✕); store v22 (`contracts/connector-grants.md`) |
| Carregar só o conector que a tarefa precisa (roteamento sem modelo, só com texto da pessoa) | **existe** | `persona-engine/src/connectors-needed.ts`; `connector-bridge.ts` (`connectorsNeededBy`) |
| Isolamento por motor | **parcial** | `isolation.ts`: Claude `full`, OpenCode `full` (sem conector nenhum), Codex `partial` (carrega **todos** os MCP da pessoa), Cursor `none` (`oar/cursor.ts`: "OAR refuses `mcpServers`") |
| Ferramentas próprias da Persona servidas como MCP às CLIs (quadro, rotinas, `persona_ask`, navegador) | **existe** | `persona-runners/src/mcp/gateway.ts` (`createMcpGateway`), `persona-host/src/index.ts:1485`, `oar/codex-tools-config.ts` (home isolado do Codex) |
| **Proxy MCP / cliente OAuth no host** para servidores de terceiros (credencial no cofre) | **faltando** | Não há OAuth de MCP no host nem no cliente (grep `oauth` vazio em `persona-host/src` e `client-ui-persona/src`) |
| **Catálogo** de conectores, conectar com 1 clique, adicionar por URL ou comando | **faltando** | `connections/ConnectionsView.tsx` é só de **contas de motor** (Claude/Codex/…), não de ferramentas |
| Saúde e erros do conector | **parcial** | Estado "Não encontrado" só na spec (`CONNECTOR-GRANT-SPEC.md` §4); a ponte guarda um snapshot e, se falhar, "a persona fica sem conector" em silêncio (`connector-bridge.ts`) |
| Aviso de custo por conector (tokens a mais por chamada) | **parcial** | Textos `grant.iso5Cost` na `CONNECTOR-GRANT-SPEC.md`; medição em `oar/context-measure.ts` |
| Skills | **parcial**: só as **nascidas no app** ("Ensinar a persona" / playbook), com versão, ativar, voltar e compartilhar | `skills/SkillsPanel.tsx` é **real**: lê o host (`data/adapters/skills.ts`, `persona-host/src/screens.ts`, `KIND_SKILL`); `skills/mock-data.ts` hoje guarda só o tipo e a amostra de galeria |
| Importar skill (link GitHub / zip / editor) | **faltando** | Nada no host nem na UI |
| Skills pessoais do Claude nas personas (HT-11) | **parcial**: o runner está pronto, a UI está **desligada** | `persona-runners/src/oar/personal-skills.ts` (junções `--add-dir`); `settings-personas/ConnectedPersonasSettings.tsx:47` ("ficam FORA desta tela… voltam na v1.2") |
| Composer: `/` | **existe** (6 comandos) | `chat/composer-slash-commands.ts` (`/limites`, `/assunto`, `/lado`, `/ensinar`, `/contratar`, `/resumo`) |
| Composer: `@` | **parcial** (só personas) | `chat/ChannelComposer.tsx:260` + `responder-menu.ts` |
| Composer: `$skill` e `@conector` | **faltando** | `TOP30.md` item 23 |
| Rotinas | **parcial** (só por horário, com predefinições amigáveis) | `persona-host/src/harness-routines.ts` (`SchedulePreset` → `rrule`) |
| Eventos externos | **parcial**: email IMAP, Slack, Discord, Telegram e CalDAV viram **conversa**, e não gatilho de rotina | `persona-host/src/external-sources.ts`, `client/email-rule/EmailRuleForm.tsx` |
| Cofre DPAPI para segredos | **existe** | `persona-host/src/cofre-entries.ts`, `client/cofre/` |
| Plugins / pacotes (conector + skill + rotina + persona juntos) | **faltando** | — |

**Resumo:** o **motor de política** (quem pode, quando pergunta, prévia, só o necessário) já está à frente do T3 e no nível do agentes.chat. O que falta é **a porta de entrada**: catálogo, conectar, saúde, skills de fora e os gatilhos. E falta **a paridade entre motores**: fora do Claude, a pessoa quase não tem conector.

---

## 1. Tabela de capacidades

Legenda da coluna Persona: ✅ existe · ◐ parcial · ✗ faltando.

| Capacidade | T3 Code | agentes.chat (ADRs) | Mercado (Claude, ChatGPT, Codex, Cursor) | Persona hoje |
|---|---|---|---|---|
| Ver os servidores MCP ligados | Mostra os do provedor; o foco é dev (INVENTARIO-BACKEND §4) | Lista por organização, com ícone do servidor (0016, adendo de 27/10) | Claude Desktop: Settings › Connectors; Claude Code: `/mcp`; Cursor: Settings › MCP com bolinha verde/vermelha; Codex: `config.toml` sem tela **(incerto se já há tela)** | ◐ só a conta claude.ai (`connector-bridge.ts`) |
| Catálogo de 1 clique | ✗ | ✅ presets de 1 clique (Linear, Sentry, Notion, Stripe…) + 15 serviços pelo Composio + social (0107, 0170) | ✅ diretório de Connectors do Claude; diretório de Apps do ChatGPT; botão "Add to Cursor" (deeplink) **(incerto: o diretório oficial do Cursor)** | ✗ |
| Adicionar por URL | ✗ | ✅ qualquer https, com sondagem: aberto → liga; 401 → OAuth; senão pede chave (0016) | ✅ "Add custom connector" (Claude Pro/Max); modo dev do ChatGPT **(incerto: em quais planos)**; `claude mcp add --transport http` | ✗ |
| Adicionar por comando (`npx …`, JSON) | ✗ | ✗ (é nuvem) | ✅ `claude mcp add`, `codex mcp add` **(incerto)**, `mcp.json` do Cursor; extensões `.mcpb` do Claude Desktop (servidor local em 1 clique) | ✗ |
| OAuth do MCP (descoberta, DCR, PKCE, refresh) | ✗ | ✅ completo, com refresh um de cada vez (0016, adendo de 31/10) | ✅ Claude/ChatGPT pela conta; Claude Code `/mcp` → navegador | ✗ (só herda da conta claude.ai) |
| Várias contas do mesmo serviço | ✗ | ✅ "Stripe (Acme)", "Stripe 2", prefixo fixo de ferramenta (0099) | ◐ **(incerto)** | ✗ |
| Saúde, reconectar e erro em linguagem humana | ◐ bolinha de status de conexão (INVENTARIO 1.15) | ✅ `needs_reconnect`, "Reconectar", reconciliação a cada 15 min, falta de escopo explicada (0107 §8, 0016 adendo de 03/11) | ◐ Cursor mostra o erro cru; Claude pede "Connect" de novo | ◐ (só na spec) |
| Acesso por agente/persona | ✗ | ✅ por agente, só um admin dá; o dono só estreita (0016) | ✗ (tudo ou nada por app) | ✅ concessão + autorização por pedido + prévia (`connector-grants.md`) |
| Classificar ferramentas (ler / mudar / sensível) | ◐ aprovação de app MCP (INVENTARIO 4.17) | ✅ anotação + verbo + juiz; sensível só "aprovar" ou "desligado" (0016, adendo de 16/10) | ◐ Claude pergunta por ferramenta; ChatGPT confirma as de escrita **(incerto)** | ✅ `classifyTool` (a mais estrita entre anotação e nome) |
| Carregar só o necessário | ✗ | ✅ grupos + `find_tools`/`use_tool` (0043) | ◐ Claude Code: Tool Search / carga sob demanda **(incerto: o nome exato)** | ✅ ISO-5 + `connectors-needed` |
| Uso por conector (chamadas, erros, aprovações) | ✗ | ✅ tabelas por dia (0103) | ✗ | ◐ custo de tokens medido; sem contagem por conector |
| Funciona em qualquer motor | ✅ Codex e Claude (app MCP só nesses, INVENTARIO §26) | ✅ é neutro quanto ao provedor (0043) | n/a | ◐ Claude completo, Codex vaza tudo, OpenCode nada, Cursor nada |
| Skills: formato SKILL.md | ✅ lista as skills do provedor | ✅ (0020) | ✅ Claude (app, Code, API); Codex **(incerto: suporte recente)**; Cursor **(incerto)** | ◐ formato próprio (ensinado), sem SKILL.md de fora |
| Skills: importar link GitHub / zip / editor | ✗ | ✅ os três; um repo com várias skills deixa escolher; scripts nunca rodam (0020) | ✅ Claude: enviar zip; Claude Code: pasta e plugin | ✗ |
| Skills: versões, atualizar do link, desfazer | ✗ | ✅ hash da fonte, "Desfazer atualização", script novo espera aprovação (0020, 03/11) | ◐ via plugin/marketplace | ◐ versões e voltar existem; sem fonte externa |
| `$skill` no composer | ✅ `$` lista skills, e `$5` não dispara (INVENTARIO 2.18) | ◐ o agente carrega sozinho (progressive disclosure) | ◐ Claude Code: `/skill` **(incerto)**; ChatGPT: `@app` | ✗ |
| `@` arquivo / conector | ✅ `@` arquivo (INVENTARIO 2.15) | — | ✅ ChatGPT `@App`; Cursor `@` arquivo | ◐ só pessoas/personas |
| Evento do conector como gatilho de rotina | ✅ automações por webhook (INVENTARIO 17.12) | ✅ "Quando chegar email / pagamento / pedido…", com filtro antes de rodar (0130, 0106) | ✗ (Claude e ChatGPT têm tarefas agendadas, sem evento) **(incerto)** | ✗ (só horário; email vira conversa) |
| Plugins / pacotes / marketplace | ◐ "plugins" do harness (TOP30 l.4) | ◐ importar de outros apps (README) | ✅ Claude Code: plugins + marketplaces (comandos, agentes, skills, hooks e MCP num pacote); ChatGPT: Apps SDK | ✗ |
| Apps MCP com interface no chat | ✅ (INVENTARIO 26.8) | ✗ | ✅ ChatGPT Apps; Claude **(incerto: MCP Apps/UI)** | ✗ |
| O produto como servidor MCP para outros apps | ✅ (INVENTARIO 24.32) | ✅ (0119) | n/a | ✗ |

---

## 2. As lacunas que importam para quem não programa (em ordem)

1. **Não há porta de entrada.** A pessoa não tem onde "ligar o Mercado Pago". Hoje o conector só existe se ela **já tiver ligado na conta do claude.ai**, e só para o Claude. Para o dono de loja, isso equivale a "a Persona não tem conectores". É a lacuna nº 1 e é o que o Miguel viu.
2. **Fora do Claude, quase nada funciona, e o que funciona vaza.**
   - Codex carrega **todos** os MCP da pessoa em toda persona: fere R1 por padrão, e o custo vai junto.
   - OpenCode e Cursor ficam sem conector nenhum.
   - Quem assina o ChatGPT (Codex) é metade do público.
   - O conserto estrutural é **a ponte de conectores no host**: a Persona vira o cliente OAuth e o proxy MCP local, e entrega a cada motor só o que a persona pode usar.
3. **Sem OAuth de 1 clique nem tela de saúde.** Mesmo quando há conector, o token vence em silêncio, a persona "fica sem conector" e ninguém diz por quê nem o que fazer ("Entrar de novo no Mercado Pago").
4. **Skills só nascem de dentro.** Não dá para trazer a skill que um amigo mandou (link do GitHub, zip), nem escolher uma no composer (`$`). As skills pessoais do Claude estão prontas no runner e escondidas na UI.
5. **O trabalho não começa sozinho a partir do mundo lá fora.** "Quando entrar um pedido / um Pix / um email de cliente, a Nina responde" é o caso de uso mais desejado do pequeno negócio. Hoje a rotina é só por horário.
6. **Não há pacote pronto por tipo de negócio.** "Kit Loja Online" (conectores + skills + rotinas + persona) é como o não programador quer começar. Nem o T3 nem o agentes.chat têm isso direito: é o espaço para superar os dois.
7. **Conectores locais da pessoa invisíveis.** Quem já configurou algo no Claude Code ou no Cursor não vê isso na Persona, apesar da D-084 dizer "disponíveis".
8. **Sem contagem de uso por conector.** A pessoa não sabe qual conector "come" o limite da assinatura.

---

## 3. ITEM 26 — Conectores, plugins e skills de primeira

**Convenções:**
- O esforço é em dias de um builder, com testes.
- "Depende" cita outras fatias.
- Toda tela segue a regra da POWERS-SPEC: nenhuma palavra técnica (MCP, servidor, OAuth, token) na tela.
- Todo segredo vai no cofre DPAPI (`cofre-entries.ts`).
- A exportação e o sync nunca levam credenciais nem concessões.

### Bloco A · Fundação: a ponte de conectores (sem ela, o resto fica só no Claude)

**26.1 · Proxy MCP local no host** (3 d · depende: —)
- **O que a pessoa vê:** nada novo. A persona no Codex e no OpenCode passa a ter os mesmos conectores que no Claude, e só os concedidos.
- **Onde:**
  - um `persona-host/src/connector-proxy.ts` novo: servidor MCP streamable-HTTP em `127.0.0.1`, porta aleatória, token por turno;
  - ele reexpõe, de cada servidor de terceiro, **só as ferramentas da concessão daquela persona/tarefa**, já com `classifyTool` + `decideConnectorUse` aplicados **no host** (a prévia deixa de depender da CLI);
  - reusar o padrão de `persona-runners/src/mcp/gateway.ts`.
- **Regras:**
  - R1 é imposta no proxy, não na CLI;
  - R2: a CLI nunca vê o token do fornecedor, só o token do turno.

**26.2 · Cliente OAuth do MCP no host** (4 d · depende: 26.1)
- **Onde:** um `persona-host/src/connector-oauth.ts` novo, escrito do zero a partir das RFCs (clean-room):
  - descoberta pelo `WWW-Authenticate` / `.well-known/oauth-protected-resource`;
  - RFC 8414;
  - DCR (RFC 7591), cliente público;
  - PKCE S256;
  - `resource` (RFC 8707).
- **O retorno ao app:** pelo navegador do sistema, com retorno em `http://127.0.0.1:<porta>/callback` (loopback, padrão para app desktop).
- **Os tokens:** no cofre DPAPI.
- **O refresh:** um de cada vez por conexão, porque o fornecedor que roda o refresh token recusaria a segunda tentativa.
- **Guarda de rede:** só https, com bloqueio de IP privado (SSRF).
- **Regras:** R2 (nada passa por servidor nosso) e R3 (OAuth da conta do fornecedor, não chave de modelo).

**26.3 · Entrega por motor** (3 d · depende: 26.1)
- **O que a pessoa vê:** em Conexões, por motor, "Conectores: funcionam" / "Ainda não funcionam no Cursor".
- **Onde:**
  - **Claude:** `--mcp-config` com só o proxy, mais o que já existe do ISO-5 para os da conta;
  - **Codex:** um bloco `[mcp_servers.persona-conectores]` no **home isolado** (`oar/codex-tools-config.ts`, `oar/isolated-home.ts`). Também fechar o vazamento: se o home isolado for provado, Codex passa de `partial` a `full`;
  - **OpenCode:** um `opencode.json` no diretório de config do produto (`XDG_CONFIG_HOME` já isolado em `isolation.ts`);
  - **Cursor:** a linha honesta até o OAR aceitar `mcpServers` (`oar/cursor.ts`).

### Bloco B · A porta de entrada (o que o Miguel vai ver)

**26.4 · Catálogo "Ferramentas do seu negócio"** (3 d · depende: 26.2 para os de OAuth; sem ela, mostra só os da conta claude.ai e "Em breve")
- **O que a pessoa vê:**
  - uma aba nova em Conexões, ao lado das contas;
  - uma grade de cartões com ícone, nome e uma frase do que a persona faz com ele ("Ver vendas e responder clientes do Mercado Livre");
  - filtros por categoria: Vendas e loja · Pagamentos · Atendimento · Agenda e email · Documentos · Redes sociais · Gestão (ERP);
  - um selo "Já ligado" (detecta os da conta claude.ai e os locais).
- **Onde:**
  - `client-ui-persona/src/client/connections/ConnectorCatalog.tsx` (novo);
  - os dados em `persona-host/src/connector-catalog.ts` (curadoria nossa: id, nome PT/EN, categoria, URL do servidor oficial, forma de entrar, eventos que oferece, modelos de rotina).
- **Catálogo inicial (pequeno negócio BR):**
  - a coluna "via" diz por onde liga;
  - **(confirmar)** = verificar se o fornecedor tem servidor MCP remoto oficial antes de prometer.

| Categoria | Serviço | Via provável |
|---|---|---|
| Agenda e email | Gmail, Google Agenda, Drive, Planilhas | conta claude.ai (Claude); para Codex **(incerto: o Google exige app verificado para escopo restrito: risco)** |
| Agenda e email | Outlook / Microsoft 365 | conta claude.ai **(incerto)** ou MCP oficial **(confirmar)** |
| Pagamentos | Mercado Pago | MCP oficial **(confirmar)** |
| Pagamentos | Stripe | MCP remoto oficial |
| Pagamentos | Asaas, PagBank, Pagar.me | **(confirmar)**; senão token no cofre |
| Vendas e loja | Shopify | MCP oficial |
| Vendas e loja | Nuvemshop, Mercado Livre, Tray, Loja Integrada | **(confirmar)** |
| Atendimento | WhatsApp Business (API oficial da Meta) | **(confirmar MCP)**; a Persona já tem Telegram/Slack/Discord/email como fontes (`external-sources.ts`) |
| Redes sociais | Instagram/Facebook (Meta), Google Meu Negócio | **(confirmar)** |
| Gestão (ERP) | Bling, Omie, Conta Azul, Tiny | **(confirmar)**; o provável é token no cofre |
| Gestão (ERP) | Notion, Trello, Asana | Notion: MCP remoto oficial; os outros **(confirmar)** |
| Gestão (ERP) | HubSpot, RD Station, Pipedrive | HubSpot: MCP oficial **(confirmar)**; os outros **(confirmar)** |
| Documentos e nota fiscal | Canva | MCP oficial **(confirmar)** |
| Documentos e nota fiscal | emissor de NF-e (Focus NFe / NFE.io / eNotas) | **(confirmar)**; o provável é token |

**26.5 · Conectar com 1 clique** (3 d · depende: 26.2, 26.4)
- **O que a pessoa vê:**
  1. "Conectar" no cartão;
  2. o navegador abre na página do fornecedor ("Continuar no Mercado Pago");
  3. o app volta sozinho com a celebração curta, "Mercado Pago ligado";
  4. o passo final, "Quem pode usar?", com os rostos das personas (padrão: ninguém sem perguntar; a autorização por pedido continua valendo, D-084) e a lista do que ele permite, em PT ("Ler vendas · Criar cobrança (pede confirmação) · Estornar (sempre pede)").
- **Para serviço sem OAuth:** um assistente "Onde acho o código?" com 3 passos e imagem; o código vai direto ao cofre e nunca aparece de novo.
- **Para os da conta claude.ai:** o botão "Ligar na sua conta do Claude" abre a página de conectores da conta, e a Persona detecta na volta (ponte já existe).

**26.6 · Adicionar por endereço ou por comando** (2,5 d · depende: 26.1, 26.2)
- **O que a pessoa vê:** "Tenho um link ou comando". Um campo que aceita:
  - um endereço https (sondagem: abre direto / pede entrar / pede código);
  - um trecho JSON de `mcpServers` ou um comando `npx …` / `claude mcp add …` copiado de um site;
  - o link "Add to Cursor" **(incerto: o formato do deeplink)**.
- **Onde:** `connector-import.ts` no host (o parser, com testes de colagem real).
- **Servidor local (stdio):**
  - roda supervisionado pelo host, atrás do proxy;
  - variáveis com segredo vão para o cofre;
  - aviso claro: "Isso roda um programa no seu computador. Só adicione se confiar em quem mandou."

**26.7 · Trazer os conectores que você já tem** (2 d · depende: 26.1, 26.6)
- **O que a pessoa vê:** "Encontramos 4 ferramentas no seu Claude Code e 2 no Cursor. Trazer para a Persona?"
- **Onde:** ler (nunca escrever) o escopo user do Claude (`~/.claude.json` **(confirmar caminho)**), o `~/.codex/config.toml` e o `~/.cursor/mcp.json`. Fecha a promessa da D-084 para os MCP locais. Segredos em `env` são movidos para o cofre.

**26.8 · Saúde e erros em português** (2,5 d · depende: 26.1)
- **O que a pessoa vê:** um chip por conector, com a ação certa:

| Estado | Ação |
|---|---|
| Funcionando | — |
| Precisa entrar de novo | Entrar de novo |
| Fora do ar agora | Tentar de novo (a persona tenta mais tarde sozinha) |
| Falta permissão para X | Entrar de novo pedindo X |
| Não encontrado | Remover da lista |

- **No fio:** "A Nina não conseguiu ler as vendas: o Mercado Pago pediu para você entrar de novo · Entrar de novo".
- **Outros comportamentos:**
  - "Testar agora" faz uma chamada só de leitura;
  - checagem leve a cada 15 min e na abertura do app;
  - o erro do fornecedor vem como texto não confiável, sempre embaixo da nossa frase.
- **Onde:** estende `RUN-ERRORS-SPEC.md` / `RunErrorCard`, os estados da `CONNECTOR-GRANT-SPEC` §4 e o status no `connector-proxy.ts`.

**26.9 · "O que este conector faz" e quem pode usar** (2 d · depende: 26.4; usa o HT-13 já especificado)
- **O que a pessoa vê:** a página do conector com:
  - a lista de ações em PT, agrupada (Ler · Mudar · Enviar · Pagar · Apagar), com o cadeado nas que sempre pedem;
  - quem tem "sem perguntar";
  - várias contas ("Mercado Pago (Loja Centro)", "Mercado Pago 2").
- **Onde:** a `PERSONA-POWERS-SPEC` §5/§6 + `connector_grant` (já no store v22); a conta extra pede `connection_id` na concessão (store v23).
- **Regra (R1):** a concessão só aceita conexão que a pessoa dona tem ativa.

### Bloco C · Skills

**26.10 · Importar skill (link do GitHub, zip ou escrever)** (3,5 d · depende: —)
- **O que a pessoa vê:** em Skills, "Adicionar skill" · Colar link / Enviar arquivo / Escrever.
  - Um link com várias skills mostra a lista para marcar.
  - A prévia mostra nome, o que faz e os arquivos.
  - "Arquivos que rodam programas não serão usados" quando houver scripts.
- **Onde:** `persona-host/src/skill-import.ts` (novo):
  - baixa o zip do repositório no ref do link;
  - leitor de zip com limites (tamanho, quantidade, sem `..`);
  - valida o frontmatter do SKILL.md (`name`, `description`);
  - grava como `KIND_SKILL` em `screens.ts`, com `source`.
- **Para escrever:** um editor simples, reusando o `TEACH-PERSONA-SPEC`.
- **Regras:** R2/R3 (nenhum token GitHub é necessário para repo público) e R4.

**26.11 · Versões e atualizar do link** (2 d · depende: 26.10)
- **O que a pessoa vê:**
  - "Versão 3 · do link · atualizada ontem";
  - "Atualizar" (mesmo conteúdo, nada muda);
  - "Desfazer atualização";
  - uma mudança que traz script nova **espera a pessoa aprovar** e mostra o antes/depois.
- **Onde:** `nextSkillVersion` / `rollbackSkill` já existem (`screens.ts`); falta o hash da fonte e a fila de atualização.

**26.12 · A skill chega a qualquer motor, por persona** (2,5 d · depende: 26.10, 26.1)
- **O que a pessoa vê:**
  - na skill, "Quem usa: Nina, Bento";
  - o interruptor "Usar as minhas skills do Claude" volta (HT-11), agora ligado de verdade.
- **Onde:**
  - **Claude:** a pasta de ponteiros + `--add-dir` (`oar/personal-skills.ts`, já pronto), fiada no host;
  - **todos os motores:** duas ferramentas da Persona no gateway, `listar_skills` / `ler_skill` (carregar sob demanda: o prompt leva só nome e descrição);
  - o Codex e o Cursor com skills nativas ficam **(incerto)**, então usa-se o caminho do gateway.

**26.13 · `$skill` no composer** (1,5 d · depende: 26.12)
- **O que a pessoa vê:**
  - digitar `$` abre a lista de skills da persona ativa, com busca;
  - insere um chip "Orçamento de bolo";
  - `$5`, `R$ 50` e valores não disparam (regra do T3, INVENTARIO 2.18).
- **Onde:** `chat/ChannelComposer.tsx` (o menu já tem `/` e `@`; somar um terceiro gatilho em `responder-menu.ts`).

**26.14 · `@` para conector e arquivo** (2 d · depende: 26.4)
- **O que a pessoa vê:**
  - `@Mercado Pago` no pedido vira um chip, e isso **é** a autorização por pedido (D-084 regra 2) daquela tarefa;
  - `@arquivo` lista os arquivos do projeto (T3 2.15).
- **Onde:** `ChannelComposer.tsx`, `responder-menu.ts`; host: `ticket_connector_auth` com `source='request'` a partir do chip (mais forte que o roteamento por texto).

### Bloco D · O trabalho começa sozinho

**26.15 · Gatilho "Quando…" nas rotinas** (2 d · depende: —)
- **O que a pessoa vê:** no editor de rotina, além de "Todo dia às 8h", a opção **"Quando acontecer algo"**, com a lista de eventos dos conectores ligados, em PT, e filtros simples.
- **Onde:**
  - `routines/RoutineEditorModal.tsx`, `routine-schedule.ts`;
  - `persona-host/src/harness-routines.ts` (`trigger: {kind:'schedule'|'event'}`);
  - store: `routine_trigger`.
- **O filtro roda antes:** evento fora do filtro não acorda ninguém (custo zero).
- **Regra (R1):** a rotina só escuta conector que a persona dela pode **ler**.

**26.16 · Primeiro evento: chegou email** (1,5 d · depende: 26.15)
- **O que a pessoa vê:** "Quando chegar email de cliente em contato@…, a Nina responde (com prévia)".
- **Onde:** já existe a fonte IMAP com filtro (`external-sources.ts`, `email-rule/EmailRuleForm.tsx`); é ligar o `Trigger` à rotina, e não só à conversa. O `viaEmail` já impede o envio automático.

**26.17 · Eventos de venda e pagamento** (3 d · depende: 26.15, 26.1)
- **O que a pessoa vê:** "Quando entrar um pedido / um pagamento for aprovado / uma pergunta no Mercado Livre".
- **Onde:**
  - **por sondagem pelo proxy** (o app desktop não recebe webhook público sem túnel);
  - um "desde o último visto" por conector, intervalo adaptativo (1–5 min com o app aberto);
  - a definição de cada evento no `connector-catalog.ts` (como ler, como filtrar);
  - o conteúdo do evento entra como dado externo não confiável (`external_data`); nunca autoriza `send`/`pay` (o GUARDRAIL do `connector-grants.md`).

### Bloco E · Pacotes ("plugins" do jeito da Persona)

**26.18 · Kits por tipo de negócio** (3 d · depende: 26.5, 26.10, 26.15)
- **O que a pessoa vê:** "Kit Loja Online", "Kit Confeitaria / Encomendas", "Kit Prestador de serviço". Um kit é:
  - persona sugerida;
  - conectores a ligar (com o passo de conectar de cada);
  - skills prontas;
  - 2–3 rotinas modelo ("Todo dia 8h: vendas de ontem"; "Quando entrar pedido: confirmar com o cliente").
- **A instalação:** um assistente de 3 passos; nada é ligado sem a pessoa conectar cada conta.
- **Onde:**
  - formato `persona-kit.json` nosso (manifesto + SKILL.md + modelos de rotina; **nunca** segredo);
  - importar por arquivo ou link;
  - `persona-host/src/kit-install.ts`.

**26.19 · Modelos de rotina por conector** (1 d · depende: 26.15)
- **O que a pessoa vê:** ao ligar um conector, o cartão "Coisas que a Nina pode fazer com o Mercado Pago", com 2–3 rotinas de 1 clique.

### Bloco F · Confiança e custo

**26.20 · Uso por conector** (1,5 d · depende: 26.1)
- **O que a pessoa vê:** em Uso › por conector: chamadas, erros, quantas pediram confirmação e o custo estimado do limite (tokens das definições, já medidos em `context-measure.ts`).
- **Onde:** uma contagem por dia no proxy (só id do conector, persona e contagens; nunca entrada nem nome de pessoa).

**26.21 · Segurança do conjunto** (1,5 d · depende: 26.1, 26.2)
- **O que a pessoa vê:** "Desligar todos os conectores agora" (botão de pânico) e o registro "Quem usou o quê" por conector.
- **Testes obrigatórios:**
  - a injeção por email/evento não autoriza envio;
  - a concessão não passa do dono;
  - o export e o sync não levam token nem concessão;
  - o servidor que mente `readOnlyHint` continua sensível.

### Depois (P2)

- **26.22 · Apps MCP com interface no fio** (5 d): o cartão interativo do conector no lugar do texto (T3 26.8; ChatGPT Apps).
- **26.23 · A Persona como servidor MCP** (4 d): pedir à equipe a partir do Claude Desktop ou do ChatGPT (T3 24.32, agentes.chat 0119). Exige cuidado com R2.
- **26.24 · Contas múltiplas no mesmo fornecedor com seletor de conta automático** (2 d).

### Resumo de esforço

| Bloco | Fatias | Dias |
|---|---|---|
| A · Fundação | 26.1–26.3 | 10 |
| B · Porta de entrada | 26.4–26.9 | 15 |
| C · Skills | 26.10–26.14 | 11,5 |
| D · Gatilhos | 26.15–26.17 | 6,5 |
| E · Kits | 26.18–26.19 | 4 |
| F · Confiança | 26.20–26.21 | 3 |
| **Total P0/P1** | **21 fatias** | **≈ 50 dias-builder** (paralelizável em 3 frentes: host A/D, UI B/C, Muse nos textos e cartões) |

**Atalho para "algo visível em 1 semana" (sem esperar o Bloco A):**
- 26.4 em modo "só conta claude.ai + Em breve";
- 26.8 para os da conta;
- 26.10 + 26.13;
- 26.15 + 26.16 (email já tem fonte).

Isso cabe em ~11 dias de builder, em paralelo, e não depende do proxy.

---

## 4. As fatias "uau" para o Miguel ver primeiro

1. **Catálogo + Conectar com 1 clique (26.4 + 26.5).**
   - **O momento:** "Conectar Mercado Pago" → navegador → volta → "Quem pode usar? Nina" → e no fio a Nina já responde "Ontem entraram 14 pagamentos, R$ 2.380".
   - É a resposta direta à frase do Miguel e o que T3 não tem (nem mira esse público).
   - Para a demo antes do Bloco A: com Gmail/Drive da conta claude.ai.
2. **"Quando chegar um email / pedido, a Nina cuida" (26.15 + 26.16, depois 26.17).**
   - **O momento:** a pessoa não abre o app e o trabalho acontece, com o cartão de prévia "Vai enviar um email para ana@… · Enviar".
   - O agentes.chat tem isso na nuvem; a Persona faz **no PC, com a assinatura e sem a credencial sair da máquina**. Esse é o diferencial para contar no vídeo das 18h.
3. **Skill por link + `$` no composer (26.10 + 26.13).**
   - **O momento:** colar o link de uma skill ("orçamento de festa"), ver a prévia em PT, e no chat digitar `$orç…` → chip → a persona segue a skill.
   - Pequeno, bonito e muito "melhor que o T3" (o T3 só lista as do provedor; a Persona importa, versiona e mostra quem usa).

**Logo depois:** o **Kit Loja Online (26.18)**, que junta os três numa instalação só e é o candidato natural a tela de onboarding.

---

## 5. Riscos e pontos a confirmar antes de prometer

- **O Google para quem não usa Claude.** Gmail e Drive por OAuth próprio exigem app verificado (escopos restritos têm auditoria anual paga, como o agentes.chat registrou no ADR 0107). Para assinantes do ChatGPT/Codex, Gmail pode ficar "via IMAP com senha de app" (a fonte já existe) até haver caminho melhor. **(incerto: se o Codex expõe os conectores da conta ChatGPT à CLI)**
- **Fornecedores BR sem MCP oficial.** Cada linha "(confirmar)" do catálogo precisa de uma checagem antes de entrar como "1 clique"; o que não tiver vira "Em breve", nunca um servidor de terceiro desconhecido por padrão.
- **Composio e corretores hospedados** resolvem rápido, mas ferem R2 (o token mora fora do PC). **Fora**, salvo decisão explícita do Miguel.
- **Webhook no desktop** exige túnel público; a proposta usa sondagem (26.17). Um túnel opcional fica para depois.
- **Cursor:** sem `mcpServers` no OAR, não há conector. É a linha honesta na tela até o adaptador aceitar.
- **Codex `partial`:** enquanto 26.3 não fechar o home isolado, a tela precisa continuar dizendo que "No Codex, todos os seus conectores já ficam carregados" (POWERS-SPEC §5).
