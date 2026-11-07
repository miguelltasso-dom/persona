> **TENTATIVA 1+1 (05/11 06:46 UTC, ordem do Atlas, conector de teste): NOT-MEASURABLE POR INSTRUMENTAÇÃO — não é um resultado do modo `needed`.**
> Nenhuma resposta de modelo foi recebida: as duas tentativas terminaram em 2–3 s com 0 tokens (a cota da semana foi de 77% a 78% por outros usos). A causa foi achada depois, a custo zero (endpoint falso): a ferramenta nativa `ToolSearch` da CLI (que carrega o esquema adiado de um conector com muitas ferramentas) estava classificada como escrita pelo guarda de nível de ferramenta do produto e a persona `read` foi parada ("Ferramenta ToolSearch recusada no nível read") antes de chegar ao conector; e o script engolia a mensagem do erro. As duas coisas foram corrigidas (ver `contracts/needed-real-round.md`, "Tentativa 1+1"). O texto abaixo é o que o script gravou naquele momento, sem alteração.

# OPT-10b — rodada real do modo `needed`

**Veredito: NOT-MEASURABLE** — todas as chamadas falharam por motivo da CLI

Chamadas feitas: 2 (teto 3). Custo do conector medido no pré-voo: +0 tokens. Limite da maior requisição: 39432.

| item | passou | detalhe |
|---|---|---|

Escritas tentadas e recusadas pelo portão (achado de segurança): 0.
