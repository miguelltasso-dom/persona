# Gestor de equipe — limites / adversariais (Probe, MAESTRO.md)

| Case | Expected |
|---|---|
| always_ask + approved plan | apply writes |
| always_ask + no approval | deny |
| canGrantGestor=false + assign Gestor role | deny |
| proposed tools > gestor ceiling | deny |
| headcount at maxPersonas | deny |
| budget over cap | deny or approval |
| outside sector/project scope | deny |
| Gestor A vs Gestor B scope | no cross-scope |
| duplicate role conflict | propose / comment / human tie |
