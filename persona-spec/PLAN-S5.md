# PLAN-S5 — a VERSÃO FINAL do Miguel (Keel, 12/11 23:20)

**Regra do Miguel (via Atlas, 22:28):** ele só instala a versão final. **Sem pack, sem Setup, sem verificador do exe, sem instalador de checkpoint** até o app estar completo. O instalador vira UMA etapa só, no fim. Continuam: commits por onda com o gate da árvore, auditoria independente em ondas (acesa = auditada), e testes no app de DESENVOLVIMENTO (host dev, sem instalar).

**"Completo" =** marco M1–M9 + itens 21–26 (o #26 inteiro, com a fundação da onda B) + D-120 (login por passkey) + D-122 (pessoal/equipe, Meu espaço, levar a equipe) + as decisões D-115…D-122.

## 1. Onde estamos (12/11 23:20)

| Camada | Estado |
|---|---|
| S3b (base endurecida) | pushada (`4797e3481e`), selo do gate no commit limpo; **não será oferecida ao Miguel** (efeito do welcome já corrigido na árvore) |
| W1 SERVIDOR (marco M1–M9 no host, D-119/119b, D-121, executor B, Caderno host, Tornar do time dormente) | fecha 23:00; auditoria começa em seguida |
| W3 DESKTOP (Rivet: energia, login, executor + ponte M9, honest-1, quit) | pronto na árvore; commit logo após W1 |
| W4 CLIENTE (telas do marco, casa/clientes, rosto vivo, Meu espaço, levar a equipe) | em curso (Prism, Quill, Cobalt, Muse) |
| W2 EDGE (#23 relay Cloudflare + D-120 passkey) | 4 P1 do Lumen a corrigir antes de qualquer staging; passkey a construir |
| #26 conectores/plugins/skills | ~265 h-builder restantes (status real em `PLAN-26-STATUS.md`) |

## 2. Trilhas de trabalho do S5 (o que falta, por dono)

| Trilha | Conteúdo | Horas-builder | Donos (mistura de modelos) | Depende |
|---|---|---|---|---|
| **T-A Fundação #26** | 26.1 proxy MCP no host (fiar no `index.ts`, cliente MCP SDK, prévia no host) · **26.2 cliente OAuth do MCP** (`connector-oauth.ts`: RFC 8414/7591/8707, PKCE, loopback, SSRF, token no Cofre) · **26.3 entrega por motor + fechar o vazamento do Codex** (`isolation.ts:151`, `CODEX_HOME`, `opencode.json`) | 54 | Anvil + 1 mão nova (Sonnet high) no 26.2; Rivet no Codex/home isolado; Lumen revisa; Mend na classe de segurança | — |
| **T-B Porta de entrada** | 26.4 catálogo (acender a flag `toolsCatalog`) · 26.5 conectar com 1 clique · 26.8 saúde e erros em português · 26.9 "o que faz" + várias contas (schema v27) | 54 | Cobalt (host/painel) + Quill + Muse (textos e cartões) + Anvil (schema) | T-A (26.2) |
| **T-C Skills** | 26.10 importar (zip seguro, editor, UI) · 26.11 versões/atualizar · 26.12 skill em todo motor + HT-11 · 26.13 `$skill` · 26.14 `@conector/@arquivo` | 59 | Forge (host/gateway) + Prism/Quill (UI, composer) + Flint (`importSkills` P1-07/06) | 26.1 |
| **T-D Gatilhos** | 26.15 trava R1 · 26.16 e-mail→rotina (smoke IMAP real) · 26.17 eventos de venda/pagamento (poller via proxy) | 24 | Forge + Cobalt + Probe | 26.1, 26.2 (26.17) |
| **T-E Kits e confiança** | 26.18 kits (Loja, Confeitaria, Serviços) · 26.19 rotinas por conector · 26.20 uso por conector · 26.21 pânico "Desligar todos" + "Quem usou o quê" | 47 | Muse + Quill + Ember (kits), Tally + Prism (uso), Probe/Gauge (segurança) | T-A/T-B |
| **T-F Importar o que a pessoa já tem** | 26.6 link/comando (`npx`/stdio, "Avançado") · 26.7 trazer MCPs locais | 34 | mão nova + Quill/Rivet | 26.1, 26.2, **decisão do Miguel (3)** |
| **T-G Login e relay** | D-120 passkey (WebAuthn no Worker, sessão curta) · #23 cifra no SyncClient + tela Entrar + e2e Miniflare · correção dos 4 P1 do edge · staging só com ordem do Atlas | ≈ 40 | Bolt + Jade + Lumen (revisão) + Muse (tela de login) | P1 do edge primeiro |
| **T-H Canal restrito e Meu espaço (D-122)** | ACL de canal de verdade (core + ~12 ganchos + máscara de Tarefa + `createChannel` recusa id desconhecido) · Meu espaço = projeto pessoal · levar a equipe em lote | ≈ 24 | Tally (core) + Lumen (ganchos) + Flint (store) + Prism/Muse (UI) | commit W1 |
| **T-I Fechar 21/22/24/25** | #21 rosto vivo no fio (2 bugs) + aceite da Muse · #22 equipes/categorias V26 + acender canais · #24 prova ponta a ponta no PC dedicado (soak real) + BUG-QUIT-1 · #25 deploy oficial do relay | ≈ 36 | Quill/Ember/Muse · Flint/Prism · Onyx/Rivet/Probe · Bolt (com ordem do Atlas) | T-G |
| **T-J Memória e interação** | Caderno no app real · "Tornar do time" + `purgeMemory` (Remotes + UI) · memória de DM no turno da própria DM (regra autor==falante) · SB-5/6/7 · prova de interação persona↔persona com IA real (rodada paga só com OK do Atlas) · relatório de tokens antes/depois com conta real | ≈ 40 | Anvil + Lumen + Prism · Probe (rodada real) · Tally | W1 |

**Total ≈ 410 h-builder** (265 do #26 + ≈145 do resto). Com 8–10 trilhas em paralelo e agentes rodando ~3× o ritmo "de um dia de builder", o gargalo não é a soma: é a **cadeia crítica**.

## 3. Cadeia crítica (quem bloqueia quem)

`26.1 proxy fiado (14 h) ∥ 26.2 OAuth (24 h)` → `26.3 entrega por motor/Codex (16 h)` e `26.5 conectar 1 clique (18 h)` → `26.4 catálogo aceso (6 h)` → `26.8 saúde (12 h)` → `26.9 várias contas (12 h)` → **Typert T3 (uma vez)** → ligação das telas → **auditoria da onda #26** → correções → gate final.

Em horas de relógio: ≈ 24 h só do OAuth/proxy + ≈ 30 h até a UI do catálogo ligada. **O resto corre em paralelo.** O Typert T3 acontece quando T-A/T-B/T-C fecharem o último Remote novo (data-limite de Remotes novos: sexta 13/11 14:00).

## 4. Calendário realista (sem otimismo)

| Quando | Marco |
|---|---|
| qui 12/11 23:15 | commit W1 (servidor) → auditoria W1 |
| sex 13/11 02:00 | commit W3 (desktop) e W4a (telas do marco/casa-clientes) → auditorias |
| sex 13/11 14:00 | congelamento de Remotes novos; Typert T3 |
| sex 13/11 20:00 | **host do #26 fechado** (T-A, T-C, T-D) + passkey/edge (T-G) em staging com ordem do Atlas |
| sáb 14/11 06:00 | **UI do #26 ligada** (T-B, T-C, T-E, T-F) + D-122 (T-H) + T-I |
| sáb 14/11 06:00–14:00 | auditoria das ondas finais (Opus 5.5 pelo Antigravity), correções vermelho→verde (reaberto = Mend) |
| sáb 14/11 14:00–17:00 | gate-on-head do commit final, desenvolvimento: e2e no host dev, passada de leigo (Muse), recaptura (Ember) |
| **sáb 14/11 ~20:00** | **instalador final** (pack + verificador + e2e instalado) — **meta** |
| dom 15/11 12:00 | **limite máximo** |

Otimista (se não houver reabertura na auditoria e as 5 decisões saírem hoje): sábado 14/11 ~14:00. Pessimista (uma reabertura grande em segurança): domingo 15/11 ~12:00.

## 5. Auditoria em ondas (Auditor: Opus 5.5 high, Antigravity)

W1 (servidor) 23:15→03:00 · W3 desktop + W4a cliente 02:30→06:00 · W2 edge/passkey 21:00 (sex)→00:00 · **#26 (host)** 20:00→02:00 · **#26 (UI) + D-122 + T-I** sáb 06:00→12:00 · reauditoria do delta sáb 14:00. Cada onda só vai ao Auditor com commit fechado, check-pkg em zero e specs verdes; reaberto = Mend na hora.

## 6. Decisões que o Miguel precisa tomar (defaults que eu seguirei se não houver resposta até sexta 10:00)

1. **Google fora do Claude** (Codex/OpenCode): default = **Gmail via IMAP (senha de app)**, sem Drive/Agenda por OAuth próprio nesta versão (OAuth Google restrito exige verificação oficial + auditoria anual).
2. **24 fornecedores BR sem MCP oficial:** default = "Em breve" honesto; entram só os com MCP oficial ou **adaptador de token no Cofre** (padrão de Telegram/Slack/IMAP) para os 5 mais usados (a definir com ele).
3. **`npx`/stdio e ler `~/.claude.json`/`.codex`/`.cursor`** (26.6/26.7): default = em **"Avançado"**, com aviso forte, desligado por padrão.
4. **R2 (nada de Composio/corretor em nuvem):** default = **inegociável**.
5. **Cursor:** default = linha honesta "conectores ainda não funcionam no Cursor" (o OAR recusa `mcpServers`); investigação do OAR fica em baixa prioridade.

## 7. Mãos novas e mistura de modelos (Atlas recruta)

- **Mão 1 (Sonnet 5.5 high):** 26.2 cliente OAuth do MCP (segurança: SSRF, PKCE, token no Cofre) com Lumen revisando.
- **Mão 2 (Codex Terra 6.1):** 26.10 UI de Skills + 26.13 `$skill`/26.14 `@conector` no composer (com Prism).
- **Mão 3 (Antigravity Hydrogen xhigh):** 26.6/26.7 (importar link/comando e MCPs locais) se a decisão 3 vier "sim".
- **Mend** continua para reabertura e classes de segurança; Rivet **sai do empacotamento** para o W3/quit/Codex isolado até o instalador final.

## 8. Riscos (honestos)

1. **Auditoria da W1 vermelha de verdade** (superfície grande: ACL, DM, autoridade, executor): +3 h a 6 h e o Mend; é o caminho crítico real das próximas 12 h.
2. **A cadeia do OAuth** (24 h) é a maior; se escorregar, o catálogo acende só com "conta claude.ai + em breve" e o resto vira S6 declarado.
3. **Trava única da máquina:** gate da árvore, bundle, soak e e2e rodam um por vez; o tempo morto de fila entra nas estimativas.
4. **Hot files** (`index.ts` 11,3 mil linhas, `orchestration.ts`, `types.ts`): um dono por vez, patch atômico com `--check`.
5. **Cota do Claude:** a mistura de modelos protege; o Mend e a Muse (Opus) só nos pontos de segurança/aceite.
6. **Prova com IA real** (interação persona↔persona, relatório de tokens, soak real de uma noite) depende do OK e do teto do Atlas.

## 9. O que NÃO entra (declarado)

Levar a EMPRESA inteira (export/import cifrado), memória movida para B (modelo hub), Google OAuth próprio, Composio, VPS, `ComputerRuns` M9 no host de produção além da prova viva (o executor do desktop já existe).
