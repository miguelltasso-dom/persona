# Persona · landing page

Site estático de uma página: HTML, CSS e um JS pequeno, sem framework e sem build. Não tem deploy nem rastreador. Muse, 04/11.

- `index.html`: o conteúdo em pt-BR (fonte da verdade).
- `main.js`: troca para en (`?lang=en`, botão, ou língua do navegador) e alterna claro/escuro (`?theme=dark`, botão, ou o tema do sistema). Sem JS, a página fica completa em pt e segue o tema do sistema.
- `styles.css`: tokens dirD, os mesmos de `client-ui-persona/theme/persona-palette.css`.
- `assets/`: arte do Brush e capturas **reais** do app, geradas por `node apps/persona-site/scripts/prepare-assets.mjs`, rodado da raiz do repositório.

## Ver localmente

```sh
cd apps/persona-site && python -m http.server 4320
# http://127.0.0.1:4320  ·  ?lang=en  ·  ?theme=dark
```

Para atualizar as capturas: rode `node scripts/persona/design-shots.mjs overview card composer onboarding teach org150 "panel:Saúde" panel:Aprovações panel:Conexões "panel:Uso e limites"`, sempre sob o lock. Depois rode o `prepare-assets` de novo. Se faltar uma captura nova, o script avisa e usa a da galeria.

## Princípios (Revenue-Centric Design)

- **Hero:** diz o que o produto faz, para quem e com que resultado, e mostra prova visual real.
- **Uma ação primária** ("Baixar para Windows"), repetida no fim. "Ver como funciona" é um link, não um segundo botão.
- **Gatilho de clique** ao lado da ação: "Sem conta e sem cartão. Suas conversas ficam no seu PC."
- **Prova antes da promessa:** a Visão geral real aparece logo abaixo da dobra.
- **Leve:** cerca de 860 KB com todas as imagens. A dobra pesa menos de 450 KB, e o LCP local fica abaixo de 1 s.

Referências do refcat, só pela estrutura: Hotjar · Headers (captura de 11/07/2024), com uma ação, "No credit card required" e personagens com rótulo de função; Airtable · Headers (captura de 27/11/2024), com texto à esquerda e equipe ilustrada à direita.

## A confirmar antes de publicar (marcado com o selo tracejado "a confirmar")

- [ ] Preço: "Grátis e open source", e a licença final do fork.
- [ ] Link do instalador: o botão aponta para `#baixar` e tem `data-tbd="installer-url"`.
- [ ] Requisitos: "Windows 10 ou 11, 64 bits".
- [ ] Repositório público: `https://github.com/miguelltasso-dom/persona`.
- [ ] Capturas em inglês: hoje as capturas mostram a interface em pt, inclusive com `?lang=en`.
- [ ] Domínio, imagem de compartilhamento (`og:image` usa o hero) e favicon final.
