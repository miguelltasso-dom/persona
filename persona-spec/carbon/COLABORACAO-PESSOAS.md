VEREDITO: Arquitetura fechada na decisão do Miguel — **Cloudflare Workers + Durable Objects** como ponte cega de salas ao vivo, presença e convites (**zero D1**, usando o SQLite nativo já embutido em cada Durable Object, e **R2 apenas para anexos cifrados > 64 KB**), combinada aos **3 modos de execução local das personas** à escolha do usuário: **(a) o próprio PC**, **(b) rede Tailscale entre os PCs da equipe** (via expressa P2P para arquivos pesados e navegador ao vivo) e **(c) um Computador Dedicado sempre ligado** rodando na assinatura do dono. O Worker nunca vê credenciais, tokens de CLI nem texto claro das conversas (`E2EE` com `AES-256-GCM` + `X25519` e autoria `Ed25519`), custa **US$ 5/mês fixos na conta base** (**~US$ 0,05 a US$ 0,15 marginais por empresa adicional**) e permite desenvolver **100% agora em `wrangler dev` / Miniflare local** antes de liberar a conta da Cloudflare.

**Autor:** CARBON (Crítico-Chefe e Diretor Criativo) · **Para:** Miguel (CEO) e Atlas (CTO) · **Data:** 12/11/2026 (atualizado às 00:45 com a decisão de infraestrutura do Miguel)
**Licença e sala limpa:** Desenho 100% autoral **MIT** sobre a árvore da Persona (`persona-core`, `persona-store`, `persona-host`, `persona-runners`, `persona-sync`, `apps/persona-edge`, `client-ui-persona`). Leitura apenas conceitual das ADRs do `agentes.chat` (`0006`, `0010`, `0025`, `0068`, `0077`, `0080`, `0083`, `0084`, `0085`, `0090`, `0101` e `0148`) — zero linha, SQL ou texto copiados; sem Supabase; zero login/deploy na Cloudflare até liberação expressa do Miguel.

---

## 1. Desenho Detalhado da Arquitetura Escolhida

### 1.1 Visão Geral: A Ponte Cega na Borda + Os 3 Modos onde os Agentes Rodam

Separamos radicalmente **o plano de encontro** (mensagens, presença, convites e cartões, que cruzam o Cloudflare Worker cifrados) do **plano de execução e segredos** (CLIs de assinatura, Cofre DPAPI, pastas de trabalho e navegador Chrome, que **jamais** saem dos computadores conectados):

```
                      PONTE CEGA NA BORDA (Cloudflare Workers)
         ┌─────────────────────────────────────────────────────────────────┐
         │  Worker Stateless (roteia /w/:teamId/* + rate-limit de borda)   │
         │       │                                                         │
         │       ▼  1 Durable Object por Equipe (WorkspaceHub + SQLite)    │
         │  • Salas ao vivo via WebSocket Hibernation (custo CPU = $0 idle)│
         │  • Sequenciador único de `seq` por canal + Presença em RAM      │
         │  • Convites (só SHA-256) + Fila offline de envelopes E2EE       │
         │  • R2 opcional: SÓ blobs cifrados > 64 KB (TTL 60d, $0 egress)  │
         │  • ZERO D1 · ZERO chaves de IA · ZERO texto claro de conversa   │
         └──────────▲─────────────────────────▲────────────────────▲───────┘
                    │ WSS (E2EE)              │ WSS (E2EE)         │ WSS (E2EE)
        ┌───────────┴───────────┐ ┌───────────┴───────────┐ ┌──────┴──────────────────────┐
        │   PC DA ANA (App)     │ │  PC DO MIGUEL (App)   │ │ (c) COMPUTADOR DEDICADO     │
        │ Modo (a): Próprio PC  │ │ Modo (a): Próprio PC  │ │ "Estação Agentes" 24/7      │
        │ • SQLite + DPAPI Ana  │ │ • SQLite + DPAPI Mig. │ │ • Pareado por Miguel        │
        │ • Codex Plus da Ana   │ │ • Conversa e aprova   │ │ • Claude Max + Codex Miguel │
        │ • Roda: Téo, Nina     │ │   mesmo fechando após │ │ • Roda 24/7: Atlas, Bia,    │
        └───────────▲───────────┘ └───────────▲───────────┘ │   Luna + Rotinas das 08h    │
                    │                         │             └──────────────▲──────────────┘
                    └───────────◄─────────────┴────────────────►───────────┘
                         Modo (b) Via Expressa Tailscale (WireGuard P2P opcional)
                      • Arquivos/pastas > 50 MB direto disco-a-disco sem gastar R2
                      • Assistir / assumir navegador Chrome da persona (2FA ao vivo)
```

### 1.2 O Papel Exato de Cada Peça na Cloudflare (e por que NÃO usamos D1)

Evoluímos diretamente o `apps/persona-edge` já existente no repositório:

1. **Cloudflare Worker (`apps/persona-edge/src/index.ts`):** camada fina sem estado. Valida formato de rota, aplica limite de taxa por IP em pedidos de convite (`10/hora`), recebe webhooks externos assinados por HMAC (ex.: GitHub) e encaminha a requisição diretamente ao Durable Object daquela equipe (`idFromName(teamId)`).
2. **Um Durable Object por Equipe (`WorkspaceHub` com `new_sqlite_classes`):**
   - **Salas ao vivo e sequência linear:** é o único autoritativo para carimbar `seq = head + 1` em cada `streamId` (`channel:<id>`). Dois colegas postando no mesmo milissegundo nunca geram conflito: o DO serializa em microssegundos e transmite o envelope nos WebSockets abertos.
   - **WebSocket Hibernation nativo:** os PCs das pessoas e o Computador Dedicado abrem **1 único WebSocket multiplexado por equipe** (assinando até 200 canais no mesmo socket, em vez de 1 socket por canal como no rascunho atual). Quando ninguém digita, o DO hiberna na borda mantendo os sockets vivos a **custo zero de memória/CPU**.
   - **Presença em memória volátil do DO + batimento de 45 s:** quem está `online/busy/away/out` e qual máquina executora está viva ficam na RAM do DO (reconstruídos no `hello` se o DO acordar de hibernação), sem gastar escritas de banco a cada ping.
   - **Por que cortamos o D1:** cada Durable Object SQLite já entrega até **10 GB transacionais locais** colados na memória do objeto, sem latência de rede entre Worker e banco. Como todo link de convite carrega `teamId` no caminho (`persona://entrar/<teamId>/<token>`), nem para achar convite precisamos de índice global em D1. Menos 1 serviço, menos 1 conjunto de migrações e zero custo de linhas D1.
3. **Cloudflare R2 (estritamente quando preciso — anexos binários `> 64 KB`):**
   - Textos, cartões de tarefa, planos e miniaturas SVG pequenas viajam inline no próprio envelope do DO (`≤ 64 KB`).
   - Imagens, PDFs, áudios e pacotes de entrega maiores são cifrados na máquina de origem com uma chave aleatória de arquivo (`AES-256-GCM`), enviados por URL temporária de upload único ao bucket `BLOBS` do R2 (limite de `50 MB` por arquivo, expiração automática de `60 dias` via regra de ciclo de vida do R2, pois os PCs baixam para seu disco local) e a chave + `SHA-256` viajam dentro da mensagem cifrada do canal.

### 1.3 Os 3 Modos de Execução das Personas (`Connected Machines` em Sala Limpa MIT)

Toda persona tem um **dono humano (`owner_person_id`)** e aponta para um **Computador Executor (`runner_machine_id`)** pareado por esse dono. Os três modos convivem na mesma equipe — o Miguel pode deixar a equipe principal num mini-PC dedicado `(c)`, a Ana rodar o designer no notebook dela `(a)` e os dois ligarem Tailscale `(b)` para pastas pesadas:

- **Modo (a) · O Próprio PC (`my_pc` — padrão zero configuração):**
  - O próprio app desktop da Persona registra automaticamente este Windows como máquina executora das personas criadas ali.
  - As CLIs (`claude`, `codex`, `cursor`, `opencode`) rodam como processos filhos locais usando o login nativo da pessoa e o Cofre DPAPI daquela conta Windows.
  - **Quando fecha o notebook:** a pessoa continua recebendo histórico assim que reabrir; enquanto estiver fechado, suas personas aparecem para a equipe como *"PC de Ana desligado · pedido aguarda na fila"* (e na reabertura consolidam mensagens acumuladas num único turno `catch-up`, sem estourar a janela de 5h).

- **Modo (b) · Tailscale ligando os PCs da Equipe (`tailscale_mesh` — via expressa direta):**
  - O app detecta automaticamente se a interface Tailscale (`100.64.0.0/10`) está ativa nos PCs dos colegas e autentica um canal direto PC↔PC assinado pelas mesmas chaves `Ed25519` da equipe.
  - **O que ganha passando direto por Tailscale (sem tocar na Cloudflare):**
    1. **Transferência pesada disco-a-disco (`push/pull` sem limite de 50 MB e zero R2):** vídeos brutos, pastas de fotos da loja ou repositórios inteiros vão de PC para PC na velocidade da fibra/LAN.
    2. **Tela e navegador Chrome ao vivo (`Assumir controle`):** quando uma persona rodando em outro PC pede ajuda num login com QR Code do WhatsApp Web ou código 2FA, o dono assiste ao Chrome a 60% JPEG e assume o mouse/teclado com latência local, sem trafegar vídeo pelo Worker.
    3. **Sobrevivência local:** se um cabo submarino ou rota externa oscilar mas a malha Tailscale/LAN entre os PCs estiver de pé, a execução direta entre máquinas não cai.

- **Modo (c) · Computador Dedicado Só para os Agentes (`dedicated_agent_pc` — equipe viva 24/7):**
  - Qualquer PC Windows (mini-PC silencioso no escritório, notebook reserva na tomada ou máquina dedicada) instala a Persona e ativa **"Modo Estação de Agentes (Sempre ligado)"** — ou roda o comando headless `dsh --profile persona-station pair`.
  - **Pareamento em 30 segundos:** no seu PC principal, o Miguel clica em `Conectar computador dedicado`, recebe um código único de 8 caracteres válido por 10 minutos (`XXXX-XXXX`, só o `SHA-256` vai ao DO) e digita na máquina dedicada. Ela gera seu par de chaves no DPAPI local, abre um **WebSocket apenas de saída** para o DO (zero porta aberta no roteador/firewall!) e previne suspensão do Windows enquanto houver tarefa ativa (`SetThreadExecutionState`).
  - **Assinaturas seguras lá dentro:** o Miguel faz login no Claude Code / Codex **uma única vez diretamente no Computador Dedicado** (ou via Tailscale/RDP dele). As credenciais nunca viajam pela rede; o PC pessoal do Miguel só manda ordens assinadas (`Ed25519`) pelo canal E2EE!
  - **Isolamento e saúde da estação dedicada:**
    - Cada persona trabalha confinada na sua subpasta de rascunho `<pasta-base>/<handle>-<id8>/`, bloqueando `..`, caminhos absolutos fora do escopo e symlinks escapando da raiz.
    - **Controle de admissão por RAM livre:** antes de aceitar mais um turno simultâneo, a estação mede a memória livre (reservando `1,5 GB` de piso seguro e `~600 MB` por CLI). Se faltar espaço, fecha primeiro processos CLI quentes que estão ociosos (LRU) antes de responder `sem_vaga` (entrando em fila calma no host, sem erro na cara do usuário).
    - **Diário atômico de tarefas longas (`tasks/journal.json`):** processos de trabalho longo rodam desacoplados com batimento em arquivo `alive` a cada 15 s e limpeza garantida de árvore (`taskkill /T /F`) em cancelamento ou timeout — sobrevivendo até a atualização automática do próprio app.

### 1.4 Criptografia Ponta a Ponta (`E2EE`) e Fronteira de Confiança

| Dado | O que passa pelo Cloudflare Worker / DO | Quem consegue ler |
|---|---|---|
| **Credenciais de IA, logins de sites, chaves API** | **NADA (0 bytes).** Jamais saem do PC/Estação onde foram logados. | Só o processo local protegido pelo DPAPI do dono. |
| **Mensagens, cartões, planos, escolhas e status escrito** | `SealedPayload` (`AES-256-GCM`, IV 12B + Tag 16B) + assinatura `Ed25519` do autor. | Só os PCs membros daquele canal que possuem a `channel_key` da época atual. |
| **Anexos e entregáveis no R2 (`> 64 KB`)** | Bytes cifrados com chave efêmera única por arquivo; nome original vai dentro da mensagem cifrada. | Só membros do canal (o R2 vê apenas `blobs/<teamId>/<uuid>.enc`). |
| **Chave simétrica do canal (`channel_key`)** | Envelopes `key_wrap` cifrados individualmente via `X25519` (`ECDH` + `HKDF-SHA256`) para a chave pública de cada membro autorizado. | Apenas os membros admitidos por um dono/admin. |
| **Metadados mínimos visíveis ao DO** | `teamId`, `streamId` (`channel:<uuid>`), `seq`, `actorId` (UUID opaco), `deviceId`, `token_sha256` de convites e estado online do socket. | O DO usa apenas para ordenar `seq`, barrar revogados e entregar fan-out. |

**Desenvolvimento hoje sem conta Cloudflare:** todo este fluxo roda integralmente sobre `pnpm --filter @deepseek-ai/dsh-persona-edge dev` (Miniflare local em loopback ou exposto na LAN de teste), validado por dois perfis Electron/Node independentes + um 3º processo simulando o Computador Dedicado. No dia em que o Miguel liberar a conta, o deploy real é literalmente preencher `account_id` no `wrangler.toml` e rodar `wrangler deploy`.

---

## 2. Custo Mensal Real na Cloudflare para 1 Empresa Pequena

Cálculo realista com a tabela pública de 2026 do plano **Cloudflare Workers Paid (US$ 5,00/mês base na conta do Miguel)** para **1 empresa pequena ativa** (**6 pessoas + 10 personas + 1 Computador Dedicado 24/7**, 2.000 mensagens/eventos por dia útil, ~2 GB de artes/PDFs acumulados em 60 dias):

| Recurso Cloudflare | Consumo mensal de 1 empresa pequena | Franquia já incluída nos US$ 5/mês | Excedente cobrado por 1 empresa |
|---|---|---|---|
| **Assinatura base `Workers Paid`** | Conta única da Persona (hospeda N empresas) | — | **US$ 5,00 fixos** (1× para a Persona inteira) |
| **Requests ao Worker + DO (com desconto 20:1 de WS)** | ~220.000 frames WS/mês (msgs + presença + sync) = **~11.000 requests faturáveis** | **1.000.000** requests de DO + **10.000.000** de Worker | **US$ 0,00** *(usa só 1,1% da franquia)* |
| **Duração ativa do DO (com WebSocket Hibernation)** | DO dorme entre mensagens; ~15 ms ativos por evento = **~900 s ativos/mês** (`~115 GB-s` a 128 MB) | **400.000 GB-s** / mês | **US$ 0,00** *(usa só 0,03% da franquia)* |
| **SQLite embutido no DO (sem D1!)** | ~50.000 envelopes cifrados retidos por 60d (`~110 MB`), ~150k escritas e ~900k leituras | **1 GB** armazenamento · **50M** escritas · **25B** leituras | **US$ 0,00** *(usa ~11% do disco grátis)* |
| **R2 para anexos cifrados (`> 64 KB`, TTL 60d)** | `~2 GB` armazenados, ~5.000 uploads, ~25.000 downloads e **US$ 0 de banda de saída** | **10 GB/mês** grátis · **1M** PUTs · **10M** GETs · Egress grátis | **US$ 0,00** *(usa 20% da faixa grátis)* |
| **TOTAL MENSAL (1 empresa pequena)** | | | **US$ 5,00 / mês cravados** *(≈ R$ 28–30/mês)* |

**E quando escalarmos para várias empresas na mesma conta do Miguel?**
- **Até ~10 empresas pequenas:** a fatura total da Cloudflare continua em **US$ 5,00/mês** (tudo cabe dentro da franquia base + 10 GB grátis do R2).
- **Com 50 empresas pequenas ativas (300 pessoas + 500 personas):** ~5,5 GB de SQLite DO (+US$ 0,90) + ~90 GB no R2 (+US$ 1,20) + requests/escritas dentro ou raspando a franquia = **~US$ 7,50 a US$ 10,00/mês TOTAIS** (**custo marginal de ~US$ 0,05 a US$ 0,10 por empresa/mês**, menos de R$ 0,60 por empresa!).

---

## 3. Modelo de Dados Mínimo

Enxuto em **11 entidades** divididas entre o que sincroniza cifrado entre os membros da equipe e o que jamais sai da máquina executora:

### 3.1 Entidades Sincronizadas da Equipe (replicadas nos SQLites dos membros via envelopes E2EE)

1. **`team_space` (Organização / Equipe):** `id`, `name`, `icon`, `mode` (`'local_only' | 'shared_edge'`), `edge_url?`, `coordinator_persona_id?`, `key_epoch` (época da chave E2EE), `created_at`.
2. **`person` (Pessoa real):** `id`, `team_id`, `display_name`, `handle` (`@miguel`), `avatar`, `is_owner` (`0|1`, sempre `≥ 1` dono na equipe), `status` (`'active' | 'revoked'`), `sign_pub_key` (`Ed25519`), `box_pub_key` (`X25519`), `joined_at`.
3. **`connected_machine` (Onde os agentes rodam):** `id`, `team_id`, `owner_person_id` *(dono das assinaturas instaladas ali)*, `name` (`"Notebook de Miguel"`, `"Mini-PC Escritório"`), `kind` (`'my_pc' | 'dedicated_agent_pc'`), `tailscale_ip?` *(preenchido quando o modo `(b)` está ativo)*, `machine_sign_pub_key`, `detected_engines[]` (`['claude', 'codex']`), `status` (`'online' | 'offline'`), `free_ram_mb?`, `last_seen_at`.
4. **`role` e `person_role` (Papéis que somam, estilo Discord):**
   - `role`: `id`, `team_id`, `name`, `color`, `icon`, `position` (`0` = mais alto; `everyone` implícito na base), `permissions[]` (`post`, `create_channels`, `manage_channels`, `mention_everyone`, `talk_to_personas`, `assign_tasks`, `approve_business`, `create_personas`, `manage_personas`, `pair_machines`, `edit_brain`, `invite_people`, `manage_members`, `manage_roles`).
   - `person_role`: `(team_id, person_id, role_id)`. Regra de ferro: ninguém concede papel acima do próprio `position` nem permissão que não detém.
5. **`sector` (Setor / Sub-equipe do organograma):** `id`, `team_id`, `name` (`Marketing`, `Comercial`), `color`, `icon`, `position`, `lead_person_id?`, `backup_person_id?` (substituto automático em férias/ausência).
6. **`persona` (Ficha compartilhada + Vínculo com Dono e Máquina):**
   - `id`, `team_id`, `name`, `handle` (`@bia`), `animal_avatar`, `job_title`, `public_bio`,
   - **`owner_person_id`** *(quem é dono da persona, define seu teto máximo de acesso e paga sua assinatura)*,
   - **`runner_machine_id`** *(qual `connected_machine` do dono executa esta persona — ex.: o PC dele ou o Computador Dedicado)*,
   - `sector_id?`, `reports_to_persona_id?` *(supervisor opcional até 3 níveis, só roteia relato sem dar permissão)*,
   - `system_roles[]` (`'coordinator' | 'watchdog' | 'team_manager' | 'librarian'`), `declared_scopes`,
   - **`audience_mode`** (`'owner_only' | 'roles_or_people' | 'team_all'`), `audience_targets[]`, `consultable_by_personas` (`0|1`), `daily_shared_turn_cap` *(teto diário de turnos que colegas podem gastar)*,
   - **`owner_spec_sig`** *(assinatura `Ed25519` do `owner_person_id` cobrindo prompt, ferramentas e máquina — impede outro admin de injetar instruções na máquina do dono)*.
7. **`channel_category` (Categorias da barra lateral):** `id`, `team_id`, `name` (≤ 40 chars), `position`. Abrir/recolher e fixados (`channel_pin`, até 5 por seção) ficam salvos por pessoa.
8. **`channel` e `channel_member` (Canais e DMs entre pessoas):** `id`, `team_id`, `category_id?`, `name`, `kind` (`'general' | 'sector' | 'directorate' | 'custom' | 'person_dm'`), `visibility` (`'public' | 'private'`), `sector_id?`, `position`, `archived_at?`, `archived_reason?`, `channel_key_epoch`. Canais `private` e `person_dm` têm chave `AES-256` exclusiva embrulhada só para seus participantes.
9. **`message` (Mensagens, Assuntos e Cartões):** `id`, `channel_id`, `seq` (dado pelo DO), `subject_id?` (7 assuntos coloridos), `reply_to_id?`, `author_kind` (`'person' | 'persona' | 'system'`), `author_id`, `body_md`, `mentions[]`, `fanout_meta?`, `card_payload?`, `attachments[]` (ponteiro R2/Tailscale + chave do arquivo + `sha256`), `author_sig`, `created_at`.
10. **`presence` (Presença viva de Pessoas, Personas e Máquinas):**
    - **Pessoa:** `availability` (`'auto' | 'busy' | 'away' | 'out' | 'hidden'` — `hidden` aparece `offline` para os outros sem mexer em `last_seen`), `status_text` (≤ 100 chars), `status_until?`.
    - **Persona (100% derivada da máquina executora, nunca manual):** `'available'` | `'working'` (+ linha curta do passo atual se o canal for público) | `'waiting_human'` | `'out_of_quota'` (*"Volta às 18:00"*) | `'machine_offline'` (*"Estação/PC desligado"*). Expira na leitura se o batimento passar de `90s` — estado nunca fica "colado".
11. **`invite_link` e `join_request` (Convites blindados):**
    - **Link da equipe (`persona://entrar/<teamId>/<token>`):** nunca abre acesso direto; permite apenas enviar um `join_request` (`requester_name`, `note`, `sign_pub_key`, `box_pub_key`). Um dono/admin aprova escolhendo papel e canais e, no mesmo clique, o app dele cifra as chaves `AES` dos canais para a `box_pub_key` do colega recém-aprovado. Membros comuns podem **sugerir** um colega para aprovação de quem tem `invite_people`.

### 3.2 Entidade Estritamente Local — "De Quem é Cada Assinatura" (0 bytes na nuvem)

Gravada apenas no SQLite + Cofre **DPAPI** do computador que roda as CLIs (`my_pc` ou `dedicated_agent_pc`):

- **`local_subscription_account`:** `account_id`, `owner_person_id`, `engine` (`'claude' | 'codex' | 'cursor' | 'opencode' | 'dsh_api'`), `label` (`"Claude Max · Miguel"`), `isolated_config_dir` (`%USERPROFILE%\.persona\accounts\<id>`), `dpapi_secret_ref?`, `swap_policy` (`'ask' | 'next_account' | 'fixed'`), `window_used_pct` (pausa tarefas longas aos **95%** para guardar 5% para conversas curtas), `window_resets_at`.
- **`local_persona_binding`:** `persona_id`, `account_id`, `model`, `effort`, `local_draft_root`.

---

## 4. O Que Muda na UX

Preservamos intactos o calor visual do **Escritório acolhedor** (creme `#FAF3E4`, noite ameixa `#1E1526`, nanquim `1,5px`, animais ilustrados pelo Brush) e a disciplina de `GPU ≤ 2%` (`DESIGN-01`):

1. **Equipes estilo Discord (`Trilho 64px` + `Barra da Equipe 248px`):**
   - Com **1 única equipe local**, o trilho externo de `64px` fica oculto (experiência limpa para quem trabalha só). Ao criar a 2ª equipe ou aceitar o convite de um colega, surge à esquerda o trilho de ícones adesivos (`44×44px`: `[🏠 Pessoal]`, `[🥐 Padaria Lua]`, `[🚀 Agência Sol]`, `[+]`), trocando todo o universo de canais, quadros e memória em `160ms`.
2. **Canais por Equipe + Categorias + Indicador de Estação:**
   - Na barra de `248px`: busca `Ctrl K` e os 4 lugares fixos (`Visão geral · Quadros · Aprovações · Equipe & Memória`), seguidos por **Categorias recolhíveis** (`GERAL`, `POR SETOR` com `#marketing`, `#atendimento` e `#diretoria` nascendo do organograma sem nunca apagar histórico, `PRIVADOS`) e **Conversas Diretas** divididas entre **Pessoas reais** (foto circular) e **Personas** (animal sticker + selo discreto `de Miguel` / `⚡ Estação 24/7`).
   - No rodapé da barra, a pílula de conexão mostra com clareza onde os agentes da equipe estão rodando: `⚡ Estação Escritório · Online` ou `💻 Rodando neste PC` (e um ícone `⇄ Tailscale direto` quando dois PCs se enxergam na malha).
3. **`@menção` de Pessoa, Persona, Setor ou `@todos`:**
   - O autocomplete `@` separa **Personas deste canal**, **Pessoas reais** e **Setores/Papéis** (`@Marketing`, `@todos`), mostrando antes do envio a disponibilidade real (`Pronta na Estação`, `PC de Ana desligado`, ou `🔒 Só responde a Ana`).
4. **Quem responde quando há 2 pessoas (Miguel e Ana) e 5 personas no mesmo canal:**
   - **`@Ana` (menção só a humano):** **silêncio absoluto das 5 personas (`0 tokens`)**.
   - **Resposta direta (`Responder`) ou papo rápido humano↔humano:** em canais com 2+ pessoas, o composer permanece em `💬 Conversa entre pessoas` enquanto os humanos trocam mensagens entre si — nenhuma IA interrompe os sócios.
   - **`@Bia` ou escolha explícita em `"Quem responde"`:** aciona cirurgicamente a máquina onde a `Bia` mora (o PC do Miguel ou o Computador Dedicado dele). Se o pedido citar `@Bia e @Téo` (`texto → arte`), o plano encadeia o trabalho: a Estação do Miguel entrega o texto no canal e acorda automaticamente o PC da Ana para o `Téo` gerar a arte com o texto pronto!
   - **Pedido aberto à equipe (`Tab` / modo `🎯 Coordenação distribui`):** a pílula acima do composer anuncia explicitamente antes do `Enter` se a Coordenação vai triar aquela mensagem ou se é só conversa humana.
   - **`Toda a equipe` / `Quem tiver algo a dizer`:** cada máquina conectada responde apenas pelas suas personas locais (respeitando `≤ 2` chamadas paralelas por assinatura) e consolida tudo num único cartão recolhível **`Respostas da equipe`**.
5. **Aprovações — de quem é o botão:**
   - **Credencial, conector externo, navegador ou arquivo fora do rascunho numa máquina:** **exclusivo do dono daquela máquina/conta (`owner_person_id`)**, com gesto físico **"Segure 1,2s para aprovar"**. Os demais colegas veem *"⏳ Aguardando Miguel aprovar"*.
   - **Decisão de negócio, escolha de caminhos (`A/B/C`), revisão criativa de entrega ou memória da equipe:** **Responsável da persona, Líder do setor, Substituto (quando o dono marcou *"Fora"*) ou papel com `approve_business`**, selado com a assinatura `Ed25519` de quem aprovou (`✓ Aprovado por Ana`).
   - **Compartilhar cota da assinatura ou alterar instruções/ferramentas de uma persona:** **exclusivo do `owner_person_id`** (outros admins geram apenas *Proposta de ajuste* para o dono assinar).

---

## 5. Fatiamento em 4 Entregas que o Miguel SENTE na Mão

*(As Entregas 1, 2 e 3 inteiras rodam em `wrangler dev` / Miniflare local sem precisar esperar a liberação da conta Cloudflare!)*

### Entrega 1 (`4 a 5 dias`) · "Equipes e Canais Estilo Discord" *(100% local, só com personas)*
- **Escopo:** Trilho externo de Equipes (`team_space`) + Categorias de canais arrastáveis/recolhíveis + Reconciliador de canais automáticos por Setor (`#marketing`, `#atendimento`, `#diretoria` sobre `CV-6`) + `@menção` e pílula explícita de quem responde no composer (`CONVERSAS-SPEC`).
- **O que o Miguel sente:** já separa suas empresas/projetos como servidores do Discord, conversa por canal de equipe com os bichos certos na faixa e alterna tudo instantaneamente no seu PC.

### Entrega 2 (`5 a 6 dias`) · "O Convite do 1º Colega Ao Vivo" *(2 PCs no modo `(a) Próprio PC` + `persona-edge` em Miniflare local)*
- **Escopo:** Chaves `Ed25519`/`X25519` no Cofre DPAPI + `E2EE` (`AES-256-GCM`) por canal + 1 WebSocket multiplexado com Hibernation e presença viva no `WorkspaceHub` (sem D1!) + Fluxo *"Link pede entrada → Dono aprova e embrulha chave do canal"* + Roteamento multi-humano (silêncio em `@Pessoa`, execução apenas na máquina do `owner_person_id`, cadeia `Bia → Téo` entre 2 PCs e aprovações separadas por dono vs. negócio).
- **O que o Miguel sente:** pega um 2º notebook Windows apontando para o Worker de desenvolvimento, aceita o convite em 1 clique e vê **duas pessoas reais + cinco personas conversando e entregando tarefas juntas ao vivo**, cada uma na assinatura do seu dono.

### Entrega 3 (`5 a 6 dias`) · "Computador Dedicado 24/7 `(c)` + Via Expressa Tailscale `(b)`"
- **Escopo:** Modo **"Estação de Agentes Sempre Ligada"** no desktop/CLI com pareamento por código `XXXX-XXXX` (10 min), prevenção de suspensão, confinamento de subpastas por persona, admissão por RAM livre (reciclando CLIs quentes ociosas) e diário de tarefas longas + detecção automática de IPs Tailscale entre os PCs da equipe para transferência direta de arquivos grandes e visualização/controle ao vivo do Chrome da persona.
- **O que o Miguel sente:** deixa um mini-PC/notebook reserva ligado rodando suas personas na sua assinatura, fecha o próprio notebook, e a equipe inteira continua trabalhando com o `Atlas` e a `Bia` 24 horas por dia — com arquivos pesados voando direto via Tailscale.

### Entrega 4 (`2 a 3 dias`, no ato da liberação da conta Cloudflare) · "Produção Mundial + Governança Fina"
- **Escopo:** Deploy real do Worker + DO + bucket R2 cifrado (TTL 60d) na conta Cloudflare do Miguel + domínio curto de convite + Papéis aditivos completos, teto diário de turnos compartilhados por assinatura, modo *"Estou fora"* com Substituto e rotação automática de `key_epoch` ao remover membro.
- **O que o Miguel sente:** manda 1 link real no WhatsApp para qualquer pessoa fora da sua rede, em qualquer cidade, com segurança de ponta a ponta e custo de centavos.

---

## 6. Riscos Reais e Mitigações de Engenharia

| Risco concreto | O que aconteceria sem proteção | Como travamos no código (fora do prompt) |
|---|---|---|
| **1. Bloqueio antifraude da assinatura no Computador Dedicado** | 5 colegas mandam pedidos juntos e a Estação abre 8 processos `claude` simultâneos na conta do Miguel, acionando suspensão automática da Anthropic/OpenAI. | **Semáforo rígido de `≤ 2` chamadas concorrentes por assinatura** com espaçamento de `400–800ms`, pausa preventiva de tarefas longas aos **95%** da janela e `daily_shared_turn_cap` limitando quantos turnos colegas podem gastar por dia. |
| **2. Escalada de acesso de um colega para dentro do PC/Estação do dono** | Um admin malicioso ou distraído edita o prompt/ferramentas da `Bia` para ler arquivos pessoais do Computador Dedicado do Miguel e postar no canal. | **Ficha assinada (`owner_spec_sig` em `Ed25519`):** a Estação do Miguel verifica criptograficamente que o prompt, as ferramentas e a pasta raiz foram assinados pela chave privada do próprio Miguel + confinamento estrito na pasta `<handle>-<id8>` + `PermissionGate` em todos os motores. |
| **3. Perda da chave `E2EE` se o dono formatar o PC** | Como o Worker é cego, perder todos os PCs da equipe sem backup tornaria os envelopes retidos no DO indecifráveis. | Assim que o 2º membro (ou o Computador Dedicado do próprio dono!) entra na equipe, ele já possui cópia legítima das chaves dos canais autorizados; além disso, o Cofre oferece **Kit de Recuperação em Papel (12 palavras)** opcional na criação da equipe. |
| **4. Estouro de RAM no Computador Dedicado (8 GB / 16 GB)** | Várias sessões `--resume` quentes + Chrome comem toda a memória e travam o Windows da Estação de madrugada. | **Admissão por RAM livre (`piso de 1,5 GB livres`)**: antes de iniciar novo turno, encerra primeiro CLIs quentes ociosas mais antigas (`LRU`); se ainda faltar RAM, enfileira com aviso calmo sem derrubar processos em curso. |
| **5. Ex-membro tentando ler o canal após ser removido** | Pessoa desligada da empresa guarda o token antigo ou tenta reconectar no socket. | `revokeMember` fecha todos os WebSockets daquele `actorId` no DO no mesmo milissegundo (`1008 ACCESS_REVOKED`), recusa `append/after` e faz o próximo PC admin online girar `channel_key_epoch + 1` via `X25519` só para quem ficou. |

---

## 7. A Decisão que Só o Miguel Pode Tomar (em 3 linhas)

1. **Quando liberar a conta Cloudflare (`Workers Paid` de US$ 5/mês) e qual domínio usar nos convites** (ex.: `entrar.persona.app` ou rota sob o domínio oficial): só é necessário na virada da Entrega 4, pois as Entregas 1, 2 e 3 rodam inteiras em `wrangler dev` local a custo R$ 0.
2. **Política comercial dos anexos no R2:** confirmar o teto padrão saudável por equipe gratuita/base (sugestão: **arquivos de até 50 MB, 2 GB cifrados em trânsito por equipe e limpeza automática no R2 após 60 dias**, mantendo o custo marginal abaixo de US$ 0,10/empresa/mês enquanto os PCs guardam tudo para sempre no disco local).
3. **Sinal verde para iniciar a Entrega 1 hoje mesmo:** autorizar o time a começar já pelo trilho de Equipes e canais por Setor estilo Discord locais enquanto preparamos a suíte multi-PC em Miniflare na sequência imediata.
