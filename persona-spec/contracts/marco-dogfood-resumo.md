# Contrato — o resumo do dia da responsável (Marco Dogfood M2; Anvil, 12/11/2026)

**Proposta para o Flint implementar** (laço, cobrança e resumo são dele, PLAN §13 M2). Desenho de CONTEÚDO, TOM e PRIVACIDADE; o laço do quadro e o campo "responsável" (M1) são dele. Critério do marco (PLANO-COLHEITA, item 2): "ao fim do dia, a responsável posta um resumo no canal do projeto". Eu me ofereço para escrever o compositor puro (`day-summary.ts`) e seus testes, se o Flint preferir tocar só o gancho do laço.

## 1. O que é e onde mora
- **Uma mensagem por projeto por dia local**, no canal do projeto, com o autor = a persona RESPONSÁVEL (não uma linha "da equipe"). Id estável `day-summary-<projeto>-<AAAA-MM-DD local>`: reiniciar o host no meio da noite não posta duas vezes.
- **Nunca é memória.** É uma mensagem do canal (histórico). Não cria registro do Cofre de memória (senão cada dia incharia o contexto obrigatório e um resumo seria relido como fato). Ela LÊ a memória do time (§2.5), não a escreve.
- **Montado pelo host, sem modelo.** O texto sai de fatos estruturados (títulos, contagens, estados) por um modelo de frases fixo: testável, sem custo de cota, sem fala do modelo no meio (nada do que ela disse num turno entra). A pausa aos 95% não impede o resumo (não gasta turno).
- **"Fim do dia" = relógio LOCAL da máquina** (`localOffsetMinutes`, o mesmo da Janela de silêncio e do Playbook; nunca UTC). O dia coberto é o dia local que acabou.

## 2. O que entra (só deste projeto, só o que qualquer membro do canal pode ler)
1. **Ficou pronto hoje** — cartões que chegaram a "feito" no dia: título real + quem fez (nome da persona). Até 3 títulos; o resto vira "e mais N" (a lista cheia vai na dobra, §4).
2. **Está andando** — o que está em "fazendo"/"revisão" agora, em uma linha por pessoa que trabalha, só com o título.
3. **Espera você** — o que pede uma decisão do dono: cartão de aprovação, pergunta aberta, revisão. Cada item na pergunta em palavras simples ("Posso mandar o orçamento ao cliente?"), nunca o id do cartão nem o nome da ferramenta. O mais antigo primeiro.
4. **Travou ou foi cobrado** — cartão que não andou no dia e o motivo em uma frase; quem foi cobrado.
5. **O que o time aprendeu hoje (memória do time)** — SÓ memória de escopo `team` guardada no dia (o que o dono pediu para lembrar no canal), regras da casa novas e "virou skill" aceito; uma linha, nunca o texto completo de uma regra longa. Memória de DM (`persona`) NUNCA entra, nem como contagem.
6. **Aviso de teto** — se o projeto pausou por cota ou teto de turnos: uma frase ("A cota de hoje está quase no fim; segurei cartões novos até amanhã").
7. **Amanhã** — opcional: os 1 a 3 primeiros cartões da fila que ela puxa primeiro.

## 3. O que NUNCA entra
- **Segredo**: nada do Cofre (senha, token, chave, CNPJ, número longo); todo título e toda frase passam pelo mesmo filtro de segredo da captura de memória (`SECRET`) e por `redactText`. Título que casa vira "um cartão com dado protegido". O resumo é montado de campos estruturados, nunca de relatório de turno cru.
- **Conversa privada**: Tarefa nascida de DM, mensagem de DM, memória de DM, quem falou com quem. O post vai para TODOS os membros do canal, então é calculado para o leitor MENOS privilegiado: a visão de "membro que não está em nenhuma DM" (`ticketSeenByActor`, `dm-ticket-view.ts`). Cartão de DM NÃO aparece (nem como "Tarefa de uma conversa privada", nem em contagem: o título mascarado do quadro basta, o resumo não revela que existiu). O dono, na DM, vê o resto no "Enquanto você estava fora" dele (já mascarado por sessão, P1-DM-2).
- **Outro projeto**: nada que não seja do quadro deste projeto (a cerca do M3; a responsável A nunca resume o quadro B).
- **Cozinha técnica**: caminho de arquivo, código de erro, id, hash, nome de ferramenta, nota interna do fim de turno, número de turno, valor em dinheiro da cota. O que for técnico e necessário vai para a dobra "Detalhes" (§4), nunca no texto visível.

## 4. Tom (fala simples, nunca jargão)
- **Fala simples do dono** (`speech.ts`): texto visível ≤ 100 palavras (`VISIBLE_WORD_LIMIT`); o que passar disso vai numa dobra `<details>` "Detalhes" (≤ 300). Verbos no passado curto, frases curtas, "você" para o dono, nada de "o usuário".
- **Vocabulário do produto**: "cartão", "quadro", "pronto", "andando", "espera você", "equipe". **Proibido** no texto visível: ticket, task, run, turno, runner, gate, token, deploy, branch, commit, hook, payload, fila de admissão, SLA, backlog, "pipeline". (Teste: lista fechada no spec.)
- **Persona sem gênero**: o produto não guarda gênero; verbos na 1ª pessoa neutra ("puxei", "cobrei", "segurei"), sem adjetivo/particípio que concorde com ela ("satisfeita", "cansada"), sem artigo antes do nome ("Bia entregou", não "a Bia").
- **Sem teatro**: nada de saudação longa, emoji, "Bom trabalho, equipe!", nem elogio. A primeira linha diz o dia em uma frase ("Hoje o quadro andou: 3 cartões ficaram prontos.").
- **Repetição**: item que continua esperando o dono e não mudou desde ontem vira UMA linha de contagem ("Continuam esperando você: 2"), com detalhe só no primeiro dia.

## 5. Direito ao silêncio
- **Dia sem nada** (nenhum cartão pronto, andando ou esperando e nenhuma cobrança): NÃO posta. Fica uma linha no registro de atividade do host (`quiet-day`), nunca no canal. Nada de "Sem novidades hoje" (essa frase é do fecho de Tarefa, não do canal).
- **Janela de silêncio** do dono: o post espera o fim da janela (`silenceUntilOf`, no fuso local) e só então sai; não acorda ninguém de madrugada.
- **Pausa da equipe ou da persona responsável** ("Pausada"): não posta; registra e retoma no dia seguinte (o dia pausado não vira resumo atrasado de dois dias).
- **Já houve um post do dia** (id existente): não repete, nem se o host reiniciar.

## 6. Aceite (testes vermelhos primeiro, Flint/Gauge)
1. 2 projetos com cartões próprios: cada canal recebe SÓ o seu resumo (marca única de cada quadro; nenhuma do outro).
2. Marcas que NUNCA aparecem no texto, na dobra nem nos metadados: um título com segredo ("senha do wifi é padaria123"), um cartão nascido de DM (`FESTA-SURPRESA-…`), uma memória de DM, o id de um registro.
3. Dia sem movimento: nenhuma mensagem no canal e uma linha de atividade; dia com 1 cartão pronto: 1 mensagem.
4. Dia local: às 23:30 em UTC-3 (02:30Z do dia seguinte) o resumo cobre o dia local que acabou; idempotente depois de reiniciar o host.
5. Janela de silêncio 22h–8h: sai às 8h, não às 23h30. Persona responsável pausada: não sai.
6. Tom: ≤ 100 palavras visíveis, nenhuma palavra da lista proibida, nenhum caminho/id/hash, sem artigo antes do nome, sem concordância de gênero; a dobra existe quando a lista passa do limite.
7. "Espera você": a pergunta em palavras simples; o mesmo item inalterado no dia seguinte vira só a contagem.
8. Não é memória: depois do resumo o Cofre de memória não ganha registro algum.
9. Pausa por teto/cota (95%): a frase do §2.6 aparece e o resumo sai mesmo assim.

## 7. Dependências
M1 (campo "responsável" no projeto: Flint) · dados do quadro e da fila (Forge/Flint) · `ticketSeenByActor`, `shapeSpeech`/`speech.ts`, `silenceUntilOf`, `localOffsetMinutes` (já existem) · o "Tornar do time" (memória de DM → equipe) é independente: só depois do veredito do Carbon; quando existir, a memória promovida passa a contar em §2.5 como qualquer memória do time.
