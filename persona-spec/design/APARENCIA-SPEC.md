# Configurações › Aparência (TH-1, Muse, 05/11)

**Por que na v1.1:** o tema noturno (luminária, vaga-lumes, vazios -noite) é uma das coisas que o Miguel mais pediu. Hoje ele só aparece se o Windows estiver no escuro. A pessoa tem de poder escolher.

## A aba
**Onde:** "Aparência", em Configurações, entre Importadores e Sobre (NAV-SPEC já a prevê).

**Ordem de cima para baixo:**

1. **Tema** (`ChoiceCards` em linha, 3 cartões com uma miniatura de 120 × 72 do app desenhada com os tokens, nunca uma captura):
   - **Sistema:** "Segue o claro ou o escuro do Windows." (padrão);
   - **Claro:** "Dia: papel creme e folhagem.";
   - **Escuro:** "Noite: a luminária acesa e os vaga-lumes."
   - **A troca é AO VIVO** (sem reiniciar). Usa o `install-color-scheme` do INST-3 (`body[data-ds-dark-theme="true"]` no escuro e o atributo REMOVIDO no claro) e persiste na preferência do host (`html[data-ds-theme-source]`).
   - O `PERSONA_THEME` (variável de ambiente, para testes) continua vencendo.
2. **Dicas de atalho** (`Switch`, ligado): "Mostrar uma dica quando houver um atalho mais rápido." (P1-11).
3. **Movimento:** nada aqui. O app segue o "reduzir movimento" do Windows, e não criamos uma segunda chave.

**A 960/200 %:** os 3 cartões do tema empilham.

## Textos (pt / en)
| chave | pt | en |
|---|---|---|
| appearance.title | Aparência | Appearance |
| appearance.theme | Tema | Theme |
| appearance.system | Sistema | System |
| appearance.systemHint | Segue o claro ou o escuro do Windows. | Follows Windows light or dark. |
| appearance.light | Claro | Light |
| appearance.lightHint | Dia: papel creme e folhagem. | Day: cream paper and leaves. |
| appearance.dark | Escuro | Dark |
| appearance.darkHint | Noite: a luminária acesa e os vaga-lumes. | Night: the lamp on and the fireflies. |
| appearance.shortcutTips | Dicas de atalho | Shortcut tips |
| appearance.shortcutTipsHint | Mostrar uma dica quando houver um atalho mais rápido. | Show a tip when there's a faster shortcut. |

## Dono e aceite
- **Dono:** Prism (o shell e o tema).
- **Aceite:**
  - captura no shell real das 3 escolhas;
  - a troca ao vivo (claro → escuro sem reiniciar) e a preferência mantida depois de reabrir;
  - 960/200 %, axe 0.
