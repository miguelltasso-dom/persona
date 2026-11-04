# Ponte de avisos e bandeja: renderer ↔ desktop (IV-2 / P0-16)

Rivet (desktop, preload, main) + Lumen (cliente). Base: `NOTIFICATIONS-SPEC.md` (Muse), `attention-events.md` (Anvil). 04/11.

## Por que nada dispara hoje
1. O cliente nunca assina `persona.attentionEvents` nem chama `personaAlwaysOn.attention`.
2. `bindTrayNeedsYou` (mount.ts) chama `personaAlwaysOn.needsYouCount`, que o preload NÃO expõe.
3. Ninguém chama `personaAlwaysOn.runningAssignments`, nem registra `onOpenTask`, `onCatchUp`, `onPauseTeam`.
4. O main hoje faz `trayNeedsYou += 1` por evento (nunca baixa). Passa a ser SET pelo número do cliente.

## Superfície `window.personaAlwaysOn` (preload, Rivet)
| Função | Quem chama | Efeito |
|---|---|---|
| `attention(payload)` | cliente | `AlwaysOnAttentionPayload` (campos abaixo) → `DesktopNotifications.ingest` |
| `attention({ kind: 'resolved', eventIds })` | cliente | cancela avisos pendentes desses ids (decidido/ack em qualquer cliente) |
| `needsYouCount(n)` | cliente | **NOVO.** SET do "Precisa de você · n" da bandeja. Inteiro ≥ 0. Nunca incrementa |
| `runningAssignments(n)` | cliente | bandeja "trabalhando" + `powerSaveBlocker` |
| `onOpenTask(fn(ticketId, view?))` | desktop → cliente | clique no aviso/bandeja. `view`: `'thread'` (padrão) · `'approvals'` · `'review'` |
| `onCatchUp(fn(limit))`, `onPauseTeam(fn)` | desktop → cliente | já existem |

`AlwaysOnAttentionPayload`: `id` (estável, é o dedupe), `kind` (`needs-you`·`review`·`question`·`failed`·`done`), `title`, `ticketId` (`[a-z0-9-]{1,64}`), `at` (ISO), opcionais `personaName`, `avatarId`, `question`, `code`, `threadId`, `streamId`. Campo desconhecido ou fora do formato: o desktop descarta o evento inteiro (validação no fio).
Deep link do clique: `persona://task/<ticketId>` (+ `?v=approvals|review|thread`, parser com lista fechada; qualquer outra query é recusada).

## Regras do cliente (Lumen)
- Assinar `persona.attentionEvents({workspaceId, projectId}, signal)` uma vez por tenant; reassinar ao trocar de tenant; abortar no unmount.
- `baseline`: **não** vira aviso (é o histórico da fila). Só alimenta `needsYouCount`. Evita aviso de coisa velha ao abrir minimizado.
- `upsert`: para cada evento, mapear e chamar `attention(...)`. `id`, `kind`, `ticketId`, `threadId`, `streamId`, `at`, `personaName`, `question`, `code` vêm do evento (contrato do Anvil). Evento sem `ticketId` válido: não avisa.
- `avatarId`: id do bicho da persona (o mesmo de `apps/desktop/resources/notify-avatars/{id}.png`, `[a-z0-9-]+`); sem persona/bicho: omitir (o desktop usa o ícone do app).
- `title`: `needs-you` = título da decisão; `done`/`review` = nome da tarefa; `failed` = nada (o desktop monta com `code` + locale); `question` = vai em `question`.
- `resolved`: `attention({ kind: 'resolved', eventIds })`. Também quando a pessoa decide no app (Aprovações/Revisar) antes do aviso sair.
- Nada de aviso para: persona→persona, progresso, rotina sem novidade, contratação sem `blocking`, o que a própria pessoa acabou de fazer (SPEC §1).
- Foco, silêncio, orçamento, resumo e idioma do aviso são do desktop. O cliente NÃO filtra por isso.
- `needsYouCount`: `bindTrayNeedsYou` já faz (SET, só ao mudar). Basta o preload expô-lo.
- `runningAssignments`: contar tarefas `working` (a mesma fonte do selo "trabalhando"); SET ao mudar.
- `onOpenTask(ticketId, view)`: navegar para o lugar exato (SPEC §3): `approvals` → Aprovações com `focus=<id>`; `review` → Revisar; `thread` → o fio da tarefa. Registrar no mount e devolver o `off`.
- Web / shell antigo (sem `personaAlwaysOn`): tudo vira no-op, como em `tray-needs-you-bridge.ts`.

## Rivet (depois do descongelamento do H)
1. `always-on-ipc.ts`: canal `needsYouCount` + validador; `kind:'resolved'` já existe.
2. `preload-app.ts`: expor `needsYouCount`; `onOpenTask` passa `view`.
3. `main.ts`: tratar `needsYouCount` (SET); remover o `trayNeedsYou += 1`; `openTask` com `view`.
4. `deep-link.ts` + `notifications.ts`: `?v=` com lista fechada; href por `kind` (SPEC §3).
5. Testes: unidade (ipc, deep link, tray SET/baixa, 0 aviso em foco, `failed` sem orçamento avisa, `done` sem orçamento → resumo, mesmo id 2× → 1, progresso → 0); captura do aviso no Windows (pt e en) com rosto; clique abre o fio certo.

## Aceite
`DesktopNotifications` conforme SPEC §Aceite 1–4; no app real: decisão `blocking` nova com a janela minimizada → 1 aviso "{persona} precisa de você" com o rosto, bandeja "Precisa de você · 1"; decidir no app → bandeja volta a 0 e o aviso pendente some.
