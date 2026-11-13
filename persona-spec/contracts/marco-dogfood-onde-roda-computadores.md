# Marco Dogfood — "Onde roda": cadastro do computador da equipe (M4) — parte do Onyx, 12/11 (desenho, staging)

> **ATUALIZAÇÃO 17:30 (Keel 17:23): ESCOPO REDUZIDO.** Identidade e cadastro de computador (certificado, roster assinado, confirmação no PC, revogação, quem pode cadastrar) são do **Bolt** (`persona-host/src/computers/computer-registry.ts`). Os §2 (quem cadastra), §3 (pareamento) e os Remotes de cadastro do §4 abaixo estão **substituídos** pelo desenho dele e NÃO serão implementados por mim. Fica comigo só a **presença**: `persona-host/src/station/computer-presence.ts` (batimento → ligado/pausado/desligado, RAM/capacidade, nº de personas, rótulo da conta), que LÊ o roster do Bolt. Vale deste documento: §1 (estado derivado do batimento), a trava persistente do código (já em `pairing.ts`, usada pelo código de pareamento da Estação) e as provas de presença.

D-116 (Miguel/Atlas, 14:40). Cobre **só a minha parte**: a lista "Computadores da equipe", o pareamento por código, quem cadastra e o que o host sabe de cada computador. As telas estão em `marco-dogfood-onde-roda.md` (Prism/Muse); o modelo "onde roda" da persona e a presença são do Flint; o transporte cifrado e a transferência são do Bolt (item 23/M5); a revisão de segurança é da Lumen. Staging até "CANDIDATO VALIDADO"; revisor independente do Atlas antes de ligar. Atrás da flag de superfície `station` (D-113), padrão desligada.

## 0. O que já existe e muda
- Hoje a Estação é um fato **da máquina**: `station.json { paired, running }`, `PairingBook` (8 caracteres, 10 min, uso único, 5 erros trancam 10 min), Remotes `issueStationCode` / `pairStation` / `setStationRunning`, todos só-dono-da-máquina (`requireMachineOwner`).
- D-116 muda o sentido de "pareada": o computador passa a estar **cadastrado numa equipe**. O mecanismo do código é o mesmo; ganha equipe, nome e chave. `Station.isPaired()` passa a significar "este PC está cadastrado como computador da equipe" (RAM e acordado de `marco-dogfood-estacao.md` seguem valendo).
- Migração sem quebra: `station.json` ganha o campo aditivo `team?: { workspaceId, computerId }`. Arquivo antigo (`paired:true`, sem `team`) = estação local legada, continua funcionando e aparece como "Este computador".

## 1. Modelo
```
TeamComputer = {
  id, workspaceId, name,              // padrão: nome do Windows (o Rivet preenche na instalação)
  kind: 'estacao' | 'pessoal',        // estacao = cadastrada pela equipe; pessoal = PC de um membro que roda as personas dele
  registeredBy: memberId, registeredAt,
  keyFingerprint,                     // da chave pública; a privada nasce e fica selada (DPAPI) no próprio PC
  lastSeenAt
}
```
**Estado derivado do batimento**, nunca digitado. O computador manda um batimento assinado a cada 30 s. `ligado` = visto há ≤ 90 s e `running`; `pausado` = visto, mas a pessoa desligou a Estação; `desligado` = sem batimento há > 90 s (a persona que mora nele fica "fora do ar", D-115). O batimento leva `ram { totalBytes, freeBytes, floorBytes, perCliBytes }`, `personaCount`, `queue`, `aiAccountLabel` (só o rótulo, "Claude · conta da Ana"; **nunca** credencial, token ou caminho), um `contador` crescente (anti-repetição) e a versão do app.

`TeamComputerView = TeamComputer & { state: 'ligado'|'pausado'|'desligado'; ram?; capacity?: number /* turnos a mais: floor((free − floor)/perCli) */; personas: number; aiAccountLabel?; isThisComputer: boolean }`. Tipos planos no fio.

## 2. Quem pode cadastrar
- **Dono da equipe:** sempre. **Outro membro:** só com a permissão `computers.register` que o dono concede (doc do workspace `team_computer_acl { memberIds }`, só o dono escreve). Convidado/leitor: nunca.
- **PC pessoal** (`pessoal`): qualquer membro cadastra o PRÓPRIO PC, só para as personas que ele criou. A equipe vê "PC da Ana · ligado · 3 personas", sem RAM nem endereço.
- **Remover:** o dono, ou quem cadastrou (o seu). Com personas nele: recusa calma ("leve as personas para outro computador antes"); o dono pode `force` ("remover mesmo assim"): elas ficam fora do ar, nada se perde. Remover revoga a chave: o PC deixa de ser aceito e volta a "não cadastrado".
- **Renomear:** quem cadastrou e o dono.

## 3. Pareamento por código (o mesmo do M5; sentido igual ao da tela do Prism)
1. No computador a cadastrar (app instalado, ou o cliente web do M5 pelo Tailscale), `requestComputerCode({ name })` gera `XXXX-XXXX` e mostra por 10 minutos. Mesmas regras do `PairingBook`: sem 0/O/1/I, só o SHA-256 fica guardado, uso único, 5 erros trancam 10 min, código novo destrava. A chave do PC nasce aqui e fica nele.
2. Quem pode cadastrar abre "Computadores da equipe › Cadastrar" e digita o código: `pairComputer({ workspaceId, code, kind })`. A ACL do §2 é conferida **neste momento** (não quando o código nasceu).
3. **Confira nos dois lados:** as duas telas mostram os mesmos 4 caracteres da impressão da chave (`4F2A·91BC`); só vira cadastro quando quem cadastra toca "É esse mesmo". Um código fotografado não cadastra o PC de outro.
4. Recusas com frase calma e específica: inválido/vencido/usado/bloqueado (frases do `pairStation` atual); "esse computador já está numa equipe: saia dela antes"; "este computador não tem memória para rodar nem uma persona" (RAM total < piso + 1 CLI = 2,1 GB).
5. **Trava persistente (Keel 14:47; `m5-seguranca-requisitos.md` §B da Lumen).** Hoje `PairingBook` guarda `misses` e `lockedUntil` só na RAM: reiniciar o app zera a contagem. Passa a gravar no disco (arquivo `pairing-lock.json` ao lado do `station.json`, escrita atômica): 5 erros no mesmo código **queimam o código** (o dono gera outro); no máximo 5 códigos em tentativa por equipe e 10 resgates por hora, e tetos por endereço remoto (10 tentativas/10 min) e global (30/hora) com `429` e `Retry-After`; backoff exponencial por endereço. Reiniciar o host no meio e continuar errando **não** reinicia a contagem. O código **nunca** vai para log, URL, auditoria nem mensagem de erro (nem o hash). Passos 2 e 3 vencem em 2 min.
5b. **Aprovação no PC novo.** Além do cadastrante tocar "É esse mesmo", o PC a cadastrar mostra "{Ana} quer cadastrar este computador na equipe {X} · Aprovar / Recusar" (nome de quem e da equipe, impressão da chave). Código sozinho NÃO cadastra. Recusar não cria nada e queima o código. Cada cadastro novo avisa o dono da equipe.
5c. **Pelo cliente remoto (M5) o cadastro é NEGADO** ("gerir pareamentos", "mudar a Estação" estão na lista de "nunca pelo remoto" da Lumen): `requestComputerCode`, `pairComputer`, `confirmComputer`, `removeComputer`, `setComputerAccess` nascem `remote-not-allowed`; `listTeamComputers` é permitido. O PC novo aprova na própria tela (ou no cliente web DELE, aberto localmente), nunca por um celular.
6. **Nenhuma credencial viaja** no cadastro: sobe a chave pública. A conta de IA é a que a pessoa entrar naquele PC; a tela diz "roda neste PC, com a conta Claude de quem o configurou".

## 4. Remotes (tipos planos)
| Remote | Quem | Regras |
|---|---|---|
| `listTeamComputers({workspaceId})` | membro | Estação da equipe completa (com RAM) para todo membro; `pessoal` sem RAM nem endereço, salvo para quem cadastrou e para o dono; `isThisComputer`. Regras já provadas em `team-computers.ts` (stage). (O Prism chama de `listComputers()`: mesmo contrato, nome final do Flint.) |
| `requestComputerCode({name})` | no PC novo | §3.1; auditoria `computer.code` (sem o código). |
| `pairComputer({workspaceId, code, kind})` | cadastrante (§2) | §3.2–3.5; devolve `{ ok, line, fingerprint? }`. |
| `confirmComputer({workspaceId, computerId})` | quem digitou o código | passo 3; sem isso expira em 2 min. |
| `renameComputer` / `removeComputer({workspaceId, computerId, force?})` | §2 | `force` só dono; auditoria `computer.removed`. |
| `setComputerAccess({workspaceId, memberId, allowed})` | só dono | concede `computers.register`. |
Para o Flint: portas `computerState(computerId)` e `computersOf(workspaceId)`; ele decide como a persona aparece. **Acesso da persona = menor entre criador e PC** é dele e da Lumen; eu exponho por computador o teto do PC (`ceiling`: conectores e ferramentas que o dono do PC liberou; padrão = o que o dono liberou).

## 5. Provas (vermelho primeiro, em staging; relógio e batimento falsos)
**Puros:** estado derivado (≤ 90 s ligado, pausado, > 90 s desligado); capacidade por RAM; contador anti-repetição (batimento repetido ou fora de ordem é recusado); código (uso único, expira, trava) e limites por equipe.
**Host:** ACL (dono ok; membro sem permissão recusado e com permissão ok; convidado recusado; PC pessoal só do próprio membro); confirmação dos 4 caracteres obrigatória; PC já em outra equipe recusado; RAM total baixa recusada; remover com personas recusa e `force` só do dono; remover revoga a chave (batimento seguinte recusado); **credencial nunca aparece** em nenhuma resposta (varredura do JSON da lista e do batimento); `station.json` antigo continua lido.

## 6. Com os outros e perguntas
- **Rivet:** nome padrão do PC na instalação; autostart ligado quando o PC está cadastrado (G4 de `marco-dogfood-estacao.md`); aviso "este computador precisa ficar ligado e com a sessão aberta".
- **Bolt:** transporte do batimento e do código; eu defino só os campos. **Flint:** consome `computerState`. **Prism:** sentido do código alinhado ao dele (gerado no PC novo).
- **Decidido (Keel 14:47):** o registro vive no host do DONO da equipe, que recebe os batimentos pelo Tailscale (v1 sem hub; o relay Cloudflare entra só para convidar de fora). Com o host do dono desligado a lista mostra "visto pela última vez às…" em vez de zerar (o último estado é guardado no disco). Limites 5 códigos / 10 resgates por hora OK, com trava persistente (§3.5).
- **Provas novas por isso:** reiniciar o host no meio das tentativas não zera a contagem; 5 erros queimam o código e o código certo depois não entra; nenhum log/auditoria contém o código; recusa no PC novo não cadastra; os Remotes de cadastro respondem `remote-not-allowed` no modo remoto e `listTeamComputers` não; o registro e o último batimento sobrevivem ao reinício do host do dono.
