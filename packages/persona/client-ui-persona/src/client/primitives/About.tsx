/**
 * AboutPersona (Muse, kit de lançamento): the "Sobre a Persona" screen — team photo by Brush, what the app is,
 * version, and honest credits for the work it stands on. Licenses are data (never translated); copy is labels.
 */

import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import styles from './About.module.css'

export interface CreditEntry {
  readonly id: string
  readonly name: string
  /** SPDX id, e.g. `MIT`, `Apache-2.0`. */
  readonly license: string
  readonly holder: string
  readonly url: string
}

/** Verified against LICENSE, THIRD_PARTY_NOTICES.md and the upstream repos (04/11). */
export const PERSONA_CREDITS: readonly CreditEntry[] = [
  { id: 'deepseek-harness', name: 'DeepSeek Harness', license: 'MIT', holder: '© 2026 DeepSeek', url: 'https://github.com/deepseek-ai/deepseek-harness' },
  { id: 'oar', name: 'OAR', license: 'Apache-2.0', holder: 'botiverse', url: 'https://github.com/botiverse/oar' },
  { id: 't3code', name: 't3code', license: 'MIT', holder: '© 2026 T3 Tools Inc.', url: 'https://github.com/pingdotgg/t3code' },
]

export interface AboutLabels {
  readonly title: string
  readonly tagline: string
  readonly body: string
  /** "Versão 0.1.0" */
  readonly version: (version: string) => string
  readonly creditsTitle: string
  /** One sentence per credit, keyed by id: what Persona owes to it. */
  readonly creditWhat: Readonly<Record<string, string>>
  readonly license: (spdx: string) => string
  readonly thirdParty: string
  readonly madeBy: string
  readonly artAlt: string
}

export interface AboutPersonaProps {
  /** Versão instalada: sem ela, a linha "Versão" não aparece (a ponte de versão chega com o item do Cobalt). */
  readonly version?: string | undefined
  readonly labels: AboutLabels
  readonly credits?: readonly CreditEntry[]
  /** Open THIRD_PARTY_NOTICES (host decides how: file, window or link). */
  readonly onOpenNotices?: (() => void) | undefined
  /** Open an external URL through the host (never navigate the app window). */
  readonly onOpenUrl?: ((url: string) => void) | undefined
  /** Dentro de Configurações › Sobre: na grade da página (sem a coluna de 560 px) e com a sombra sticker do kit. */
  readonly inline?: boolean | undefined
}

export function AboutPersona({ version, labels, credits = PERSONA_CREDITS, onOpenNotices, onOpenUrl, inline }: AboutPersonaProps): ReactNode {
  const art = ILLUSTRATIONS['about-team']
  return (
    <section className={inline === true ? `${styles.about} ${styles.inline}` : styles.about} aria-labelledby="persona-about-title">
      {art !== undefined && <img className={styles.art} src={art} alt={labels.artAlt} width={480} height={270} />}
      <div className={styles.head}>
        <h2 id="persona-about-title" className={styles.title}>{labels.title}</h2>
        {version !== undefined && <span className={styles.version}>{labels.version(version)}</span>}
      </div>
      <p className={styles.tagline}>{labels.tagline}</p>
      <p className={styles.body}>{labels.body}</p>

      <h3 className={styles.creditsTitle}>{labels.creditsTitle}</h3>
      <ul className={styles.credits}>
        {credits.map(credit => (
          <li key={credit.id} className={styles.credit}>
            <span className={styles.creditName}>
              {onOpenUrl === undefined
                ? credit.name
                : <button type="button" className={styles.link} onClick={() => { onOpenUrl(credit.url) }}>{credit.name}</button>}
            </span>
            <span className={styles.license}>{labels.license(credit.license)}</span>
            {labels.creditWhat[credit.id] !== undefined && <span className={styles.creditWhat}>{labels.creditWhat[credit.id]}</span>}
            <span className={styles.holder}>{credit.holder}</span>
          </li>
        ))}
      </ul>
      <div className={styles.foot}>
        {onOpenNotices !== undefined && <button type="button" className={styles.link} onClick={onOpenNotices}>{labels.thirdParty}</button>}
        <span className={styles.madeBy}>{labels.madeBy}</span>
      </div>
    </section>
  )
}

/** pt-BR copy (MICROCOPY.md tone). Screens may pass their own dictionary instead. */
export const ABOUT_LABELS_PT: AboutLabels = {
  title: 'Sobre a Persona',
  tagline: 'Sua equipe de IA, com nome, rosto e limites.',
  body: 'A Persona roda no seu computador. Suas conversas, o Cofre e as chaves ficam aqui, a menos que você decida outra coisa.',
  version: v => `Versão ${v}`,
  creditsTitle: 'Feito sobre o trabalho de',
  creditWhat: {
    'deepseek-harness': 'A base do app: o que roda no seu computador, os plugins e a janela.',
    'oar': 'Como as personas usam o Claude, o Codex e outras IAs.',
    't3code': 'Ideias de atalhos de teclado e da caixa de mensagem que adaptamos.',
  },
  license: spdx => `Licença ${spdx}`,
  thirdParty: 'Ver avisos de terceiros',
  madeBy: 'Arte da equipe por Brush.',
  artAlt: 'A equipe da Persona posando junta: Atlas, Bento, Nina, Sol e Luna.',
}

export const ABOUT_LABELS_EN: AboutLabels = {
  title: 'About Persona',
  tagline: 'Your AI team, with names, faces and limits.',
  body: 'Persona runs on your computer. Your conversations, the Vault and your keys stay here unless you decide otherwise.',
  version: v => `Version ${v}`,
  creditsTitle: 'Built on the work of',
  creditWhat: {
    'deepseek-harness': 'The app’s foundation: what runs on your computer, plugins and the window.',
    'oar': 'How personas use Claude, Codex and other AIs.',
    't3code': 'Keyboard shortcut and message box ideas we adapted.',
  },
  license: spdx => `${spdx} license`,
  thirdParty: 'See third-party notices',
  madeBy: 'Team art by Brush.',
  artAlt: 'The Persona team posing together: Atlas, Bento, Nina, Sol and Luna.',
}
