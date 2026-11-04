# Valores de segredo em texto derivado

Core exporta `containsSecretValue(body:string):boolean` pela raiz e por import/index. É puro, não altera a origem e não grava nada. Detecta credencial reconhecível ou senha/chave/token com rótulo e valor não vazio em PT/EN, texto, Markdown e JSON. JSON estruturado/aninhado, rótulos escapados, atribuição vazia seguida por outra na mesma linha e plurais fazem parte dos testes.

`looksLikeSecret` conserva a política ampla de importação baseada também em palavras. Texto como Never send password pode continuar barrado nessa política de import; o consumidor de prompt usa o predicado de VALOR para preservar orientação sem segredo. Palavras Nunca/Never não dispensam uma atribuição real. Campo de política só é orientação quando o valor inteiro corresponde à orientação genérica conhecida; valor concreto no mesmo campo continua sensível.

O consumidor do host examina body, title e locator independentemente e omite os textos sensíveis da cópia usada no contexto/prompt, mantendo marca restricted e identidade/required. Marcar restricted sem retirar body não basta quando um compositor lê resumos diretamente. O registro original continua intacto. O helper não escolhe permissões nem amplia audiência.

O extrator de fatos do Report mantém o redator anterior e usa containsSecretValue em title/body/evidence antes do corte. Sua visão de detecção normaliza Unicode e retira controles ANSI via Node, sem alterar o Report original. Candidato sensível gera só index/reason secret, sem página/fallback genérico nem payload no diagnóstico. Guidance sem valor permanece elegível e a primeira entrega não extrai fatos.
