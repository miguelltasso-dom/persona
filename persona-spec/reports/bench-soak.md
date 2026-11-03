# Soak 7 dias (relógio falso)

7 dias × 3 projetos × 5 personas. Semente `0x50A7`. Memória no engine; Anvil: `defineSoakSuite` + SQLite (`persona-spec/contracts/soak.md`).

Reinícios do host: 10. Saltos: zone-America/Sao_Paulo, laptop-sleep-8h, user-tz-America/Sao_Paulo→Europe/Lisbon, dst-Europe/Lisbon-spring, dst-Europe/Lisbon-fall.

| métrica | valor |
|---|---:|
| Tarefas criadas | 3 |
| Tarefas perdidas | 0 |
| Tarefas duplicadas | 0 |
| Triggers processados | 258 |
| Triggers repetidos (recusados) | 168 |
| Orçamento ultrapassado | 0 |
| Intervalo proposta início (h) | 4.80 |
| Intervalo proposta fim (h) | 6.73 |
| Eventos/dia | 131.6 |
| Tokens/dia (proxy) | 3360 |
| Bytes início | 123 |
| Bytes fim | 5418 |
| Retenção viva pico | 144 |
| Retenção viva fim | 144 |
| Outbox fim | 0 |

Invariantes: nenhuma Tarefa perdida/duplicada; trigger repetido recusado (168); orçamento nunca negativo; retenção viva estável no pico (144); taxa de aceitação caiu → intervalo 4.80 → 6.73.
