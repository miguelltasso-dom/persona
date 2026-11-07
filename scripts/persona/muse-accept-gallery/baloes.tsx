// Muse: chat bubbles (Miguel 04/11: "as respostas dos agentes dentro de um balão e as minhas também, como o grokbot").
// Person = lilac bubble on the right; persona = cream card bubble on the left, with the "speaking" corner near the face.
// Same-author runs are grouped; markdown/table/code live inside the bubble with internal scroll; structured cards
// (question, plan, preview, team replies) stay cards, never a bubble inside a bubble. Not shipped.
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Avatar } from '../../../packages/persona/client-ui-persona/src/client/primitives/Avatar.tsx'
import { UiIcon } from '../../../packages/persona/client-ui-persona/src/client/primitives/icons.tsx'
import { AVATAR_96 } from '../../../packages/persona/client-ui-persona/src/client/assets/generated-imports.ts'
import { ConversasSidebar } from './conversas.tsx'

const face = (id: string): string => (AVATAR_96 as Record<string, string>)[id] ?? ''
const ink = 'var(--persona-ink)'
const soft = 'var(--persona-ink-soft)'
const TEXT = '500 15px/23px var(--persona-font-text)'

/** A tiny leaf peeking out of the first bubble of a persona run: decoration outside the text, aria-hidden. */
function Sprig(): ReactNode {
  return (
    <svg aria-hidden="true" width="22" height="16" viewBox="0 0 22 16" style={{ position: 'absolute', top: -9, right: 14, color: 'var(--persona-success)' }}>
      <path d="M2 14C6 6 12 3 20 2c-2 6-7 11-18 12Z" fill="currentColor" opacity=".55" />
      <path d="M3 13c5-4 9-7 15-9" fill="none" stroke="var(--persona-outline)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function PersonaRun({ who, role, time, children }: { readonly who: string; readonly role: string; readonly time: string; readonly children: readonly ReactNode[] }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, margin: '16px 0', alignItems: 'flex-start' }}>
      <Avatar name={who} src={face(who.toLowerCase())} size={32} shape="portrait" decorative />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ font: '800 13px/18px var(--persona-font-text)', color: ink, marginBottom: 6 }}>{who} <span style={{ fontWeight: 600, color: soft }}>· {role} · {time}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>{children}</div>
      </div>
    </div>
  )
}

/** Persona bubble; `pos` shapes the corners of a grouped run (the corner near the face stays tight). */
function PBubble({ children, pos, sprig, wide }: { readonly children: ReactNode; readonly pos: 'single' | 'first' | 'middle' | 'last'; readonly sprig?: boolean; readonly wide?: boolean }): ReactNode {
  const r = 18
  const tl = pos === 'single' || pos === 'first' ? 6 : 6
  const bl = pos === 'last' || pos === 'single' ? r : 6
  return (
    <div data-lit="" style={{ position: 'relative', maxWidth: wide ? 'min(100%, 860px)' : 'min(100%, 680px)', padding: '10px 14px', background: 'var(--persona-card)', border: '1.5px solid var(--persona-outline-soft)', borderRadius: `${tl}px ${r}px ${r}px ${bl}px`, color: ink, font: TEXT, boxShadow: '0 1px 0 var(--persona-outline-soft)' }}>
      {sprig === true && <Sprig />}
      {children}
    </div>
  )
}

function MeBubble({ children, time }: { readonly children: ReactNode; readonly time: string }): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', margin: '16px 0' }}>
      <div data-lit="" style={{ maxWidth: 'min(80%, 600px)', padding: '10px 14px', background: 'var(--persona-wash-strong)', border: '1.5px solid var(--persona-outline-soft)', borderRadius: '18px 18px 6px 18px', color: ink, font: TEXT }}>{children}</div>
      <span style={{ font: '600 11px/16px var(--persona-font-text)', color: soft, marginTop: 3 }}>Você · {time}</span>
    </div>
  )
}

const th: CSSProperties = { textAlign: 'left', padding: '6px 10px', font: '800 11px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: soft, borderBottom: '1px solid var(--persona-outline-soft)' }
const td: CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--persona-outline-soft)', whiteSpace: 'nowrap' }

function Dm(): ReactNode {
  return (
    <>
      <MeBubble time="14:02">Pesquise os preços dos concorrentes da padaria e me diga onde estamos caros.</MeBubble>
      <PersonaRun who="Nina" role="Pesquisa" time="14:05">
        {[
          <PBubble key="a" pos="first" sprig>Achei 3 concorrentes no bairro. Estamos <b>mais caros no pão francês</b> e mais baratos nos bolos.</PBubble>,
          <PBubble key="b" pos="middle" wide>
            <div style={{ overflowX: 'auto', margin: '2px -4px' }}>
              <table style={{ borderCollapse: 'collapse', font: '500 14px/20px var(--persona-font-text)', color: ink, minWidth: 520 }}>
                <thead><tr><th style={th}>Produto</th><th style={{ ...th, textAlign: 'right' }}>Nós</th><th style={{ ...th, textAlign: 'right' }}>Pão Dourado</th><th style={{ ...th, textAlign: 'right' }}>Casa Trigo</th><th style={{ ...th, textAlign: 'right' }}>Vovó Rita</th></tr></thead>
                <tbody>
                  {[['Pão francês (kg)', 'R$ 14', 'R$ 12', 'R$ 12,50', 'R$ 13'], ['Bolo de cenoura', 'R$ 30', 'R$ 34', 'R$ 36', 'R$ 32'], ['Café coado', 'R$ 6', 'R$ 6', 'R$ 7', 'R$ 5,50']].map(row => (
                    <tr key={row[0]}>{row.map((c, i) => <td key={c + i} style={{ ...td, textAlign: i === 0 ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PBubble>,
          <PBubble key="c" pos="last">Sugestão: baixar o pão francês para <b>R$ 12,90</b>. Quer que eu atualize o cardápio?</PBubble>,
        ]}
      </PersonaRun>
      <MeBubble time="14:07">Pode atualizar. E me mande o comando do relatório.</MeBubble>
      <PersonaRun who="Nina" role="Pesquisa" time="14:08">
        {[
          <PBubble key="d" pos="first" wide>
            Para rodar o relatório:
            <div style={{ marginTop: 8, borderRadius: 10, background: 'var(--persona-paper-sunken)', border: '1px solid var(--persona-outline-soft)', overflow: 'hidden' }}>
              {/* the copy action lives in its own header row: it never covers the code */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--persona-outline-soft)', font: '700 12px/18px var(--persona-font-text)', color: soft }}>
                <span>terminal</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UiIcon name="copy" size={13} />Copiar</span>
              </div>
              <div style={{ padding: '8px 12px', overflowX: 'auto' }}><code style={{ font: '500 13px/20px var(--persona-font-mono)', whiteSpace: 'pre', color: ink }}>npm run relatorio -- --semana 45 --formato planilha</code></div>
            </div>
          </PBubble>,
          <PBubble key="e" pos="last">Atualizando o cardápio agora<span style={{ display: 'inline-block', width: 8, height: 16, marginLeft: 3, verticalAlign: '-3px', background: 'var(--persona-accent)', borderRadius: 2 }} /></PBubble>,
        ]}
      </PersonaRun>
    </>
  )
}

function Channel(): ReactNode {
  const team = [['Bia', 'tamandua', 'Redação', 'Faço os 3 textos hoje à tarde, no tom das últimas promoções.'], ['Téo', 'cervo', 'Design', 'Posso usar as fotos dos bolos da semana passada nas artes.'], ['Gabi', 'raposa', 'Anúncios', 'Sugiro impulsionar só o post de sexta, que vende mais.']] as const
  return (
    <>
      <MeBubble time="10:12">Preciso de 3 posts para a promoção de dezembro. O que vocês acham?</MeBubble>
      {/* the "Toda a equipe" block is a card, not a bubble (no bubble inside a bubble) */}
      <div data-lit="" style={{ margin: '16px 0 16px 42px', maxWidth: 680, padding: 14, borderRadius: 'var(--persona-radius-l)', background: 'var(--persona-card)', border: 'var(--persona-border-width) solid var(--persona-outline)', boxShadow: 'var(--persona-shadow-sticker)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', font: '800 11px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--persona-brand)', marginBottom: 8 }}>
          <span>Respostas da equipe de Marketing</span><span style={{ color: soft }}>3 de 4 responderam</span>
        </div>
        {team.map(([n, a, r, t]) => (
          <div key={n} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--persona-outline-soft)' }}>
            <Avatar name={n} src={face(a)} size={24} shape="portrait" decorative />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ font: '800 13px/18px var(--persona-font-text)', color: ink }}>{n} <span style={{ fontWeight: 600, color: soft }}>· {r}</span></b>
              <div style={{ font: '500 14px/20px var(--persona-font-text)', color: ink }}>{t}</div>
            </div>
            <span style={{ font: '700 12px/18px var(--persona-font-text)', color: 'var(--persona-brand)' }}>Ler tudo</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--persona-outline-soft)', paddingTop: 8, font: '600 12px/16px var(--persona-font-text)', color: soft }}>Lia ainda está escrevendo…</div>
      </div>
      <PersonaRun who="Atlas" role="Coordenação" time="10:14">
        {[<PBubble key="x" pos="single" sprig>Juntei as ideias: a Bia escreve, o Téo faz as artes e a Gabi impulsiona o de sexta. Criei os 3 cartões no quadro de Marketing.</PBubble>]}
      </PersonaRun>
    </>
  )
}

/*
 * Atlas/Miguel experiment (dark only): the warm light of the rail lamp spills into the chat from the bottom-left.
 * The light lives ONLY on the background layer (aria-hidden, behind everything); every bubble keeps its solid fill, so
 * text contrast is the same as without the light. Bubbles closer to the lamp get a warmer rim on the side facing it and
 * a shadow cast away from it (up-right). --lit (0..1) is computed once per layout from the distance to the lamp.
 * Breathing: 14 s opacity .9 ↔ 1, off with prefers-reduced-motion. Light theme: nothing changes.
 */
const LAMP_CSS = `
.muse-lamp-layer { display: none; }
body[data-ds-dark-theme="true"] .muse-lamp-layer {
  display: block; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(1150px 780px at -110px 93%, rgb(242 186 110 / .30), rgb(242 186 110 / .13) 34%, rgb(242 186 110 / .04) 58%, transparent 74%),
    radial-gradient(115% 105% at 10% 92%, transparent 42%, rgb(8 4 12 / .55));
  animation: muse-lamp-breathe 14s ease-in-out infinite alternate;
}
@keyframes muse-lamp-breathe { from { opacity: .9; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { body[data-ds-dark-theme="true"] .muse-lamp-layer { animation: none; } }
body[data-ds-dark-theme="true"] [data-lamp] [data-lit] {
  border-left-color: color-mix(in srgb, #f2c27a calc(var(--lit, 0) * 80%), var(--persona-outline-soft)) !important;
  border-bottom-color: color-mix(in srgb, #f2c27a calc(var(--lit, 0) * 80%), var(--persona-outline-soft)) !important;
  box-shadow: calc(2px + var(--lit, 0) * 5px) calc(-1px - var(--lit, 0) * 4px) calc(10px + var(--lit, 0) * 10px) rgb(6 3 10 / calc(.28 + var(--lit, 0) * .3)) !important;
}
`

/** Sets --lit on every [data-lit] element from its distance to the lamp (bottom-left of the chat). */
function useLampLight(on: boolean): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!on || root === null) return undefined
    const apply = (): void => {
      const box = root.getBoundingClientRect()
      const lamp = { x: box.left - 110, y: box.top + box.height * 0.93 }
      const reach = Math.hypot(box.width, box.height) * 0.85
      for (const el of root.querySelectorAll<HTMLElement>('[data-lit]')) {
        const r = el.getBoundingClientRect()
        const d = Math.hypot(r.left + Math.min(r.width, 160) / 2 - lamp.x, r.top + r.height / 2 - lamp.y)
        el.style.setProperty('--lit', Math.max(0, Math.min(1, 1 - d / reach)).toFixed(2))
      }
    }
    apply()
    window.addEventListener('resize', apply)
    return () => { window.removeEventListener('resize', apply) }
  }, [on])
  return ref
}

export function BaloesPrototype({ state, lamp = false }: { readonly state: 'dm' | 'channel'; readonly lamp?: boolean }): ReactNode {
  const sectionRef = useLampLight(lamp)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '296px minmax(0, 1fr)', height: '100vh', background: 'var(--persona-paper)' }}>
      <ConversasSidebar many={state === 'channel'} dm={state === 'dm'} />
      <section ref={sectionRef} data-lamp={lamp ? '' : undefined} style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {lamp && <><style>{LAMP_CSS}</style><div className="muse-lamp-layer" aria-hidden="true" /></>}
        <header style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--persona-outline-soft)' }}>
          {state === 'dm' ? <Avatar name="Nina" src={face('nina')} size={40} shape="portrait" decorative />
            : <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--persona-paper-sunken)', font: '800 20px/1 var(--persona-font-text)', color: soft }}>#</span>}
          <span style={{ flex: 1 }}>
            <b style={{ display: 'block', font: '700 20px/26px var(--persona-font-display)', color: ink }}>{state === 'dm' ? 'Nina' : 'marketing'}</b>
            <span style={{ font: '600 13px/18px var(--persona-font-text)', color: soft }}>{state === 'dm' ? 'Pesquisa · age com as suas permissões · Sugere e espera' : 'A equipe de Marketing · 4 personas'}</span>
          </span>
        </header>
        <div style={{ position: 'relative', zIndex: 1, flex: 1, padding: '4px 24px', overflow: 'hidden' }}>{state === 'dm' ? <Dm /> : <Channel />}</div>
        <div data-lit="" style={{ position: 'relative', zIndex: 1, margin: '0 16px 16px', padding: '12px 14px', borderRadius: 'var(--persona-radius-l)', background: 'var(--persona-card)', border: 'var(--persona-border-width) solid var(--persona-outline)' }}>
          <div style={{ font: '500 15px/22px var(--persona-font-text)', color: soft }}>{state === 'dm' ? 'Mensagem para Nina · ela sugere e espera você' : 'Mensagem em #marketing… (@ chama alguém)'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {(['plus', 'image', 'attach', 'smile', 'at'] as const).map(icon => (
              <span key={icon} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1.5px solid var(--persona-outline-soft)', color: ink, background: 'var(--persona-card)' }}><UiIcon name={icon} size={16} /></span>
            ))}
            {/* In a channel the "Quem responde" chip is always there; only the DM drops it (the persona is the one answering). */}
            {state === 'channel' && (
              <>
                <span style={{ width: 1, height: 22, background: 'var(--persona-outline-soft)', margin: '0 2px' }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, border: '1.5px solid var(--persona-outline-soft)', font: '700 13px/18px var(--persona-font-text)', color: ink }}>
                  Quem responde <Avatar name="Atlas" src={face('atlas')} size={24} shape="portrait" decorative />Coordenação<UiIcon name="chevronDown" size={14} />
                </span>
              </>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--persona-accent)', color: 'var(--persona-accent-ink)' }}><UiIcon name="send" size={18} /></span>
          </div>
        </div>
      </section>
    </div>
  )
}
