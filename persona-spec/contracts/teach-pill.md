# Ensinar — pílula de gravação e as 4 lacunas do desktop

Rivet, 04/11 19:40. Pedido do Quill (reports/quill.md, "Pendências", item 2). Código: `apps/desktop/src/{teach-pill,teach-chrome,teach-ipc,teach-sources,teach-image}.ts`.

## Estado das 4 lacunas

| # | Lacuna | Estado | Prova |
|---|---|---|---|
| (a) | `listSources` devolve miniatura 16:10 por fonte | **feito** (já no H2) | `teach-sources.spec.ts`: PNG 320×200 em `data:`; fonte sem prévia não leva campo |
| (b) | Minimizar a Persona e pílula (cronômetro, Pausar, Parar) numa janela sempre no topo, **fora da gravação** | **feito agora (H3)**; falta a prova no Electron real | `teach-pill.spec.ts`, `teach-chrome.spec.ts`, `teach-ipc.spec.ts`, `preload-app.spec.ts` |
| (c) | Miniatura da revisão sem protocolo novo | **feito** (já no H2): `stop` devolve `imageRef` = `data:image/png` de 320×200, nunca `file://` | `teach-ipc.spec.ts` ("lists sources, records a keyframe, and stops with host frames") |
| (d) | Aplicar o borrão nos PNG | **feito** (já no H2): `stop` aplica `blurTeachPixels` nos retângulos marcados ANTES de gravar o PNG e de gerar a miniatura | `teach-ipc.spec.ts` (arquivo gravado = "sanitized:1"), `teach-capture.spec.ts` (pixels) |

Então o botão "Borrar parte" pode voltar na revisão: os retângulos que `teach.blur(rect)` marca durante a gravação são aplicados de fato.

## (b) O que o desktop passa a fazer

1. **`teach.start(sourceId, mic, consent)`**
   - minimiza a janela da Persona, **a menos que** a fonte escolhida seja a própria janela da Persona;
   - desliga o `backgroundThrottling` do renderer enquanto grava (janela minimizada tem timer limitado a 1 tick por segundo, o que mataria a amostragem de 1,5 s);
   - abre a **pílula**: janela pequena (330×52), topo-centro do monitor principal, `alwaysOnTop` nível `screen-saver`, `focusable: false` (não rouba o foco do app que está sendo gravado) e **`setContentProtection(true)`**, que a tira dos pixels capturados (Windows 10 2004+). Dica ao passar o mouse: "Esta barra não aparece na gravação".
2. **`teach.pause()` / `teach.resume()`**: a pílula troca para "Pausado" / "Retomar" e congela o cronômetro.
3. **Parar na pílula:** a pílula **fecha na hora** e a Persona é restaurada e focada, ANTES de o renderer pedir o texto digitado (a gravação acabou para a pessoa). A sessão do gravador continua até o `teach.stop()` (depois da narração); pause/resume que o renderer chamar nesse intervalo não reabrem a pílula. Não precisa de RPC novo (`teach.finish`).
   **`teach.stop()`** (ou qualquer fim, inclusive erro ao gravar o artefato): fecha a pílula (se ainda aberta), religa o throttling e restaura/foca a Persona (só se foi o desktop que a minimizou; se a pessoa já a tinha minimizado, ela continua assim). Um novo `teach.start` depois de um Parar-da-pílula cuja gravação foi descartada sem `teach.stop` conta como gravação nova: minimiza e mostra a pílula de novo.
4. **Salvaguarda:** se ninguém encerrar a gravação em 11 min (o gravador para sozinho aos 10), a pílula é retirada e a Persona volta.

## O que o renderer (Quill/Prism) precisa fazer

```ts
const off = window.personaDesktop.teach.onPillAction((action) => { /* 'pause' | 'resume' | 'stop' */ })
```

- Assinar ao começar a gravar e chamar `off()` ao terminar.
- O botão da pílula é **o mesmo** que o botão do app: `pause` → pausa o gravador e chama `teach.pause()`; `resume` → idem com `teach.resume()`; `stop` → o mesmo caminho do "Parar" da tela (para o gravador, junta o texto digitado e chama `teach.stop(...)`, e abre a revisão). **Não** chamar `teach.stop()` direto sem passar pelo gravador.
- Ao receber `stop` a Persona já foi restaurada pelo desktop; a revisão abre numa janela visível.
- Não assumir que a janela está visível durante a gravação. Não depender de `document.visibilityState`.
- A pílula é texto simples e não conhece o idioma do renderer: usa o idioma do app do desktop (pt/en; os demais caem em inglês).

## Segurança

- A página da pílula é um documento estático (`data:`), com CSP `default-src 'none'` e um único script cujo hash está na política; sem preload, sem IPC, sem rede.
- Os botões são links para `https://teach-action.persona.invalid/{pause|resume|stop}` (domínio que nunca resolve). O `will-navigate` cancela qualquer navegação e só executa essas três URLs exatas; `window.open` é negado.
- Nunca leva pixels de quadro.

## Limitações conhecidas (o que só o Electron real confirma)

1. **Provado em Electron real (44.7.0, Windows 10.0.26200, 04/11 20:43)** com o smoke `.maestri/tmp/rivet-pill-smoke/` (`node .maestri/tmp/rivet-pill-smoke/run.mjs`; resultado em `result.json`), que carrega `teach-pill.ts`/`teach-chrome.ts` de verdade numa janela real:
   - **fora da gravação:** captura de tela real (`desktopCapturer`, 1920×1200): a cor da pílula ocupa **0 %** da área dela com `setContentProtection(true)` e **67,3 %** com `false` (controle);
   - **sempre no topo, sem foco:** `alwaysOnTop`, `focusable: false`, e a pílula não vira a janela focada;
   - **botões:** cliques de mouse na janela (`sendInputEvent`) em Pausar → Retomar → Parar disparam `pause`, `resume`, `stop`; após pausar, o texto vira "Pausado 00:04 Retomar Parar" com o relógio congelado; Parar fecha a pílula e restaura a Persona;
   - **Persona minimizada ao começar e restaurada ao acabar.**
   **Ainda não coberto:** clique de hardware (o `sendInputEvent` é sintético, entregue ao renderer, não ao SO) e o app Persona real no lugar do stand-in; isso o Probe vê no instalado do H3.
2. **Windows anterior ao 10 2004:** `setContentProtection` pinta um retângulo preto na captura em vez de omitir a janela.
3. **Teclado/leitor de tela:** a pílula não recebe foco (de propósito). Quem não usa o mouse para a pílula usa os controles da Persona (restaurar pela barra de tarefas). Atalho global de "Parar" fica como melhoria.
4. **Gravar a própria Persona:** a pílula também aparece (fora da gravação, pelo mesmo motivo) e a Persona não é minimizada.
5. Posição fixa (topo-centro do monitor principal); não arrastável nesta versão.
