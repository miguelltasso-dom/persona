# A primeira janela da Persona (abertura e primeiro uso)

Muse, 04/11. Implementação: Rivet (`apps/desktop`). Base: a splash e a tela de erro que já existem (galeria `27-rivet-splash`, `28-rivet-splash-error`). Texto: `design/MICROCOPY.md`.

## Por que este documento existe

Na revisão do primeiro uso instalado (pacote `dfe13272c6`, 04/11 06:45), a janela ficou **branca por 120 s**: sem splash, sem mensagem e sem saída. O onboarding nunca apareceu. A causa técnica já foi corrigida (perfil `persona` e fail-loud). Esta spec cuida do resto: nenhuma falha, presente ou futura, pode virar uma janela muda.

**Regra única: a janela sempre diz o que está acontecendo e sempre tem uma saída.**

## Estados e tempos

| Momento | O que a pessoa vê | Regra |
|---|---|---|
| 0 ms (janela criada) | Fundo de papel do tema | `BrowserWindow({ backgroundColor })` com `#faf3e4` no claro e `#1e1526` no escuro (`nativeTheme.shouldUseDarkColors`). Nunca `#fff` nem transparente sem conteúdo. |
| ≤ 300 ms | **Splash**: o símbolo, uma persona em pose `disponivel` e uma linha de status | HTML estático, CSS e imagens locais, sem script inline (o CSP do app bloqueia script inline e `eval`). Funciona sem o bundle do app. |
| 0–3 s | "Abrindo a Persona…" | — |
| 3 s em diante | "Chamando a equipe…" | Se o host expõe as fases do boot, a linha acompanha cada uma; senão, troca por tempo. |
| Só no 1º uso, 8 s em diante | Segunda linha: "Na primeira vez leva até um minuto." | Reduz a ansiedade (RCD: progresso visível). |
| App pintou o 1º quadro | Crossfade da splash para o app em 220 ms (`--ease-enter`) | O renderer avisa o 1º quadro (`persona:first-paint`); a splash nunca some antes disso. |
| Prazo estourado (20 s numa abertura normal, 60 s no 1º uso) ou erro do host | **Tela de erro** (a `28-rivet-splash-error`) | Ver abaixo. Nunca deixe a splash girando para sempre. |

**Reduced-motion:** a persona fica parada, sem respirar nem balançar, e as trocas viram um fade de 120 ms.

## Tela de erro do boot

- Arte: a persona com curativo, como já está.
- **Título:** "Não conseguimos abrir a Persona".
- **Corpo**, por causa, quando se sabe:
  - genérico: "Isso costuma se resolver tentando de novo. Se continuar, reinicie o computador.";
  - porta ou processo preso: "Outra cópia da Persona pode estar aberta. Feche-a e tente de novo.";
  - perfil corrompido: "Algo nos dados locais não abriu. Seus arquivos continuam salvos.".
- **Ação primária:** "Tentar de novo". Reinicia o host, não só a janela, e volta para a splash.
- **Secundárias:**
  - "Copiar diagnóstico" (como já está), que copia a versão, o código do erro e o caminho do log;
  - "Detalhes para o suporte", dobrado, com o código e a primeira linha do erro. Nunca uma stack como texto principal.
- O foco começa em "Tentar de novo". Enter aciona, e Esc não fecha a janela.

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| boot.opening | Abrindo a Persona… | Opening Persona… |
| boot.calling | Chamando a equipe… | Calling the team… |
| boot.firstRun | Na primeira vez leva até um minuto. | The first time can take up to a minute. |
| boot.error.title | Não conseguimos abrir a Persona | We couldn’t open Persona |
| boot.error.generic | Isso costuma se resolver tentando de novo. Se continuar, reinicie o computador. | Trying again usually fixes it. If it keeps happening, restart your computer. |
| boot.error.locked | Outra cópia da Persona pode estar aberta. Feche-a e tente de novo. | Another copy of Persona may be open. Close it and try again. |
| boot.error.profile | Algo nos dados locais não abriu. Seus arquivos continuam salvos. | Something in the local data didn’t open. Your files are still safe. |
| boot.retry | Tentar de novo | Try again |
| boot.copyDiag | Copiar diagnóstico | Copy diagnostics |
| boot.details | Detalhes para o suporte | Details for support |

## Não fazer

- Janela branca ou transparente sem conteúdo, mesmo por um quadro.
- Spinner sem palavras.
- Erro sem ação.
- Splash que depende do bundle do app (se o bundle falhar, a splash falha junto).
- "Reinicie o computador" como primeira sugestão.

## Aceite (Muse, com `.maestri/tmp/muse/first-run.mts`, perfil limpo, claro e escuro)

1. O 1º quadro capturado tem o fundo do tema, nunca branco.
2. A splash aparece em ≤ 500 ms.
3. O onboarding passo 1 aparece em ≤ 10 s numa abertura normal e em ≤ 60 s no 1º uso, na máquina de referência.
4. Com o host forçado a falhar (variável de ambiente de teste do Rivet), a tela de erro aparece dentro do prazo e "Tentar de novo" volta para a splash.
5. axe 0 na splash e na tela de erro.
6. Com reduced-motion, 0 animações infinitas.
