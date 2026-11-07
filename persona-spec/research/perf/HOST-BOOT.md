# Subida do persona-host — perfil e o que dá para adiar

Zinc, 07/11/2026. Medição da metade **host** do pedido do Miguel (“a Persona tem que abrir bem rápido e ser leve”); o Cobalt cobre app instalado/Electron/instalador e junta tudo no PLANO.md.

## Fronteira medida

O que está aqui é o **plugin `persona-host`**: do processo Node nascer até o host aceitar a primeira chamada de um cliente (`listProjects`). Ficam fora o carregador Cordis/`dsh` que sobe o processo, o servidor Web e a janela Electron (Cobalt). O script também mede quando a detecção de CLIs e os conectores terminam, porque eles rodam em segundo plano e não bloqueiam a primeira chamada.

## Método

- Script: `scripts/persona/host-boot-probe.mjs` na cópia `C:/p8w-zinc` (fonte com `node --import tsx/esm`; modo `--built` para um `lib/index.js` compilado).
- **Frio**: banco novo (migrações + índices) e host vazio; processo Node novo.
- **Quente**: banco semeado (1 workspace, 2 personas, 1 rotina), um boot de aquecimento e depois processos Node novos sobre o mesmo banco.
- 5 amostras de cada (fonte) e 5 de cada no bundle; relógio `performance.now()`, marcas `PERSONA_BOOT_PROFILE=1` no construtor, CPU/RSS no instante da primeira chamada.
- Tudo sob a trava `--lock check`; nenhuma IA real, nenhum commit.

## Resultado de produção (bundle `--built`)

Bundle: `C:/Users/migue/dev/persona/packages/persona/persona-host/lib/index.js` (build de 04/11 da árvore principal; o build desta cópia não está linkado — ver “Limites”). 5 amostras de cada.

| etapa | frio mediana (ms) | quente mediana (ms) |
| --- | ---: | ---: |
| carga do módulo (`import`) | 452,1 | 367,7 |
| construtor do host | 509,2 | 529,9 |
| **primeira chamada (`listProjects`)** | **1,5** | **2,4** |
| **processo → primeira chamada** | **963,4** | **885,7** |
| CPU na primeira chamada (user/system) | 390 / 218 | 297 / 188 |
| RSS na primeira chamada | 93,3 MB | 92,4 MB |

**Leitura:** no bundle de produção o host fica pronto em **~0,9 s** (mediana; amostras de 0,6 a 1,5 s), com a primeira chamada em ~2 ms e ~93 MB de RSS. O host **não é o gargalo** da abertura; o tempo restante do app está no Electron/Web/instalador (metade do Cobalt). O perfil de fonte+tsx abaixo serve para atribuir etapas e achar trabalho síncrono, **não** para prever o app.

## Perfil de desenvolvimento (fonte + tsx) — atribuição de etapas

O `tsx` transforma o grafo de módulos e compila os caminhos executados no construtor; por isso os totais abaixo são muito maiores que o bundle. Use-os para comparar etapas, não como tempo do app.

| etapa | frio mediana (ms) | quente mediana (ms) |
| --- | ---: | ---: |
| carga do módulo do host | 2698,3 | 2826,8 |
| construtor do host | 7079,9 | 5224,1 |
| primeira chamada (`listProjects`) | 1,8 | 3,3 |
| processo → primeira chamada | 9928,9 | 8694,4 |
| banco + migrações (`openPersonaStore`) | 553,1 | 8,0 |
| `gh --version` (síncrono) | 160,2 | 200,4 |
| `ConnectionProbe` (construtor) | 0,4 | 0,3 |
| laço de projetos (`runtime` + curadoria + canais + remote team) | 0,1 | 24,5 |
| CLI pronta (fundo) | 20944,3 | 19971,7 |
| conectores prontos (fundo) | 18801,6 | 17830,2 |
| RSS na primeira chamada | 225,8 MB | 222,3 MB |

Rodada final de 3× com `super` e CPU desde o processo nascer: `super` (registro do serviço no Cordis) **14,5–16,2 ms**; CPU na primeira chamada **~3,4 s user + ~3,0 s system** (frio) e **~3,5 s + ~3,2 s** (quente); `store` frio mediana **116 ms** (pico de 740 ms); `gh` **181–240 ms**; `projects` quente mediana **17,9 ms** (pico de 43,8 ms); `cliReady` **15,8–17,0 s**; `connectorsReady` **15,9–17,7 s**. A variância é alta (disco/CLI/antivírus); os números são medianas.

## O que pesa

1. **Produção:** carga do módulo (~370–450 ms) + construtor (~510–530 ms) = ~0,9 s até a primeira chamada. O resto do app está fora desta metade.
2. **Banco/migrações (frio):** 116–553 ms no modo fonte, com picos de 0,7–3,3 s; no bundle o total frio é ~0,96 s, então as migrações cabem nesse orçamento. Quente: ~8 ms.
3. **`gh --version` síncrono:** 160–240 ms em toda subida, mesmo sem ninguém usar GitHub.
4. **Laço de projetos:** 18–25 ms de mediana (quente), com picos de 44–428 ms; inclui `orchestration.runtime`, `curateProjectReports`, `teamChannels.reconcile` e `remoteTeam.resume`.
5. **CLI/conectores:** ~16–20 s, mas em segundo plano; a primeira chamada é ~2 ms. O custo é CPU/processos disputando com a primeira tela, não bloqueio da chamada.
6. **RSS:** ~93 MB no bundle (o modo fonte+tsx infla para ~226 MB).

## O que dá para adiar (protótipo medido)

### 1. Warmups de CLI/conectores/prewarm/scheduler

Protótipo: `PERSONA_BOOT_DEFER_WARMUPS=1` agenda `connections.warm()` + `connectorBridge.refresh()` + `prewarmAll()` + `proactivityScheduler.start()` para o próximo tick. No **modo fonte+tsx** o construtor cai de 5,2–7,1 s para **0,74 s** (frio) / 0,61 s (quente), o CPU na primeira chamada cai de ~6,2 s para ~2,6 s e o RSS de ~226 MB para ~132 MB. **Esse ganho é do `tsx`**: ele compila os caminhos do bloco durante o construtor; no bundle o construtor já é 510–530 ms. O que continua verdadeiro em produção é que o bloco é trabalho de fundo e pode começar no primeiro pedido do cliente, não no construtor; o ganho de CPU/RSS no app instalado precisa ser medido pelo Cobalt. **Recomendação:** iniciar o bloco no primeiro pedido (ou após ~1 s ocioso) e medir no instalado; não vender como “5 s” no app.

### 2. `gh --version` lazy

Protótipo: `PERSONA_BOOT_DEFER_GH=1` não roda `detectGh()` no construtor; a detecção vira lazy na primeira vez que a fonte GitHub for usada. A etapa `gh` medida é **160–240 ms de mediana** (fonte), com picos de 0,5–3,5 s sob carga. É um ganho real e pequeno; o protótipo só mede o custo, não implementa o lazy probe.

### 3. `orchestration.runtime` + `curateProjectReports` no laço de projetos

Protótipo: `PERSONA_BOOT_DEFER_PROJECT_WORK=1` pula os dois no boot; o runtime é criado sob demanda e a curadoria fica para o próximo evento. A etapa `projects` é **17,9–24,5 ms de mediana** (quente), com picos de 43,8 / 223 / 428 ms. Com o protótipo, a segunda chamada (`getOverview`, que cria o runtime) custou **~5 ms**; a curadoria não voltou nessa chamada. Ganho típico ~20 ms, até ~0,4 s no pior caso; a janela lista projetos antes de o quadro pedir o runtime.

### 4. Migrações/índices do banco (frio)

Não dá para adiar sem uma tela de espera: o host precisa do banco. O custo frio mediano é 116–553 ms no modo fonte, com picos de 0,7–3,3 s; no bundle o total frio é ~0,96 s. Candidato a trabalho futuro: medir migração por migração e remover índices sem leitor; rodar em worker só se o pico aparecer no instalado (medida do Cobalt).

## Rust/Go

Só com número: **não há um bloco do host em que Rust/Go ganhe de forma mensurável.**

- `store`/migrações: 116–553 ms (fonte) é DDL do SQLite, que já é C; um runner em Rust/Go continuaria chamando o mesmo SQLite.
- `gh --version`: 160–240 ms é `spawnSync` do processo; o custo é o processo/antivírus, não o código Node.
- CLI/conectores: ~16–20 s é autenticação/spawn das CLIs; o gargalo é cada CLI, não o host. Um helper nativo para sondar as quatro em paralelo poderia cortar parte disso, mas é fundo e não está no caminho da primeira tela; o custo de build/assinatura não se paga.
- Carga do módulo/construtor: ~0,9 s no bundle; é V8, não um algoritmo que Rust/Go acelere.
- RSS ~93 MB: vem dos módulos/processos; um rewrite nativo não reduz o que o Node carrega.

Se um dia houver um cálculo puro e quente (ex.: parsing de transcrição em massa), aí sim; hoje o perfil é I/O, spawn e DDL.

## Recomendações

1. **P0 do produto: o host não é o gargalo.** Ele fica pronto em ~0,9 s e ~93 MB; a abertura restante é Electron/Web/instalador (Cobalt). Não gaste esforço em Rust/Go nem em reescrever o host.
2. **P1 — `gh --version` lazy:** tira 160–240 ms (picos de 0,5–3,5 s) do caminho da primeira tela; baixo risco.
3. **P1 — warmups no primeiro pedido:** mover `connections.warm()`/`connectorBridge.refresh()`/`prewarmAll()`/`proactivityScheduler.start()` para o primeiro pedido do cliente (ou ~1 s ocioso). No fonte+tsx o ganho é grande; no bundle o construtor já é curto, então **medir no instalado** antes de tratar como P0. A tela de Conexões já mostra “verificando”.
4. **P2 — runtime/curadoria de relatórios sob demanda:** ~20 ms típico, até ~0,4 s no pior caso; o primeiro `getOverview` cria o runtime em ~5 ms.
5. **P2 — migrações/índices no frio:** medir migração por migração e remover índices sem leitor; o pico de 3,3 s só importa se aparecer no instalado.

## Limites desta medição

- O bundle medido é o de 04/11 da árvore principal; o build desta cópia não está linkado no `node_modules` (o modo `--built` usa um loader só de medição para o Cordis). O número final de produção deve vir do app instalado (Cobalt).
- O modo fonte+tsx infla a carga do módulo e o construtor; os 5–7 s do construtor **não** são o app. Use-o para atribuir etapas.
- A máquina estava compartilhada com outros builders; a variância é alta (picos de 0,4–3,5 s em `gh`, `projects` e `store`). As medianas são o sinal; os picos mostram o pior caso.
- O protótipo de warmups usa `setTimeout(0)`; no app real o gatilho deve ser o primeiro pedido do cliente (ou ~1 s), para garantir que a tela chegue antes.
- A instrumentação (`src/boot-profile.ts`, as marcas `bootMark` no construtor) e as flags `PERSONA_BOOT_DEFER_WARMUPS`/`PERSONA_BOOT_DEFER_PROJECT_WORK`/`PERSONA_BOOT_DEFER_GH` vivem **só na cópia de medição** `C:/p8w-zinc`; não fazem parte dos patches `catchup.patch`/`approve-run.patch`.

## Reprodução

```sh
cd C:/p8w-zinc
# fonte (atribuição de etapas; tsx infla):
node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc boot" --lock check -- \
  node scripts/persona/host-boot-probe.mjs --samples 5 --json .maestri/tmp/zinc/perf/boot.json
# bundle de produção:
node C:/Users/migue/dev/persona/scripts/persona/with-lock.mjs "Zinc boot built" --lock check -- \
  node scripts/persona/host-boot-probe.mjs --samples 5 \
  --built C:/Users/migue/dev/persona/packages/persona/persona-host/lib/index.js
# protótipos:
PERSONA_BOOT_DEFER_WARMUPS=1 node scripts/persona/host-boot-probe.mjs --samples 3
PERSONA_BOOT_DEFER_PROJECT_WORK=1 node scripts/persona/host-boot-probe.mjs --samples 3
PERSONA_BOOT_DEFER_GH=1 node scripts/persona/host-boot-probe.mjs --samples 3
```
