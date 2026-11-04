/**
 * Persona · design system vivo (Muse). Renders the REAL primitives from client-ui-persona, so this page cannot drift
 * from the code. Build: `pnpm exec vite build --config persona-spec/design/system-src/vite.config.mjs`
 * → `persona-spec/design/system/index.html` (opens straight from disk).
 */

import { createRoot } from 'react-dom/client'
import { useEffect, useState, type ReactNode } from 'react'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import paletteCss from '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css?raw'
import iconsSrc from '../../../packages/persona/client-ui-persona/src/client/primitives/icons.tsx?raw'
import {
  ABOUT_LABELS_PT, AboutPersona, ActivityGroup, ApprovedStamp, Avatar, Button, Card, Chip, ChoiceCards, EmptyState,
  ErrorState, FileChangeRow, GestorPlanCard, Input, Notice, PooledQuotaBar, Skeleton, Switch, Tabs, Textarea, Toast, UiIcon, type UiIconName,
} from '../../../packages/persona/client-ui-persona/src/client/primitives/index.ts'
import { AVATAR_96, ILLUSTRATIONS } from '../../../packages/persona/client-ui-persona/src/client/assets/generated-imports.ts'
import './system.css'

const A = AVATAR_96 as Record<string, string>

/* ── tokens, read from the real palette (semantic block) ── */
function semanticTokens(): { readonly group: string; readonly names: string[] }[] {
  const start = paletteCss.indexOf("body:not([data-ds-dark-theme='true'])")
  const block = paletteCss.slice(start, paletteCss.indexOf('\n}', start))
  // grain-* are texture settings (url/size/blend), not colors: they belong in DESIGN-SYSTEM §4.5, not in swatches.
  const names = [...block.matchAll(/(--persona-[a-z0-9-]+):/gu)].map(m => m[1]!).filter(n => !n.startsWith('--persona-grain'))
  const groups: [string, RegExp][] = [
    ['Superfícies', /paper|card|wash|sunken|surface|rail/u],
    ['Texto', /ink/u],
    ['Contornos', /outline|border|focus/u],
    ['Marca e acento', /brand|accent|link/u],
    ['Estados', /success|warning|danger|info|state|subject/u],
  ]
  const used = new Set<string>()
  const out = groups.map(([group, re]) => {
    const list = names.filter(n => re.test(n) && !used.has(n) && !/shadow/u.test(n))
    for (const n of list) used.add(n)
    return { group, names: list }
  })
  const rest = names.filter(n => !used.has(n) && !/shadow/u.test(n))
  if (rest.length > 0) out.push({ group: 'Outros', names: rest })
  return out.filter(g => g.names.length > 0)
}
const ICONS = (() => {
  const s = iconsSrc.indexOf('const UI_PATHS')
  const body = iconsSrc.slice(s, iconsSrc.indexOf('\n}', s))
  return [...body.matchAll(/^\s{2}([a-zA-Z]+):/gmu)].map(m => m[1]!) as UiIconName[]
})()

function useTheme(): readonly ['light' | 'dark', (t: 'light' | 'dark') => void] {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => {
    if (theme === 'dark') document.body.dataset.dsDarkTheme = 'true'
    else delete document.body.dataset.dsDarkTheme
  }, [theme])
  return [theme, setTheme]
}

function Swatch({ name, theme }: { readonly name: string; readonly theme: string }): ReactNode {
  const [value, setValue] = useState('')
  useEffect(() => { setValue(getComputedStyle(document.body).getPropertyValue(name).trim()) }, [name, theme])
  return (
    <li className="swatch">
      <span className="chip" style={{ background: `var(${name})` }} aria-hidden="true" />
      <code>{name.replace('--persona-', '')}</code>
      <span className="val">{value}</span>
    </li>
  )
}

function Section({ id, title, lead, children }: { readonly id: string; readonly title: string; readonly lead?: string; readonly children: ReactNode }): ReactNode {
  return (
    <section id={id} className="section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {lead !== undefined && <p className="lead">{lead}</p>}
      {children}
    </section>
  )
}

function Spec({ name, use, avoid, children }: { readonly name: string; readonly use: string; readonly avoid: string; readonly children: ReactNode }): ReactNode {
  return (
    <article className="spec" aria-label={name}>
      <header><h3>{name}</h3></header>
      <div className="demo">{children}</div>
      <dl className="rules">
        <div><dt>Use quando</dt><dd>{use}</dd></div>
        <div><dt>Não use quando</dt><dd>{avoid}</dd></div>
      </dl>
    </article>
  )
}

function MotionDemo({ token, ease }: { readonly token: string; readonly ease: string }): ReactNode {
  const [on, setOn] = useState(false)
  return (
    <li className="motion">
      <button type="button" className="play" onClick={() => { setOn(v => !v) }} aria-pressed={on}>
        <code>{token}</code> + <code>{ease}</code>
      </button>
      <span className="track" aria-hidden="true">
        <span className="dot" style={{ transform: on ? 'translateX(220px)' : 'none', transition: `transform var(${token}) var(${ease})` }} />
      </span>
    </li>
  )
}

const planLabels = { title: (m: string) => `Plano do ${m}`, kinds: { hire: 'Contratar', board: 'Criar quadro', allocate: 'Alocar', sprint: 'Sprint 1', move: 'Mover', pause: 'Pausar' }, approve: 'Aprovar', adjust: 'Ajustar', decline: 'Agora não', approvedText: 'Personas alocadas conforme o plano.', declinedText: 'Plano deixado de lado.', adjustingText: 'Ajustando…', stamp: 'Aprovado' }
const pool = { left: (p: number) => `${p}% sobrando`, nextRefill: (p: number, at: string, a: string) => `Volta ${p}% às ${at} (${a})`, noWindow: 'não informa esta janela', segment: (a: { label: string; leftPct?: number | undefined }) => `${a.label}: ${a.leftPct}% sobrando` }
const act = {
  phrase: { command: (n: number) => `rodou ${n} comando${n > 1 ? 's' : ''}`, file: (n: number) => `mudou ${n} arquivo${n > 1 ? 's' : ''}`, hire: (n: number) => `contratou ${n}`, message: (n: number) => `mandou ${n} mensage${n > 1 ? 'ns' : 'm'}`, read: (n: number) => `leu ${n}`, check: (n: number) => `conferiu ${n}` },
  more: (n: number) => `e mais ${n}`, failed: (n: number) => `${n} falhou`, running: 'ainda trabalhando',
  status: { done: 'feito', failed: 'falhou', running: 'rodando', waiting: 'esperando' }, open: 'Abrir', expand: 'ver', collapse: 'esconder',
}

function App(): ReactNode {
  const [theme, setTheme] = useTheme()
  const [tab, setTab] = useState<'quadro' | 'conversa' | 'arquivos'>('quadro')
  const [sw, setSw] = useState(true)
  const [policy, setPolicy] = useState<'ask' | 'auto'>('ask')
  const tokens = semanticTokens()
  const nav = [['cor', 'Cor'], ['tipo', 'Tipografia'], ['forma', 'Forma'], ['movimento', 'Movimento'], ['icones', 'Ícones'], ['componentes', 'Componentes'], ['texto', 'Texto']] as const
  return (
    <div className="page">
      <header className="top">
        <img src={ILLUSTRATIONS['about-team']} alt="" className="topArt" />
        <div>
          <p className="eyebrow">Persona · design system vivo</p>
          <h1>Tudo que a UI usa, renderizado de verdade</h1>
          <p className="lead">Cada exemplo abaixo é o componente real do app (<code>client-ui-persona/src/client/primitives</code>), não uma cópia. Regras completas em <code>persona-spec/DESIGN-SYSTEM.md</code>; texto em <code>design/MICROCOPY.md</code>.</p>
          <div className="themeSwitch" role="group" aria-label="Tema">
            <Button size="s" variant={theme === 'light' ? 'primary' : 'secondary'} aria-pressed={theme === 'light'} onClick={() => { setTheme('light') }}>Claro</Button>
            <Button size="s" variant={theme === 'dark' ? 'primary' : 'secondary'} aria-pressed={theme === 'dark'} onClick={() => { setTheme('dark') }}>Escuro</Button>
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Seções">{nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>

      <main>
        <Section id="cor" title="Cor" lead="Componentes usam só tokens semânticos; o valor muda com o tema (troque acima). Nunca hex solto em tela.">
          {tokens.map(g => (
            <div key={g.group} className="tokenGroup">
              <h3>{g.group}</h3>
              <ul className="swatches">{g.names.map(n => <Swatch key={n} name={n} theme={theme} />)}</ul>
            </div>
          ))}
        </Section>

        <Section id="tipo" title="Tipografia" lead="Fredoka para títulos e números de destaque; Nunito para todo o resto. Corpo nunca abaixo de 14 px.">
          <div className="typeScale">
            <p style={{ font: '700 32px/40px var(--persona-font-display)' }}>Título de tela · 32/40 Fredoka</p>
            <p style={{ font: '700 22px/28px var(--persona-font-display)' }}>Título de seção · 22/28 Fredoka</p>
            <p style={{ font: '700 17px/24px var(--persona-font-display)' }}>Título de cartão · 17/24 Fredoka</p>
            <p style={{ font: '500 15px/22px var(--persona-font-text)' }}>Corpo · 15/22 Nunito. A equipe lê o Cofre antes de cada tarefa.</p>
            <p style={{ font: '700 13px/20px var(--persona-font-text)', color: 'var(--persona-ink-soft)' }}>Legenda e metadados · 13/20 Nunito bold, tinta suave</p>
          </div>
        </Section>

        <Section id="forma" title="Forma" lead="Contorno ameixa de 1,5 px, sombra sólida deslocada para baixo (sem blur), raios macios e grade de 4/8.">
          <div className="shapes">
            {['xs', 's', 'm', 'l', 'xl', 'pill'].map(r => <div key={r} className="shape" style={{ borderRadius: `var(--persona-radius-${r})` }}><code>radius-{r}</code></div>)}
          </div>
          <div className="shapes">
            {['press', 'press-hover', 'press-active'].map(s => <div key={s} className="shape" style={{ boxShadow: `var(--persona-shadow-${s})` }}><code>shadow-{s}</code></div>)}
          </div>
          <div className="spaces">{[1, 2, 3, 4, 5, 6, 8].map(n => <span key={n} className="space"><span style={{ width: `var(--persona-space-${n})` }} /><code>space-{n}</code></span>)}</div>
        </Section>

        <Section id="movimento" title="Movimento" lead="Só transform e opacity. Com reduced-motion, todos os tokens viram um fade de 120 ms. Clique para tocar.">
          <ul className="motions">
            <MotionDemo token="--motion-fast" ease="--ease-enter" />
            <MotionDemo token="--motion-base" ease="--ease-spring" />
            <MotionDemo token="--motion-slow" ease="--ease-standard" />
            <MotionDemo token="--motion-character" ease="--ease-spring" />
          </ul>
          <table className="motionTable">
            <caption>Coreografias do app (UX-GUIDE §3)</caption>
            <thead><tr><th scope="col">Momento</th><th scope="col">Como</th><th scope="col">Com reduced-motion</th></tr></thead>
            <tbody>
              <tr><td>Persona chega à equipe</td><td>760 ms, mola, entra pela colina</td><td>fade 120 ms</td></tr>
              <tr><td>Troca de estado na faixa</td><td>crossfade de pose 220 ms + pulo de 6 px</td><td>fade 110 ms</td></tr>
              <tr><td>Persona move um cartão</td><td>FLIP 360 ms com o mini-avatar carregando</td><td>fade 100 ms, sem viagem</td></tr>
              <tr><td>Você move um cartão</td><td>FLIP 220 ms, mola</td><td>fade 100 ms</td></tr>
              <tr><td>Troca de painel</td><td>140 ms, sobe 4 px</td><td>fade 100 ms</td></tr>
              <tr><td>Aprovado</td><td>carimbo 1×, patinhas 1× (cooldown 2,5 s)</td><td>carimbo parado</td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="icones" title="Ícones" lead="Traço de 2 px, cantos redondos, sempre com texto ao lado ou aria-label. Ícone sozinho só em botão com rótulo acessível.">
          <ul className="icons">{ICONS.map(name => <li key={name}><UiIcon name={name} size={22} strokeWidth={2} /><code>{name}</code></li>)}</ul>
        </Section>

        <Section id="componentes" title="Componentes" lead="Cada um com seus estados e a regra de quando usar.">
          <div className="specs">
            <Spec name="Button" use="Uma ação com resultado claro ('Montar equipe'). Uma primária por área." avoid="Navegar para outra tela (use link) ou abrir menu (use MenuButton).">
              <div className="row">
                <Button variant="primary">Montar equipe</Button>
                <Button variant="secondary">Ajustar</Button>
                <Button variant="ghost">Agora não</Button>
                <Button variant="danger">Remover persona</Button>
              </div>
              <div className="row">
                <Button variant="primary" size="s" icon={<UiIcon name="plus" size={16} strokeWidth={2.2} />}>Nova tarefa</Button>
                <Button variant="primary" loading>Salvando</Button>
                <Button variant="secondary" disabled>Indisponível</Button>
              </div>
            </Spec>

            <Spec name="Chip" use="Rótulo curto de estado ou categoria, sempre com texto." avoid="Ação clicável principal (use Button) ou parágrafos.">
              <div className="row">{(['neutral', 'brand', 'accent', 'success', 'warning', 'danger', 'info'] as const).map(t => <Chip key={t} tone={t}>{t}</Chip>)}</div>
            </Spec>

            <Spec name="Card" use="Agrupar um assunto com título; interactive quando o cartão inteiro abre algo." avoid="Envolver a tela inteira ou aninhar cartão dentro de cartão.">
              <div className="row stretch">
                <Card eyebrow="Projeto" title="Site da padaria" padding="m"><p className="p">3 tarefas em andamento.</p></Card>
                <Card title="Precisa de você" tone="accent" padding="m"><p className="p">Aprovar a contratação da Lia.</p></Card>
              </div>
            </Spec>

            <Spec name="Avatar" use="Mostrar quem é (persona ou pessoa), com presença quando importa." avoid="Decorar sem significado. Se o nome está ao lado, use decorative.">
              <div className="row">
                {([24, 32, 40, 56, 96] as const).map(s => <Avatar key={s} name="Nina" src={A.nina} size={s} shape="portrait" />)}
                {(['online', 'busy', 'away', 'offline'] as const).map(p => <Avatar key={p} name={`Bento (${p})`} src={A.bento} size={48} shape="portrait" presence={p} />)}
              </div>
            </Spec>

            <Spec name="Tabs" use="Alternar vistas do MESMO objeto (Quadro · Conversa · Arquivos). Setas do teclado navegam." avoid="Passos de um fluxo (use stepper) ou filtros múltiplos (use chips).">
              <Tabs label="Vistas do projeto" idPrefix="ds-tabs" value={tab} onChange={setTab} items={[{ id: 'quadro', label: 'Quadro', count: 4 }, { id: 'conversa', label: 'Conversa' }, { id: 'arquivos', label: 'Arquivos', disabled: true }]} />
            </Spec>

            <Spec name="Input · Textarea" use="Entrada com rótulo visível; dica abaixo; erro diz como corrigir." avoid="Placeholder no lugar do rótulo.">
              <div className="col">
                <Input label="Seu nome" placeholder="Ex.: Miguel" hint="Aparece nas mensagens e nas aprovações." />
                <Input label="E-mail da conta" defaultValue="miguel@" error="Falta o domínio, como @gmail.com." />
                <Textarea label="Contexto da empresa" placeholder="Descreva em linguagem natural ou cole um texto…" rows={3} />
              </div>
            </Spec>

            <Spec name="Switch" use="Ligar ou desligar algo que vale na hora (microfone, Gestor de equipe)." avoid="Escolha entre opções com nomes (use ChoiceCards) ou ação que precisa de confirmação.">
              <div className="col narrow">
                <label className="swRow"><span id="ds-sw1">Narrar com o microfone</span><Switch checked={sw} onChange={setSw} labelledBy="ds-sw1" /></label>
                <label className="swRow"><span id="ds-sw2">Indisponível nesta conta</span><Switch checked={false} disabled onChange={() => {}} labelledBy="ds-sw2" /></label>
              </div>
            </Spec>

            <Spec name="ChoiceCards" use="Uma escolha explícita entre 2 a 4 políticas, cada uma com uma frase do que acontece." avoid="Mais de 4 opções (use lista) ou sim/não (use Switch).">
              <ChoiceCards legend="Quando contratar ou mudar alguém" name="ds-policy" value={policy} onChange={setPolicy} options={[{ id: 'ask', title: 'Sempre me perguntar', body: 'Mostra o plano no chat e espera seu ok.', badge: 'Recomendado' }, { id: 'auto', title: 'Fazer sozinho dentro dos limites', body: 'Contrata e organiza sem perguntar, se couber nos limites.' }]} />
            </Spec>

            <Spec name="Notice" use="Aviso que muda o que a pessoa vai fazer agora (antes de gravar, antes de trocar de conta)." avoid="Erro de tela (use ErrorState) ou confirmação de sucesso (use Toast).">
              <div className="col">
                <Notice tone="warning">Evite mostrar senhas ou dados sensíveis na tela.</Notice>
                <Notice tone="info" title="Contas do mesmo provedor">Usar várias contas do mesmo provedor chega na próxima atualização do app.</Notice>
              </div>
            </Spec>

            <Spec name="Toast" use="Confirmar algo que acabou de acontecer, com desfazer quando der." avoid="Erro que bloqueia (use ErrorState) ou pergunta (use Modal).">
              <div className="col">
                <Toast tone="success" title="Movida para Site" action={<Button size="s" variant="ghost">Desfazer</Button>} />
                <Toast tone="celebrate" title="Sua equipe entregou o primeiro trabalho!" body="A Nina concluiu a proposta da padaria." />
              </div>
            </Spec>

            <Spec name="EmptyState" use="Tela ou lista vazia: diga o que vai aparecer e dê UMA ação." avoid="Carregando (use Skeleton) ou falha (use ErrorState).">
              <EmptyState compact illustration={ILLUSTRATIONS['empty-kanban']} title="Nenhuma tarefa ainda" body="Peça algo no #geral e a Coordenação cria a primeira." action={<Button variant="primary" size="s">Abrir #geral</Button>} />
            </Spec>

            <Spec name="ErrorState" use="Algo falhou: frase humana + Tentar de novo; o detalhe técnico fica dobrado." avoid="Validação de campo (use o erro do Input).">
              <ErrorState title="Não consegui falar com a equipe agora" body="Seus dados estão salvos." retryLabel="Tentar de novo" onRetry={() => {}} detail='O host da Persona não conseguiu concluir "listTeam" (gateway/cancelled)' />
            </Spec>

            <Spec name="Skeleton" use="Carregamento com forma do conteúdo final, curto." avoid="Esperas longas sem explicação (diga o que está acontecendo).">
              <div className="col narrow"><Skeleton shape="text" width="70%" /><Skeleton shape="text" width="45%" /><Skeleton shape="block" height={80} /></div>
            </Spec>

            <Spec name="ApprovedStamp" use="Marcar uma aprovação humana concluída (Revisar, plano do Gestor)." avoid="Sucesso automático sem decisão de alguém.">
              <div className="row"><ApprovedStamp label="Aprovado" /><ApprovedStamp label="Aprovado" size={56} /></div>
            </Spec>

            <Spec name="PooledQuotaBar" use="Mostrar o que sobra de cota somando contas do mesmo provedor." avoid="Provedor que não informa a janela: troque por uma linha só.">
              <PooledQuotaBar window="5 horas" labels={pool} color="#f0be6a" accounts={[{ id: 'w', label: 'Trabalho', leftPct: 22, refillPct: 30, refillAt: '18:30' }, { id: 'p', label: 'Pessoal', leftPct: 74 }]} />
            </Spec>

            <Spec name="ActivityGroup" use="Resumir o que uma persona fez numa rodada, com o que falhou em destaque." avoid="Log técnico linha a linha.">
              <ActivityGroup persona={{ name: 'Nina', avatarSrc: A.nina }} labels={act} items={[{ id: 'a', kind: 'command', title: 'npm test', status: 'done' }, { id: 'b', kind: 'file', title: 'proposta.md', status: 'done' }, { id: 'c', kind: 'command', title: 'npm run build', status: 'failed' }]} />
            </Spec>

            <Spec name="GestorPlanCard" use="O Gestor de equipe propõe contratar ou reorganizar: plano com passos, custo e três saídas." avoid="Mudança pequena e rotineira (registre na atividade).">
              <GestorPlanCard gestor={{ name: 'Atlas', avatarSrc: A.atlas }} summary="Vou contratar 2 personas e criar o quadro Site." reason="Hoje ninguém cobre design." steps={[{ id: '1', kind: 'hire', title: 'Pipoca · Designer', detail: 'raposa · Claude · Sonnet', avatarSrc: A.raposa }, { id: '2', kind: 'board', title: 'Quadro Site', detail: 'fluxo Site · sprint de 2 semanas', flowModel: 'site' }]} cost="≈ 40 tarefas médias por mês a mais" state="pending" onApprove={() => {}} onAdjust={() => {}} onDecline={() => {}} labels={planLabels} />
            </Spec>

            <Spec name="FileChangeRow" use="Revisar mudanças de um rascunho: um arquivo por linha, em palavras (Novo · Mudou · Apagado)." avoid="Mostrar diff, linhas +/− ou caminho absoluto para quem não programa.">
              <ul style={{ margin: 0, padding: 0 }}>
                <FileChangeRow change={{ id: 'a', name: 'cardapio.docx', folder: 'Cardápio/2026', kind: 'changed', type: 'text' }} labels={{ kind: { new: 'Novo', changed: 'Mudou', deleted: 'Apagado' }, deletedNote: 'Este arquivo sai da pasta', show: 'Ver antes e depois', hide: 'Esconder antes e depois' }} expanded onToggle={() => {}}><p className="p">Antes: “Pão de queijo R$ 6” → Depois: “Pão de queijo R$ 7”</p></FileChangeRow>
                <FileChangeRow change={{ id: 'b', name: 'precos.xlsx', folder: 'Financeiro', kind: 'new', type: 'sheet' }} labels={{ kind: { new: 'Novo', changed: 'Mudou', deleted: 'Apagado' }, deletedNote: 'Este arquivo sai da pasta', show: 'Ver antes e depois', hide: 'Esconder antes e depois' }} onToggle={() => {}} />
                <FileChangeRow change={{ id: 'c', name: 'cardapio-2025.docx', folder: 'Cardápio', kind: 'deleted', type: 'text' }} labels={{ kind: { new: 'Novo', changed: 'Mudou', deleted: 'Apagado' }, deletedNote: 'Este arquivo sai da pasta', show: 'Ver antes e depois', hide: 'Esconder antes e depois' }} />
              </ul>
            </Spec>

            <Spec name="AboutPersona" use="Tela Sobre: o que é o app, versão e créditos honestos." avoid="—">
              <AboutPersona version="0.1.0" labels={ABOUT_LABELS_PT} onOpenUrl={() => {}} onOpenNotices={() => {}} />
            </Spec>
          </div>
        </Section>

        <Section id="texto" title="Texto" lead="Acolhedor e curto; primeira pessoa da equipe; o resultado, não o mecanismo. Glossário completo em design/MICROCOPY.md.">
          <table className="motionTable">
            <thead><tr><th scope="col">Diga</th><th scope="col">Nunca diga</th></tr></thead>
            <tbody>
              <tr><td>equipe, toda a equipe</td><td>workspace, tenant</td></tr>
              <tr><td>motor, a IA que faz o trabalho</td><td>runner, harness</td></tr>
              <tr><td>ferramentas de IA neste computador</td><td>CLIs detectadas</td></tr>
              <tr><td>app Persona</td><td>host, gateway</td></tr>
              <tr><td>montar a equipe</td><td>onboarding</td></tr>
              <tr><td>Não consegui falar com a equipe agora</td><td>Ocorreu um erro</td></tr>
            </tbody>
          </table>
        </Section>
      </main>
      <footer className="foot">Gerado de <code>persona-spec/design/system-src</code> · Muse · arte do Brush</footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
