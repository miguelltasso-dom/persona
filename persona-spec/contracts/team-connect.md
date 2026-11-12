# Contrato: Ligar a IA para a equipe toda + "não consegui conferir" (item 13, Tally, 11/11)

Host pronto e testado (sem IA real). A tela segue `design/COLHEITA-MUSE.md` §13; a arte é a da Brush (`ligar-ia-equipe`, 480×280).
Código: `persona-host/src/{team-connect,team-connect-host,check-unconfirmed}.ts`; ganchos em `index.ts`, `connection-probe.ts`, `types.ts`.

## Regras que a tela precisa respeitar
1. **"Sem IA" só quando CONFIRMADO.** O host já faz a conta: `getTeamAi().without` traz só quem teve o motor confirmado como "não instalado" ou "sem login". Quem está só "conferindo" ou "não consegui conferir" vem em `unsure` (um número) e **nunca** entra no banner.
2. **Vermelho só no logout confirmado.** "não consegui conferir" usa `--persona-ink-muted`.
3. **Sem dinheiro (D-092).** A conta mostra só `Claude · sobra bastante` / `Claude · quase no limite`; `desconhecida` mostra só o nome do motor (o fornecedor não publicou a janela: nunca se presume folga).

## Remote
| Método | Quem | Entrada | Saída |
|---|---|---|---|
| `getTeamAi` | quem lê o projeto | `{ workspaceId, projectId }` | `{ without: { personaId, name, title }[], unsure: number, choices: { id, provider, label, room, usedPercent? }[] }`. `choices` já vem ordenado pela folga da janela (mais folga primeiro, desconhecida por último); **a primeira é a padrão do modal**. Banner: `without.length >= 1`. Botão do modal: `Ligar para as ${without.length}` |
| `connectTeam` | dono do espaço | `{ workspaceId, projectId, accountId? }` | `{ ok: true, view } \| { ok: false, code: 'no_one' \| 'no_account' \| 'unknown_account' }`. Devolve na hora a 1ª visão (todas `esperando`); o resto roda no host, uma persona por vez |
| `getTeamConnect` | quem lê | `{ workspaceId, projectId }` | `{ state: 'idle'\|'running'\|'done'\|'partial', accountId?, provider?, rows: { personaId, name, status, reason? }[] }`. É a leitura do progresso (consulte a cada ~500 ms enquanto `running`) |
| `retryTeamPersona` | dono do espaço | `{ workspaceId, projectId, personaId }` | a visão depois de tentar só aquela persona de novo (só vale se a linha dela é `nao_conectou`) |
| `retryEngine` (já existia) | quem escreve | projeto | agora esquece as checagens estouradas e confere de novo: é o "Tentar de novo" da pílula `não consegui conferir` |

`rows[].status`: `esperando` (anel tracejado "Sem motor") → `conectando` → `conectada` (anel lavanda de `Disponível`, com check, preset `pose`) | `nao_conectou` (`Não conectou · Tentar de novo`, com `reason`: `sem_login` | `nao_conferido` | `falhou`).
`state`: `done` = "Pronto: a equipe toda tem IA."; `partial` = terminou e alguma não conectou (as outras seguem conectadas).

## Pílula do motor (cartões de conexão)
`listConnections` e `listConnectionAccounts` ganharam `unconfirmed?: true`. Três estados, separados:
| Situação | Campos | Pílula | Ação |
|---|---|---|---|
| Checando | `phase: 'checking'`, sem `unconfirmed` | `Claude · conferindo…` | — |
| A checagem passou do tempo 2 vezes seguidas | `phase: 'checking'` + `unconfirmed: true`, **sem `error`** | `Claude · não consegui conferir` | `Tentar de novo` (`retryEngine`) |
| Saiu de verdade | `phase: 'ready'`, `loggedIn: false`, `error.code: 'not_logged_in'` | `Claude · sem login` | `Entrar` |
`phase` continua `checking` no estado 2 de propósito: um cliente que não conhece `unconfirmed` mostra "conferindo…", nunca "sem login".

## O que NÃO está nesta fatia (limites honestos)
- "Acordar" = pôr a persona no motor escolhido (só se ela não estava nele; quem já estava mantém modelo e esforço), derrubar a sessão quente e conferir que o motor responde. **Não abre sessão de CLI nem chama modelo.** Se o Cobalt expuser o pré-aquecimento (item 2a), entra pela porta `wake`.
- Conta com casa própria: o veredito é o login daquela casa; qual conta cada turno usa continua sendo a política de troca de contas que já existia.
- Importar com prévia: o host já tem prévia + aplicar por item (`previewBringContext*`, `applyContextProposals`). Falta só a tela virar lista com caixa marcada e `Importar N` (§13.5); não precisa de método novo.
