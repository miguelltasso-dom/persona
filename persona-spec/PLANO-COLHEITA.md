# PLANO COLHEITA: as 20 ideias do agentes.chat, TODAS EM PARALELO (Atlas, 11/11 21:50)

Ordem do Miguel: "a equipe toda trabalhando nisso, da maneira mais RÁPIDA possível, não em semanas".
Fonte das ideias: `persona-spec/carbon/AGENTES-CHAT.md`. É a lista final do Carbon (20 itens), e cada item lá tem a ideia, a ADR e o esforço. Contexto extra em `persona-spec/research/agentes-chat/{MOTOR,PLATAFORMA,DESIGN-MUSE}.md`.

## REGRA DE SALA LIMPA (inegociável: o código deles é AGPL e a Persona é MIT)
- Pode ler o AGENTES-CHAT.md do Carbon, os 3 relatórios e as ADRs em `C:\Users\migue\dev\_avaliacao\agentes-chat\docs\adr\*.md`, só para entender a IDEIA.
- É PROIBIDO abrir `.ts`, `.tsx`, `.rs` ou `.css` de `_avaliacao`, colar qualquer trecho deles (código, texto de interface ou prompt) e usar os nomes internos deles (Jev, Lodi, talker, stretch, unbacked etc.) em código nosso. Os nomes são nossos e em português quando for texto de interface.
- O Gauge cria a checagem `scripts/persona/check-cleanroom.mjs`, que entra no pré-aceite do Ember. Item que falha na checagem não integra.

## REGRAS DE VELOCIDADE
- Cada dono começa AGORA. A primeira fatia verde (teste + captura, quando houver tela) sai em <= 24h, e o item completo em <= 48h. Os itens 2º de cada pessoa começam assim que o 1º for integrado.
- Faça a fatia mínima que o Miguel SENTE no app, integre e só depois refine. Sem pesquisa e sem relatório longo: o Status recebe uma linha por entrega.
- Fluxo de aceite: teste verde → pré-aceite do Ember (com sala limpa) → leitura visual do Carbon (`node .maestri/bin/carbon-review.mjs`, só para itens com tela) → Muse → o Keel integra no persona-dev.
- Bloqueado? Avise o Keel em 1 linha e já pegue o próximo item seu. Ninguém fica parado.
- O que estiver integrado entra num Setup interno toda noite (Rivet) e no vídeo das 18h (Ember).
- Rodada de IA real só com OK do Atlas e teto. DeepSeek (Cobalt, Zinc, Onyx, Jade) até US$ 5/dia por agente, só com código.
- Sem git commit/push: só o Keel publica. O Cobalt commita na própria worktree, como já faz. Nada de reset/clean.

## QUEM FAZ O QUÊ
| # | Item (numeração do Carbon) | Dono | Depois |
|---|---|---|---|
| 1 | Repasses rastreados que voltam sozinhos + fim da colisão divisão × pass_forward | **Forge** | apoia #3 |
| 2a | Processo CLI vivo por (persona, sessão) com --resume + morte garantida no Windows (stdin EOF + taskkill /T) | **Cobalt** | #20 (voz e sons, ligado à dieta) |
| 2b | Streaming real de deltas (50 ms) + steer limpo (mensagem no meio do trabalho, sem perder nada) | **Zinc** | #12 |
| 3 | Controlador determinístico de fim de turno: sem "Pronto!" falso, investigar antes de perguntar, perguntou = espera, até 3 continuações | **Bolt** | revisa #7 |
| 4 | Fala simples por padrão + detalhe técnico dobrável + direito ao silêncio | **Anvil** | #16 |
| 5 | "Segure para aprovar" com prazo + executa exatamente o aprovado, 1 vez + desfazer em 5 min no que é interno | **Prism** | #18 |
| 6 | Presença viva pelo trabalho + linha do passo atual + resumo recolhido ("N passos · tempo") | **Quill** | #14 (régua de controles + figurinha como reação) |
| 7 | Resposta de status pelo servidor (zero tokens) + cartão "Continuar" no lugar do teto de turnos | **Flint** | #13 |
| 8 | Tabela única de autoridade + porteiro determinístico de comandos/rascunho nos 4 CLIs | **Lumen** (+ Onyx em Codex/Cursor/OpenCode) | #15 |
| 9 | Prefixo e ferramentas estáveis no pool quente + artefato grande por referência + "fast" só ao vivo | **Tally** | apoia #10 |
| 10 | Pausa aos 95% da janela + fila única de retomada por conversa | **Jade** | #19b |
| 11 | Cartão de escolha de 1 clique no fim do turno + teto de 300 caracteres por pergunta | **Rivet** | #19a + Setup noturno |
| 12 | Trabalho longo vai sozinho para o fundo aos 4 min e a persona fica livre | **Zinc** (depois do 2b) | |
| 13 | Ligar a assinatura para o time inteiro + statusUnknown honesto + importação com prévia | **Flint** (depois do 7) | |
| 14 | Régua 32/40/48 + figurinha como reação sem abrir turno + testes de CSS/higiene + eval Padaria Lua --repeat 3 | **Quill** (UI) + **Gauge** (testes) + **Probe** (eval) | |
| 15 | Cofre v2 sobre DPAPI: ficha/CNPJ + digitação cega + cartão 2FA + importar CSV | **Lumen** (depois do 8) | |
| 16 | Memória que se prova: citação do dono + memória do time + jeito de trabalhar que vira habilidade + quem tem qual acesso | **Anvil** (depois do 4) | |
| 17 | Navegador no Chrome do Windows + perfis compartilhados com vez e "Assumir controle" | **Onyx** (depois de ajudar no 8) | |
| 18 | Conversa da tarefa como fio real dentro do Quadro | **Prism** (depois do 5) | |
| 19a | Painel "Minha Casa" com indicadores vivos por rotina muda (teste obrigatório antes de fixar) | **Rivet** (depois do 11) | |
| 19b | Gatilhos filtrados na origem + e-mail IMAP BR (Locaweb/Hostinger/Zoho), só leitura e envio com aprovação | **Jade** (depois do 10) | |
| 20 | Mensagem de voz + sons discretos SEM engordar o instalador (STT nativo do Windows ou baixado no 1º uso) | **Cobalt** (depois do 2a) | |

**Apoio fixo:**
- **Keel:** integra sem parar, resolve conflitos entre as frentes, publica, mantém este quadro no Status e me chama só com bloqueio ou pedido de OK.
- **Muse:** primeiro, em até 2h, a especificação de tela/movimento de 5, 6, 11, 13, 14, 18, 19a e 20 (curta: estados, medidas, movimento, texto PT-BR simples). Depois, o aceite final de cada item com tela.
- **Brush:** a arte de tudo que é novo, combinada com a Muse:
  - presença (estados das personas trabalhando, pensando, esperando você, fora até X h);
  - cartão de escolha;
  - "segure para aprovar";
  - figurinhas da capivara para reação (12);
  - vazios do Minha Casa, do Cofre e da conversa da tarefa;
  - ilustração "ligar a assinatura para o time";
  - ícones dos indicadores.
- **Ember:** pré-aceite (com sala limpa), vídeo das 18h e fila do Carbon.
- **Probe:** eval repetível da Padaria Lua (fake primeiro). A meta da IA real fica para quando 1+2+3+4 estiverem integrados: <= 6 turnos, < 120 mil tokens, texto + arte, sem "Pronto!" falso e sem pergunta boba. A rodada real só com OK do Atlas.
- **Gauge:** check-cleanroom.mjs (em 1h), testes de CSS/higiene e regressão de desempenho de cada integração.

## ITEM 21 (Miguel, 11/11 23:40): "Personas vivas"
- Referência: o comportamento do open-bot-avatar (MIT, clonado em C:\Users\migue\dev\_avaliacao\open-bot-avatar). Não usamos o visual: são silhuetas chapadas estilo "bot", que o Miguel recusou.
- Comportamento a reproduzir nos nossos bichos ilustrados (avatars/*.png, com o -blink já existente):
  - a cabeça inclina alguns graus para o mouse ou para a mensagem nova;
  - 3 humores ligados à presença do item 6: pensando enquanto trabalha, feliz ao entregar, esperando você;
  - respira quando está parada e pisca;
  - para quando sai da tela;
  - respeita o reduced-motion;
  - cabe nas 6 regras de GPU do DESIGN-01.
- Ordem: a Muse define o movimento, só com a capivara. O Brush faz capivara-pensando e capivara-feliz no nosso estilo. O Quill implementa depois do item 6. O Miguel aprova a capivara viva, e só então o Brush faz o resto do time.

## ITEM 22 (Miguel, 12/11 00:30): "Equipes e canais estilo Discord" (ainda local, só com personas)
- O usuário monta EQUIPES de personas (ex.: "Marketing", "Atendimento"). Cada equipe tem os seus canais, com categorias recolhíveis na barra lateral, e @equipe chama a equipe inteira.
- Quem responde dentro do canal: a regra de roteamento que já temos, restrita aos membros daquele canal.
- Ideias para LER (sala limpa): as ADRs 0080 (categorias de canal), 0083 (grupos de agentes) e 0148 (setores e a linha "Responde a") do agentes.chat.
- Esta é a base para o passo seguinte, PESSOAS REAIS no mesmo chat. A arquitetura desse passo está com o Carbon (persona-spec/carbon/COLABORACAO-PESSOAS.md); o modelo de dados do item 22 deve seguir o que ele recomendar.
- Dono: o Keel escolhe quem fechar primeiro o seu item atual. A Muse desenha a barra lateral e o canal.

## PESSOAS REAIS (Miguel 12/11 00:45: Cloudflare Workers). Desenho completo em persona-spec/carbon/COLABORACAO-PESSOAS.md
- ITEM 22 = Entrega 1: equipes e canais estilo Discord, local (4 a 5 dias). Já está no quadro.
- ITEM 23 = Entrega 2: o convite do 1º colega ao vivo. Chaves Ed25519/X25519 no Cofre, E2EE por canal, WebSocket com hibernação no persona-edge (Miniflare LOCAL), convite por link e roteamento multi-humano (5 a 6 dias).
- ITEM 24 = Entrega 3: o computador dedicado 24/7 (pareamento por código, sem suspensão, admissão por RAM) + Tailscale (5 a 6 dias).
- ITEM 25 = Entrega 4: deploy na conta Cloudflare do Miguel + domínio de convite (2 a 3 dias). BLOQUEADO até o Miguel liberar a conta. Nada de wrangler login ou deploy antes disso.
- As 4 leis do Carbon (§0) são inegociáveis: a persona só roda no PC e na assinatura do dono; o acesso da persona é sempre ⊆ ao do dono; a ficha da persona é assinada pelo dono; e é local-first.

## Decisões do Miguel (12/11 00:50)
- ANEXOS NA NUVEM: NÃO apagar automaticamente após 60 dias. Fica guardado enquanto a equipe existir, com uma cota por equipe e aviso perto da cota. O dono pode limpar quando quiser. (O custo do R2 é de centavos por GB; e manter o histórico ajuda quem entra depois na equipe.) Isso vale para os itens 23 e 25.
- UI E UX COM QUALIDADE TOTAL: toda tela passa pelo pré-aceite do Ember E pela Muse (sem exceção), e a cada snapshot a Muse faz uma "passada de leigo" nos fluxos inteiros. A auditoria do Carbon também caça falhas de uso.
- ITEM 26, "Conectores, plugins e skills de primeira" (MCP no nível do T3 Code, do agentes.chat e do Claude): a análise de lacunas está em andamento em persona-spec/research/PLUGINS-GAP.md, e daí saem as fatias do item.

## Decisão visual (Miguel 12/11 01:05): FONTE C + ROSTO R2 + BALÕES NOVOS
- Geist (OFL, variável, 57 KB) no texto e Fredoka só nos títulos grandes. O rosto ao lado da mensagem tem 40 px, enquadrado na cabeça; é ali que a persona viva do item 21 pisca e muda de humor. Os balões são os da prancha v5 da Muse (.maestri/tmp/shots/design/fontes-baloes/). O R3 (a cor da persona) fica guardado.
- Vira CSS e tokens REAIS no client-ui-persona, com o pré-aceite do Ember e o aceite da Muse. Adicionar a fonte em persona-assets/fonts com o OFL-geist.txt e registrar no NOTICE/licenças.
- CARBON NO VISUAL: só UMA leitura visual por Setup interno (o app inteiro, telas que mudaram, claro e escuro), além da auditoria de funcionamento de cada snapshot. Os créditos do Traycer são limitados: nada de lote por lote.

## ITEM 26: Conectores (MCP), plugins e skills de primeira. Análise e as 21 fatias: persona-spec/research/PLUGINS-GAP.md
Achado: as regras de permissão já são fortes. Falta a PORTA DE ENTRADA e o funcionamento fora do Claude:
- só aparecem os conectores da conta claude.ai, e só para o Claude;
- o Codex vaza todos os MCP da pessoa;
- Cursor e OpenCode ficam sem conector;
- as skills só entram quando são ensinadas no app.
Ordem:
- ONDA A, visível em cerca de 11 dias e sem depender do proxy:
  - 26.4: catálogo BR com os conectores da conta claude.ai;
  - 26.8: saúde e erros em português simples;
  - 26.10 + 26.13: importar skill por link ou zip, e $skill no composer;
  - 26.15 + 26.16: gatilho "Quando chegar e-mail…". JUNTAR com o 19b da Jade, que já faz os gatilhos filtrados e o IMAP: não duplicar.
- ONDA B, a fundação: 26.1 proxy MCP local + 26.2 OAuth com o token no Cofre DPAPI + 26.3 entrega por motor (fecha o vazamento do Codex e liga Cursor e OpenCode). Depois: 26.5 (1 clique), 26.6 (por URL ou comando), 26.7 (trazer os conectores locais), 26.9, 26.12 e 26.14.
- ONDA C: 26.17 (vendas e pagamentos), 26.18 (kits por negócio), 26.19, 26.20, 26.21 e 26.11.
As "uau" para o Miguel ver primeiro: o catálogo com 1 clique ("Conectar Mercado Pago" e a Nina responde as vendas), o gatilho "quando chegar e-mail ou pedido, a Nina cuida" e a skill por link com $ no composer.
Regras: NADA de Composio, porque o token sairia do PC. Antes de prometer um fornecedor BR (Mercado Pago, Nuvemshop, Bling, WhatsApp), confirmar que existe um MCP oficial.

## MARCO DOGFOOD (Miguel, 12/11 13:30): "a gente mesmo usando, 24 h, com acesso remoto"
Pedido do Miguel: fechar rápido para NÓS testarmos usando de verdade. Personas controlando os quadros (kanban) de vários projetos, cada projeto com um responsável, tocando tudo sozinhas, num computador que fica ligado 24 h, com acesso remoto. Os itens 21 a 26 passam a servir a este marco, nesta ordem.

O marco está pronto quando, no app instalado:
1. PROJETOS COM RESPONSÁVEL: cada projeto tem uma persona responsável (e opcionalmente uma pessoa), visível no cabeçalho do projeto, no quadro e na Casa (item 22). Trocar o responsável é 1 clique.
2. QUADRO QUE ANDA SOZINHO: a responsável puxa o próximo cartão, distribui para quem é da equipe, cobra quem parou, move o cartão (fila → fazendo → revisão → feito) e, ao fim do dia, posta um resumo no canal do projeto. Tudo que tem risco continua pedindo aprovação (o "segure para aprovar" do item 5). Teto de turnos e de cota por projeto, com pausa aos 95% (item 10).
3. VÁRIOS PROJETOS EM PARALELO: 2 ou mais projetos com quadros próprios andando ao mesmo tempo, sem uma responsável mexer no quadro da outra (a cerca de projeto do R2 vale).
4. COMPUTADOR 24 H (item 24): o PC dedicado não dorme, o app sobe sozinho com o Windows, volta sozinho de queda ou atualização, e admite turnos conforme a RAM.
5. ACESSO REMOTO SEM CLOUDFLARE: pelo Tailscale, o Miguel abre o Persona do PC dedicado no notebook e no celular (cliente web do host, só na rede Tailscale, pareamento por código, nunca exposto à internet aberta). O relay Cloudflare (item 25) continua para convidar colegas, não para isto.
6. "QUEM ESTÁ CUIDANDO DE QUÊ": uma visão que responde em 1 olhar, por projeto, quem é a responsável, o que cada persona está fazendo agora (item 6) e o que espera o Miguel.

Ordem de ataque: 24 (estação 24 h + Tailscale + cliente remoto) e o quadro autônomo começam JÁ, em paralelo com a auditoria final (a auditoria olha uma faixa fixa, o trabalho novo não atrapalha). Depois 22 (projetos e equipes na Casa), 21 (rostos vivos), 23, 26. Só os donos de um eventual P0/P1 do Carbon param para corrigir.
Teste de aceite: o próprio Miguel, com 2 projetos reais, deixando rodar uma noite inteira no PC dedicado, e conferindo pelo celular de manhã.

### Ajuste do Miguel ao critério 5 (12/11 14:30): o celular e o web são o MESMO app, estilo Discord
O app no celular e no navegador não é um painel reduzido de 3 telas: é a mesma Casa do desktop (item 22), adaptada ao celular como o app do Discord. Ele tem os canais, as conversas e as pessoas na lateral (gaveta no celular), e o fio de mensagens com o compositor.
- Dá para mandar mensagem para PESSOAS (entre os humanos da equipe) e para AGENTES (personas), nos canais e nas conversas diretas.
- Só aparecem e respondem as personas que estão ATIVAS, ou seja, cujo computador está ligado e rodando. Persona sem computador ligado não aparece como disponível (no máximo numa seção recolhida "Fora do ar", sem compositor).
- Continuam valendo: senha e Cofre só pelo PC; o "segure para aprovar" funciona no toque; "Esta noite" e "Espera você" viram atalhos no topo da Casa no celular, e não um app separado.
- Pessoas no mesmo Tailscale já conversam por este caminho. Convidar alguém de fora da rede continua sendo o item 23/25 (relay Cloudflare).
- Reforço do time (Miguel, 14:30): Onyx e Cobalt deixam de ser DeepSeek e passam a ser Sonnet 5.5 xhigh, agora. Onyx = M4 (computador 24 h) com o Rivet. Cobalt = M5 (cliente web/celular estilo Discord) com o Bolt (host, pareamento) e o Prism (UI compartilhada da Casa). Zinc e Jade (DeepSeek) seguem pausados.
