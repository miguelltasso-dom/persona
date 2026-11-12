# Marco DOGFOOD, M4 + M5: o que o app INSTALADO precisa para o PC ficar 24 h

Dono: Rivet (empacotamento, autostart do instalador, atualização). Onyx (Sonnet, entra no M4): não dormir com trabalho, recuperação de queda e admissão por RAM no host (`persona-host/src/station`). Escrito 12/11 14:43. Plano; código e teste vermelho nascem em staging (`.maestri/tmp/rivet/marco/`) e só entram na árvore depois do "CANDIDATO VALIDADO" (~15:15).

## 1. O que o app instalado faz HOJE (lido no código, não suposto)

| Pergunta | Hoje | Onde |
| --- | --- | --- |
| Sobe com o Windows? | Só se o dono ligar "Iniciar com o Windows" no tray (padrão DESLIGADO) e abre COM janela; não existe modo "sem janela" | `login-item.ts`, `main.ts:1501-1508`, `main.ts:~1693` |
| Fechar a janela mata o trabalho? | Não: fechar só esconde, o app e o Host seguem. "Sair" encerra tudo | `main.ts:1865` |
| Impede o Windows de dormir? | Sim, mas por DOIS caminhos: (a) `DesktopPower` (`prevent-app-suspension` enquanto há atribuição rodando) para QUALQUER usuário; (b) `PowerKeeper` do host (SetThreadExecutionState) só com Estação. A regra do marco é "só com Estação pareada": (a) contradiz | `power.ts`, `main.ts:1509-1560`; `persona-host/src/station/power.ts` |
| O Host (filho) cai e volta? | Volta sozinho, 3 tentativas com espera 15/30/60 s, MAS o orçamento NÃO enche de novo depois de uma recuperação (só enche fora de recuperação): a 4ª queda da vida do app vira tela de erro que pede clique | `backend-controller.ts:105,161-203`, `main.ts:790-797` |
| O Persona.exe inteiro morre (crash, Windows Update reinicia, alguém mata)? | NADA o reabre | (não existe) |
| Reinício do Windows | O login item só roda depois que o usuário ENTRA; sem entrada automática o PC fica na tela de senha | pré-requisito do PC |
| Atualização | Baixa e instala só depois de uma confirmação do dono; `quitAndInstall(true, true)` = silencioso + reabre o app | `update-coordinator.ts:201-226` |
| Retomada do quadro depois de reabrir | É do host (reabre o mesmo arquivo e o scheduler retoma); o desktop só espera o Host `ready` | host (Flint/Onyx); e10 do Gauge |
| Instalador | por usuário, sem admin (`perMachine:false`, `allowElevation:false`) | `scripts/electron-builder-config.mjs:294` |

## 2. O que o app instalado PRECISA (nesta ordem) e como cada item é provado

R1. **Modo estação sem janela** (`--background`): abre só na bandeja, sem janela e sem foco; a janela abre pelo tray ou pelo atalho. O login item da Estação passa `args:['--background']`. Prova: unit do parser de argumento + app instalado aberto com `--background`: 0 janelas visíveis, Host `ready`, tray presente.
R2. **Autostart só com consentimento, OFERECIDO pelo pareamento** (D Keel 14:44): ao PAREAR a estação, o app OFERECE "abrir com o Windows" com 1 confirmação e desfazível (o mesmo item do tray); desparear desliga. O instalador continua sem autostart por padrão. Auto-login do Windows: só guia, nada automático. Prova: spec do `DesktopLoginItem` (liga/desliga com o estado da Estação) + `app.getLoginItemSettings()` no app instalado.
R3. **Watchdog fora do app** (D Keel 14:44): tarefa agendada do Windows de USUÁRIO ("ao iniciar sessão" + reinício em falha), só com Estação pareada, criada pelo app por XML (`schtasks /Create /XML`, sem admin): gatilho de logon do próprio usuário, ação `Persona.exe --background`, `RestartOnFailure` (1 min, muitas vezes), `MultipleInstancesPolicy=IgnoreNew`, sem limite de tempo e sem parar na bateria. O `requestSingleInstanceLock` torna idempotente (a 2ª instância entrega os argumentos e sai). "Sair" deliberado (código 0) NÃO é relançado. Removida ao desparear e pelo desinstalador. RISCOS a provar no app instalado: (a) criar a tarefa sem elevação pode ser negado; (b) o Agendador só reinicia por falha se a ação termina com código != 0. Rede de proteção se (a) ou (b) falhar: gatilho de repetição a cada 5 min (não exige admin; `IgnoreNew` evita duplicata). Prova: `taskkill /F` no Persona.exe instalado: em ≤ 6 min volta sozinho, mesmo `PERSONA_HOME`, mesmo quadro; "Sair" pelo tray NÃO volta; desinstalar remove a tarefa.
R4. **Orçamento de reconexão de 24 h** (`backend-controller.ts`, é meu; D Keel 14:44): o orçamento volta ao cheio depois de 10 min estável (nunca "a 4ª queda da vida do app"). Teto: 5 quedas em 10 min com Estação pareada PAUSAM a Estação (`running:false` em `station.json`) e avisam (bandeja + cliente remoto + aviso do SO), em vez de tela de erro bloqueante; sem Estação o comportamento de hoje fica igual, só com o orçamento reenchendo. O desktop lê `station.json` (forma fixa em `persona-host/src/station/station-store.ts`: `{paired, running}`) com leitor próprio de ~10 linhas + spec que fixa a forma contra `loadStationState` para não derivar. Prova: spec do controller com relógio falso (5 quedas espaçadas por >10 min nunca chegam ao erro; 5 em 10 min pausam; sem Estação igual a hoje).
R5. **Um só bloqueio de sono, o do HOST** (D Keel 14:44): o `PowerKeeper` do host decide, só com Estação PAREADA e "rodando", e segura o Windows acordado enquanto houver turno OU cartão aberto/fila "sem vaga" (Onyx). O `DesktopPower` do desktop deixa de segurar para qualquer usuário (vira no-op; o `onResume`/catch-up continua). Prova: spec do `DesktopPower` (nunca chama `powerSaveBlocker.start`) + `powercfg /requests` no app instalado: com Estação pareada e turno vivo aparece o Persona; sem estação, não.
R6. **Atualização na estação**: com Estação, instalar quando OCIOSO numa janela do dono (padrão 04:00, sem turno vivo e sem cartão esperando aprovação); sem estação nada muda (continua pedindo confirmação). `quitAndInstall(true,true)` já reabre. Prova: instalar por cima, silencioso, com o app aberto e um quadro andando: o app volta sozinho (R1+R3 como rede de proteção), sem janela, mesmo quadro.
R7. **Verificador do pack**: o `verify-persona-package.mjs` passa a checar que `--background` é aceito (flag no main empacotado) e que o instalador/desinstalador conhecem a tarefa agendada (nome fixo). Prova: RED contra o pack atual, verde no próximo.

Fora do app, pré-requisitos do PC dedicado (vão numa tela "Preparar este PC" ou num texto do pareamento, não no instalador): entrada automática do Windows (sem ela, queda de energia deixa o PC na senha), horário de reinício do Windows Update fora da noite, Tailscale instalado e entrado. O app só LÊ e avisa (`readTailscale` já existe); não mexe em plano de energia nem em registro.

## 3. M5, empacotar o cliente remoto (a parte do Rivet)

- O cliente web é o mesmo que a janela do desktop carrega e quem o serve é o Host: não há segundo bundle para empacotar. O que falta no pack: (i) o Host precisa escutar também no IP Tailscale (100.x) e NUNCA em 0.0.0.0 (Bolt/Lumen); (ii) a 1ª escuta fora do loopback faz o Windows mostrar o aviso do firewall, e o instalador por usuário NÃO tem admin para criar regra: documentar que o PC dedicado aceita UMA vez em "Redes privadas", ou o app orienta ("Permitir" na janela do Windows). Proposta: o app mostra esse passo no pareamento; não elevamos o instalador.
- Tailscale NÃO entra no instalador (é do usuário; licença e atualização próprias). O app detecta e orienta.
- Prova no pack: do notebook de teste (outra máquina ou o mesmo por IP Tailscale), abrir o cliente pelo IP Tailscale, com o código; e a porta recusa pelo IP da rede local. Depende do Bolt: só dá para provar quando o host escutar no Tailscale.

## 4. Decisões (Keel 14:44) e o que ainda está em aberto

Decidido: (1) orçamento de recuperação reenche após 10 min estável; (2) watchdog fora do app, tarefa por usuário, só com Estação pareada; (3) UM só bloqueio de sono, o do host; (4) autostart oferecido no pareamento (1 confirmação, desfazível) e `--background` abre só o host sem janela; (5) Tailscale/firewall = aviso e guia no pareamento, nunca regra do instalador; auto-login do Windows só guia; teto de 5 quedas em 10 min pausa a Estação e avisa. Divisão: Onyx = host/Estação; Rivet = desktop/instalador.

Em aberto:
1. Keel: R6, janela de atualização 04:00 como padrão da estação é decisão de produto (Atlas/Muse?); sem resposta, R6 fica fora do primeiro corte e a estação continua pedindo confirmação para atualizar.
2. Onyx: o desktop só LÊ `station.json`; quem PAUSA a Estação quando o teto estoura sou eu (escrevo `running:false` pelo mesmo `saveStationState`)? Prefiro que você exponha uma chamada do host ("pausar por quedas") e eu só dispare, mas se o Host está caído não há quem responda: por isso a escrita direta no arquivo. Diga se discorda.
3. Muse: texto da oferta do R2 e do aviso do firewall (leigo).

## 5. Ordem e custo

R4 (pequeno, spec) → R1+R2 → R5 → R3 → R7 → R6. R1..R5 cabem em staging hoje; R3 e R6 pedem o app instalado (pack) e rodam depois do pack de ensaio do corte 3. Nada disso toca `packages/**` fora de `apps/desktop`, exceto a leitura da Estação pareada (Onyx expõe `station.paired` ao desktop por `readStationState` ou equivalente).
