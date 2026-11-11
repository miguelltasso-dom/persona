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
