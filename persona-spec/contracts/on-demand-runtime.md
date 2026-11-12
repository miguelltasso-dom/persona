# Contrato — runtime sob demanda (LibreOffice e Python) — v1.1.1 “LEVE E RÁPIDA”

Cobalt, 07/11/2026. Decisão do Atlas (17:36): os dois maiores pesos do instalador saem do pacote base e passam a ser **baixados na primeira
necessidade**, com o desenho da Muse para a experiência. Este contrato fixa o comportamento que o host, o cliente e o empacotamento têm de
cumprir; a forma visual é da Muse.

## 1. O que sai do instalador base

| Componente | Tamanho instalado | Quando é preciso |
| --- | ---: | --- |
| `libreoffice` (`@deepseek-ai/libreoffice-kit-win32-x64`) | 183 MB | pré-visualizar/converter um documento Office (`.docx/.xlsx/.pptx`) |
| `python` (3.12 + numpy/pandas/docx/pptx/openpyxl/Pillow/lxml) | 145 MB | rodar uma skill de escritório (office skills) |

Nada disso entra no caminho de abertura: o app abre, o host sobe e o shell monta sem eles. O instalador base fica com ~700 MB instalados
(≈ 190 MiB comprimidos) em vez de 1,2 GB (328 MiB).

## 2. Quando baixa (nunca no boot)

- **LibreOffice:** na primeira pré-visualização de um documento Office (ou na primeira conversão que a peça).
- **Python:** no primeiro uso de uma skill de escritório.
- O download **nunca** começa no boot, no onboarding nem “para deixar pronto”. É sob demanda, com a pessoa esperando aquela ação.

## 3. Experiência (Muse)

- **Progresso honesto:** “Preparando a pré-visualização… 12 MB de 183 MB” com barra; o resto do app continua utilizável.
- **Offline:** “Para ver este documento, preciso baixar o conversor (183 MB). Você está sem internet — tente de novo quando conectar.” com
  **Tentar de novo**; a pré-visualização fica com o estado “precisa do conversor”, nunca em branco nem girando para sempre.
- **Falha:** motivo em palavras (“não deu para baixar”, “o arquivo veio corrompido”, “sem espaço em disco: preciso de 400 MB livres”), com a
  ação possível (tentar de novo, abrir Configurações › Componentes).
- **Nunca falha calada:** sem download, a feature diz o que falta e como resolver; nenhum erro técnico cru na tela.
- **Configurações › Componentes:** lista os dois, tamanho, estado (instalado/ausente), “Baixar agora” e “Remover”.

## 4. Segurança e integridade

- HTTPS do host de releases do produto; **sha256 fixado no app** (manifesto por versão, não vem do servidor); tamanho conferido.
- Verificação **antes** de executar: hash errado → apaga o arquivo, recusa e mostra “o arquivo veio corrompido; tente de novo”.
- Assinatura de código quando houver (o mesmo pipeline do instalador); o download nunca cai em pasta executável fora do `PERSONA_HOME`.
- Nenhum componente é carregado de caminho arbitrário: o host resolve o caminho, não o cliente.

## 5. Onde fica e como sai

- `%PERSONA_HOME%\runtime\<componente>\<versão>\` (versão no caminho; trocar de versão baixa de novo e a antiga é removida depois).
- Desinstalar o app remove o `PERSONA_HOME%\runtime` (o instalador já remove o home que criou; conferir no NSIS).
- “Remover” em Configurações apaga a pasta do componente e volta ao estado “ausente”.

## 6. Contrato técnico (host)

```ts
type ComponentKind = 'libreoffice' | 'python'
type ComponentState =
  | { readonly state: 'installed'; readonly path: string; readonly version: string }
  | { readonly state: 'absent' }
  | { readonly state: 'downloading'; readonly received: number; readonly total: number }
  | { readonly state: 'failed'; readonly reason: 'offline' | 'checksum' | 'disk' | 'http' | 'cancelled' }

/** Garante o componente; nunca bloqueia o boot. Idempotente e concorrente-seguro (uma instalação por vez). */
ensureComponent(kind: ComponentKind): Promise<ComponentState>
/** Estado atual, sem baixar. */
componentState(kind: ComponentKind): ComponentState
/** Remove o componente (Configurações › Componentes). */
removeComponent(kind: ComponentKind): Promise<void>
```

- **Quem chama:** `document/office-to-pdf` (LibreOffice) e `skill/skill-office` (Python) pedem `ensureComponent` antes de usar; se vier
  `failed`, devolvem a frase do §3 e a feature fica indisponível **com motivo**.
- **Concorrência:** duas pré-visualizações ao mesmo tempo compartilham o mesmo download.
- **Progresso:** o host publica o estado (evento/IPC) para a tela; o cliente não calcula tamanho.
- **Sem IA, sem rede no boot:** o host só toca a rede quando alguém pede o componente.

## 7. Prova (aceite)

1. Home limpo, offline: abrir um `.docx` → mensagem do §3, **sem** download, app continua utilizável.
2. Online: abrir o mesmo `.docx` → progresso → pré-visualização funciona; a 2ª vez não baixa de novo.
3. sha256 trocado no manifesto → recusa, apaga, mensagem “corrompido”; nada executa.
4. Disco cheio (simulado) → mensagem de espaço, nenhum arquivo parcial executável.
5. Desinstalar/“Remover” → pasta some; a próxima pré-visualização volta ao estado “ausente”.
6. Instalador base sem os dois: `verify-persona-package` verde e o tamanho do `Setup.exe` medido (~190 MiB).

## 8. Donos

- **Cobalt:** o contrato e a implementação do host (v1.1.1).
- **Muse:** a forma (progresso, offline, erro, Configurações › Componentes).
- **Keel:** integração/corte e o gate do `verify-persona-package`.
- **Rivet:** empacotamento (tirar os dois do asar) e o host de download/assinatura.

## 9. MinGit (proposta do Cobalt, 11/11)

O terceiro peso do instalador é o MinGit (**91,8 MB instalados, ~25 MiB no Setup**), hoje copiado pelo `afterPack` (`persona-mingit.mjs`).
Ele é o único dos três que serve uma feature central (Projetos/histórico privado), então entra **por último** na fila.

- **Sai do instalador base** com o mesmo `ComponentKind` novo `mingit` (o `ComponentManager` já cobre manifesto + sha256 + instalação atômica).
- **Quando baixa:** no primeiro uso de Git quando o `resolveGitExecutable` não acha um Git no PATH (o resolvedor já prefere o PATH e só então o
  empacotado; com o componente instalado, o caminho do store entra como `bundledExecutable`).
- **Offline:** a feature de Git fica indisponível com a frase do §3 e o motivo; nada mais quebra.
- **Ganho:** 329,6 → ~185 MiB de Setup (com LibreOffice + Python + pnpm já fora).
- **Dono:** Cobalt (resolvedor) + Rivet (tirar do afterPack).

### Launcher do pnpm (desenho fechado, 11/11)

O plugin manager (core) recebe `packageManager` do perfil; para não tocar no core, o host passa um **launcher** do app:

```js
// pnpm-launcher.mjs (no runtime preparado; o host o usa como packageManager.command)
// 1. lê DSH_COMPONENTS_MANIFEST + PERSONA_HOME
// 2. ComponentManager({ root: <home>/runtime, manifest }).ensure('pnpm')
// 3. exec: process.execPath --expose-internals <store>/pnpm/bin/pnpm.mjs <args recebidos>
// 4. qualquer falha (sem manifesto, offline, checksum) cai no pnpm empacotado (DSH_PACKAGED_PNPM)
```

O `packageManager` do perfil vira `{ command: process.execPath, args: ['--expose-internals', <launcher>], env: { DSH_COMPONENTS_MANIFEST, DSH_PACKAGED_PNPM, ... } }`; o launcher repassa `process.argv.slice(2)` e o código de saída. O `prepare-dsh` escreve o launcher no runtime e o `files` do electron-builder já cobre `lib/**` (se ele for emitido pelo tsdown) ou o runtime (se for escrito no pack). Prova: instalar um plugin com o componente ausente → baixa e instala; offline → usa o empacotado.

## 10. Estado da ligação (11/11, Cobalt)

| componente | pacote/manifesto | chamador ligado | resolvedor |
| --- | --- | --- | --- |
| LibreOffice | `persona-components` + `prepare-components.ts` (arquivo + sha256 + `components.json`) | **sim** — `office-to-pdf` chama `ensure('libreoffice')` antes do `createConverter`; falha vira `unavailable` | **sim** — `installOfficeEngineResolution` cai para `<PERSONA_HOME>/runtime/libreoffice/<versão>` quando o kit empacotado não existe |
| MinGit | idem (kind `mingit`) | **sim** — `persona-host` chama `ensure('mingit')` no primeiro review sem Git no PATH | **sim** — o `cmd/git.exe` do store vira o `bundledExecutable` do `resolveGitExecutable` |
| Python | idem (kind `python`) | **sim** — `desktop-office` chama `ensure('python')` e passa o diretório do componente (runtime.json + dependencies/python) como `source` do `tool-workspace-dependencies`; o payload empacotado fica de fallback | **sim** — o store vira o `source` quando o componente está instalado |
| pnpm | idem (kind `pnpm`) | **falta** — desenho: o `packageManager` do perfil passa a apontar para um launcher do app (`lib/pnpm-launcher.mjs`) que importa `@deepseek-ai/dsh-persona-components`, garante o componente e executa o pnpm do store repassando os argumentos; o plugin manager (core) não muda | **falta** — o launcher resolve o store e cai no pnpm empacotado se o componente não instalar |

Os quatro estão no tree: LibreOffice (`f27ef9de67`), MinGit (`17771ddcd5`), Python (`72db7f4a68`) e pnpm (`7788e3bbee`, launcher no runtime). O empacotamento (`3620600ac0`) tira os componentes do instalador base quando `DSH_DESKTOP_COMPONENTS_BASE_URL` está setado: arquiva LibreOffice/Python, remove o kit, o Python e o pnpm da árvore base (depois do smoke primário) e pula o MinGit no afterPack. Esperado: ~1.112 → ~672 MB instalados, instalador ~185 MiB (alvo < 200 MiB).

## 11. `components.json`: quem gera (Cobalt, 11/11)

O manifesto é escrito por **`scripts/persona/gen-components-json.mjs`**, não pelo servidor e não à mão:

```sh
node scripts/persona/gen-components-json.mjs --print                       # inspecionar
node scripts/persona/gen-components-json.mjs --out <raiz-do-build>/components.json
node scripts/persona/gen-components-json.mjs --from <components.json do release> --out <raiz-do-build>/components.json
```

- **Entradas fixadas no gerador:** `stt` = `vosk-model-small-pt-0.3.tar.gz` publicado pelo projeto do vosk-browser (o mesmo runtime do Worker), 32.440.432 B, sha256 `49977153…887c`, `format: "tar.gz"` — o instalador guarda o arquivo como `model.tar.gz`, sem conversão zip→tar.gz. É a única fonte que o app baixa de um host de terceiros; URL, tamanho e hash nunca vêm da rede.
- **Entradas do release:** LibreOffice, Python, MinGit e pnpm são arquivados a partir da árvore pelo empacotamento e entram por `--from`; o gerador valida cada uma (kind conhecido, URL https, sha256 hex, tamanho positivo) e **a entrada fixada vence** em caso de kind repetido.
- **Saída:** `{ schemaVersion: 1, components: [...] }`, exatamente o que `parseComponentManifest` aceita. O `prepare-dsh` copia o arquivo para a raiz do build e o electron-builder o publica como `resources/components.json`; o main do desktop só passa `DSH_COMPONENTS_MANIFEST` quando ele existe (fora do release o plugin fica inerte).
- **`stt` no host (item 20):** `ensureVoiceModel` (Remote) chama `ctx.personaComponents.ensure('stt')`, baixa o tar.gz fixado, guarda como `model.tar.gz` e o devolve; o renderer não baixa nada, só guarda o consentimento e os bytes em cache.
