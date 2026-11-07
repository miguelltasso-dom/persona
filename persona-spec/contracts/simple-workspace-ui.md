# Contrato UI ↔ host: Revisar mudanças, Aplicar, Desfazer e Histórico (SW-8)

Lumen, 04/11. Fontes: `SIMPLE-WORKSPACE.md` (D-064), `design/SIMPLE-WORKSPACE-SPEC.md` (Muse, SW-7). Este documento é o que a UI **já consome ou está pronta para consumir**; tudo é opcional e degrada sem quebrar. O host ainda não precisa mandar nada para a tela nova funcionar: ela lê o patch do host de hoje (`reviewSummary.patch`) e o transforma em arquivos simples.

## 1. Regra de vocabulário (vale também para mensagens de erro do host)

A UI nunca mostra git, worktree, branch, diff, merge, commit, push, "linhas". Texto livre vindo do host (`explanation`, `detail`, mensagem de exceção) **aparece só dobrado** em "Detalhes para o suporte". A frase que a pessoa lê é da UI.

## 2. `reviewSummary` (já existe) — campos novos opcionais

`ReviewSummaryView.files[]` hoje: `{ path, added, deleted }`. A UI usa só `path` (nome e pasta curta) e lê o tipo de mudança do patch. Quando o host tiver o rascunho (SW-1), pode mandar **por arquivo**:

| Campo | Tipo | Efeito na tela |
|---|---|---|
| `kind` | `'new' \| 'changed' \| 'deleted'` | chip Novo / Mudou / Apagado (hoje inferido do patch) |
| `before`, `after` | `string` (texto inteiro, até ~1 MB) | duas colunas Antes/Depois por linhas alinhadas (a UI calcula; sem `@@`) |
| `cells` | `{ sheet, cell, before, after }[]` | planilha: "Preços › C4: R$ 12 → R$ 14" |
| `beforeImage`, `afterImage` | URL que o webview abre (`persona-draft://…` ou `data:`) | imagem lado a lado + "Antes · Depois" |
| `conflict` | `boolean` | o arquivo mudou na pasta durante a Tarefa: a UI pede a escolha (§4) |
| `truncated` | `boolean` | "Mudança grande demais… Aqui vai o começo." |
| `canOpenDraft` | `boolean` | PDF/outros: botão "Abrir o arquivo do rascunho" |

Caminhos sempre **relativos ao projeto**. Nunca caminho absoluto.

## 3. Aplicar

`acceptReview({ workspaceId, projectId, ticketId, mode, choices? })`

- `choices?: Record<arquivo, 'mine' | 'theirs' | 'both'>` — a escolha da pessoa para cada arquivo em conflito. **A UI só chama Aplicar depois de todas respondidas.**
- Resultado (`ReviewAcceptView`): `accepted` (ideal: com `restorePointId` para o Desfazer imediato) · `blocked` (conflito que a UI não resolveu; `explanation` só dobrada) · e os estados de §3.1.
- **Atômico:** falha no meio deixa a pasta como estava. A UI diz "Sua pasta não mudou" — o host precisa garantir isso.

### 3.1 Estados que a tela já sabe mostrar (`ApplyPhase`)

| Estado | O host devolve / emite | A tela diz |
|---|---|---|
| aplicando | (chamada em curso) | botão "Aplicando…" |
| arquivo aberto (Excel/Word) | erro tipado `file_locked` + `file` | "Feche {arquivo} para eu aplicar as mudanças." + Tentar de novo |
| OneDrive só online | progresso `downloading` + `file` + `percent?` | "Baixando {arquivo} do OneDrive…" (segue sozinha) |
| falhou | qualquer outro erro + `detail` | "Não consegui aplicar agora. Sua pasta não mudou." + detalhe dobrado |
| pronto | `accepted` | carimbo/toast "Aplicado na pasta" + Desfazer (só se houver `restorePointId`) |

## 4. Conflito por arquivo

Para cada `files[i].conflict === true` a tela mostra "Você e {Persona} mudaram {arquivo}" com três cartões:

- `mine` — Ficar com o meu: mantém o arquivo da pasta, descarta a mudança da persona **neste arquivo**.
- `theirs` — Ficar com o da persona: usa o rascunho; **a versão da pessoa fica no Histórico por 30 dias**.
- `both` — Manter os dois (recomendado): grava a versão do rascunho como `"{arquivo} (rascunho).{ext}"` ao lado (`"(rascunho 2)"`, `"(rascunho 3)"`… quando já existe). **SEMPRE `(rascunho)`**, com ou sem nome de persona: o motor não sabe o nome e a tela promete exatamente isto (Muse/Lumen, 05/11; antes `(de {Persona})` no contrato e `(da persona)` no motor).

**Nunca** marcadores `<<<<` em arquivo da pessoa. O nome da cópia é calculado pela UI (`conflictCopyName`) só para mostrar; o host é quem grava e deve usar a mesma regra.

## 5. Histórico e Desfazer (host SW-6, `contracts/simple-workspace.md`: já consumido)

A UI usa os Remotes e tipos que o host publicou (`data/history-remote.ts`):

```ts
listRestorePoints({ workspaceId, projectId }): RestorePointListView
// { status: 'available' | 'unsupported' | 'unconfigured', points: RestorePointView[] }
// RestorePointView: { id, ticketId, createdAt, expiresAt, state: 'available' | 'undone' | 'expired', files: string[] }
undoApply({ workspaceId, projectId, restorePointId }): UndoApplyView
// { kind: 'restored' | 'expired' | 'blocked' (+ explanation em português seguro) }
```

- `status` diferente de `available` (pasta que já usa git, ou histórico não configurado): a tela diz "O histórico fica disponível quando a pasta do projeto tem a Persona ativa", nunca "Nada aplicado ainda".
- O ponto não traz quem aplicou: a UI mostra o **nome da Tarefa** pelo `ticketId` (cartões do quadro) e, como autor, a persona atribuída à Tarefa ("A persona" se não souber).
- `files` são caminhos relativos ao projeto; a UI mostra só o nome do arquivo.
- `state: 'expired'` some da lista; `'undone'` fica como "Desfeito", sem segundo Desfazer.
- `blocked`: a UI mostra a `explanation` do host como está (por isso ela precisa ser frase para a pessoa, sem jargão); `expired`: "Passou do prazo de 30 dias…".

### Pedido ao host para o toast "Aplicado na pasta · Desfazer"

`ReviewAcceptView` `accepted` deveria trazer `restorePointId` (o ponto criado por aquele Aplicar). A UI já lê `result.restorePointId` quando existir: com ele o toast mostra Desfazer (chama `undoApply`); sem ele, mostra só "Aplicado na pasta" (nunca um Desfazer falso).

## 6. Abrir o arquivo do rascunho (PDF e outros)

`openDraftFile({ workspaceId, projectId, ticketId, path })` — abre a cópia do rascunho pelo sistema, **somente leitura**. A tela só mostra o botão com `canOpenDraft`.

## 7. Aceite (SW-8)

jsdom: `tests/draft-review-panel.client.spec.tsx`, `tests/project-history.client.spec.tsx`, `tests/review-simple-core.client.spec.ts`, `tests/kanban-review-sheet.client.spec.tsx` — incluem a **varredura de jargão** (a lista "nunca diga" da spec, pt e en, no texto de `review`, `kanban`, no Histórico e em todos os estados renderizados). Galeria e captura claro/escuro com axe: depois que o host (SW-6) responder `listRestorePoints`.
