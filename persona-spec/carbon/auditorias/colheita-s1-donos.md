# colheita-s1: quem corrige o quê (Keel, 12/11 03:30)

Auditoria: `colheita-s1.md` (BLOQUEADO: 14 P0, 12 P1, 3 P2). Regras do Atlas: (1) sprint de correção, ninguém começa item novo com P0/P1 aberto no seu item; (2) REPRODUZA ANTES DE CORRIGIR: teste vermelho primeiro, depois verde; se não reproduzir, responda com a evidência em `colheita-s1-respostas.md`; (3) ordem: vazam segredo/acesso (P0-02, 03, 04, 07, 09, 13, 14), depois perdem dado (P0-06, 08, 10), depois o resto; (4) quando os P0 fecharem: snapshot de correção e `carbon-audit --snapshot colheita-s1-fix --base 0167f7d029`; (5) rodada real do Probe SUSPENSA até P0-05, 06, 07 e P1-01 reauditados.

Donos com teto de US$ 5 estourado (Cobalt, Jade, Onyx, Zinc) voltam à meia-noite; o que era deles foi redistribuído a agentes Claude e eles revisam amanhã.

| # | Gravidade | Resumo | Dono | Apoio |
|---|---|---|---|---|
| P0-01 | P0 | persona-components não monta no Loader (export default), tsconfig.host.json sem reference, extract-zip x yauzl no prepare-dsh | Keel | Cobalt (extract-zip -> fflate, amanhã) |
| P0-02 | P0 vaza segredo | browser_login: SecretMask.redact sem chamador; tools read leem corpo de POST; vigia de URL | Lumen | Probe (it.fails vira verde) |
| P0-03 | P0 vaza acesso | authority routine/unattended nunca chega ao gate; viaEmail perdido no handoff | Lumen (authority) + Flint (viaEmail transitivo) | |
| P0-04 | P0 vaza acesso | bypass de command-policy (-Param:Valor, espaço, .git/hooks, segredos Win32, Grep), OAR_CODEX_SANDBOX global, opencode sem "*":"deny" | Tally | Lumen (tabela) |
| P0-05 | P0 | pool reusa runner com gate fechado; warmRunners mantém Chrome após revogar; lease vaza | Forge | |
| P0-06 | P0 perde dado | steer/whenIdle: wrappers não repassam steer; mensagem some / fecha MCP do turno ativo | Flint | Zinc revisa amanhã |
| P0-07 | P0 vaza acesso | withThreadResume shared: histórico entre DMs, canais, /lado | Forge | |
| P0-08 | P0 perde dado | reserva 95%: responder rápido apaga pedidos retidos | Rivet | |
| P0-09 | P0 vaza segredo | Cofre: id colide com connector:*, migração deixa revoked/versões, export ZIP, connector-policy read | Anvil | Zinc revisa amanhã |
| P0-10 | P0 | Segure/Editar/Desfazer: TypeError ao editar, unwrapRemote, cartões mortos em DM/Aprovações, campos ocultos | Prism | |
| P0-11 | P0 | IMAP: injeção CRLF em quote(), OOM em BODY.PEEK[], From: por includes | Rivet | Jade revisa amanhã |
| P0-12 | P0 | processos órfãos no Windows (dispose, closeAll no shutdown, taskkill, listeners error) | Bolt | Cobalt/Onyx revisam amanhã |
| P0-13 | P0 | ACL de @Remote: teste cego a async, owner em cofre/browser/station, pairStation sem lockout, ensureVoiceModel | Tally | Gauge (teste) |
| P0-14 | P0 | E2EE: framing do AAD, chave de ordem baixa, remote-team ainda manda { clear } | Bolt | |
| P1-01 | P1 | turn-close: perguntou=espera ignorado, ferramenta negada vira prova, <details> esconde ?, finishReply sem runTurnClose | Anvil | Bolt |
| P1-02 | P1 | item 12: ingest sem backgroundWork.run; colisão com steer/noteBusy/warmRunners | Forge | |
| P1-03 | P1 | balão digitando preso (failReply/finishStopped não liquidam o partial) | Anvil | |
| P1-04 | P1 | ask_vault_code e browser_login filtrados das personas padrão; cartão 2FA sem uso | Lumen | |
| P1-05 | P1 | voz/sons fora das telas, CSP/permissão media no Electron, mic preso | Quill | Cobalt revisa amanhã |
| P1-06 | P1 | cartão Continuar some >277 chars; /s+/ sem barra; shapeSpeech corrompe [[escolha]]/[[indicador]]; duplo clique | Flint | Anvil (speech) |
| P1-07 | P1 | split-chain/ask_colleague presos ao Parar/Descartar; keepEntrega sobrescreve | Forge | |
| P1-08 | P1 | Seus números: tempestade de IA a cada 60 s, 'updating' órfão, alertas invisíveis | Rivet | |
| P1-09 | P1 | ligar assinatura: active_account não gravado, modal vazio, 'partial' congela | Tally | |
| P1-10 | P1 | fachadas: Estação sem admitTurn, perfis de navegador, conversa da tarefa, Regras, 'Receber de' invertido | Prism | Onyx revisa amanhã |
| P1-11 | P1 | CSV trim da senha, Ficha apaga resumo, skills learned, memórias de DM no perfil, DM sem estado | Anvil | Quill (UI) |
| P1-12 | P1 | silêncio em UTC (deslocado 3 h), scheduler sem relógio do host | Flint | |
| P2-01 | P2 | jargão e colisão Cofre x Memória | Quill + Prism | depois |
| P2-02 | P2 | .red.ts na suíte, testes ocos, persona-assets fora do git, eval sem --strict | Gauge + Probe | depois |
| P2-03 | P2 | cleanroom pontos cegos, randomUUID, runtime-file-policy | Gauge, Quill, Keel | depois |

Fila por dono (ordem de ataque): **Lumen** P0-02, P0-03a, P1-04 | **Tally** P0-04, P0-13, RED-1/2 (Gauge), P1-09 | **Forge** P0-05, P0-07, P1-07, P1-02 | **Flint** P0-06, P0-03b, P1-06, P1-12 | **Rivet** P0-08, P0-11, P1-08 | **Prism** P0-10, P1-10 | **Bolt** P0-14, P0-12 | **Anvil** P0-09, P1-01, P1-03, P1-11 | **Quill** P1-05, P2-01 | **Keel** P0-01.
