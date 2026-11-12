# D-116 "Onde a persona roda" — a parte do Prism (telas), com a Muse — rascunho 12/11 14:50

Escopo: só as TELAS e o que elas pedem do host. O modelo "onde roda", a presença e a transferência cifrada são do Flint, do Bolt e do Rivet/Onyx (Estação); o texto final e a arte são da Muse. Tudo em STAGING até o "candidato validado"; revisor independente do Atlas antes de ligar. Regra de honestidade (HONEST-1): nenhuma tela mostra "no ar", conta de IA ou computador que o host não disse.

## 1. "Onde roda" ao criar a persona (editor de persona / contratar)
- Um campo no fim do formulário, SÓ quando a persona é compartilhada com a equipe (a persona só minha não pergunta: roda aqui). Dois cartões de escolha (primitiva `ChoiceCards` que já existe):
  1. **Neste computador** (padrão) — "Ela fica no ar enquanto este computador estiver ligado."
  2. **Um computador da equipe** — lista dos computadores cadastrados com o estado (ligado / desligado); desligado aparece mas avisa "ela só fica no ar quando ele ligar".
- Abaixo, uma linha fixa e honesta: "Ela usa a conta de IA entrada naquele computador. Ninguém copia login de um PC para o outro." Sem computador cadastrado: o segundo cartão some e vira o link "Cadastrar um computador da equipe" (leva a 3).
- Dados que a tela pede: `listComputers()` (id, nome, ligado, RAM, personas que roda, "é este") e o campo `homeComputerId` na criação.

## 2. "Onde roda" no perfil da persona
- Um cartão no perfil (aba Visão geral): o nome do computador, o chip de estado (`No ar` verde / `Fora do ar` neutro), a linha da conta ("roda no PC da padaria, com a conta Claude de quem o configurou" — vem do host, nunca montada no cliente) e o menor acesso ("o acesso dela é o menor entre o seu e o do PC": o host diz o resultado, a tela só mostra).
- Botão **Levar para outro computador** (só dono da persona ou quem o dono autorizou). Abre o diálogo da seção 4. Na 1ª versão a escolha é feita ao criar e este é o único jeito de mudar.
- **Privacidade (Lumen L3b):** quando a persona roda num computador que NÃO é o do criador (o da equipe), uma linha fixa no cabeçalho da DM e no perfil, ANTES de qualquer um escrever: "{Persona} roda no {PC}: quem cuida dele pode ver esta conversa." Some quando o computador de casa é o da própria pessoa.
- **Conceder conector em computador da equipe (Lumen L1):** a concessão mostra de quem é a conta ("Gmail de Ana, neste computador"): o conector é identificado por computador + id; sem a exposição do dono do computador a opção nem aparece (o host decide; a tela só mostra o que ele mandou).

## 3. "Computadores da equipe" (Configurações, ao lado de Estação/Celular)
- Lista: nome, chip ligado/desligado, RAM, "roda N personas" (clicável: abre as personas dele). Só o dono da equipe ou quem ele autorizou vê "Cadastrar" e "Remover".
- **Cadastrar um computador (acordo com o Bolt, B0; troca o que estava aqui):** o código nasce no PC DO DONO (**Computadores da equipe › Cadastrar**, `issueComputerCode`) e é DIGITADO no computador novo ("Entrar como computador da equipe", `enrollThisComputer`), igual à Estação e ao celular do M5. O MESMO componente do código `XXXX-XXXX` (10 minutos, 1 uso; "Só funciona na sua rede do Tailscale"). O dono ainda CONFIRMA vendo o nome, a RAM e a impressão digital das chaves ("Cadastrar PC da padaria?", `confirmComputer` / `rejectComputer`): o código sozinho não cadastra. Erros como na Estação: "Esse código não confere." / "O código venceu. Gere outro no PC."
- Remover um computador que ainda roda personas: bloqueado com a lista delas ("Leve estas personas para outro computador antes").

## 4. "Levar para outro computador" (diálogo com confirmação)
- Título "Levar {persona} para outro computador?"; escolha do destino (a mesma lista de 1, o atual desabilitado).
- O que muda, em 3 linhas: "As memórias, as regras e as habilidades dela vão cifradas." / "A conta de IA NÃO vai: ela usa a do computador novo." / "A cópia no computador antigo é desligada. Ela nunca roda em dois lugares."
- Botão primário "Levar" (confirmação simples, não o 'segure': é reversível levando de volta); "Cancelar". Estado "Levando…" com a persona marcada fora do ar até o host confirmar; falha = a frase do host e a persona continua onde estava.

## 5. Persona fora do ar (histórico sem compositor)
- DM e canal: a conversa continua LEGÍVEL; no lugar do compositor entra um cartão com a arte e a frase "O computador onde {persona} roda está desligado." + "Ela volta quando ele ligar." (sem botão morto; se o dono do PC for a própria pessoa, "Ligue o PC da padaria"). No canal, o `@persona` de quem está fora do ar não envia: o menu `@` mostra "fora do ar" cinza e não escolhe.
- Barra (Casa): as personas fora do ar saem de "Personas" e vão para a seção recolhida "Fora do ar · N" (a presença é a do computador). "Quem está aqui" usa o grupo "Fora agora" que o host já entrega.
- No celular a mesma regra (Muse §31c): ler sim, escrever não.

## O que peço ao host (nomes finais do Bolt, B0; o Flint decide o contrato do host)
`PersonaView.home?: { computerId, computerName, online, accountLabel?, accessNote? }` (e `getPersonaHome({ personaId })`); `listComputers()`; `issueComputerCode({ label? })` (dono, no PC dele) / `enrollThisComputer({ code, address, label })` (computador novo) / `confirmComputer({ requestId })` / `rejectComputer({ requestId })` / `revokeComputer({ computerId })`; `previewMovePersona({ personaId, toComputerId })` (o que vai, o que NÃO vai, o que está em andamento: a tela do diálogo lê dela) e `movePersona({ personaId, toComputerId, confirm: true })` -> `{ transferId }` + `getTransfer({ transferId })` (estados `em-transferencia` / ok / erro com a frase do host). A presença por persona vem do computador (nada de estimativa no cliente). Sem esses campos as telas 2 a 5 não aparecem (HONEST-1).

## Componentes (Prism, em staging)
`WhereRunsField` (1), `WhereRunsCard` (2), `ComputersPanel` + reuso do pareamento (3), `MovePersonaDialog` (4), `OfflinePersonaNotice` (5, no lugar do compositor) e a seção "Fora do ar · N" da barra. Todos com alvos de 44 px e sem largura de desktop (Atlas: um fio só, também a 390 px).

---

# D-116 "Onde roda" — a parte do Cobalt (cliente web e celular, M5) — 12/11 14:58

Só o que muda no cliente web/celular. Usa os nomes do Prism acima (`home: { computerId, computerName, online, accountLabel?, accessNote? }`); se o Flint/Bolt trocarem, só o `readHome` muda.

## C1. Regra de ouro
O celular e o navegador são só TELAS do PC. Não são um "Onde roda": o cliente nunca oferece "rodar neste aparelho", e nada que ele escreve muda onde uma persona roda. Cadastrar computador, escolher onde roda e "Levar para outro computador" são só pelo PC: o host recusa com `pc-only` e o cliente nem desenha o botão (nenhum botão morto). O celular LÊ a casa da persona e a presença dela.

## C2. O que o celular mostra
1. **O chip "Onde roda"** no cabeçalho da conversa com a persona e, em 13 px muted, na linha dela na gaveta: `PC da padaria · ligado` ou `· desligado`. A bolinha é verde só com `home.online` E a persona `ativa` (computador ligado e persona pausada não é verde).
2. **A folha "Onde roda"** (toque no chip, folha de baixo): `{Persona} roda no {computerName}.` + `home.accountLabel` exatamente como o host mandou (o cliente NUNCA monta a frase da conta) + `home.accessNote` se vier + `Mudar de computador só pelo PC.` Só texto e `Fechar`: nenhuma ação.
3. **Persona fora do ar** (o mesmo caminho do D-115): vai para `Fora do ar · N` recolhida, o fio abre só para leitura e o compositor dá lugar ao `OfflinePersonaNotice` do Prism (importado, não refeito). A razão diz o computador:
   | `reasonCode` | Frase (pt) |
   |---|---|
   | `computador-desligado` | `{Persona} roda no {computerName}, que está desligado. Ela volta quando ele ligar.` |
   | `em-transferencia` | `{Persona} está mudando de computador. Volta já.` |
   | `pausada` / `sem-ficha` / `sem-motor` | as frases do contrato do Bolt |
4. **`Fora do ar` agrupado por computador** com 2 ou mais computadores (`PC da padaria · 3`); com 1, lista simples; sem `home`, grupo `sem-computador`, por último.
5. **O computador volta**: o celular relê `listPersonas` a cada 20 s (combinado com o Bolt), a persona sobe sozinha e o compositor reaparece sem recarregar. O rascunho digitado num compositor que fechou fica guardado e volta com ele.
6. **Sem `home`** (host antigo): nenhum chip, nenhuma folha, nada inventado (HONEST-1).

## C3. Falhas (vocabulário fechado do host)
- `persona-offline` (com `details.reasonCode`, e `details.computerName` se vier): o compositor volta ao estado "fora do ar" com a frase da tabela, o texto digitado fica, e nada aparece como "enviado".
- `pc-only` em qualquer ação de computador: `Isto só pelo PC.` Nunca silêncio.
- O computador some no meio de um turno: a mensagem já enviada continua no fio; a resposta não chega; a persona passa a `fora-do-ar`. O cliente não promete resposta.

## C4. Módulos (NOVOS, em `client-ui-persona/src/client/mobile/`)
Puros: `where-runs.ts` (`readHome(wire)` falha fechada: faltando `computerId` ou `computerName` = `undefined`; `homeChip(home, presence)` → `on | off | unknown`; `whereRunsSheet(persona)`), `presence.ts` estendido (`awayReasonKey(reason, home?)` com `{computer}`, `groupAwayByComputer(rows)`), `composer-gate.ts` (`composerState`: `open | away | readonly`, rascunho guardado). Visuais: `WhereRunsChip.tsx` (o Prism pode importar no desktop, sem largura), `WhereRunsSheet.tsx`, `ComposerGate.tsx`. Texto: namespace `persona.mobile`, chaves `where.*`.

## C5. Testes vermelhos (`.maestri/staging/cobalt-web/tests/where-runs.spec.ts`)
W1 `readHome` bom e fio ruim (sem nome, número, array, `null`) · W2 `homeChip` (online + ativa = on; ligado + pausada ≠ on; sem `home` = unknown) · W3 a folha só tem texto e `Fechar` (nenhuma ação de mudar; `accountLabel` é o do host, byte a byte) · W4 `awayReasonKey` traz o computador; `em-transferencia` tem frase; razão desconhecida cai em `unknown` · W5 `groupAwayByComputer` (2 computadores, 1, sem `home`, ordem da Casa) · W6 o compositor fecha quando a persona vai a `fora-do-ar`, o rascunho é guardado e volta · W7 `persona-offline` mostra a frase do computador e não marca "enviado" · W8 nenhuma chave pt/en do celular oferece rodar neste aparelho.

## C6. O que peço
- **Flint e Bolt:** `home` em `listPersonas` (com `accountLabel` e `accessNote` prontos), `reasonCode: 'em-transferencia'`, `listComputers()` e `home` em `PHONE_ALLOW` só leitura, `persona-offline` com `details.reasonCode` e `details.computerName`, `pc-only` em cadastrar/mover. Sem e-mail, nome ou id de conta no `accountLabel` (só o tipo: "conta Claude").
- **Prism:** `OfflinePersonaNotice` e `WhereRunsCard` sem largura de desktop, para eu os usar no celular; o `WhereRunsChip` meu é compartilhado se ele quiser.
- **Muse:** o desenho do chip, da folha e do "Fora do ar" agrupado, a 360 a 430 px, claro e escuro.

---

# D-116 "Onde roda" — a parte do Bolt (cadastro do computador e transferência cifrada) — 12/11 15:05

**Só isto é meu:** (1) cadastrar um computador da equipe por código (o do M5); (2) "Levar para outro computador": a memória, as regras e as skills da persona viajam CIFRADAS e a cópia antiga desliga; (3) o modelo de ameaça. **Não é meu:** o modelo "onde roda" e a presença (Flint), Estação/RAM/autostart (Onyx, Rivet), telas (Prism, Cobalt), desenho (Muse), revisão de segurança (Lumen). Reusa o M5 (`marco-dogfood-remoto.md`): o mesmo `DevicePairing` (`XXXX-XXXX`, 10 min, 1 uso, 5 erros trancam, só conta erro com código aberto) e a mesma porta Tailscale.

## B0. Respostas ao Prism e ao Cobalt (acordos que mudam as seções acima)
- **Direção do código:** o código nasce no computador que JÁ É da equipe (o do dono: **Computadores da equipe › Cadastrar**) e é DIGITADO no computador novo ("Entrar como computador da equipe"), como a Estação e o celular do M5 (Muse §31). Prism: a linha "gerado no computador que será cadastrado" da seção 3 deve virar "gerado no PC do dono, digitado no computador novo". Motivo: o segredo fica com quem autoriza, e o dono ainda confirma o cadastro vendo nome, RAM e impressão digital das chaves.
- **Nomes finais** (trocam os provisórios do Prism): `issueComputerCode({ label? })` (dono, PC) · `enrollThisComputer({ code, address, label })` (computador novo) · `confirmComputer({ requestId })` / `rejectComputer({ requestId })` (dono) · `listComputers()` · `revokeComputer({ computerId })` · `getPersonaHome({ personaId })` · `previewMovePersona({ personaId, toComputerId })` · `movePersona({ personaId, toComputerId, confirm: true })` → `{ transferId }` · `getTransfer({ transferId })`.
- **Cobalt (C6):** SIM a `reasonCode: 'em-transferencia'` (fecha-se em `listPersonas`, junto de `computador-desligado | pausada | sem-ficha | sem-motor`); SIM a `persona-offline` com `details.reasonCode` e `details.computerName`; SIM a `pc-only` em cadastrar/mover/revogar; `listComputers` e `home` entram em `PHONE_ALLOW` SÓ para leitura. O `accountLabel` e o `accessNote` são do Flint (host); regra minha: o rótulo da conta é o TIPO ("conta Claude"), nunca e-mail, nome ou id.

## B1. Vocabulário
| Termo | O que é |
|---|---|
| **Computador** | Um host do Persona que a equipe reconhece: `{ id, label, signKey (Ed25519), boxKey (X25519), registeredBy, registeredAt }`. As chaves privadas nascem NO computador e ficam seladas nele (Cofre/DPAPI); nenhuma chave privada trafega. |
| **Certificado** | O registro acima assinado pelo DONO da equipe (lei 3). A equipe confia no certificado, nunca numa chave que chegue pelo fio sem ele. Revogar = lista de revogação assinada. Carrega `caps` (conectores e teto de autonomia que aquele computador permite). |
| **Casa da persona (HomeRecord)** | `{ personaId, computerId, epoch, at }` assinado pelo criador da persona (ou pelo dono). Um computador SÓ roda a persona se tem uma casa vigente que o nomeia e a ficha assinada (lei 3). `epoch` só cresce. |
| **Pacote da persona** | O que viaja: memória (segundo cérebro/notas dela), regras da casa dela, skills dela, a ficha assinada. **Não viaja:** credenciais, Cofre, sessão de conta de IA, perfil de navegador, arquivos fora do projeto, nem o histórico do fio (esse já é da equipe). |

## B2. Cadastro do computador (pareamento)
1. No computador do dono: **Computadores da equipe › Cadastrar** → `issueComputerCode` → `XXXX-XXXX` (outra instância do `DevicePairing`; só o dono, `requireMachineOwner`).
2. No computador novo: digita o código e o endereço do dono (Tailscale `100.x:porta`, ou o link do convite se o relay estiver ligado). Ele gera o par de chaves **ali**, sela a privada e manda `{ code, label, signKey, boxKey, ram }` (rota pública do portão do M5, mesma cerca e limite: `POST /remote/computer-hello`).
3. O dono vê "Cadastrar *PC da padaria*?" com nome, RAM e a impressão digital das chaves (≥ 12 caracteres, derivada das DUAS chaves; Lumen L6.3) e CONFIRMA. O código sozinho não basta: sem o "Cadastrar" do dono nada é assinado.
4. O dono assina o certificado; o computador novo guarda o certificado do dono (âncora de confiança) e o roster. Daí em diante os computadores se reconhecem por assinatura, não por rede.
5. Revogar: o certificado entra na lista de revogação assinada; as personas daquele computador ficam **fora do ar** (sem casa) até serem levadas para outro; nenhum pacote é cifrado para chave revogada.

**Transporte (Q2):** o pareamento e o pacote são OPACOS (assinados e cifrados), servem a qualquer transporte. v1 do dogfood: **direto pelo Tailscale** (o portão do M5 ganha o principal `computer` e a rota `/remote/computer/*`, mesma cerca e limite); quando o relay (23/25) ligar, o mesmo pacote vai pelo hub (o encaixe `StationPairingPort` da Estação já existe para o código).

## B3. "Levar para outro computador"
A = casa de hoje, B = destino cadastrado e ligado, `epoch` = e.
1. **Prévia** (`previewMovePersona`): o que vai (memória N itens, regras, skills, tamanho), o que NÃO vai ("o login de IA não vai: em B vale a conta de lá"), o que está em andamento (o turno aberto é cancelado; os cartões continuam no quadro). Sem `confirm: true` não há movimento (`confirm-required`).
2. **A fecha:** não aceita turno novo, cancela o em curso e grava DURAVELMENTE `transferindo(e → e+1)` (se A cair agora, volta sabendo). Estado visível: `em-transferencia`.
3. **A empacota e cifra:** JSON canônico + SHA-256 (o molde da ficha, lei 3) → caixa selada para a `boxKey` de B lida do CERTIFICADO (nunca da rede): X25519 efêmero + HKDF + AES-GCM (as primitivas do item 23, `e2ee-channel.md`), assinada por A. Cabeçalho `{ personaId, from, to, epoch: e+1, nonce, notAfter (24 h), digest }`; teto de tamanho; pedaços com hash por pedaço.
4. **B recebe e confere, sem ativar:** assinatura de A (certificado vigente), `to == B`, `epoch == e+1`, `nonce` novo, `notAfter`, digest. Guarda em quarentena e responde `recebido(e+1, digest)` assinado.
5. **A libera:** ao ver o `recebido`, A **apaga a cópia** (procedimento do P0-09 + backups, B9-L5; sem prometer "cripto-apagada") e grava `liberada(e+1)` DURAVELMENTE; sobra o histórico do fio e a persona vira "casa em B".
6. **B ativa** em `e+1` ao receber `liberada(e+1)` de A com o HomeRecord novo. Só então a persona fica `ativa` em B.

**Nunca em dois lugares:** A só libera DEPOIS de B guardar e B só ativa DEPOIS de A liberar; entre os dois a persona fica fora do ar (falha segura). Além da ordem, **fencing por epoch**: qualquer computador que veja, na malha, um HomeRecord de epoch maior para a mesma persona PARA de rodá-la na hora.

| Falha | O que acontece |
|---|---|
| B não responde (offline, recusou) | A ainda não liberou: **desfaz** e reabre a persona em A (epoch e). Nada some. |
| A cai depois de empacotar | Ao voltar, lê `transferindo` e pergunta a B: B ativo → A apaga a cópia; B só tem a quarentena → A reabre a persona. |
| A liberou e B não ativa | Persona **fora do ar** (nunca duas). O dono pode "Ativar de novo em A" (epoch e+2); se B voltar com e+1, o fencing o para. **Limite honesto:** se B ficou ISOLADO da rede e segue rodando e+1, os dois rodam até se falarem; por isso esse botão exige confirmar e avisa isso. |
| Pacote repetido ou antigo | Recusado (nonce visto, epoch ≤ atual, `notAfter`). |
| Computador revogado no meio | Recusado; a persona fica fora do ar até nova casa. |

## B4. As leis do H23 e o D-116
- **Lei 1** (persona só no PC/assinatura do dono) × D-116 (computador da equipe, com a conta entrada NAQUELE computador): **peço ao Keel/Carbon que registrem o D-116 como emenda da lei 1**: a persona roda no computador que a equipe cadastrou, com a conta de quem o configurou, e a tela diz isso. A credencial nunca sai (o pacote não a carrega, por desenho e por teste).
- **Lei 2** (acesso ⊆ criador): o acesso efetivo em B é o MENOR entre o que o criador deu (ficha) e o que o certificado de B permite (`caps`, assinado pelo dono). Quem calcula é o `sheetGate` do host de B (Flint liga o gancho; eu entrego os `caps`).
- **Lei 3** (ficha assinada): B só roda com ficha válida E casa que o nomeia; o pacote leva a ficha assinada, não uma nova.
- **Lei 4** (local-first): nada passa por servidor central; o pacote é cifrado de ponta a ponta e o transporte é opaco.

## B5. Modelo de ameaça curto
| Ameaça | Resposta |
|---|---|
| Computador da equipe comprometido ou roubado | Só tem o que já recebeu; a revogação assinada corta novos pacotes e o tira da malha; credenciais de outros computadores nunca estão nele. |
| Código fotografado | Vale 10 min, 1 uso, e o dono ainda precisa "Cadastrar" vendo nome, RAM e impressão digital. |
| Homem no meio na transferência | A chave de B vem do certificado assinado pelo dono, não do fio; pacote assinado por A e selado para B; digest e nonce. |
| Replay ou downgrade do pacote | epoch crescente, nonce visto, `notAfter` de 24 h. |
| Pacote malicioso (skill ou arquivo hostil) | B trata o pacote como ENTRADA NÃO CONFIÁVEL: limites de tamanho e quantidade, caminhos normalizados (sem `..`), skills só como dado até passarem pela checagem da importação; tudo roda sob o teto "menor entre criador e computador". |
| Resíduo no disco de A | **Apagar com o procedimento do P0-09** (`secure_delete` durante a apagada + `VACUUM` + checkpoint `TRUNCATE`) **e limpar os backups, o WAL, os rascunhos, a atividade e o contexto usado**; a tela NÃO diz "cripto-apagada" (não há cifra por persona hoje; B9-L5). |
| Duas cópias rodando | B3 (ordem + epoch). Limite honesto na partição (3ª falha). |
| Credencial de IA saindo de um PC | Fora do pacote por desenho; um teste varre o pacote atrás de padrões de token e de qualquer campo do Cofre. |

## B6. Arquivos novos (staging; aviso ao Keel ao aplicar)
`persona-host/src/computers/{computer-book.ts, computer-cert.ts, persona-bundle.ts, handoff.ts}` e, em `persona-sync/src/`, `sealed-bundle.ts` (caixa selada + assinatura + pedaços, sobre as primitivas do item 23). Ganchos em `index.ts` (hot): 9 Remotes de B0, ≤ 30 linhas por vez. Superfície `computers` DESLIGADA no produto (D-113/D-115) até a auditoria; ligada sob Vitest.

## B7. Provas (vermelho primeiro)
T1 certificado (adulterado, de outro dono, revogado → recusado) · T2 pareamento (código, só o dono confirma, 5 erros trancam, sem código aberto não conta) · T3 caixa selada (só B abre; A e terceiros não; pedaço adulterado falha) · T4 transferência feliz (A libera depois de B guardar, B ativa depois de A liberar; **nunca `ativa` nos dois em instante nenhum**, observado por um relógio de eventos) · T5 cada falha da tabela de B3 · T6 replay/downgrade · T7 pacote SEM nenhuma credencial (varredura) · T8 `after-move-no-persona-text-in-db-wal-backups` (nenhum texto da persona no banco, WAL, backups, rascunhos de A; o método do `cofre-p0-09.spec`) + `claim-matches-mechanism` (a frase da tela não promete cripto-apagar) · T9 menor-entre-criador-e-computador · T10 superfície desligada no produto. Runtime real: 2 computadores no Tailscale (com o Probe, depois de "candidato validado").

## B8. Decisões abertas (recomendação em negrito)
- **Q1 Lei 1:** **registrar o D-116 como emenda** (Keel/Carbon).
- **Q2 Transporte v1:** **Tailscale direto** (sem Cloudflare); o pacote opaco serve ao relay depois.
- **Q3 Quem cadastra:** **só o dono no v1**; "quem ele autorizar" (D-116) vira certificado de autorização assinado no v1.1.
- **Q4 O que é "memória":** **o que o Flint definir no modelo** (segundo cérebro + notas da persona; NÃO os documentos do projeto, que são da equipe).
- **Q5 Turno em andamento ao mover:** **cancelar** (o cartão volta à fila).
- **Q6 Árbitro/lease:** **fora do v1**; o limite da partição está dito em B3 e a mitigação é o fencing por epoch.

## B9. A revisão do Lumen (L1–L6) incorporada ao desenho, e o limite que a tela DIZ (12/11 15:20; Keel 14:57)
Estas linhas substituem o que B1–B7 dizem em contrário.

- **L1 — dois consentimentos para o que é da conta/Cofre/navegador de B.** O certificado de B traz `caps.expose` (lista do que o DONO de B expõe: conectores, Cofre, navegador; **padrão VAZIO**). A concessão do criador (ficha) é **por cima**: acesso efetivo = criador ∩ quem pediu ∩ o que o computador permite ∩ `caps.expose`, recalculado a cada turno. Um conector é identificado por **computador + id**, nunca só pelo nome; o pacote NÃO leva concessões; em B o criador concede de novo **vendo de quem é a conta** ("Gmail de Ana, neste computador"). Testes: `grant-needs-operator-exposure`, `connector-identity-includes-computer`, `cofre-of-b-not-reachable-by-creator-grant`.
- **L2 — quem pode HOSPEDAR.** O certificado traz `caps.hostFor` (o dono + as pessoas que ele listou, assinado) e um teto por criador (`caps.perCreatorMax`: personas e RAM). **B recusa** uma casa que o certificado não permite (a recusa é de B, não só da tela). Testes: `home-needs-host-permission`, `host-quota-per-creator`.
- **L3 — memória privada de DM não viaja.** O pacote NÃO leva registros privados de DM a um computador que não seja o do próprio criador, a menos que ele confirme ("levar tudo; quem cuida do PC novo pode ler"); padrão = ficam. Tela (Prism/Muse): antes de qualquer membro escrever a uma persona hospedada fora do PC dele, uma linha fixa "{Persona} roda no {PC}: quem cuida dele pode ver esta conversa". Testes: `bundle-excludes-private-dm-memory`, `dm-notice-when-home-is-not-mine` (cliente).
- **L4 — roster e revogação com VERSÃO.** Roster e lista de revogação levam `version` crescente e `issuedAt`, assinados pelo dono; cada computador guarda a maior versão vista e **recusa menor** (a repetição de um roster antigo não ressuscita um computador revogado); passadas 24 h sem roster fresco o computador **para de aceitar pacotes** (falha segura). Testes: `roster-rollback-rejected`, `revoked-computer-stays-revoked-after-replay`, `stale-roster-stops-accepting-bundles`.
- **L5 — apagar em A, honesto (decisão L9.3 em aberto; adoto a recomendação do Lumen para o dogfood).** Hoje a memória vive em SQLite sem cifra por persona, com WAL e backups em claro: **destruir uma chave não apaga nada**. Portanto: "Levar" usa o procedimento do P0-09 (`secure_delete` só durante a apagada + `VACUUM` + checkpoint `TRUNCATE`) **e limpa os backups** (banco, WAL, backups, rascunhos, atividade, contexto usado), e **a tela NÃO diz "cripto-apagada"**. A cifra por persona (e o cripto-apagar de verdade) fica como evolução. Testes: `after-move-no-persona-text-in-db-wal-backups`, `claim-matches-mechanism`.
- **L6.1 — janela de ativação.** `liberada(e+1)` leva `activateBefore` (10 min): B **não ativa depois dele**; A só aceita "Ativar de novo" **depois** da janela. Fecha o caso "B apenas lento". Testes: `late-activation-refused`, `reactivate-waits-for-window`.
- **L6.2 — mensagem para a casa antiga.** Depois de `liberada`, uma mensagem endereçada a A não é processada por A **nem some**: A responde `persona-moved(epoch, computerId)` e o remetente reencaminha (ou a persona aparece "fora do ar"). Teste: `message-to-old-home-not-lost-not-run`.
- **L6.3 — impressão digital ≥ 12 caracteres** derivada das DUAS chaves (≥ 56 bits). Teste: `fingerprint-bits >= 56`.
- **L6.5 — o pacote é dado.** Memória e skills do pacote são DADO, nunca instrução de ficha; a ficha (instruções) só vale com a assinatura do criador (lei 3), não com a de A.
- **O LIMITE QUE A TELA DIZ (Keel 14:57: não esconder).** Sem hub e sem árbitro (v1, Tailscale direto), uma **partição de rede** com B já ativo + "Ativar de novo em A" forçado pode rodar a persona nos dois computadores até eles se falarem (o fencing por epoch para o antigo ao voltar). Onde aparece: (1) no diálogo do botão "Ativar de novo em A", em uma frase fixa ("Se o outro computador está sem rede, ela pode rodar nos dois até eles se encontrarem"), com confirmação explícita; (2) em `getTransfer` quando `released` sem `active` passa de `activateBefore` (`message` do host: "O computador novo ainda não respondeu."); (3) no relatório do soak, quando houver partição. A cópia antiga e o fencing precisam de um lugar onde VER a época: sem hub, um computador isolado não vê HomeRecord maior; aceito como limite do dogfood (2 computadores do Miguel).
- **Ordem de implementação (Lumen L8):** 1 HomeRecord com época + CAS + janela de ativação; 2 certificado com `caps.expose`/`caps.hostFor` + roster com versão; 3 pacote com esquema fechado (lista de permitidos) + exclusão de DM privada + varredura de segredo; 4 apagar em A (P0-09 + backups); 5 avisos de tela com Prism/Muse. Cada passo vermelho → verde depois do "candidato validado".

---

# D-116 "Onde roda" — REVISÃO DE SEGURANÇA (parte do Lumen) do desenho do Bolt (B0–B8) — 12/11 15:10

Li o desenho do Bolt inteiro contra o que o Keel pediu: credencial nunca atravessa, acesso = o menor, nunca em 2 lugares (corrida), cadastro só do dono/autorizado, memória cifrada em trânsito e em repouso. **Veredito: a espinha está certa** (certificado assinado pelo dono, casa com `epoch`, "A só libera depois de B guardar, B só ativa depois de A liberar", pacote selado para a chave do certificado, fencing por `epoch`). **Mas 4 pontos abrem um buraco real (P1) e 3 endurecem (P2)**; nenhum exige refazer o desenho. Cada achado diz o requisito e o teste que o prova (vermelho em staging quando o código do dono entrar).

## L0. As leis do Carbon depois do D-116 (a lei nova e o que continua inegociável)
| Lei (§0 do Carbon) | Antes | Agora |
|---|---|---|
| **1. Onde roda** | só no PC e na assinatura do dono | **EMENDA (D-116):** roda no computador que é a casa dela, um só por vez: o do criador ou um cadastrado pela equipe, **sempre com a conta de IA entrada NAQUELE computador** |
| **2. Acesso** | persona ⊆ dono | **reforçada:** efetivo = criador ∩ quem pediu ∩ o que o computador permite ∩ **o que o dono daquele computador expôs** (L2 abaixo), nunca a união, recalculado a cada turno |
| **3. Ficha** | assinada pelo dono | fica: assinada pelo criador; o computador de destino a **verifica** antes de ativar |
| **4. Local-first** | ponte cega | fica: a ponte só vê cifrado; "computador" é uma máquina da equipe |

**Continua inegociável** (só muda por nova decisão expressa do Miguel): (1) credencial nunca atravessa computadores; (2) nunca em dois lugares; (3) acesso = o menor; (4) a ponte é cega e **não cadastra computador nem move persona sozinha**; (5) cadastro = dono (ou autorizado por escrito, revogável) **+ confirmação no PC**; (6) a origem do turno continua mandando na autoridade (`person`/`routine`/`unattended`/`quadro`): rodar em outro computador não dá mais poder a turno nenhum.

**O que o D-116 abre e a tela tem de dizer (não é falha, é consequência):** quem opera o computador de casa **lê tudo o que a persona sabe, recebe e faz** (a memória é decifrada lá; as conversas com ela chegam decifradas lá; pastas e navegador ficam lá), e a conta de IA gasta é a dele (termos da assinatura: decisão de negócio do Atlas, registrada).

## L1. P1 — o conector que o criador concede NÃO é o que o computador da equipe resolve (dois consentimentos)
**Buraco:** o desenho calcula "o menor entre o que o criador deu (ficha) e os `caps` do certificado de B". Mas a concessão de conector é **por nome/id** ("claude.ai Gmail"), e em B esse nome resolve para o conector da **conta de IA de B** — o Gmail de **quem configurou aquele PC**, não o do criador. O criador acha que dá o dele; a persona age no de outro. O mesmo vale para os logins do Cofre e o perfil do navegador de B (o Cofre de B é do operador).
**Requisito:** em um computador de equipe, **o que é da conta/Cofre/navegador de B só entra se o DONO DE B expôs** (lista explícita no certificado, `caps.expose`, padrão **vazio**); a concessão do criador é **por cima** (interseção), e o conector é identificado pelo **computador + id**, nunca só pelo nome. A transferência não leva concessões (o desenho já diz) e o criador concede de novo em B **vendo o nome do dono da conta** ("Gmail de Ana, neste computador").
**Testes:** `grant-needs-operator-exposure` (concessão do criador sem exposição do dono = recusada); `connector-identity-includes-computer` (mesmo nome em dois computadores = dois conectores); `cofre-of-b-not-reachable-by-creator-grant`.

## L2. P1 — quem PODE pôr uma persona num computador da equipe (autorização de "hospedar")
**Buraco:** a casa é "assinada pelo criador (ou pelo dono)". Cadastrar o computador é do dono, mas **qualquer criador** poderia assinar uma casa em B e gastar a RAM e a cota de IA do operador (e instalar skills/memória lá).
**Requisito:** o certificado de B traz **quem pode hospedar** (`caps.hostFor`: dono + pessoas que o dono listou, assinado) e teto por criador; B **recusa** uma casa que o certificado não permite. Sem isso, "cadastrar" vira um cheque em branco.
**Testes:** `home-needs-host-permission`; `host-quota-per-creator`; a casa fora da lista é recusada por B (não só pela tela).

## L3. P1 — privacidade das DMs numa persona hospedada fora do PC do criador
**Fato:** toda conversa (canal ou **DM**) com uma persona hospedada em B é decifrada **em B** e fica no banco de B. O operador de B lê DMs que o membro achava privadas ("só entre nós dois"); e a **memória privada de DM** (os registros do `private-records.ts` do Anvil) é exatamente o que o pacote leva.
**Requisito:** (a) o pacote **não** leva registros privados de DM a computador que não seja o do próprio criador, a menos que ele confirme ("levar tudo, e o operador pode ler"); padrão = ficam; (b) **antes de qualquer membro escrever** a uma persona hospedada fora do PC dele, a tela diz "{Persona} roda no {PC}: quem cuida dele pode ver esta conversa" (Prism/Muse, uma linha fixa no cabeçalho da DM e no perfil); (c) a regra "DM é só dos dois" do Anvil passa a ler "e o computador de casa".
**Testes:** `bundle-excludes-private-dm-memory`; `dm-notice-when-home-is-not-mine` (cliente); `private-record-never-listed-for-operator-via-remote` (o operador de B, como membro, continua sem ler DM alheia pela interface — o acesso é ao disco, não à ACL).

## L4. P1 — roster/revogação com versão (rollback)
**Buraco:** "lista de revogação assinada" sem **versão monotônica**: a ponte (ou um computador malicioso) repete um roster ANTIGO, de antes da revogação, e o computador revogado volta a ser aceito.
**Requisito:** roster e lista de revogação com `version` crescente assinada pelo dono; cada computador guarda a maior vista e **recusa menor**; o roster tem `issuedAt` e um prazo (ex.: 24 h) depois do qual um computador **sem roster fresco para de aceitar pacotes** (falha segura).
**Testes:** `roster-rollback-rejected`; `revoked-computer-stays-revoked-after-replay`; `stale-roster-stops-accepting-bundles`.

## L5. P1 (honestidade) — "cripto-apagar" é uma promessa que o armazenamento de hoje não cumpre
O desenho promete apagar a cópia de A "destruindo a chave" da persona. Hoje a memória vive em **SQLite sem criptografia por persona**, com WAL e **backups** (`backupNow`) que guardam o texto em claro. Sem uma camada de cifra por persona **antes** de a memória ser escrita, destruir uma chave não apaga nada.
**Requisito:** ou (a) a memória da persona é cifrada por linha com a chave dela **desde já** (e a chave fica fora dos backups), ou (b) o "levar" usa o procedimento do P0-09 (`secure_delete` só durante a apagada + `VACUUM` + checkpoint `TRUNCATE`) **e limpa os backups**, e a tela **não diz "cripto-apagada"**. Inventário do que persona deixa em A: banco, WAL, backups, rascunhos, atividade, contexto usado.
**Testes:** `after-move-no-persona-text-in-db-wal-backups` (o método do `cofre-p0-09.spec`, agora com o corpo da memória e o texto de um rascunho); `claim-matches-mechanism` (se não há cifra por persona, a frase da tela não promete chave destruída).

## L6. P2 — endurecimentos
1. **Janela de ativação:** em B3 "A liberou e B não ativa → o dono ativa de novo em A (epoch e+2)". Um B apenas **lento** pode ativar depois, em `e+1`. Requisito: `liberada(e+1)` leva `activateBefore` (ex.: 10 min); B **não ativa depois dele**; e A só aceita "ativar de novo" **depois** dessa janela. Isso fecha o caso "B lento"; a partição com B já ativo continua sendo o limite honesto do Bolt. Teste: `late-activation-refused`; `reactivate-waits-for-window`.
2. **Mensagem para a casa antiga:** uma mensagem endereçada a A depois de `liberada` não pode ser processada por A **nem sumir**: A responde `persona-moved(epoch, computerId)` e o remetente reencaminha (ou a persona aparece "fora do ar"). Teste: `message-to-old-home-not-lost-not-run`.
3. **Impressão digital de 8 caracteres (32 bits)** é curta para conferir fora de banda; usar **≥ 12 caracteres** ou um código de palavras derivado das **duas** chaves. Teste: `fingerprint-bits >= 56`.
4. **A cópia antiga e o fencing exigem um lugar onde ver a época:** sem hub (Tailscale direto) um computador isolado não vê HomeRecord maior. Aceitar como limite para o dogfood (2 computadores do Miguel), mas **registrar no relatório do soak** quando houver partição.
5. **Pacote = entrada não confiável** (o Bolt já diz): acrescento que **memória e skills do pacote são dado, nunca instrução de ficha** até passarem pela checagem; a ficha (instruções) só vale com a assinatura do criador (lei 3), não com a de A.

## L7. O que NÃO aceito como candidato (resumo)
credencial, token, perfil ou segredo num pacote; uma persona com lease/ativa em dois computadores; computador cadastrado sem assinatura do dono **e** confirmação no PC; o hub ou um membro comum adicionando computador; conector/Cofre/navegador de B usados por concessão do criador **sem exposição do dono de B**; casa assinada fora da lista de quem pode hospedar; roster antigo aceito; memória privada de DM saindo do PC do criador sem confirmação; a tela prometendo "apagada com segurança" sem que o mecanismo exista.

## L8. Ordem sugerida para o Bolt/Flint (cada passo com vermelho → verde, depois do "candidato validado")
1. HomeRecord com época + CAS + janela de ativação (L6.1) — é o que impede dois lugares.
2. Certificado com `caps.expose` e `caps.hostFor` + roster com versão (L1, L2, L4).
3. Pacote com esquema fechado (lista de permitidos) + exclusão de DM privada + varredura de segredo (L3 e a lei 1).
4. Apagar em A: P0-09 + backups, até existir cifra por persona (L5).
5. Avisos de tela (L3b, L1) com o Prism/Muse.

## L9. Perguntas para o Keel/Atlas
1. **Termos da assinatura:** vários membros gastando a conta de quem configurou o computador da equipe — o Atlas confirma que está de acordo com os termos do fornecedor?
2. **L1/L2:** "dono do computador expõe, criador concede" (dois consentimentos) é o modelo que o Miguel quer? A alternativa mais simples (o dono do computador é o dono da equipe e expõe tudo) deixa de valer no dia em que o computador for de outra pessoa.
3. **L5:** cifra por persona agora (mais trabalho, promessa honesta) ou procedimento do P0-09 + backups e texto sem "cripto-apagar" (recomendo, para o dogfood)?


---

# D-116 "Onde roda" — a parte do Flint (modelo no host e presença da persona) — 12/11 15:25

**Só isto é meu:** (1) o modelo "onde roda" por persona no host; (2) "um lugar só" por persona; (3) a presença da persona = a presença do computador, e onde ela entra (listPersonas/Casa, "persona ativa" do M5, a admissão do M2/M4); (4) as respostas ao Bolt (B0 acima). **Não é meu:** certificado/pareamento/pacote cifrado (Bolt), cadastro e RAM do computador (Onyx/Rivet), telas (Prism/Cobalt/Muse). Tudo em staging até o "candidato validado"; superfície `computers` DESLIGADA no produto até o revisor independente do Atlas.

## F1. O modelo
Cada persona tem UMA casa. Um doc por persona na KV de telas (`screen_doc`, kind `persona_home`, id = personaId; **sem migração** — V27 só se o Keel preferir, os Remotes não mudam):
```
{ computerId, epoch, state: 'active' | 'moving', movingTo?, record, since }
```
- `computerId`: o computador onde ela roda; **ausente = "este computador"** (toda persona criada antes do D-116 é do criador e roda aqui: nada muda, e a tela NÃO mostra chip — HONEST-1).
- `epoch`: só cresce. `record` = o `HomeRecord` assinado do Bolt (`{personaId, computerId, epoch, at}` + assinatura do criador/dono), guardado como veio: o host valida e guarda, nunca "inventa" casa.
- `state`: `active` (roda) ou `moving` (fechada para a transferência: sem turno novo, o aberto foi cancelado — `em-transferencia`).
- Persona só do dono (projeto Pessoal / não compartilhada): casa = este computador, não se pergunta. O "Onde roda" só existe para persona compartilhada com a equipe (decisão do Prism, §1 acima).

**`PersonaHomeBook` (arquivo novo, puro sobre a KV):** `homeOf(personaId)`; `set(personaId, record, now)` com **compare-and-set por epoch** (`epoch` novo tem de ser > o atual; igual/menor = recusado `stale-epoch`; é o que impede duas casas); `close(personaId, reason)` / `open(personaId)` (troca `state` de forma DURÁVEL antes de qualquer outra coisa: se o host cair no meio, volta sabendo); `placesOf(computerId)` (as personas dele, para "roda N personas").

## F2. "Um lugar só" — 4 invariantes, todas com teste
1. **Um doc por persona; casa nova só com epoch maior** (CAS). Duas gravações concorrentes: uma vence, a outra recebe `stale-epoch`.
2. **Este host só RODA a persona se `computerId` é o dele E `state = active`.** Persona com casa em outro computador é, NESTE host, "fora do ar": sem turno, sem fila, sem compositor, o laço do quadro (M2) não a escala, a Casa a põe em "Fora agora". O histórico do fio continua legível (D-115).
3. **Fechar antes de mover:** `close(personaId, 'moving')` grava `moving` PRIMEIRO e só depois cancela o turno aberto (o cartão volta à fila, Q5 do Bolt) e descarta o runner; a admissão passa a recusar a persona no mesmo instante (não há janela entre "gravou" e "parou").
4. **Fencing por epoch:** ao ver (pela malha do Bolt) um `HomeRecord` de epoch MAIOR para uma persona que este host roda, o host a fecha NA HORA (`close('fenced')`), sem esperar confirmação. Em partição vale o limite honesto do Bolt (B3).

## F3. Presença = a do computador (e o que ela alimenta)
```
presenceOf(persona) =
  casa deste host?  → 'ativa' se state = active e não pausada e motor ok; 'fora-do-ar' com razão se não
  casa em outro?    → o computador dela está online (porta do Bolt: ComputerPresencePort.isOnline(computerId); desconhecido = tratado como DESLIGADO, nunca "provavelmente no ar")
```
**Vocabulário de razão (`reasonCode`, fechado, o do Bolt):** `computador-desligado | em-transferencia | pausada | sem-ficha | sem-motor`. O host calcula; nenhuma tela estima.

**`listPersonas` ganha `home?`** — `{ computerId, computerName, online, accountLabel?, accessNote?, isThis, status: 'ativa' | 'fora-do-ar' | 'em-transferencia', reasonCode? }` (campo opcional; host antigo = sem chip). `accountLabel` = **só o TIPO** ("conta Claude"): vem do cartão de conexão do computador da casa (`kind` do motor); NUNCA e-mail, nome ou id. `accessNote` = a frase pronta do "menor entre criador e computador" que o `sheetGate`/`caps` do Bolt devolve; eu a repasso sem remontar.

**Onde a presença entra:**
- **Casa (H2, "Quem está aqui"):** `HereMember.away` ganha `computer-off | moving` além de `paused | no-engine` (string no fio, sem template literal); o grupo "Fora agora" já existe.
- **M5 "persona ativa":** o cliente web/celular lê `home.status === 'ativa'` (o bolinha verde = computador ligado E ativa; ligado + pausada não é verde, Cobalt C2). Nada de presença guardada no cliente.
- **M2 (laço do quadro):** `LeadPersona` só é usável se `status = ativa`; persona fora do ar nunca recebe cartão nem é cobrada; se a RESPONSÁVEL está fora do ar, o laço segura (`lead:hold`, "a responsável está fora do ar") em vez de agir em nome dela.
- **M4 (admissão/Estação):** só persona cuja casa é ESTE computador conta na admissão por RAM; um turno de persona de outra casa nem chega à fila (a admissão recusa com a razão). `placesOf(thisComputer).length` alimenta o "roda N personas" da lista "Computadores da equipe".
- **Mensagem para persona fora do ar:** não entra em fila escondida. `postMessage`/`@persona` endereçado a uma persona fora do ar devolve a falha tipada `persona-offline` com `details.reasonCode` e `details.computerName` (o compositor já nem aparece; isto cobre o `@` e clientes velhos). Nada fica "enviado".

## F4. Respostas ao Bolt (14:46)
1. **O que é a MEMÓRIA da persona no pacote:** (a) os registros de memória de **escopo `persona`** dela (o que foi dito a ela na DM, incluindo as marcadas como **regra** — contexto obrigatório de todo turno); (b) o **segundo cérebro** dela (as páginas dela, `brain.ts`) e as notas dela; (c) as **skills de escopo `persona`**; (d) a ficha assinada. **Não entra:** memória de escopo `team`, skills de escopo `team`/`project`, quadro, cartões, o histórico do fio e os documentos do projeto — isso é da equipe e fica no host do projeto; nem Cofre, nem credencial, nem sessão de IA. (Ponto a confirmar com o Keel: a "regra da casa" do projeto — `house-rules.ts` — é da EQUIPE, não viaja com a persona.)
2. **Onde mora o estado `ativa | fora-do-ar`:** em dois lugares, sem duplicar a verdade: o doc `persona_home` (`state`, durável: `active | moving`) e a derivação `presenceOf` (calculada na hora do computador + pausa + motor + ficha). Para fechar a persona ao mover, o Bolt chama `PersonaHomeBook.close(personaId, 'moving')` — grava `moving` ANTES, cancela o turno aberto, descarta o runner e a admissão recusa a partir dali; `open` volta (falha da transferência = reabre em A, epoch e).
3. **`listPersonas.home`** = o formato de F3 acima (`accountLabel` só o tipo; `accessNote` pronto; `reasonCode` do vocabulário fechado; `status` com `em-transferencia`). `listComputers()`/`getPersonaHome` são seus (B0); eu só alimento `online` (porta de presença) e `placesOf`.

## F5. Ganchos (todos pequenos; só depois do "candidato validado"; superfície `computers` desligada no produto)
`persona-home.ts` (arquivo NOVO: `PersonaHomeBook` + `presenceOf` puro) · `orchestration.ts`: um portão na admissão, irmão de `isPersonaPaused` (`isPersonaHomeHere`) · `index.ts`: `listPersonas` (+`home`), `herePersonas` da Casa (+razão), `postMessage`/menção a persona fora do ar (+`persona-offline`), o mesmo portão no `LeadPersona` do laço · Remotes só de leitura: `getPersonaHome` (do Bolt, eu forneço o `PersonaHomeBook`). Typert regerado ANTES de dizer "pronto"; tipos de fio planos.

## F6. Provas (vermelho primeiro, relógio injetado, sem rede)
P1 CAS por epoch (maior grava; igual/menor `stale-epoch`; duas gravações simultâneas: uma só vence) · P2 persona com casa em outro computador: admissão recusa, laço não a escala, Casa a põe em "Fora agora", fio legível · P3 `close('moving')` grava `moving` antes de cancelar (host que cai entre os dois volta `moving`), turno cancelado, 0 turno novo · P4 fencing: epoch maior visto = fecha na hora · P5 `presenceOf` (tabela inteira: este host ativa/pausada/sem motor/sem ficha; outro computador ligado/desligado/desconhecido=desligado) · P6 `listPersonas.home`: `accountLabel` é só o tipo (varredura: nenhum `@`, nenhum id), `accessNote` repassado sem remontar, host sem `home` = campo ausente · P7 mensagem para persona fora do ar = `persona-offline` com `reasonCode`/`computerName`, nada gravado como enviado · P8 M2: responsável fora do ar = `lead:hold`, persona fora do ar nunca recebe cartão · P9 "nunca em dois lugares" no host de A e no de B com um relógio de eventos (Gauge): em nenhum instante as duas `ativa` (junto da T4 do Bolt).

## F7. Perguntas ao Keel
1. KV (recomendo) ou V27 para `persona_home`? 2. Persona antiga sem doc = "este computador" (recomendo; zero migração e zero chip) — ok? 3. De onde vem o `thisComputerId`: a identidade do dispositivo que o H23 já guarda no Cofre (`loadOrCreateIdentity`) — confirmo com o Bolt. 4. A "regra da casa" do projeto não viaja com a persona (é da equipe) — ok?


---

# D-116 "Onde roda": a parte da Muse (desenho e texto final), 12/11 15:00

**A prancha** (claro e escuro): `.maestri/tmp/shots/design/onde-roda/`
- `criar-*`: "Onde roda" ao criar e o cartão do perfil;
- `computadores-*`: Computadores da equipe;
- `levar-*`: a confirmação, o "levando…", o "pronto" e a falha.

A fonte é `.maestri/tmp/muse/casa-equipe/onde-roda.html?tela=criar|computadores|levar`, e a especificação longa está em `persona-spec/design/COLHEITA-MUSE.md` §32. Quando o texto daqui e o das partes do Prism e do Cobalt divergirem, **vale o daqui**: o Prism e o Cobalt desenharam a estrutura, e eu fecho as palavras.

## M0. As regras de texto (valem para as 3 telas e para o celular)
- **Sem pronome para a persona:** nada de "ela", "dela", "ele". Repita o nome (regra do Keel). "Ela fica no ar enquanto…" vira `{Persona} fica no ar enquanto…`.
- **"Computador"**, nunca "host", "máquina" ou "dispositivo". "PC" só dentro do nome que a pessoa deu ("PC da padaria").
- **A memória do computador** é dita como **folga**, com os GB em 12 px muted embaixo e nunca "RAM" sozinha. A folga é o `capacity` do Onyx, ou seja, quantas personas a mais podem trabalhar **ao mesmo tempo**:
  - ≥ 2: `Folga para mais N`;
  - 1: `Apertado: mais 1`;
  - 0: `Cheio: as tarefas esperam a vez`.
  - O cabeçalho da coluna tem a dica `Quantas personas a mais podem trabalhar ao mesmo tempo neste computador.`
- **A conta de IA:** é sempre a frase do host (`accountLabel`); o cliente não monta. A forma é a do D-116: `com a conta Claude de quem o configurou`. Se o host mandar o nome de quem configurou (`configuredByName`, só o nome de alguém da equipe, nunca e-mail ou id), ele entra entre parênteses: `(Miguel)`. **Quem decide se vem o nome é o Lumen.**
- **O estado:**
  - o computador fica **Ligado / Pausado / Desligado** (os 3 do Onyx; com a hora: `Desligado desde 14:30`). `Pausado` é âmbar, com a linha `Ligado, mas parou de rodar personas.`;
  - a persona fica **No ar / Fora do ar**. Não misturar os dois.
- **"Skills"**, como no resto do app (o pt já usa assim), e não "habilidades".

## M1. "Onde roda" ao criar (aparece só quando a persona é compartilhada com a equipe)
| Peça | Texto e forma |
|---|---|
| Título | `Onde {Persona} vai trabalhar?` |
| Linha de apoio | `{Persona} só fica no ar enquanto esse computador estiver ligado. A equipe toda pode conversar com {Persona}.` |
| Cartão 1 (padrão) | **`Neste computador`** · `{nome deste computador} · fica no ar quando ele está ligado.` (o glifo `estacao`, sem selo "Recomendado") |
| Cartão 2 | **`Num computador da equipe`** · Select com a bolinha e `PC da padaria · ligado`. Um desligado é escolhível, com a nota `Desligado agora: {Persona} só fica no ar quando ele ligar.` |
| Sem computador cadastrado | O cartão 2 vira a linha `Nenhum computador da equipe ainda.` com o link `Cadastrar computador` (abre M3) |
| Bloco da conta (14,5 px, 600) | `Roda no PC da padaria, com a conta Claude de quem o configurou.` |
| Nota (glifo `lock`, 13 px muted) | `Nenhum login sai do seu computador. O acesso de {Persona} é o menor entre o que você deu e o que esse computador permite.` |

Com o cartão 1 escolhido, o bloco diz `Roda neste computador, com a sua conta Claude.`

## M2. O cartão "Onde roda" no perfil (Visão geral)
- Glifo `estacao` 20 px + **nome do computador** (600) + chip de estado.
- A linha `Ligado · roda 3 personas · conta Claude de quem o configurou`, em 13 px muted.
- O botão secundário `Levar para outro computador` (32 px), mostrado só a quem pode levar. Para os outros não aparece nada: não fica um botão desabilitado.
- O rodapé: `{Persona} só fica no ar enquanto o PC da padaria estiver ligado. Desligado, a equipe lê as conversas, mas não manda mensagem.`
- **Sem `home`** (host antigo): o cartão não aparece (HONEST-1).

## M3. "Computadores da equipe" (Configurações, ao lado de Estação e Celular)
- O título `Computadores da equipe`, a linha `Cada persona trabalha em um computador. Ela só fica no ar enquanto ele está ligado.` e, à direita, o primário `+ Cadastrar computador`. Este último só aparece para o dono da equipe ou para quem ele autorizou.
- **A tabela** (cabeçalho em 11 px, 600, versalete):
  | COMPUTADOR | ESTADO | FOLGA | PERSONAS |
  |---|---|---|---|
  | glifo, nome, chip `este` no próprio, e a linha `Da equipe · conta Claude de quem o configurou` (`estacao`) ou `Computador de Ana` (`pessoal`) | chip `Ligado` (verde), `Pausado` (âmbar) ou `Desligado desde 14:30` (neutro) | `Folga para mais 3` + `16 GB · 6 GB livres`; no `pessoal` de outra pessoa: `—` (o host não manda RAM) | pilha de rostos de 24 px, mais `+2` |
- **A linha toda é clicável:** abre as personas daquele computador. O desligado fica a 65 % de opacidade.
- **A folga** vem do `capacity` do host. Sem ele, a coluna mostra só `6 GB livres de 16 GB`, e o cliente não faz nenhuma conta própria.
- **No `⋯` da linha:** `Renomear` e `Remover da equipe`.
  - Se o computador roda personas, o item leva a uma folha com a lista delas: `Leve estas personas para outro computador antes.`
  - Só o dono tem, em texto vermelho, `Remover mesmo assim`, com a linha `As personas dele ficam fora do ar até alguém levar para outro computador. Nada se perde.`
  - Não existe "desligar pelo app".
- **O cadastro** é o MESMO componente de pareamento da Estação (§28): código `XXXX-XXXX`, 10 min, com os erros da Estação.
  - **O sentido do código** (Keel 15:33; Bolt/Onyx/Rivet): o código **nasce no computador de quem cadastra** (o dono, ou quem ele autorizou) e é **digitado no computador novo**.
  - **No computador de quem cadastra**, `Configurações › Computadores da equipe › Cadastrar computador` abre o painel `Cadastrar um computador da equipe`:
    1. `No computador novo, abra o Persona e escolha "Entrar como computador da equipe".`
    2. `Digite lá este código:` e o código `XXXX-XXXX` em 28 px, Geist Mono 600, com `Vale por 10 minutos.` e `Gerar outro`.
    3. Quando o computador novo digita o código, o painel passa a **Confira**:
       - o sinal em 28 px, Geist Mono 600 (`4F2A·91BC·7D3E`: ≥ 12 caracteres em 3 grupos de 4, Lumen L6.3);
       - `Confira se o computador novo mostra este mesmo sinal.`;
       - os botões `É esse mesmo` (primário) e `Não é` (secundário, cancela e queima o código).
  - **No computador novo**, a tela `Entrar como computador da equipe`:
    - `Digite o código que apareceu no computador de quem cuida da equipe.`;
    - o campo `XXXX-XXXX` (8 caixas, cola de uma vez, sem 0/O/1/I);
    - o primário `Entrar`.
    - **Depois do código** vem a confirmação deste lado (Onyx §3.5b): `Este computador vai entrar na equipe Padaria Pão Quente, cadastrado por Ana.`, o mesmo sinal, `Esperando Ana confirmar no outro computador…` e o botão `Cancelar`.
  - **Os prazos e os erros:**
    - os passos de confirmação vencem em 2 min, com `O tempo acabou. Gere um código novo no computador de quem cadastra.`;
    - o resto dos erros é o da Estação: `Esse código não confere.` / `O código venceu. Gere outro.` / `Muitas tentativas. Gere um código novo.`.
  - **Pelo celular:** nada disso aparece (o host diz `remote-not-allowed`); a lista é só leitura.
- O rodapé (glifo `lock`): `Cada computador usa a conta de IA que está entrada nele. Nenhum login passa de um computador para o outro.`
- **O vazio:** a arte `pc-sem-ligacao` (já existe), `Nenhum computador da equipe ainda.`, `Cadastre um PC que fica ligado na padaria e as personas da equipe trabalham nele.` e o primário `Cadastrar computador`.

## M4. "Levar para outro computador" (modal de 560 px)
- **O título:** `Levar {Persona} para outro computador?`
- **Os destinos:** a lista de rádios com o glifo, o nome, o estado e a folga. O computador atual não aparece na lista.
  - O desligado fica desabilitado, com `Desligado: só dá para levar a um computador ligado.`
  - O cheio **não** fica desabilitado. Ele tem a linha âmbar `Cheio agora: as tarefas de {Persona} podem esperar a vez.`
- **Dois blocos lado a lado** (e um sobre o outro abaixo de 520 px):
  - `VAI JUNTO, CIFRADO`: `As memórias da equipe, as regras e as skills de {Persona}.`
  - `MUDA`: `{Persona} passa a usar a conta Claude entrada no {destino}. As conexões (Gmail, WhatsApp…) não vão: lá, você liga de novo, vendo de quem é cada conta.` (Lumen L1)
- **As conversas particulares (Lumen L3)**, só quando o destino não é um computador de quem criou a persona:
  - a caixa de marcar **desmarcada**: `Levar também o que {Persona} guardou das conversas particulares`;
  - a linha muted embaixo: `Quem cuida do {destino} vai poder ler. Sem marcar, essas lembranças ficam neste computador.`
- **A linha** `A cópia deste computador é apagada. {Persona} nunca trabalha em dois lugares.` (Lumen L5: nunca "cripto-apagada")
- **A nota** (glifo `clock`): `Leva alguns minutos. Nesse tempo, {Persona} fica fora do ar.`
- **Os botões:** `Cancelar` e o primário com o destino, `Levar para o {destino}`. Não é o "segure": a ação é reversível.
- **O estado "levando"** (no cartão do perfil e no lugar do compositor da conversa com a persona):
  - o rosto `pensando` e `Levando {Persona} para o {destino}…`, com a linha `{Persona} fica fora do ar até terminar. Pode fechar esta tela.`;
  - os 3 passos com check, os **3 pontinhos da casa** (os mesmos do `Button` ocupado, 4 px no círculo de 24 px com o tom da marca, `persona-dot` 900 ms; com reduced-motion ficam parados a 0,8) e o círculo tracejado da espera. Nunca um anel parado, que lê como ©: `Guardando as memórias, as regras e as skills` → `Levando, cifrado, para o {destino}` → `Ligando {Persona} lá`;
  - os passos e a barra de progresso **só aparecem se o host mandar a etapa ou a fração real**. Sem isso, só o spinner e a frase.
- **Pronto:** um toast verde `{Persona} agora trabalha no {destino}.`
- **A falha:** `Não deu para levar. {Persona} continua no {origem}, como antes.`, com a frase do host em 13 px muted embaixo e o botão `Tentar de novo`.

## M5. Fora do ar e celular (o que fecho para o Prism e o Cobalt)
- **No `OfflinePersonaNotice`** (no lugar do compositor): a arte `pc-sem-ligacao` em 96 px e os textos por `reasonCode`:
  | `reasonCode` | Texto |
  |---|---|
  | `computador-desligado` | `{Persona} trabalha no {computador}, que está desligado.` e embaixo `{Persona} volta quando ele ligar.` |
  | `em-transferencia` | `{Persona} está mudando de computador. Volta em alguns minutos.` |
  - Quando o computador é o da própria pessoa, entra também `Ligue o {computador} e {Persona} volta.`
  - Nenhum botão morto.
- **No celular** (o pedido do Cobalt):
  - **O chip** no cabeçalho da conversa: bolinha 8 px + `PC da padaria`, em 13 px. A bolinha é verde só se o computador está ligado E a persona está ativa; senão é neutra.
  - **A folha** "Onde roda": título `Onde {Persona} trabalha`, a linha `{computador} · Ligado`, depois `accountLabel` do host, `accessNote` e, em muted, `Para mudar de computador, use o PC.`. Só um botão: `Fechar`.
  - **"Fora do ar"** agrupado por computador com 2 ou mais: `PC da padaria · 3`.
  - A prancha 360 a 430 px sai em seguida como `celular-onde-roda-*` na mesma pasta.

## M6. Arte
Não falta nada. Reuso:
- `pc-sem-ligacao` para o vazio e o fora do ar;
- o rosto `pensando` no "levando";
- os glifos `estacao`, `lock` e `clock`, que já estão no `UiIcon`.

Se a transferência pedir uma ilustração própria depois, quem faz é o Brush.

## M8. O aviso da conversa particular (Lumen L3)
Antes de alguém escrever, numa conversa particular, a uma persona que mora num computador que **não é o dessa pessoa**, aparece uma linha fixa logo acima do compositor:
- **O texto:** `{Persona} trabalha no {computador}: quem cuida dele pode ver esta conversa.`
- **A forma:** glifo `lock` 14 px, 13 px muted, fundo `wash`, 32 px de altura, raio 10, sem botão de fechar (é um fato, não um anúncio).
- **Celular e desktop:** é a mesma linha.
- **Quando não aparece:** na persona que mora no computador da própria pessoa, a linha não existe.

## M7. Aceite
Ember faz o pré-check e a Muse a captura do app real, claro e escuro, com 2 computadores falsos: um ligado e um desligado. As telas e estados a capturar são:
- M1 com e sem computador cadastrado;
- M2;
- M3 cheia e vazia;
- M4 (escolha, levando, pronto e falha);
- o fora do ar a 390 px.


---

# D-116 "Onde roda": a parte do Rivet (o PC e o instalador), com o Onyx, 12/11 15:25 (hora real do anexo: 15:23)

**Só isto é meu:** o que o app instalado e o instalador fazem num computador cadastrado: cadastrar o PC, onde fica a conta de IA daquele PC, "este PC roda as personas X, Y", e o que acontece em instalar, reinstalar, clonar e desinstalar. **Não é meu:** certificado, código, pacote cifrado (Bolt), `home` e presença (Flint), telas (Prism, Cobalt, Muse), segurança (Lumen). Tudo em staging até o "candidato validado". Para M4 (Estação 24 h) vale `marco-dogfood-24h.md`.

## R1. Fatos que o desenho de cima usa (lidos no código)
- Estação: `persona-host/src/station/` já tem o livro de pareamento (`pairing.ts`: 8 letras, só o hash guardado, 10 min, 1 uso, 5 erros trancam), a costura com a ponte (`pairing-port.ts`: `PairingAnswer { stationId }`), `station.json` (`paired`, `running`; o Onyx acrescenta `crashes`, `lastStartAt`, `team`) e `StationView`. No pareamento da Estação o código nasce no PC da pessoa e é DIGITADO na estação (cabeçalho de `pairing.ts`).
- Conta de IA: cada conta é um login de CLI numa pasta própria DESTE computador (`isolatedHome`, p. ex. `CLAUDE_CONFIG_DIR`); `connections-accounts.md`: "credenciais nunca saem do desktop"; chaves de API no Cofre (DPAPI).
- Instalador: por usuário, sem admin (`perMachine:false`, `allowElevation:false`), sem autostart, sem pergunta de cadastro.

## R2. Cadastrado não é Estação 24 h (peço o OK do Keel/Onyx)
Cadastrar um PC na equipe (Bolt B2) NÃO liga o modo Estação (não dormir, abrir com o Windows, watchdog: `marco-dogfood-24h.md`). Proposta: `station.json.team = { computerId, teamId, name }` (o campo aditivo que o Onyx já prevê) é o cadastro; `paired` continua só do modo Estação. Sem isso, um PC comum cadastrado herdaria bloqueio de sono, piso de RAM e watchdog sem a pessoa ter pedido. Duas consequências que o app trata (minhas):
1. **Oferta no cadastro:** ao cadastrar, o app oferece "abrir com o Windows" (mesma oferta de 1 confirmação, desfazível, da Estação), porque computador cadastrado que não sobe depois de um reinício tira as personas do ar sem ninguém ver.
2. **"Sair" avisa:** o "Sair" do tray, num computador que roda N personas da equipe, pergunta "Este computador roda {N} personas da equipe. Se sair, elas ficam fora do ar até ele ligar de novo." (fechar a janela continua só escondendo). Texto final: Muse.

## R3. Onde fica a conta de IA daquele PC
- **Fica nas pastas de conta do próprio PC** (`<PERSONA_HOME>/…/<id da conta>`, o `isolatedHome`) e no Cofre DPAPI. NADA disso entra no pareamento, na ponte, no pacote do "Levar", em backup ou exportação: lista de EXCLUSÃO fixa no código, com teste que planta um segredo-sentinela na pasta da conta e prova que ele não aparece em nenhum payload que sai do PC (mesma técnica do sentinela de dados do `install-trial`). O pacote do Bolt já exclui por desenho; o teste dele (T7) e o meu cobrem os dois lados.
- **O que a equipe vê** é só o tipo e o rótulo ("conta Claude"), nunca e-mail ou id (Bolt B0, Lumen). `accountLabel` vem do host.
- **PC sem conta entrada:** as personas de casa nele ficam fora do ar pelo `reasonCode` que já existe, `sem-motor` (vocabulário do Bolt/Flint); nunca caem em outra conta nem pedem a de outro PC. Na primeira vez num PC cadastrado o app leva a Conexões (tela que já existe, "+ Adicionar outra conta").
- **Troca no limite** só escolhe entre contas DESTE PC (a regra vale por provedor).

## R4. "Este PC roda as personas X, Y"
Dado vem do host (`placesOf(thisComputerId)` do Flint, via `getPersonaHome`/`listComputers` do Bolt); o desktop não deduz nada. Mostra: no tray, `Computador da equipe: {nome} · {N} personas`; em Configurações › Computadores da equipe, a lista de nomes ("Nina, Beto") com o estado e a folga que o host mandar; e "Remover este computador" só pelo dono (`revokeComputer`, Bolt) com a frase de que as personas ficam fora do ar. Este computador só LÊ a casa que o host lhe disse; quem roda a persona ou não é o portão do host (Flint F2.2), nunca o desktop.

## R5. Ciclo de vida do PC cadastrado (o que o instalador e o app garantem)
| Situação | Resultado |
|---|---|
| Instalar | Nada de cadastro, autostart ou admin. Cadastrar é dentro do app (onboarding opcional "Entrar como computador da equipe" e Configurações). |
| Reinstalar mantendo os dados | Continua cadastrado (chaves seladas com DPAPI no próprio usuário/PC). |
| Reinstalar apagando os dados | Chaves novas: precisa de código de novo; a entrada antiga fica "desligado" até o dono remover. |
| Copiar a pasta de dados para outro PC ou restaurar backup em outra máquina | O selo DPAPI não abre: o app cai em "precisa cadastrar de novo" (falha fechada; nunca age como o PC original). |
| Desinstalar | O instalador não fala com o host, então NÃO avisa a equipe: a presença some (Flint: desconhecido = desligado) e a lista mostra "desligado". O desinstalador remove a tarefa de watchdog da Estação (quando existir). O aviso honesto fica no app ("Remover este computador" antes de desinstalar). |
| Reinício do Windows | Só volta sozinho se a oferta de abrir com o Windows foi aceita (R2.1); o app avisa isso no cadastro. |

## R6. Provas (app instalado, 2 "computadores" na mesma máquina de teste, sem IA paga)
Dois `PERSONA_HOME` + dois `--user-data-dir` (a instância única é por userData):
1. O dono emite o código; o computador novo digita; o dono confirma vendo o sinal; o novo aparece na lista com folga e "ligado"; o mesmo código de novo é recusado; 5 códigos errados trancam.
2. Persona com casa no B roda no B e NÃO no A; B parado: A mostra "fora do ar" e o compositor some.
3. Segredo-sentinela na pasta de conta do A não aparece em nada que o A mandou ao B (pareamento, pacote, backup).
4. B sem conta entrada: persona de B fora do ar com `sem-motor`.
5. Reinstalar B mantendo dados: continua cadastrado; apagando dados: pede código; copiar a pasta de dados de B para um terceiro `PERSONA_HOME`: não assume a identidade.
6. "Sair" no B com 2 personas de casa pergunta antes; fechar a janela não.
7. Desinstalar B (silencioso): a tarefa de watchdog some e A passa a mostrar "desligado".

## R7. Em aberto (peço resposta)
- **Keel/Onyx:** R2, cadastrado ≠ Estação (`team` em vez de `paired`).
- **Muse/Bolt/Onyx, conflito de desenho que bate no onboarding do PC novo:** o Bolt (B0/B2) e o `pairing.ts` da Estação fazem o código NASCER no PC do dono e ser DIGITADO no computador novo ("Entrar como computador da equipe", `enrollThisComputer`); a Muse (M3, passo 1) escreve "No computador novo... Aparece um código" e o item "Usar como computador da equipe". Preciso de UM só nome e UMA direção antes de escrever a entrada no onboarding. Recomendo a do Bolt (o segredo fica com quem autoriza) e o rótulo "Entrar como computador da equipe".
- **Bolt:** o computador sair da equipe pelo próprio app (não só o dono revogar): existe `leaveTeam`, ou só `revokeComputer` do dono?
- **Flint:** a presença vem de batida do host (heartbeat) enquanto `ready`; confirmar o intervalo, porque ele define em quanto tempo "desinstalou" vira "desligado" na lista.

## A parte do Tally (contas) — D-116 × a troca de conta no limite (Keel 15:28, aceito)

Escrito pelo Tally (12/11 15:35), de leitura + sondas em copia temporaria (apagadas). Fatos: a troca de conta no limite e o Desfazer (W2-4/5/7, D-078) vivem TODOS no banco local da maquina: `accounts` (por workspace e motor), `account_policy`, e os docs `active_account`, `account_hold`, `account_limit`, `account_limit_log`, `account_swap`, `account_activity` e a fila `quota_wait`. Nada disso e lido de outro computador. A D-116 nao muda o mecanismo, desde que as 4 regras abaixo valham.

**Regra 1 — no computador da equipe, motor e conta sao VINCULO LOCAL (assento), nunca reescrita da ficha.** O `runner` da persona (motor, modelo) esta DENTRO da ficha assinada (`SheetFields.runner`). `applyEngine` (team-connect-host) reescreve `runner` e o `wrapPersonaWrites` re-assina com a chave DESTE host: no computador da equipe, sem a chave do criador, a ficha viraria `tampered`/`foreign` e o gate de ficha bloquearia a persona. So o criador/dono muda o motor da ficha. No computador da equipe, escolher motor/conta grava um vinculo local (`engine_local`, doc da maquina) que o executor le por cima do `runner` da ficha (um ponto: `orchestration.ts` onde hoje le `persona.runner`, anchor `--check`); a ficha nao muda e o digest fica igual.

**Regra 2 — persona com casa em OUTRO computador nao recebe `applyEngine` nem `bindAccount` daqui.** O `listPersonas` do TeamConnect lista so as personas com casa NESTE computador; as duas portas recusam (`home-elsewhere`) a que nao e daqui. (A sessao dela esta la; `evictWarmRunners` daqui nao faz nada.) Gancho: `teamConnectPorts({ ..., homeHere })` com o `PersonaHomeBook` do Flint (`isPersonaHomeHere`).

**Regra 3 — contas: so as ENTRADAS nesta maquina; nunca colidem.** `accounts.list(workspaceId, provider)` e o conjunto; o `homeDir` e por id da conta (`isolatedAccountHome(pessoa, motor, id)` = hash da pessoa / motor / hash do id), entao 2 pessoas e 5 contas (3 Claude + 2 GPT) entram sem dividir pasta. O guarda que faltava: `addConnectionAccount` aceita um `homeDir` explicito e nao confere que ele e unico; duas contas com a mesma pasta fazem `assertIsolatedHomes` lancar `SHARED_HOME` em TODO turno de TODA persona daquele motor. Passa a recusar (`conflict`) o `homeDir` ja usado por outra conta.

**Regra 4 — o pacote do "Levar" NAO leva estado de conta, e mover zera o assento e as esperas.** Nao viajam: `active_account`, `account_hold`, `account_limit`, `account_limit_log`, `account_swap`, `account_activity`, `quota_wait`, `account_policy`, nem linhas de `accounts` (homeDir). A lista e UMA so (`account-docs.ts`: `MACHINE_ACCOUNT_DOCS`, com teste de deriva que varre o fonte do host e falha se um doc de conta novo nao estiver nela). Ao mover (`close('moving')`), o computador antigo chama `releaseMachineSeat(projectId, personaId)`: apaga `active_account` e `account_hold` dela e zera as esperas de cota das Tarefas dela (`quota_wait`); o historico (livro de limites e de trocas) fica, e so de acrescimo. Em B ela comeca sem assento e `seatForPersona` escolhe entre as contas de B (sem nenhuma conta: conta padrao do motor, ou `sem-motor`).

**Achados que isto fecha (vermelhos em staging, mesmo sem a D-116):**
- SEAT-2/SEAT-3: `active_account` que aponta para conta que a maquina nao tem (persona que veio de outro PC, ou conta REMOVIDA em Conexoes) faz `seatForPersona` lancar `INVALID_ACCOUNT_POLICY` (`pickAccount` UNKNOWN_ACCOUNT): o turno da persona quebra. Correcao: `seatForPersona` ignora o assento que nao esta em `seats` e regrava; `removeConnectionAccount` limpa os docs que apontam para a conta.
- SEAT-4: o Desfazer religava a persona a uma conta removida (`undone:true` num assento inexistente). Correcao: `stale` se a conta que ela deixou nao existe.
- ACC-2: `homeDir` duplicado (regra 3).

**Testes (RED primeiro, staging `.maestri/tmp/tally/marco/`):** SEAT-1..4 · ACC-1 (3 Claude + 2 Codex entram, 5 pastas distintas, cada persona so enxerga as do motor dela) · ACC-2 (homeDir repetido recusado; os turnos seguem) · ACC-3 (2 pessoas entram "Pessoal"/"Trabalho": nenhuma colisao; o mesmo rotulo de novo = `conflict`, nada sobrescrito) · TC-1/TC-2 (regra 2) · ENG-1 (regra 1: `applyEngine` num computador de equipe nao chama `updatePersona`, o digest da ficha fica igual, o vinculo local vale no turno) · MOVE-1 (regra 4: `releaseMachineSeat`; pacote sem docs de conta; deriva) · M5-1 (celular: `confirm`/`decline`/`undoAccountSwap` e as leituras passam; `add/remove/updateConnectionAccount` e `setAccountPolicy` sao so do PC).
**Quem faz:** Tally (regras 1-4, `account-docs.ts`, guardas e testes). **Ganchos nos arquivos dos outros (1 mudanca, ancora `--check`):** Flint — `homeHere` no `teamConnectPorts` e `releaseMachineSeat` ao mover; Bolt — o pacote do "Levar" usa `MACHINE_ACCOUNT_DOCS` como lista de exclusao; Lumen — revisa a regra 1 (a ficha nao muda) e a regra 4.
