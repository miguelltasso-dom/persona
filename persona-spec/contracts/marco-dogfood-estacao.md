# Marco Dogfood — M4 "Computador 24 h" (Estação) — Onyx, 12/11 (desenho, staging)

Critério 4 de `PLANO-COLHEITA.md` ("MARCO DOGFOOD"); `PLAN.md` §13 linha M4; D-113 (Estação desligada até o revisor independente do Atlas). Regra de terreno (Atlas, 14:30): tudo em **staging** (`.maestri/tmp/onyx/marco/stage/`) até o aviso "candidato validado" do Keel (~15:15). Este documento é o desenho; o vermelho vem primeiro; o código só entra depois do aviso. Sem git, sem IA real, sem afrouxar CSP/permissões.

**Pronto quando:** o PC dedicado (1) não dorme enquanto há trabalho, (2) sobe sozinho com o Windows, (3) volta sozinho de queda ou de atualização e retoma o quadro, (4) admite turnos conforme a RAM livre.

## 0. O que já existe (não se reinventa)
- `station/station.ts` + `admission.ts`: `admitTurn` admite por RAM (`RAM_FLOOR_BYTES` 1,5 GB + 600 MB por CLI; evicta CLI ocioso antes de recusar; recusa = `sem-vaga`).
- `station/station-gate.ts`: todo turno passa por `Orchestration.resolveFor`; recusa vira `StationBusyError` → ticket `blocked` com frase calma; `resumeNow`/retry de 30 s religam.
- `station/power.ts` (`PowerKeeper`): `SetThreadExecutionState` por processo (`ES_SYSTEM_REQUIRED`, tela pode apagar), só enquanto há turno admitido.
- `station/station-store.ts`: `station.json` (`paired`, `running`) sobrevive ao reinício.
- `apps/desktop/src/power.ts` (`DesktopPower`): `powerSaveBlocker` só enquanto o renderer informa atribuições rodando; `onResume` pede *catch-up* ao Vigia.
- `apps/desktop/src/login-item.ts`: `setLoginItemSettings`, **padrão desligado**, ligado por `prefs.startWithWindows`.
- `apps/desktop/src/single-instance.ts`: trava de instância única; segunda execução foca a primeira.
- O quadro é derivado dos tickets em disco; a Vigia (`ProactivityScheduler`) puxa ticket que ninguém executa. Isso é o que "retoma o quadro" já usa.

## 1. Lacunas (o que o M4 fecha)
| # | Lacuna | Hoje | Alvo |
|---|---|---|---|
| G1 | Fila "sem vaga" só na RAM | `StationGate.waiting` é um `Map`; reiniciar esquece os cartões parados pela Estação | Derivar do disco no boot: ticket `blocked` com falha `station_busy` e assignment mais recente = linha de espera. Reinício não perde cartão. |
| G2 | Acordado só com turno rodando | `PowerKeeper` solta quando `working.size == 0`; entre turnos (backoff da Vigia, retentativa, espera de 30 s) o Windows pode dormir | Estação **pareada** segura acordado enquanto houver **trabalho aberto**: turno rodando OU cartão `doing` OU fila de espera OU retentativa agendada; solta quando o quadro inteiro está parado esperando a pessoa. |
| G3 | Duas trancas de energia sem dono | renderer (`DesktopPower`) e host (`PowerKeeper`) pedem independentes; com a janela fechada no tray o renderer não informa | O host é a fonte da verdade (G2). O `DesktopPower` fica como cinto-e-suspensório e passa a ser ligado também pelo estado do host. |
| G4 | Login-item desligado por padrão | `DesktopLoginItem` começa `false` | Estação pareada → `openAtLogin: true` por padrão (a pessoa pode desligar em Configurações; escolha explícita dela vence). |
| G5 | Queda não tem decisão | `reportFatal` mostra erro; nada relança | Decisão pura `decideRecovery` (abaixo); o `main.ts` do Rivet a chama. |
| G6 | Atualização termina em "sair e instalar" | `quitAndInstall(true, true)` já pede relançar; falta provar que o board retoma e que a estação não vira "desligada" | Teste: reinício pós-atualização encontra `running` como a pessoa deixou e retoma. |
| G7 | Reinício em rajada | nada limita | Backoff e teto de relançamentos (abaixo). |

## 2. Decisão de recuperação (pura, `persona-host/src/station/recovery.ts`, arquivo NOVO)
```ts
type RecoveryReason = 'crash' | 'renderer-gone' | 'host-failed' | 'update' | 'user-quit'
decideRecovery(input: { reason; crashesInWindow: number; windowMs?: number; now: number; paired: boolean }):
  { action: 'relaunch' | 'wait' | 'giveup'; delayMs: number; note: string }
```
Regras:
1. `user-quit` → **nunca** relança (a pessoa fechou de propósito). `giveup` com nota "saiu de propósito".
2. `update` → relança em 0 ms, não conta como queda.
3. `crash`/`renderer-gone`/`host-failed` em estação **pareada**: relança com backoff exponencial 2 s, 4 s, 8 s … teto 60 s; a janela padrão é 10 min.
4. Mais de 5 quedas na janela → `giveup` (não vira loop de reinício; o `main.ts` mostra a tela de erro e a pessoa decide). Estação **não pareada**: nunca relança sozinha em queda (computador comum não surpreende a pessoa), só `giveup` com nota.
5. Função pura: relógio e contador entram; o contador vive no `station.json` (campo aditivo `crashes: number[]` com timestamps, podado pela janela) para sobreviver ao próprio relançamento.

## 3. Admissão por RAM (já existe; o M4 só prova)
Sem mudar `admit()`. Provas novas: (a) RAM sobe de novo → a fila "sem vaga" anda sozinha sem a pessoa; (b) RAM cai com N CLIs → evicta o mais ocioso, nunca um que está rodando; (c) estação **desligada** pela pessoa continua desligada depois de reinício/queda/atualização (`running:false` persistido; reinício nunca religa a equipe nem a desliga).

## 4. Fronteira com o Rivet (proposta por mensagem às 14:29; vale se o Rivet não discordar)
- **Onyx:** `recovery.ts`, derivação do disco (G1), política de acordado (G2), campo `crashes` no `station.json`, specs.
- **Rivet:** `apps/desktop` e instalador: ligar o login-item quando a estação está pareada (G4), chamar `decideRecovery` no `main.ts` (G5/G7), flag de relançar após atualização (G6), aviso/guia de auto-login do Windows (sem login automático o "sobe com o Windows" só vale depois da pessoa entrar).
- Eu não mexo em `apps/desktop` sem ele.

## 5. Testes vermelhos (em staging; relógio e energia falsos)
`.maestri/tmp/onyx/marco/stage/`:
1. `station-recovery.spec.ts` (puro): `user-quit` nunca relança; `update` relança em 0 ms sem contar; backoff 2/4/8… com teto de 60 s; 6ª queda na janela = `giveup`; janela expira e zera; estação não pareada não relança em queda.
2. `station-waiting-disk.host.spec.ts` (host real, IA falsa): cartão parado por `station_busy` + reabrir o MESMO arquivo → entra de novo na fila e roda quando a RAM folga; ticket que mudou de assignment entre o fechamento e a abertura é descartado sem rodar.
3. `station-awake.host.spec.ts`: estação pareada segura acordado com cartão `doing` e sem turno rodando; solta quando só resta cartão esperando a pessoa; estação não pareada nunca segura.
4. `station-restart.host.spec.ts`: `running:false` sobrevive a queda e a atualização; `running:true` idem; 2 projetos andam de novo sem duplicar entrega (idempotência: id de assignment).

## 6. Perguntas
1. **Auto-login do Windows** é por conta do Miguel (configuração do PC dedicado, `netplwiz`) ou o instalador oferece? Recomendo: guia na tela da Estação, nada automático (mexe em segurança do PC).
2. **Teto de 5 quedas / 10 min** está bom para o soak (M7)? Fica configurável por parâmetro, não constante solta.
3. **Hibernação/suspensão manual** do Windows (botão de desligar) fora do nosso controle: ao acordar, o `onResume` já pede *catch-up* limitado (burst 3); o teste G6 cobre a volta.
