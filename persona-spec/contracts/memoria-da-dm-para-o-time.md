# Contrato — "Tornar do time": a memória de uma DM vira memória da equipe (Anvil, 12/11/2026)

**Proposta, sem código.** Só se implementa depois do veredito do Carbon (Keel, 12/11 08:30): é funcionalidade nova com efeito de privacidade (lei 2: o acesso da persona é sempre ⊆ ao do dono). Hoje a memória dita numa DM é um registro do Cofre de memória com `visibility: { kind: 'persona', personaId }`, `factKey: owner:<slug>`, `sourceIds: [mensagem]` e uma prova (`memory_proof`: a mensagem inteira, quem, quando, `where: 'dm'`). Só aquela persona a lê. O único caminho de subida que existe é o dono **repetir a frase num canal** (`captureOwnerMemory`: a cópia da persona é arquivada). Este contrato dá a esse caminho um botão com garantias.

## 1. Quem pode
- **Só o dono do espaço** (`member.role === 'owner'`) **e só pela tela**, num Remote próprio. Nunca uma persona, rotina, execução sem ninguém por trás, ferramenta ou marcador (`[[…]]`): para a tabela de autoridade a ação é `deny` fora de `person`.
- **Só uma memória dita por ele** (`proof.byId === ele`). Memória de DM de outro membro: recusa (`NOT_YOURS`).
- Uma persona pode, no máximo, **sugerir** (cartão em Aprovações: "Bia sugere tornar do time: …"); quem decide é o dono. A sugestão fica para depois, não entra na v1.

## 2. Confirmação explícita, com a prévia do que vira público
Dois passos, o segundo só existe depois do primeiro:
1. `previewMemoryForTeam({ id })` devolve **o texto exato que a equipe vai ler** (o fato), a **linha de origem como ela vai aparecer** ("Você disse numa conversa privada com Bia, 11/11"), `textHash` (o hash do que o dono está vendo) e `blocked?` (ver §3). Nada é gravado.
2. `promoteMemoryToTeam({ id, text, previewHash, explicit: true })`: `previewHash` tem de ser o do registro **de agora** (o host relê e compara; se o registro mudou depois da prévia, recusa `preview-changed` e pede nova prévia). `text` é o que será publicado: o dono pode **editar o fato na prévia** e o texto editado passa pelos mesmos filtros do §3. (Revisado em 12/11 15:37, na implementação em staging: "texto igual ao da prévia" impedia editar; o hash trava a prévia velha e deixa o texto livre.)
- Palavras da confirmação (sem jargão, sem artigo para a persona): "Todas as personas vão passar a usar isto. Quem já usou não é desfeito." Botões "Tornar do time" e "Agora não".
- **A mensagem original da DM não sobe.** Hoje a prova guarda a mensagem inteira e a tela de Memória a mostra a todos. Na promoção, a citação pública passa a ser **o próprio fato** (o que o dono viu e aprovou); a mensagem inteira continua só na DM.
- Se a memória é **regra** (`constraint`, contexto obrigatório em todo turno), a prévia diz isso ("Vale em toda conversa de toda persona") e a promoção respeita o teto das regras da casa (`REQUIRED_CONTEXT_OVERFLOW`): estourou, recusa com o aviso do teto, sem promover pela metade.

## 3. O que nunca sobe
O host **recusa** (`blocked` na prévia e erro na promoção), sem depender de a tela esconder o botão:
- **Segredo**: o mesmo filtro de captura (`SECRET`: senha, token, chave de API, número longo), qualquer registro com `factKey` de segredo (`SECRET_FACT_KEYS`) e tudo que mora no Cofre (`connector:*`, `code:*`, entradas `cofre-*`). Texto: "Isto parece uma senha ou chave. Guarde no Cofre."
- **Dado de terceiros**: e-mail, telefone, CPF/CNPJ, cartão ou endereço de pessoa que não é o dono. Texto: "Tem dado de uma pessoa de fora. Tire o dado ou deixe no Cofre." O dono pode editar o texto na prévia e tentar de novo.
- Memória **já revogada**, **pendente** de aprovação ou **sem prova** (registro que não nasceu de um pedido do dono).
- O filtro é uma rede, não a fronteira: a fronteira é o dono ver o texto exato e confirmar.

## 4. Desfazer
- **Voltar a ser só da persona** ("Deixar só da Bia"): a mesma memória muda de visibilidade de volta para `persona`, com versão nova (o histórico guarda as duas). Vale para frente: quem já leu em algum turno não "desleu", e a confirmação já avisou.
- Esquecer (`forgetMemory`) continua valendo para a memória do time como para qualquer outra.

## 5. Trilha
- Um registro `memory_promotion` por mudança (promover e desfazer): `{ recordId, byId, at, fromPersonaId, direction: 'to-team' | 'to-persona', textShown }` (o texto exato que o dono viu).
- Na tela de Memória a linha da memória diz: "Virou do time em 12/11, por você (era só da Bia)". A mesma frase vira `Ver mais` para o histórico completo.
- Sem mensagem para as personas e sem mudança no canal; o efeito é só o que elas passam a ler.

## 6. Pergunta aberta para o Carbon (veredito antes de codar)
Hoje `listMemory` devolve as memórias `persona` com a citação inteira para **qualquer membro** que abra a tela de Memória do projeto. Num espaço com mais de uma pessoa (COLABORACAO-PESSOAS) isso já mostra a DM de um dono a colegas. Proposta: a listagem entrega uma memória `persona` **só ao autor** (`proof.byId`); os outros membros nem a veem. Sem isso, "Tornar do time" não adiciona privacidade, só convida um vazamento que já existe.

## 7. Aceite (testes vermelhos primeiro, quando for implementar)
host: dono promove (visibilidade `workspace`, citação pública = fato, original fica na DM) · persona/rotina/outro membro/memória alheia recusados · segredo, número longo e e-mail de terceiro recusados na prévia e na promoção · texto diferente do da prévia recusado · regra que estoura o teto recusada inteira · desfazer devolve a `persona` e a trilha tem as duas linhas · idempotente (promover duas vezes = uma). cliente: modal com a prévia exata e as duas frases do §2 · botão só para o dono e só em memória de DM dele · mostra o motivo do bloqueio com as palavras do §3.
