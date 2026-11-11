# Dieta de tamanho da Persona (Cobalt, 07/11/2026; atualizada 09/11 com o artefato final v1.1)

Pedido do Atlas (v1.1.1 "LEVE E RÁPIDA"): auditar `dsh/node_modules` (473 MiB lógicos no asar final), `app.asar.unpacked` e `primary-runtime` — o que a
Persona **realmente carrega** em tempo de execução e o que pode sair, com o ganho em MB; locales só pt-BR/en; meta do instalador ≤ 250 MiB
(melhor < 150).

Medido no artefato final v1.1 (`win-unpacked` do pack `3660c033a5`, mesmos bits do Setup `941fd2a5`; os tamanhos são os do disco, não do instalador comprimido):

| Bloco | Tamanho | Conteúdo |
| --- | ---: | --- |
| Electron (`Persona.exe` + dlls + paks + `locales/`) | ~350 MB | Chromium; `locales/` sozinho = **48,3 MiB** (55 arquivos) |
| `resources/app.asar` | **237,1 MiB** (248.630.466 B, 20.944 arquivos) | JS do main/host/clientes + metadados dos nativos |
| `resources/app.asar.unpacked` | **254,1 MiB** (266.478.144 B) | nativos desempacotados |
| `resources/runtime/primary-runtime` | **254,4 MiB** (266.791.925 B) | Python 3.12 + pacotes (144,5 MiB), Node 24 (89,4 MiB), pnpm 11 (20,5 MiB) |
| `resources/mingit` | **91,8 MiB** (96.237.338 B) | MinGit (ucrt64 67,8 MB + usr 27,6 MB) — **não estava no levantamento de 07/11** |
| **Total instalado** | **1,18 GiB** (1.264.151.371 B) | instalador NSIS: **329,6 MiB** (345.642.102 B; compressão ~0,27) |

## 1. Os pesos, um por um (com quem usa)

| Pacote / bloco | Tamanho | Quem importa (repo) | Carrega no boot? | Veredito |
| --- | ---: | --- | --- | --- |
| `@deepseek-ai/libreoffice-kit-win32-x64` | **182,0 MiB** (unpacked) | `document/office-to-pdf`, `skill/skill-office`, `bundle/web-app` | **não** (só ao converter/pré-visualizar um documento Office) | **Sai do instalador base** → download sob demanda na 1ª pré-visualização/uso da skill Office |
| `primary-runtime/dependencies/python` (3.12 + numpy/pandas/docx/pptx/openpyxl/Pillow/lxml) | **144,5 MiB** | skills de escritório (Python) | não (só quando a skill roda) | **Sob demanda** (mesma política do LibreOffice) |
| `locales/` (Chromium) | **48,3 MiB** | Electron | sim, mas só pt-BR/en são usados | **Só `pt-BR.pak` + `en-US.pak`** (~2 MB) |
| `sherpa-onnx-win-x64` | **22,4 MiB** | `experimental/speech-to-text-sensevoice` | não | **Fora do bundle de produção** (experimental) |
| `@deepseek-ai/dsh-experimental-inspector` (inclui o worker do lighthouse) | **22,4 MiB** | `experimental/inspector*`, `apps/cli` | não (ferramenta de dev) | **Fora do bundle de produção** |
| `@earendil-works/pi-coding-agent` | **20,3 MiB** | `experimental/subagent-oar` **e `@botiverse/oar`** (o runtime dos runners que o produto carrega) | sim (via OAR) | **MANTER** — o rastreio por import pegaria só o experimental, mas a dependência transitiva do OAR usa |
| `primary-runtime/dependencies/pnpm` | **20,5 MiB** | instalação de plugins (`command-installation`) | não | **Sob demanda** (1º plugin) |
| `@cursor/sdk` + `@cursor/sdk-win32-x64` | **29,9 MiB** (19,6 no asar + 10,3 unpacked) | `persona-runners` (runner Cursor) | não (só se a pessoa usa Cursor) | Manter; **opcional** se a meta < 150 MiB exigir |
| `@img/sharp-win32-x64` | **18,9 MiB** | miniaturas/anexos | sim no host (imagens) | Manter |
| `@deepseek-ai/dsh-client-ui-persona` | **15,9 MiB** | UI do produto (cliente) | chunk do shell | **MANTER** (não é corte) |
| `dsh-client-ui-sidebar-documentpreview` | **14,1 MiB** | painel de pré-visualização (cliente) | chunk lazy | Manter (garantir que é lazy) |
| `openai` + `@google/genai` | **13,2 MiB** (7,5 + 5,7) | provedores LLM (transitivo) | não | Conferir se algum runner do produto usa; se não, fora |
| `resources/mingit` (MinGit) | **91,8 MiB** | features de Git (Projetos/histórico privado) | não | **Novo no levantamento**: manter ou **sob demanda** (detectar o Git do sistema; senão baixar com progresso/assinatura) |
| `dsh-cua` (experimental computer-use) | **0,3 MiB** | `experimental/cua*` | não | Já não pesa; manter |
| `dsh-plugin-market` | **0,3 MiB** | `boot/plugin-market`, `api/remotes` | não | Já não pesa; manter |
| resto (node-pty, ripgrep, koffi, fontkit, brotli, …) | ~80 MiB | terminal, busca, fontes | conforme uso | Manter |

## 2. Proposta (ordem de ganho)

1. **LibreOffice sob demanda (182,0 MiB).** O binário só é necessário para converter/pré-visualizar Office. Duas opções: (a) componente opcional do
   NSIS (a pessoa marca “pré-visualizar documentos Office” na instalação); (b) download na 1ª pré-visualização, com progresso e aviso honesto
   (“preparando a pré-visualização”). A (b) é a que mais reduz o instalador base; a (a) é mais simples e offline-friendly. **Ganho: −182 MiB
   instalado, ≈ −49 MiB no instalador.**
2. **Python sob demanda (144,5 MiB).** Mesma política das skills de escritório. **−144,5 MiB, ≈ −39 MiB.**
3. **Locales só pt-BR/en (48,3 → ~2 MiB).** `electron-builder` já aceita `electronLanguages`; hoje vão todos. **−46,3 MiB, ≈ −12,5 MiB.**
4. **Pacotes experimentais fora do bundle de produção (sherpa 22,4 + inspector 22,4 = 44,8 MiB; `pi-coding-agent` FICA: o OAR depende dele).**
   Eles não são plugins do perfil `persona` (`packages/persona/persona-app/cordis.patch.yml` só adiciona `ui-sidebar-documentpreview`); entram porque
   o `bundle/web-app` os declara. Excluir do `dsh/node_modules` empacotado (o repo de dev continua com eles). **−44,8 MiB, ≈ −12 MiB.**
5. **pnpm sob demanda (20,5 MiB).** Só é usado para instalar plugins; baixar/instalar na 1ª vez. **−20,5 MiB, ≈ −5,5 MiB.**
6. **MinGit sob demanda (91,8 MiB).** Detectar o Git do sistema (o `persona-mingit.mjs` já baixa o MinGit com `AbortSignal.timeout(180_000)`); se não
   houver, baixar na 1ª operação de Git com progresso/assinatura. **−91,8 MiB, ≈ −25 MiB.** (Novo; não estava no levantamento de 07/11.)
7. **Conferir `openai`/`@google/genai` (13,2 MiB).** Se o produto só fala DeepSeek/Claude/Codex/OpenCode/Cursor via OAR, saem. **−13,2 MiB, ≈ −3,6 MiB.**
8. **Opcional para < 150 MiB: `@cursor/sdk` (29,9 MiB).** Só quem usa Cursor precisa; componente opcional do instalador. **−29,9 MiB, ≈ −8 MiB.**
9. **Se ainda faltar para < 150 MiB:** o Node do `primary-runtime` (89,4 MiB) ou o `sharp` (18,9 MiB) sob demanda/opcional; ou `asar` com compressão.
   Medir antes (o host já roda no Electron-as-Node; o Node do runtime é para as skills/Python/pnpm).

## 3. Conta final (estimativa, compressão 0,27)

| Cenário | Instalado | Instalador |
| --- | ---: | ---: |
| Hoje (v1.1 final) | 1,18 GiB | **329,6 MiB** |
| Cortes 1–5 (LibreOffice, Python, locales, experimentais, pnpm) | ~824 MB | **~211 MiB** |
| + MinGit sob demanda (6) | ~732 MB | **~186 MiB** |
| + openai/genai (7) | ~719 MB | ~182 MiB |
| + Cursor opcional (8) | ~689 MB | **~174 MiB** |
| Meta do Atlas | — | **≤ 250 MiB ✅** |
| < 150 MiB | — | ainda não; ver item 9 (Node/sharp/pty ou compressão) |

**A meta ≤ 250 MiB fecha com os cortes 1–5; com MinGit, 6, o instalador cai para ~186 MiB.** A < 150 MiB não fecha só com isso: precisa do item 9
(Node do runtime/sharp opcionais, ou compressão melhor).

## 4. Riscos e cuidados

- **Offline:** download sob demanda quebra a 1ª pré-visualização sem rede. O aviso tem de ser honesto (“preciso baixar o conversor de
  documentos”) e o componente opcional do NSIS resolve para quem quer tudo offline.
- **Assinatura:** binário baixado depois precisa de verificação (sha256 publicado) — o updater já tem esse padrão.
- **Skills de escritório** (`skill/skill-office`) usam o Python; sem ele a skill falha com mensagem clara, nunca em silêncio.
- **MinGit:** as features de Git (Projetos/histórico privado) precisam de um Git; sem o do sistema, o download sob demanda tem de ser explícito e
  verificado. O `scripts/persona/persona-mingit.mjs` já baixa com timeout de 180 s.
- **`verify-persona-package.mjs`** exige o `electron.cordis.patch.yml` do `dsh-desktop-host` (o artefato velho de 04/11 não o tinha; o pack novo
  tem de passar nele).
- Os tamanhos acima são do disco; o instalador comprime ~3,7×. Medir o instalador de verdade depois de cada corte (o `perf-probe-visible` e o
  tamanho do `Setup.exe`).
