# Cromo do desktop — splash, barra de título, bandeja (Muse → Rivet, 03/11/2026)

Base: `DESIGN-SYSTEM.md`. Dono do código: **Rivet** (`apps/desktop`). Muse já fez a parte do cliente: o frame reserva a faixa da barra de título e a torna arrastável via `env(titlebar-area-height)` (`shell/PersonaAppFrame`), então nenhum cabeçalho fica sob os botões da janela.

## 1. Barra de título (Windows `titleBarOverlay`)

- `color` = papel do app, **não** cinza: claro `#FAF3E4`, escuro `#1E1526`. `symbolColor` = tinta: claro `#34243F`, escuro `#F6EEE0`.
- Atualizar ao trocar o tema (`nativeTheme.on('updated')` → `win.setTitleBarOverlay({ color, symbolColor })`).
- Altura = `WINDOWS_TITLEBAR_HEIGHT` (o cliente lê via `env(titlebar-area-height)`).
- macOS: `hiddenInset` com semáforos a `{ x: 18, y: 22 }` para alinharem com o selo do logo no rail (o rail já desce a mesma faixa).
- Fundo da janela antes do primeiro paint: papel do tema (evita flash branco/cinza).

## 2. Splash / carregamento (antes do cliente montar) e "Reconectando…"

Página local (sem rede), tokens da tabela já usada em `reconnecting-page.ts`.
- Layout: centro vertical; selo do símbolo (40px, rotação −4°, contorno ameixa + sombra press) + "Persona" em Fredoka 700 32px; abaixo, **a equipe andando em fila** sobre uma colina baixa (arte do Brush `splash-equipe(-dark).png` como fundo + `walk-{atlas,bento,nina,sol,luna}.png` animados com passo/balanço CSS 1.2s defasado; `prefers-reduced-motion` → parados); linha de status Nunito 600 15px ("Acordando a equipe…", "Reconectando…") com 3 patinhas pulsando (não spinner).
- Imagens embutidas como `data:` webp (≤ 250 KB no total) para funcionar sem o servidor do cliente.
- Erro de boot: mesma página, arte `empty-error`, texto humano + botão "Tentar de novo" (âmbar, contorno + sombra press) e link "Copiar diagnóstico".

## 3. Bandeja (tray)

Ícones do Brush `persona-assets/brand/tray/tray-{idle,working,needs-you,paused}` (16/24 SVG + PNG 32 + ICO):
| Estado | Quando | Ícone | Tooltip |
|---|---|---|---|
| `idle` | ninguém trabalhando, nada pendente | símbolo | "Persona — equipe descansando" |
| `working` | ≥1 persona trabalhando | símbolo + 3 pontinhos | "Persona — 2 trabalhando" |
| `needs-you` | ≥1 "Precisa de você" | símbolo + ponto âmbar | "Persona — 1 precisa de você" (tem prioridade sobre working) |
| `paused` | equipe pausada | símbolo + barrinhas | "Persona — equipe pausada" |

Menu (nesta ordem): linha de estado **desabilitada** ("2 trabalhando · 1 precisa de você"); "Abrir Persona"; "Ver o que precisa de você" (só em `needs-you`, abre a Visão geral); separador; **"Pausar equipe" / "Retomar equipe"** (rótulo alterna); "Abrir pasta de logs"; "Copiar diagnóstico"; separador; "Sair de vez".
Dados: os mesmos do rail "Sua equipe" (estado ao vivo por persona) — o host já tem `getOverviewNow`.

## 4. Aceite
Capturas do splash claro/escuro (página isolada no Playwright), da janela no Windows mostrando a barra no tom do papel, e da bandeja nos 4 estados (screenshot do menu). Reduced-motion verificado no splash.
