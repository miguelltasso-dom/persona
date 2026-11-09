# Dieta de tamanho da Persona (Cobalt, 07/11/2026)

Pedido do Atlas (v1.1.1 “LEVE E RÁPIDA”): auditar `dsh/node_modules` (524 MB, 26 mil arquivos), `app.asar.unpacked` e `primary-runtime` — o que a
Persona **realmente carrega** em tempo de execução e o que pode sair, com o ganho em MB; locales só pt-BR/en; meta do instalador ≤ 250 MiB
(melhor < 150).

Medido no app instalado (`%LOCALAPPDATA%\Programs\Persona`, artefato de 04/11; os tamanhos são os do disco, não do instalador comprimido):

| Bloco | Tamanho | Conteúdo |
| --- | ---: | --- |
| Electron (`Persona.exe` + dlls + paks + `locales/`) | ~350 MB | Chromium; `locales/` sozinho = **49 MB** |
| `resources/app.asar` | 291 MB (27.472 arquivos) | JS do main/host/clientes + metadados dos nativos |
| `resources/app.asar.unpacked` | 255 MB | nativos desempacotados |
| `resources/runtime/primary-runtime` | 255 MB | Python 3.12 + pacotes (145 MB), Node 24 (90 MB), pnpm 11 (21 MB) |
| **Total instalado** | **~1,2 GB** | instalador NSIS: **328 MiB** (compressão ~0,27) |

## 1. Os pesos, um por um (com quem usa)

| Pacote / bloco | Tamanho | Quem importa (repo) | Carrega no boot? | Veredito |
| --- | ---: | --- | --- | --- |
| `@deepseek-ai/libreoffice-kit-win32-x64` | **183 MB** (unpacked) | `document/office-to-pdf`, `skill/skill-office`, `bundle/web-app` | **não** (só ao converter/pré-visualizar um documento Office) | **Sai do instalador base** → download sob demanda na 1ª pré-visualização/uso da skill Office |
| `primary-runtime/dependencies/python` (3.12 + numpy/pandas/docx/pptx/openpyxl/Pillow/lxml) | **145 MB** | skills de escritório (Python) | não (só quando a skill roda) | **Sob demanda** (mesma política do LibreOffice) |
| `locales/` (Chromium) | **49 MB** | Electron | sim, mas só pt-BR/en são usados | **Só `pt-BR.pak` + `en-US.pak`** (~2 MB) |
| `sherpa-onnx-win-x64` | **23 MB** | `experimental/speech-to-text-sensevoice` | não | **Fora do bundle de produção** (experimental) |
| `@deepseek-ai/dsh-experimental-inspector` (inclui o worker do lighthouse, 8,9 MB) | **22 MB** | `experimental/inspector*`, `apps/cli` | não (ferramenta de dev) | **Fora do bundle de produção** |
| `@earendil-works/pi-coding-agent` | **22 MB** | `experimental/subagent-oar` **e `@botiverse/oar`** (o runtime dos runners que o produto carrega) | sim (via OAR) | **MANTER** — o rastreio por import pegaria só o experimental, mas a dependência transitiva do OAR usa |
| `primary-runtime/dependencies/pnpm` | **21 MB** | instalação de plugins (`command-installation`) | não | **Sob demanda** (1º plugin) |
| `@cursor/sdk` + `@cursor/sdk-win32-x64` | **30 MB** (20 no asar + 11 unpacked) | `persona-runners` (runner Cursor) | não (só se a pessoa usa Cursor) | Manter; **opcional** se a meta < 150 MiB exigir |
| `@img/sharp-win32-x64` | **19 MB** | miniaturas/anexos | sim no host (imagens) | Manter |
| `dsh-client-ui-sidebar-documentpreview` | **14 MB** | painel de pré-visualização (cliente) | chunk lazy | Manter (garantir que é lazy) |
| `openai` + `@google/genai` | **13 MB** | provedores LLM (transitivo) | não | Conferir se algum runner do produto usa; se não, fora |
| `dsh-cua` (experimental computer-use) | **5 MB** | `experimental/cua*` | não | Fora do bundle de produção |
| `dsh-plugin-market` | **5 MB** | `boot/plugin-market`, `api/remotes` | não | Manter (feature do produto) |
| resto (node-pty, ripgrep, koffi, fontkit, brotli, …) | ~15 MB | terminal, busca, fontes | conforme uso | Manter |

## 2. Proposta (ordem de ganho)

1. **LibreOffice sob demanda (183 MB).** O binário só é necessário para converter/pré-visualizar Office. Duas opções: (a) componente opcional do
   NSIS (a pessoa marca “pré-visualizar documentos Office” na instalação); (b) download na 1ª pré-visualização, com progresso e aviso honesto
   (“preparando a pré-visualização”). A (b) é a que mais reduz o instalador base; a (a) é mais simples e offline-friendly. **Ganho: −183 MB
   instalado, ≈ −100 MiB no instalador.**
2. **Python sob demanda (145 MB).** Mesma política das skills de escritório. **−145 MB, ≈ −60 MiB.**
3. **Locales só pt-BR/en (49 → ~2 MB).** `electron-builder` já aceita `electronLanguages`; hoje vão todos. **−47 MB, ≈ −10 MiB.**
4. **Pacotes experimentais fora do bundle de produção (sherpa 23 + inspector 22 + cua 5 = 50 MB; `pi-coding-agent` FICA: o OAR depende dele).** Eles não são plugins do perfil
   `persona` (`packages/persona/persona-app/cordis.patch.yml` só adiciona `ui-sidebar-documentpreview`); entram porque o `bundle/web-app` os
   declara. Excluir do `dsh/node_modules` empacotado (o repo de dev continua com eles). **−50 MB, ≈ −20 MiB.**
5. **pnpm sob demanda (21 MB).** Só é usado para instalar plugins; baixar/instalar na 1ª vez. **−21 MB, ≈ −8 MiB.**
6. **Conferir `openai`/`@google/genai` (13 MB).** Se o produto só fala DeepSeek/Claude/Codex/OpenCode/Cursor via OAR, saem. **−13 MB.**
7. **Opcional para < 150 MiB: `@cursor/sdk` (30 MB).** Só quem usa Cursor precisa; componente opcional do instalador. **−30 MB, ≈ −15 MiB.**

## 3. Conta final (estimativa)

| Cenário | Instalado | Instalador (×0,27) |
| --- | ---: | ---: |
| Hoje | 1,2 GB | 328 MiB |
| Cortes 1–5 (LibreOffice, Python, locales, experimentais sem pi, pnpm) | ~700 MB | **~190 MiB** |
| + openai/genai (6) | ~687 MB | ~185 MiB |
| + Cursor opcional (7) | ~657 MB | **~177 MiB** |
| Meta do Atlas | — | **≤ 250 MiB ✅** (a < 150 MiB exige também cortar sharp/pty ou comprimir melhor) |

**A meta ≤ 250 MiB fecha com os cortes 1–5.** A < 150 MiB não fecha só com isso: precisaria de mais um passo (Cursor/sharp opcionais, ou
`asar` com compressão, ou mover o Node do `primary-runtime` para o Electron-as-Node que já existe no pacote — medir antes).

## 4. Riscos e cuidados

- **Offline:** download sob demanda quebra a 1ª pré-visualização sem rede. O aviso tem de ser honesto (“preciso baixar o conversor de
  documentos”) e o componente opcional do NSIS resolve para quem quer tudo offline.
- **Assinatura:** binário baixado depois precisa de verificação (sha256 publicado) — o updater já tem esse padrão.
- **Skills de escritório** (`skill/skill-office`) usam o Python; sem ele a skill falha com mensagem clara, nunca em silêncio.
- **`verify-persona-package.mjs`** exige o `electron.cordis.patch.yml` do `dsh-desktop-host` (o artefato velho de 04/11 não o tinha; o pack novo
  tem de passar nele).
- Os tamanhos acima são do disco; o instalador comprime ~3,7×. Medir o instalador de verdade depois de cada corte (o `perf-probe` e o tamanho do
  `Setup.exe`).
