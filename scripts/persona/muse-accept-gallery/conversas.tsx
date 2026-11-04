// Muse: visual PROTOTYPE of "Conversas" (Miguel's ask: fewer clicks like Grok, team channels, dozens of personas).
// Real primitives, tokens and Brush portraits; sample data only. Not shipped. States: 5 personas / 30 personas /
// 30 personas with the "Quem responde" picker open. Spec: persona-spec/design/CONVERSAS-SPEC.md.
import type { CSSProperties, ReactNode } from 'react'
import { Avatar } from '../../../packages/persona/client-ui-persona/src/client/primitives/Avatar.tsx'
import { Chip } from '../../../packages/persona/client-ui-persona/src/client/primitives/Chip.tsx'
import { BrandIcon, UiIcon } from '../../../packages/persona/client-ui-persona/src/client/primitives/icons.tsx'
import { AVATAR_96 } from '../../../packages/persona/client-ui-persona/src/client/assets/generated-imports.ts'

type State = 'working' | 'resting' | 'waiting'
interface P { readonly name: string; readonly role: string; readonly animal: string; readonly team: string; readonly state: State; readonly last?: string; readonly when?: string; readonly unread?: number }
const face = (animal: string): string => (AVATAR_96 as Record<string, string>)[animal] ?? ''

const CORE: readonly P[] = [
  { name: 'Atlas', role: 'Coordenação', animal: 'atlas', team: 'Diretoria', state: 'working', last: 'Distribuí os pedidos da semana.', when: '14:20' },
  { name: 'Nina', role: 'Pesquisa', animal: 'nina', team: 'Produto', state: 'working', last: 'Achei 3 concorrentes com preço menor.', when: '14:05', unread: 2 },
  { name: 'Bento', role: 'Engenharia', animal: 'bento', team: 'Produto', state: 'resting', last: 'Corrigi o formulário de pedidos.', when: 'ontem' },
  { name: 'Sol', role: 'Relacionamento', animal: 'sol', team: 'Atendimento', state: 'waiting', last: 'Posso responder a cliente da Rua 9?', when: '13:40', unread: 1 },
  { name: 'Luna', role: 'Vigia', animal: 'luna', team: 'Diretoria', state: 'resting', last: 'Tudo em ordem hoje.', when: 'segunda' },
]
const EXTRA_ANIMALS = ['capivara', 'cervo', 'coelho', 'coruja', 'guaxinim', 'lobo-guara', 'lontra', 'ourico', 'panda', 'raposa', 'tamandua', 'tucano']
const EXTRA_NAMES = ['Bia', 'Téo', 'Lia', 'Caio', 'Duda', 'Gabi', 'Iara', 'Juca', 'Kika', 'Léo', 'Malu', 'Nico', 'Olga', 'Pipa', 'Quim', 'Rosa', 'Tati', 'Uri', 'Vavá', 'Wil', 'Xica', 'Yuri', 'Zezé', 'Bolota', 'Capi']
const TEAMS = ['Marketing', 'Marketing', 'Atendimento', 'Financeiro', 'Produto', 'Marketing', 'Atendimento', 'Financeiro']
const ROLES: Record<string, string[]> = { Marketing: ['Redação', 'Design', 'Anúncios', 'Redes sociais'], Atendimento: ['WhatsApp', 'E-mail', 'Pós-venda'], Financeiro: ['Contas a pagar', 'Notas fiscais'], Produto: ['Testes', 'Dados'] }
const MORE: readonly P[] = EXTRA_NAMES.map((name, i) => {
  const team = TEAMS[i % TEAMS.length]!
  return { name, role: ROLES[team]![i % ROLES[team]!.length]!, animal: EXTRA_ANIMALS[i % EXTRA_ANIMALS.length]!, team, state: (i % 5 === 0 ? 'working' : 'resting') as State }
})

const card: CSSProperties = { background: 'var(--persona-card)', border: 'var(--persona-border-width) solid var(--persona-outline)', borderRadius: 'var(--persona-radius-l)' }
const eyebrow: CSSProperties = { font: '800 11px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--persona-ink-soft)', margin: '14px 12px 6px', display: 'flex', alignItems: 'center', gap: 6 }
const dot = (s: State): string => (s === 'working' ? 'var(--persona-success)' : s === 'waiting' ? 'var(--persona-accent)' : 'var(--persona-outline-soft)')

// Miguel 04/11: ONE lilac bar. Brand + search + compact places stay fixed on top; channels and people scroll inside;
// the pill + settings stay fixed at the bottom. Rows are denser than the first prototype (28/40 px).
const R = { ink: 'var(--persona-rail-ink)', soft: 'var(--persona-rail-ink-soft)', active: 'var(--persona-cream-50)', activeInk: 'var(--persona-plum-900)' }
const railEyebrow: CSSProperties = { font: '800 11px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: R.soft, margin: '12px 14px 4px', display: 'flex', alignItems: 'center', gap: 6 }
const badge = (n: number): ReactNode => <span style={{ background: 'var(--persona-accent)', color: 'var(--persona-accent-ink)', borderRadius: 999, minWidth: 20, textAlign: 'center', font: '800 11px/20px var(--persona-font-text)', padding: '0 6px' }}>{n}</span>

function Place({ icon, label, count }: { readonly icon: string; readonly label: string; readonly count?: number }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px', margin: '0 6px', borderRadius: 10, color: R.ink, font: '700 14px/20px var(--persona-font-text)' }}>
      <BrandIcon name={icon as never} size={16} /><span style={{ flex: 1 }}>{label}</span>{count !== undefined && badge(count)}
    </div>
  )
}

function RailChannel({ name, unread, active, note }: { readonly name: string; readonly unread?: number; readonly active?: boolean; readonly note?: string }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', margin: '0 6px', borderRadius: 10, background: active ? R.active : 'transparent', color: active ? R.activeInk : R.ink }}>
      <span style={{ width: 20, textAlign: 'center', font: '800 15px/20px var(--persona-font-text)' }}>#</span>
      <span style={{ flex: 1, minWidth: 0, font: `${unread || active ? 800 : 700} 14px/20px var(--persona-font-text)` }}>{name}{note !== undefined && <span style={{ fontWeight: 600, color: active ? 'color-mix(in srgb, var(--persona-plum-900) 75%, var(--persona-cream-50))' : R.soft }}> · {note}</span>}</span>
      {unread !== undefined && badge(unread)}
    </div>
  )
}

function RailPerson({ p, active, compact }: { readonly p: P; readonly active?: boolean; readonly compact?: boolean }): ReactNode {
  const ink = active ? R.activeInk : R.ink
  const soft = active ? 'color-mix(in srgb, var(--persona-plum-900) 75%, var(--persona-cream-50))' : R.soft
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: compact ? '3px 12px' : '4px 12px', margin: '0 6px', borderRadius: 10, background: active ? R.active : 'transparent' }}>
      <span style={{ position: 'relative', flex: '0 0 auto' }}>
        <Avatar name={p.name} src={face(p.animal)} size={compact ? 24 : 32} shape="portrait" decorative />
        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: 999, background: dot(p.state), border: '2px solid var(--persona-rail)' }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: `${p.unread || active ? 800 : 700} 14px/18px var(--persona-font-text)`, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name} <span style={{ fontWeight: 600, fontSize: 12, color: soft }}>{p.role}</span></span>
        {!compact && p.last !== undefined && <span style={{ display: 'block', font: '500 12px/16px var(--persona-font-text)', color: soft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.last}</span>}
      </span>
      {p.unread !== undefined ? badge(p.unread) : null}
    </div>
  )
}

function RailTeam({ name, people, open }: { readonly name: string; readonly people: readonly P[]; readonly open: boolean }): ReactNode {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', margin: '0 6px', color: R.ink, font: '700 13px/18px var(--persona-font-text)' }}>
        <UiIcon name={open ? 'chevronDown' : 'chevronRight'} size={14} />{name}<span style={{ color: R.soft, fontWeight: 600 }}>{people.length}</span>
        {!open && <span style={{ display: 'flex', marginLeft: 'auto' }}>{people.slice(0, 4).map((p, i) => <span key={p.name} style={{ marginLeft: i === 0 ? 0 : -8 }}><Avatar name={p.name} src={face(p.animal)} size={24} shape="portrait" decorative /></span>)}</span>}
      </div>
      {open && people.map(p => <RailPerson key={p.name} p={p} compact />)}
    </div>
  )
}

function Sidebar({ many, dm }: { readonly many: boolean; readonly dm: boolean }): ReactNode {
  const all = many ? [...CORE, ...MORE] : CORE
  const byTeam = (team: string) => all.filter(p => p.team === team)
  const rule = '1px solid color-mix(in srgb, var(--persona-rail-ink) 16%, transparent)'
  return (
    <aside style={{ background: 'var(--persona-rail)', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100vh' }}>
      <div style={{ padding: '16px 10px 6px' }}>
        <div style={{ font: '700 22px/28px var(--persona-font-display)', color: R.ink, margin: '0 8px 10px' }}>Persona</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', margin: '0 4px', borderRadius: 12, background: 'var(--persona-rail-field)', color: R.ink, font: '600 13px/18px var(--persona-font-text)' }}>
          <BrandIcon name="busca" size={15} /><span style={{ flex: 1 }}>Buscar ou ir para…</span>
          <kbd style={{ font: '700 11px/1 var(--persona-font-text)', padding: '3px 6px', borderRadius: 6, background: 'var(--persona-rail-kbd)', color: R.ink }}>Ctrl K</kbd>
        </div>
        <div style={{ marginTop: 8 }}>
          <Place icon="visao-geral" label="Visão geral" /><Place icon="projetos" label="Projetos" /><Place icon="decisoes" label="Aprovações" count={2} />
          <Place icon="equipe" label="Equipe" /><Place icon="conhecimento-memoria" label="Memória da empresa" />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderTop: rule, paddingBottom: 8 }}>
        <div style={railEyebrow}>Canais</div>
        <RailChannel name="geral" />
        {many && <><RailChannel name="marketing" unread={4} active={!dm} /><RailChannel name="atendimento" /><RailChannel name="financeiro" /></>}
        <RailChannel name="diretoria" note="gestores" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', margin: '0 6px', color: R.soft, font: '700 13px/18px var(--persona-font-text)' }}><UiIcon name="plus" size={14} />Novo canal</div>
        <div style={railEyebrow}>{many ? 'Recentes' : 'Pessoas'}</div>
        {(many ? CORE.slice(0, 4) : CORE).map((p, i) => <RailPerson key={p.name} p={p} active={dm && i === 1} />)}
        {many && (
          <>
            <div style={railEyebrow}>Todas as personas · {all.length}</div>
            <RailTeam name="Diretoria" people={byTeam('Diretoria')} open={false} />
            <RailTeam name="Marketing" people={byTeam('Marketing')} open={!dm} />
            <RailTeam name="Atendimento" people={byTeam('Atendimento')} open={false} />
            <RailTeam name="Produto" people={byTeam('Produto')} open={false} />
            <RailTeam name="Financeiro" people={byTeam('Financeiro')} open={false} />
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 14px', borderTop: rule }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, background: R.active, color: R.activeInk, font: '700 13px/18px var(--persona-font-text)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--persona-success)' }} />Claude · 82% livre
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, background: R.active, color: R.activeInk }}><BrandIcon name="configuracoes" size={16} /></span>
      </div>
    </aside>
  )
}

function Bubble({ who, text, me }: { readonly who?: P; readonly text: string; readonly me?: boolean }): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: me ? 'flex-end' : 'flex-start', margin: '10px 0' }}>
      {who !== undefined && <Avatar name={who.name} src={face(who.animal)} size={32} shape="portrait" decorative />}
      <div style={{ maxWidth: 520, padding: '10px 14px', borderRadius: 14, background: me ? 'var(--persona-wash)' : 'var(--persona-card)', border: '1.5px solid var(--persona-outline-soft)', color: 'var(--persona-ink)', font: '500 15px/22px var(--persona-font-text)' }}>
        {who !== undefined && <b style={{ display: 'block', font: '800 13px/18px var(--persona-font-text)' }}>{who.name} <span style={{ fontWeight: 600, color: 'var(--persona-ink-soft)' }}>· {who.role}</span></b>}
        {text}
      </div>
    </div>
  )
}

function CardRow({ p, active }: { readonly p: P; readonly active?: boolean }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 10, background: active ? 'var(--persona-wash)' : 'transparent', borderLeft: active ? '3px solid var(--persona-accent)' : '3px solid transparent' }}>
      <span style={{ position: 'relative' }}>
        <Avatar name={p.name} src={face(p.animal)} size={24} shape="portrait" decorative />
        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: 999, background: dot(p.state), border: '2px solid var(--persona-card)' }} />
      </span>
      <b style={{ font: '700 14px/18px var(--persona-font-text)', color: 'var(--persona-ink)' }}>{p.name}</b>
      <span style={{ font: '500 12px/16px var(--persona-font-text)', color: 'var(--persona-ink-soft)' }}>{p.role}</span>
    </div>
  )
}

function Picker(): ReactNode {
  const hits = MORE.filter(p => p.team === 'Marketing').slice(0, 5)
  return (
    <div style={{ ...card, position: 'absolute', bottom: 74, left: 16, width: 360, boxShadow: 'var(--persona-shadow-float)', padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1.5px solid var(--persona-outline)', borderRadius: 10, font: '600 14px/18px var(--persona-font-text)', color: 'var(--persona-ink)' }}>
        <BrandIcon name="busca" size={16} />mar<span style={{ width: 1.5, height: 16, background: 'var(--persona-ink)' }} />
      </div>
      <div style={{ ...eyebrow, margin: '10px 6px 4px' }}>Quem responde aqui</div>
      <CardRow p={CORE[0]!} />
      <div style={{ ...eyebrow, margin: '10px 6px 4px' }}>Marketing · {hits.length}</div>
      {hits.map((p, i) => <CardRow key={p.name} p={p} active={i === 0} />)}
      <div style={{ borderTop: '1px solid var(--persona-outline-soft)', marginTop: 8, padding: '8px 8px 2px', display: 'flex', justifyContent: 'space-between', font: '600 12px/16px var(--persona-font-text)', color: 'var(--persona-ink-soft)' }}>
        <span>Enter responde aqui · Ctrl+Enter abre a conversa com {hits[0]!.name}</span>
      </div>
    </div>
  )
}

function Thread({ many, picker }: { readonly many: boolean; readonly picker: boolean }): ReactNode {
  const nina = CORE[1]!
  const title = many ? 'marketing' : 'Nina'
  const mk = MORE.filter(p => p.team === 'Marketing')
  return (
    <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--persona-outline-soft)' }}>
        {many ? <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--persona-paper-sunken)', font: '800 20px/1 var(--persona-font-text)', color: 'var(--persona-ink-soft)' }}>#</span>
          : <Avatar name="Nina" src={face('nina')} size={40} shape="portrait" decorative />}
        <span style={{ flex: 1 }}>
          <b style={{ display: 'block', font: '700 20px/26px var(--persona-font-display)', color: 'var(--persona-ink)' }}>{title}</b>
          <span style={{ font: '500 13px/18px var(--persona-font-text)', color: 'var(--persona-ink-soft)' }}>{many ? `A equipe de Marketing · ${mk.length} personas` : 'Pesquisa · trabalhando em "Preços de dezembro"'}</span>
        </span>
        {many ? <span style={{ display: 'flex' }}>{mk.slice(0, 5).map((p, i) => <span key={p.name} style={{ marginLeft: i === 0 ? 0 : -8 }}><Avatar name={p.name} src={face(p.animal)} size={28} shape="portrait" decorative /></span>)}</span>
          : <Chip tone="success" size="s">Trabalhando</Chip>}
      </header>
      <div style={{ flex: 1, padding: '8px 24px', overflow: 'hidden' }}>
        {many ? (
          <>
            <div style={{ textAlign: 'center', font: '600 12px/16px var(--persona-font-text)', color: 'var(--persona-ink-soft)', margin: '10px 0' }}>Canal criado para a equipe de Marketing</div>
            <Bubble me text="Preciso de 3 posts para a promoção de dezembro." />
            <Bubble who={mk[0]} text="Faço os textos hoje à tarde. A Gabi cuida das imagens?" />
            <Bubble who={mk[1]} text="Combinado. Mando as artes até as 17h." />
          </>
        ) : (
          <>
            <Bubble me text="Pesquise os preços dos concorrentes da padaria." />
            <Bubble who={nina} text="Achei 3 concorrentes com preço menor no pão francês. Quer a tabela?" />
          </>
        )}
      </div>
      <div style={{ ...card, margin: '0 16px 16px', padding: '12px 14px' }}>
        <div style={{ font: '500 15px/22px var(--persona-font-text)', color: 'var(--persona-ink-soft)', marginBottom: 10 }}>{many ? 'Mensagem em #marketing… (@ chama alguém)' : 'Mensagem para Nina…'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {many && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, border: `1.5px solid ${picker ? 'var(--persona-outline)' : 'var(--persona-outline-soft)'}`, font: '700 13px/18px var(--persona-font-text)', color: 'var(--persona-ink)' }}>
              Quem responde <Avatar name="Atlas" src={face('atlas')} size={24} shape="portrait" decorative />Coordenação<UiIcon name="chevronDown" size={14} />
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--persona-accent)', color: 'var(--persona-accent-ink)' }}><UiIcon name="send" size={18} /></span>
        </div>
      </div>
      {picker && <Picker />}
    </section>
  )
}

export function ConversasPrototype({ many, picker = false, dm = false }: { readonly many: boolean; readonly picker?: boolean; readonly dm?: boolean }): ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '296px minmax(0, 1fr)', height: '100vh', background: 'var(--persona-paper)', fontFamily: 'var(--persona-font-text)' }}>
      <Sidebar many={many} dm={dm} />
      <Thread many={many && !dm} picker={picker} />
    </div>
  )
}
