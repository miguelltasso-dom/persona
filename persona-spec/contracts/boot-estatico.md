# boot-estatico — shell estático + transporte tardio (lado host/transporte)

Status: PROPOSTA do Forge (12/11 10:50) para a alavanca 1 de `research/perf/ABERTURA.md` e o P0.5 de `research/perf/PLANO.md` (Atlas aprovou para o próximo instalador interno).
A decidir com o Rivet (pack/main/preload) e o Prism (estado "acordando o time"). Nada em arquivo quente antes do corte das 11h.

## 1. Princípio
O renderer monta o shell SEM o host (índice estático + manifesto de módulos no asar, servido em `dsh-app://app/`). O host só é preciso para DADOS. A ligação com o host tem três estados:
`waking` (o host ainda não respondeu), `ready`, `failed`. SÓ `failed` mostra erro; `waking` é um estado calmo da tela, nunca um erro.

## 2. O que o renderer pode usar em `waking` (sem host)
Só o que é local: locale, tema, rota e shell, `dshDesktopBoot.*`, `personaBoot.*` (já existe: `subscribe`, `retry`, `diagnostic`), e o estado vazio de cada painel. NENHUM Remote.

## 3. Transporte tardio (`lateFetch`)
Pontos de encaixe que já existem: `ClientTransportHooks.fetch` (RpcFetch) e `openStream` em `packages/client/connection` (instalados antes do `bootClient`); `streamBaseUrl` chega depois, com o `ready`.
- **Sinal de ready: PUSH, por um canal NOVO.** (Rivet, com evidência: o `bootState` é canal só de FALHA, `boot.js:144-147` trata qualquer push dele como erro e abre a tela de erro.) Novo IPC `DESKTOP_IPC.bootPhase` + `personaBoot.onPhase(listener({ phase: 'waking' | 'ready', url? }))` no preload (o `boot.js` já usa `bridge.onPhase` se existir; passa a aceitar `'ready'`). `personaBoot.subscribe` continua SÓ-FALHA e é o nosso `failed` (`{ code, message }`, com `retry`/`diagnostic`). Plano B se nenhum evento em 1 s: consultar o estado a cada 250 → 500 → 1000 ms (teto).
- **Quem segura as chamadas (decisão, 12/11 11:05):** o MAIN. Hoje todo Remote (unário e stream) sai de um carrier só (`connection/src/client/index.ts:233`), o unário cai no `protocol.handle` do main (`main.ts` ~966-991) e o main já devolve 503 enquanto `hostUrl` é indefinido. Proposta do Rivet, aceita: em vez do 503, o `protocol.handle` SEGURA o pedido até o host ficar pronto (a promessa do startup, teto de 90 s) e só então encaminha; assim o unário e os 8 pacotes que chamam `fetch` direto (file-upload, ui-deliverables, ui-file-actions, ui-file-drag, ui-open-in-app, ui-sidebar-documentpreview…) viram "pendente" SEM mudar o cliente, e o mesmo pedido nunca é reenviado (nenhuma escrita duplicada). Não há timeout no carrier do cliente (conferido em `connection/src`), então a espera de até 90 s não quebra nada ali. O `lateFetch` NÃO é instalado no unário; fica para o que o main não segura: o STREAM (WebSocket, vai direto ao origin do host via `streamBaseUrl`), o estado `useHostLink` e a rede de segurança (503 `host-starting`/recusa de conexão, que passam a existir só depois do teto).
- **A 1ª carga do cliente começa no `ready`, não ao montar o shell.** O live store usa timers de fallback (`settleOptionalRemote`, `OPTIONAL_BOOT_REMOTE_MS`): iniciado em `waking`, o timer mediria a espera e gravaria o valor vazio. O store conectado só dispara as leituras da 1ª tela quando `useHostLink()` vira `ready`.
- **Fila.** Em `waking` toda chamada Remote fica pendente (uma promessa) e sai em ordem no `ready`, com concorrência 4 e fila máxima 50. Escrita (enviar mensagem, ação) também espera, não se perde e não se duplica (a mesma id de pedido; a UI já desabilita o composer em `waking`).
- **Erros transitórios nunca sobem em `waking`:** recusa de conexão, `fetch failed`, HTTP 503 `host-starting`. Depois do `ready`, mesmo assim: backoff 200 ms ×2 até 2 s, com jitter, por até 30 s (cookie/rede podem atrasar um pouco); só depois vira erro normal do Remote.
- **`failed` só por:** (a) o main avisar que o host saiu/`fatal` (`bootState`), ou (b) 90 s sem `ready`. Mostra o fluxo que já existe (`personaBoot.retry` / `diagnostic`), nunca janela vermelha no meio da UI.

## 4. O que o host faz para o `ready` ser rápido
- **O `ready` do filho hoje espera MUITO mais que isso** (Rivet, `apps/desktop-host/src/index.ts:134-147`): o perfil inteiro (construtor do `PersonaHost`, banco, migrações) → diagnósticos/controle de update/inspeção de saída → `await ctx.plugin(desktopOffice, …)` (o plugin do Office/primary-runtime, AINDA NÃO MEDIDO, no caminho do ready) → sessão da plataforma → `collectIndexInjections` → `process.send({ type: 'ready' })`. Com o índice estático, as injections saem do pack e deixam de ser coisa do ready; o `desktopOffice` é o 1º candidato a sair do caminho (carregar depois do `ready`; medir com o `measure-host-child.mjs`).
- `ready` (IPC filho → main) = o servidor escuta e os Remotes de LEITURA respondem. Nada de warmup, analytics, conta, curadoria ou `gh` antes dele (a dieta de `BOOT_BACKGROUND_DELAY_MS = 1500` já tira os warmups; o `teamChannels.reconcile` por projeto FICA onde está: o Flint mediu com 10 projetos × 8 personas e deu 10–14 ms no total, ~1–2 ms por projeto, ≈ 0,1 % dos 17 s; o construtor do host inteiro também só leva 121–172 ms, medido pelo Forge).
- **main (Rivet):** publicar o `ready` ao renderer logo depois de `host.start()` + `authenticateWebHost`, ANTES de `welcomeBackend.analyticsEnabled()`, `accountBackend.watch`, `removeLegacyHostCookies` e `track` (viram `void`; `analyticsEnabled` fica `false` até resolver).
- **Fase 2 (opcional, só se o main NÃO segurar):** o servidor escuta antes de o `PersonaHost` terminar e responde 503 + `Retry-After: 1` com o fault `host-starting` (novo `RemoteFaultCode`) às chamadas que chegarem no meio; o cliente trata como `waking`. Com o main segurando (§3), esta fase deixa de ser necessária.
- **Um Remote de leitura `getBootSnapshot`** (workspaces, projetos, personas, flags/superfícies, membro da sessão): a 1ª tela em UMA ida e volta no lugar da cascata de RPCs logo depois do `ready`.

## 5. PanelBoundary e Remote (cliente)
`useHostLink()` devolve `'waking' | 'ready' | 'failed'`. Os painéis conectados em `waking` mostram o estado calmo ("Acordando o time…", esqueleto), nunca o erro; o PanelBoundary só captura erro REAL, e um erro que chegue durante `waking` é reclassificado como espera. Textos (pt/en) ficam com o Muse/Quill.

## 6. Aceite (sem Electron, no que couber)
a) Shell visível < 2,5 s com o host atrasado de propósito 10 s (`PERSONA_TEST_HOST_DELAY_MS`), nenhum painel em erro.
b) Teste do `lateFetch` com relógio falso: a chamada feita em `waking` resolve com o dado certo depois do `ready`; ordem da fila; backoff; 90 s → `failed`.
c) Host que sai → `failed` pelo fluxo `personaBoot`; o `retry` funciona.
d) Analytics e conta DEPOIS do `ready` (marcas de tempo do `bootMarks`).
e) Nenhuma escrita duplicada ao reconectar.

## 7. Divisão proposta
Forge: este contrato; `late-transport.ts` puro (estado, fila, backoff, timeout) com os testes (b)/(e); o `host-starting` e o `getBootSnapshot` no host (fase 2, depois do corte).
Rivet: índice estático + injections geradas no pack (`bootInjections(graph)` do Zinc), `main.ts` (o `protocol.handle` segura os pedidos até o ready, ordem do `ready`, `void` do analytics/conta/`readWelcomeState`), `preload-app.ts` (`bootPhase` + `personaBoot.onPhase`), `boot.ts` (o gate não bloqueia o `ModuleLoader`), `boot-marks.ts` (marcas do main). Forge: o `late-transport.ts` cobre o STREAM, o estado e a rede de segurança; ligar ao `openStream` e ao `onPhase` só depois do corte.
Prism: o estado "acordando o time" e o `useHostLink`. Muse/Quill: o texto. Flint: `bootMarks` e a medição do `reconcile`.

## 8. Riscos e medidas já conhecidas
O renderer disputa CPU com o host (a janela antecipada custou +1,5 s de shell em 11/11): renderer em prioridade baixa e splash estático até o `ready`. O cliente estático é o item de 2–3 dias do Zinc. O custo do host deixa de estar no caminho da 1ª tela, mas continua no caminho de qualquer DADO.
