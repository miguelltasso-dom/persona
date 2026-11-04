# Microcópia do Persona: tom, glossário e regras

Muse, 04/11. Este guia vale para pt-BR e en. Quem escreve texto de interface (dicionários em `client-ui-persona/locale-sources/*.json`, toasts e erros) consulta este arquivo antes.

## Tom

- **Acolhedor e curto**, como uma colega de equipe que resolve. A equipe fala em primeira pessoa: "Não consegui falar com a equipe agora", e não "Ocorreu um erro".
- **Diga o resultado, não o mecanismo.** A pessoa contrata personas e pede tarefas. Ela não "configura runners" nem "autentica CLIs".
- **Gênero neutro** quando não sabemos quem lê: "Boas-vindas", e não "Bem-vindo". Estados das personas usam verbo ou locução neutra: "Precisa de ajuda", e não "Travado".
- **Sem culpa, sem pressa falsa.** Um erro diz o que houve e o que fazer: "Não consegui anexar este arquivo. Tente um arquivo menor ou de outro tipo."
- **Botão = resultado:** "Montar equipe", "Começar com esta equipe", "Conectar uma IA". Nada de "OK", "Enviar" solto ou "Clique aqui".

## Glossário (use sempre o mesmo termo)

| Diga | Nunca diga para quem usa | en |
|---|---|---|
| equipe / toda a equipe | workspace, tenant | team / everyone on the team |
| motor ("Trocar motor"), a IA que faz o trabalho | runner, harness, engine id, `dsh · default` | engine, the AI that does the work |
| ferramentas de IA neste computador | CLIs, harnesses detectados | AI tools on this computer |
| app Persona (aberto neste computador) | host, gateway, backend | the Persona app |
| montar a equipe | onboarding | build the team |
| modelo pronto (de equipe) | template | ready-made team |
| pasta das suas notas | vault (exceto o nome "Obsidian") | notes folder |
| Cofre | vault, knowledge base | Vault |
| consumo | tokens e cache (como título) | usage |
| reaproveitado de conversas anteriores | cache hit | reused from earlier turns |
| fora do ar | offline (como estado de persona) | away |
| precisa de ajuda | erro, travado (como estado) | needs help |
| mudança (no Revisar) | patch, diff, bytes | change |
| perguntar como está | pedir status | ask for an update |
| O que mudar | feedback | What to change |
| DeepSeek, Claude, Codex… (nome do provedor) | Harness DeepSeek | (same) |
| conta principal | default | main account |

"Tokens" pode aparecer **só** em Uso e limites e em Regras (limites), onde a pessoa controla o gasto; ao lado vai sempre uma tradução prática ("≈ 40 tarefas médias").

## Padrões

- **Erro de tela:** `"Não consegui {verbo} agora"` + botão "Tentar de novo". O detalhe técnico, quando existe, fica pequeno e selecionável no `ErrorState`, e nunca é o único texto.
- **Vazio:** o que vai aparecer aqui + a próxima ação. Ex.: "Quando a equipe fizer a primeira tarefa, o consumo aparece aqui." + "Conectar uma IA".
- **Estado ausente do provedor:** uma linha só, sem barras vazias: "O Claude não informa limites desta conta."
- **Conteúdo de exemplo** (amostras, mocks e seeds visíveis) segue o mesmo padrão. Nada de texto de desenvolvimento ("patch de locale do shell", "proatividade nativa") em tela.

## Passada de 04/11 (o que mudou)

- **Onboarding:**
  - passo 3 "Harnesses detectados" → "Ferramentas de IA neste computador";
  - "CLIs já autenticadas" → "ferramentas de IA em que você já entrou";
  - "contexto obrigatório em todo turno" → "a equipe lê antes de cada tarefa";
  - "template" → "modelo pronto";
  - "vault" → "pasta das suas notas";
  - "Bem-vindo" → "Boas-vindas".
- **Shell:**
  - estado da equipe "Persona host online/indisponível" → "Equipe conectada / fora do ar…";
  - texto de desenvolvimento removido do "Enquanto você estava fora";
  - "Travado" e "Offline" → "Precisa de ajuda" e "Fora do ar".
- **Conexões, Contratar, Editor e Perfil:**
  - o campo "Harness" vira "Motor";
  - "Escolha qual harness ou CLI…" → "Escolha qual IA faz o trabalho desta persona";
  - "Todos do workspace" → "Toda a equipe";
  - "Harness DeepSeek" → "DeepSeek".
- **Uso:**
  - "cache hit" → "reaproveitado de conversas anteriores";
  - "Onboarding em andamento" → "Montando a equipe";
  - "Conectar harness" → "Conectar uma IA".
- **Chat:**
  - "Anexar opção" → "Mais opções";
  - "Obrigado" (reação) → "Valeu";
  - aviso de compactação sem jargão;
  - "Seu feedback" → "O que mudar".
- **Revisar:** "Patch truncado — … bytes" → "Mudança grande demais para mostrar inteira. Aqui vai o começo."
- Pendente fora do cliente: `persona-core/src/domain/account-policy.ts:177` ainda devolve "Harness DeepSeek" (Forge).
