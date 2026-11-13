# Aceite do Marco Dogfood — roteiro do Miguel (uma noite, conferido pelo celular)

Rascunho do Probe (12/11 14:55), escrito contra os critérios 1–6 de `PLANO-COLHEITA.md`. Os nomes de tela entre colchetes podem mudar quando Prism/Muse fecharem M1/M6. Cada linha termina em PASSOU ou FALHOU; FALHOU leva um print e a hora.

## 0. Antes de dormir (no PC dedicado, ~10 min)

1. O app INSTALADO (não o de desenvolvimento) está aberto e anotei a versão: `______`. Hora de saída do PC: `____:____`.
2. Dois projetos REAIS, cada um com uma persona **responsável** definida (critério 1) e pelo menos 3 cartões na fila. Anotei quantos: A `__` · B `__`.
3. Um cartão de RISCO de propósito em cada projeto (por exemplo "mande um e-mail de teste para mim mesmo", "pague 1 centavo"): a persona deve PARAR no cartão de aprovação e não enviar nada sozinha.
4. Teto de turnos e de cota por projeto definidos; cota atual: `__ %`.
5. O PC não dorme (Configurações do Windows › Energia: nunca) e o Tailscale está conectado; anotei o endereço do PC na rede Tailscale: `______`.
6. Print de [Quem está cuidando de quê] antes de ir (é a foto "de antes").
7. Fui dormir sem mexer em mais nada. Nada de abrir o app no PC durante a noite.

## 1. De manhã, SÓ pelo celular (o PC fica como está)

| # | O que eu faço | O que eu espero ver | Critério |
|---|---|---|---|
| 1 | Abro o endereço Tailscale no celular e digito o código de pareamento | Entra no Persona do PC dedicado. Fora da rede Tailscale (Wi-Fi do vizinho, 4G sem Tailscale) NÃO abre | 5 |
| 2 | Abro [Quem está cuidando de quê] | Para cada projeto, numa tela só: a responsável, o que cada persona está fazendo agora, o que espera por mim | 6 |
| 3 | Abro cada projeto e olho o cabeçalho | O nome da responsável aparece no cabeçalho, no quadro e na Casa; trocar a responsável é 1 toque | 1 |
| 4 | Conto os cartões do quadro de cada projeto | Os cartões andaram sozinhos: menos na fila, mais em revisão/feito do que no print de antes; nenhum sumiu (a conta fecha com o que anotei na noite) | 2 |
| 5 | Abro o canal de cada projeto | Há UM resumo do dia por projeto, com feitos, andando e esperando por mim; só fala do projeto dele | 2 |
| 6 | Abro Aprovações | Os cartões de risco estão PARADOS esperando eu. Conferi a caixa de entrada: nenhum e-mail saiu, nenhum pagamento | 2 |
| 7 | Aprovo UM cartão de risco pelo gesto de segurar | Acontece exatamente uma vez (um e-mail, não dois) | 2 |
| 8 | Comparo os dois projetos | Nada do projeto A aparece no B, nem nome de cliente, nem cartão, nem resumo | 3 |
| 9 | Olho a cota de cada projeto | Respeitou o teto; se bateu 95%, diz "pausei: cota 95%" e não gastou mais | 2 |
| 10 | Olho o computador em [Estação] | Ligado a noite toda. Se reiniciou (atualização, queda), diz a hora em que voltou e os cartões continuaram de onde estavam, sem repetir entrega | 4 |

## 2. Se algo falhar

Tire print da tela inteira (com a hora do celular), anote o número da linha da tabela e a hora em que o PC voltou ou parou. Não mexa no PC antes de o Probe copiar o diagnóstico: o que ele precisa está nos registros da noite.

## 3. Veredito

- PASSOU: linhas 1 a 10 sem nenhum FALHOU. Anoto a data: `__/__`.
- FALHOU em qualquer linha: o marco não fecha; o Keel abre um item por linha com o print.

## 4. O que já foi provado ANTES (não precisa conferir à toa)

O soak com IA falsa (Gauge, relógio acelerado, 24 h simuladas; Probe, tempo real, 30 min com o host como processo) prova: sem travar, sem vazar memória nem processo, sem perder cartão, a cerca entre projetos e o teto/cota. Relatório: `packages/persona/persona-e2e/artifacts/marco-soak/<carimbo>/report.md`. O que o soak NÃO prova e por isso está neste roteiro: Windows dormindo, o app instalado voltando de uma queda, Tailscale de verdade, IA e cota reais, a tela do celular.
