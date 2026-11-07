// Muse: prototypes from the Lodi harvest (Miguel 04/11). A(1) = a structured question inside the thread (chips,
// single and multiple choice, answered state, free text always possible). D = a persona sticker with a live-text
// caption (never text baked into the art). Uses the one-lilac-bar shell from conversas.tsx. Not shipped.
import type { CSSProperties, ReactNode } from 'react'
import { Avatar } from '../../../packages/persona/client-ui-persona/src/client/primitives/Avatar.tsx'
import { Chip } from '../../../packages/persona/client-ui-persona/src/client/primitives/Chip.tsx'
import { UiIcon } from '../../../packages/persona/client-ui-persona/src/client/primitives/icons.tsx'
import { AVATAR_96, STICKERS } from '../../../packages/persona/client-ui-persona/src/client/assets/generated-imports.ts'
import { ConversasSidebar } from './conversas.tsx'

const face = (id: string): string => (AVATAR_96 as Record<string, string>)[id] ?? ''
const ink = 'var(--persona-ink)'
const soft = 'var(--persona-ink-soft)'

function Header({ mode }: { readonly mode: string }): ReactNode {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--persona-outline-soft)' }}>
      <Avatar name="Atlas" src={face('atlas')} size={40} shape="portrait" decorative />
      <span style={{ flex: 1 }}>
        <b style={{ display: 'block', font: '700 20px/26px var(--persona-font-display)', color: ink }}>Atlas</b>
        {/* B: the mandate in the header, clickable */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 13px/18px var(--persona-font-text)', color: soft }}>
          Coordenação · age com as suas permissões ·
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999, border: '1.5px solid var(--persona-outline-soft)', color: ink }}><UiIcon name="lock" size={12} />{mode}</span>
        </span>
      </span>
    </header>
  )
}

function Msg({ children, me, time }: { readonly children: ReactNode; readonly me?: boolean; readonly time: string }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: me ? 'flex-end' : 'flex-start', margin: '14px 0' }}>
      {me !== true && <Avatar name="Atlas" src={face('atlas')} size={32} shape="portrait" decorative />}
      <div style={{ maxWidth: 640 }}>
        {me !== true && <div style={{ font: '800 13px/18px var(--persona-font-text)', color: ink, marginBottom: 4 }}>Atlas <span style={{ fontWeight: 600, color: soft }}>{time}</span></div>}
        {me === true
          ? <div style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--persona-wash)', border: '1.5px solid var(--persona-outline-soft)', color: ink, font: '500 15px/22px var(--persona-font-text)' }}>{children}</div>
          : <div style={{ color: ink, font: '500 15px/22px var(--persona-font-text)' }}>{children}</div>}
      </div>
    </div>
  )
}

const chip = (label: string, picked: boolean, disabled = false): ReactNode => (
  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, font: '700 14px/18px var(--persona-font-text)', border: `1.5px solid ${picked ? 'var(--persona-outline)' : 'var(--persona-outline-soft)'}`, background: picked ? 'var(--persona-accent)' : 'var(--persona-card)', color: picked ? 'var(--persona-accent-ink)' : ink, opacity: disabled && !picked ? 0.75 : 1, boxShadow: picked ? 'var(--persona-shadow-press)' : 'none' }}>
    {picked && <UiIcon name="check" size={14} />}{label}
  </span>
)

const cardStyle: CSSProperties = { marginTop: 10, padding: 16, borderRadius: 'var(--persona-radius-l)', background: 'var(--persona-card)', border: 'var(--persona-border-width) solid var(--persona-outline)', boxShadow: 'var(--persona-shadow-sticker)' }

function Question({ answered }: { readonly answered: boolean }): ReactNode {
  const options = ['Padaria', 'Agência', 'Loja online', 'Clínica ou consultório', 'Escritório de serviços', 'Outra coisa']
  return (
    <div style={{ ...cardStyle, ...(answered ? { boxShadow: 'none', borderColor: 'var(--persona-outline-soft)' } : {}) }} role="group" aria-label="Pergunta do Atlas">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ font: '800 11px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--persona-brand)' }}>Pergunta 1 de 3</span>
        {answered && <Chip tone="success" size="s" icon={<UiIcon name="check" size={12} />}>Respondida</Chip>}
      </div>
      <div style={{ font: '700 16px/22px var(--persona-font-text)', color: ink, marginBottom: 12 }}>O que a sua empresa faz? Com isso eu monto uma equipe pronta, e você só confere.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{options.map(o => chip(o, answered && o === 'Padaria', answered))}</div>
      {!answered && (
        <div style={{ borderTop: '1px solid var(--persona-outline-soft)', marginTop: 14, paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', font: '600 13px/18px var(--persona-font-text)', color: soft }}>
          Já sabe o que quer?
          {['Ver modelos de equipe', 'Personas prontas', 'Importar das suas IAs'].map(l => <span key={l} style={{ color: 'var(--persona-brand)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{l}</span>)}
        </div>
      )}
    </div>
  )
}

function MultiQuestion(): ReactNode {
  const options = ['Responder clientes', 'Cobrar quem atrasou', 'Postar nas redes', 'Fazer orçamentos', 'Organizar a agenda', 'Controlar o estoque', 'Outra coisa']
  const picked = new Set(['Responder clientes', 'Postar nas redes', 'Fazer orçamentos'])
  return (
    <div style={cardStyle} role="group" aria-label="Pergunta do Atlas">
      <div style={{ font: '800 11px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--persona-brand)', marginBottom: 6 }}>Pergunta 2 de 3 · pode escolher mais de uma</div>
      <div style={{ font: '700 16px/22px var(--persona-font-text)', color: ink, marginBottom: 12 }}>O que mais toma o seu tempo hoje?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{options.map(o => chip(o, picked.has(o)))}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <span style={{ padding: '8px 16px', borderRadius: 12, background: 'var(--persona-accent)', color: 'var(--persona-accent-ink)', border: 'var(--persona-border-width) solid var(--persona-outline)', boxShadow: 'var(--persona-shadow-press)', font: '800 14px/18px var(--persona-font-text)' }}>Enviar 3</span>
        <span style={{ font: '600 13px/18px var(--persona-font-text)', color: soft }}>ou escreva do seu jeito na caixa abaixo</span>
      </div>
    </div>
  )
}

function StickerMsg(): ReactNode {
  return (
    <Msg time="18:02">
      Fechei a última entrega do dia. Até amanhã!
      <div style={{ marginTop: 8, width: 220, padding: 12, borderRadius: 18, background: 'var(--persona-paper-sunken)', border: '1.5px solid var(--persona-outline-soft)', textAlign: 'center' }}>
        <img src={STICKERS['atlas-feito'] ?? STICKERS['atlas-comemorando']} alt="" style={{ width: 160, height: 160, objectFit: 'contain' }} />
        {/* the caption is live text (translatable, readable), never baked into the art */}
        <div style={{ marginTop: 4, display: 'inline-block', padding: '3px 12px', borderRadius: 999, background: 'var(--persona-card)', border: '1.5px solid var(--persona-outline)', font: '800 15px/20px var(--persona-font-display)', color: ink }}>dever cumprido</div>
      </div>
    </Msg>
  )
}

export function LodiPrototype({ state }: { readonly state: 'question' | 'sticker' }): ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '296px minmax(0, 1fr)', height: '100vh', background: 'var(--persona-paper)' }}>
      <ConversasSidebar many={false} dm activePerson={0} />
      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header mode={state === 'question' ? 'Sempre pergunta' : 'Sugere e espera'} />
        <div style={{ flex: 1, padding: '6px 24px', overflow: 'hidden' }}>
          {state === 'question' ? (
            <>
              <Msg time="13:44"><b>Oi! Eu sou o Atlas, e monto a equipe com você.</b><br />Contrato as personas, conecto as ferramentas e chamo as pessoas. Nada muda sem o seu clique.<Question answered /></Msg>
              <Msg me time="13:45">Padaria. Vendemos pães e bolos em Itu desde 2014.</Msg>
              <Msg time="13:45">Boa! Uma padaria de bairro. <b>O que mais toma o seu tempo hoje?</b><MultiQuestion /></Msg>
            </>
          ) : (
            <>
              <Msg me time="17:40">Pode fechar os pedidos de amanhã?</Msg>
              <Msg time="17:58">Fechei: 34 pedidos, 6 bolos de encomenda. A lista está no quadro.</Msg>
              <StickerMsg />
            </>
          )}
        </div>
        <div style={{ margin: '0 16px 16px', padding: '12px 14px', borderRadius: 'var(--persona-radius-l)', background: 'var(--persona-card)', border: 'var(--persona-border-width) solid var(--persona-outline)' }}>
          {/* C: the composer that reassures, by autonomy mode */}
          <div style={{ font: '500 15px/22px var(--persona-font-text)', color: soft }}>{state === 'question' ? 'Mensagem para Atlas · nada muda sem você' : 'Mensagem para Atlas · ele sugere e espera você'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {(['plus', 'image', 'attach', 'smile', 'at'] as const).map(icon => (
              <span key={icon} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1.5px solid var(--persona-outline-soft)', color: 'var(--persona-ink)', background: 'var(--persona-card)' }}><UiIcon name={icon} size={16} /></span>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--persona-accent)', color: 'var(--persona-accent-ink)' }}><UiIcon name="send" size={18} /></span>
          </div>
        </div>
      </section>
    </div>
  )
}
