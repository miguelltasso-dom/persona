/**
 * Enfeites da casa e da noite (NIGHT-THEME-SPEC §2–4, BR-P4), atrás de `persona.flag.houseDecor` (`house-decor-flag.ts`).
 *
 * Todo enfeite aqui: `aria-hidden`, `alt=""`, `pointer-events: none`, SEM movimento (só o confete de um marco, uma vez), fora do conteúdo e do texto, e some a 200% e em
 * forced-colors (CSS). Desligada a flag, cada função devolve `null`/`undefined` e a tela fica como era (nenhum nó a mais).
 * O teto do "não poluir": no máximo 1 enfeite por cartão (quem monta decide onde) e 2 animados na tela (aqui: no máximo 1, o confete).
 */

import type { CSSProperties, ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { isHouseDecorEnabled } from './house-decor-flag.ts'
import styles from './HouseDecor.module.css'

/** A mesma cena em dois temas: as duas imagens existem, o CSS mostra a do tema (o quadro é o MESMO, o título não pula). */
function ThemedPair({ day, night, size }: { readonly day: string; readonly night: string; readonly size?: number | undefined }): ReactNode {
  const style = size === undefined ? undefined : { maxHeight: size, maxWidth: size }
  return (
    <span className={styles.pair} aria-hidden="true">
      <img className={styles.dayOnly} src={day} alt="" {...(style === undefined ? {} : { style })} />
      <img className={styles.nightOnly} src={night} alt="" {...(style === undefined ? {} : { style })} />
    </span>
  )
}

/**
 * A arte de um estado vazio com a versão noturna (`empty-*-noite`, só no escuro). Devolve `undefined` quando a flag está desligada ou
 * alguma das duas artes não existe: quem chama cai na ilustração de sempre.
 * @param dayKey - Chave da arte do dia em `ILLUSTRATIONS` (ex.: `empty-aprovacoes`).
 * @param nightKey - Chave da versão noturna (ex.: `empty-aprovacoes-noite`).
 * @param artSize - Tamanho máximo em px da ilustração (como o `artSize` do `EmptyState`).
 */
export function houseEmptyArt(dayKey: string, nightKey: string, artSize?: number): ReactNode | undefined {
  if (!isHouseDecorEnabled()) return undefined
  const day = ILLUSTRATIONS[dayKey]
  const night = ILLUSTRATIONS[nightKey]
  if (day === undefined || night === undefined) return undefined
  return <ThemedPair day={day} night={night} size={artSize} />
}

/**
 * Um ramo saindo de cima do canto de um cartão grande (Visão geral, Aprovações): 1 por cartão. Vai como filho do cartão (que é
 * `position: relative`); fica na margem de cima, sem cobrir título, ações nem texto.
 */
export function CardSprig(): ReactNode {
  if (!isHouseDecorEnabled()) return null
  const url = ILLUSTRATIONS['corner-leaf-tl']
  if (url === undefined) return null
  return (
    <span className={styles.sprig} aria-hidden="true" data-house-decor="sprig">
      <img src={url} alt="" />
    </span>
  )
}

/**
 * Os rabiscos da casa no cabeçalho da Visão geral (sol e xícara de dia; lua, luminária e estrelas à noite): ENTRE o título e o botão
 * "Nova tarefa", nunca atrás dele. Some a 200%, em forced-colors e quando o cabeçalho empilha (≤ 960).
 */
export function HeaderDoodles(): ReactNode {
  if (!isHouseDecorEnabled()) return null
  const day = ILLUSTRATIONS['header-doodles-light']
  const night = ILLUSTRATIONS['header-doodles-dark']
  if (day === undefined || night === undefined) return null
  return (
    <div className={styles.doodles} aria-hidden="true" data-house-decor="doodles">
      <ThemedPair day={day} night={night} />
    </div>
  )
}

/** Chave do ícone-cena de um canal de equipe pelo nome (`marketing`, `atendimento`, `financeiro`, `diretoria`, `produto`); outro nome = `channel-equipe`. */
export function channelSceneKey(name: string): string {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  for (const key of ['marketing', 'atendimento', 'financeiro', 'diretoria', 'produto']) {
    if (plain.includes(key)) return `channel-${key}`
  }
  return 'channel-equipe'
}

/**
 * O ícone-cena (48 px) de uma equipe, para o cabeçalho do canal dela. Sem flag ou sem arte: `null` (quem chama mantém o que já mostra).
 * @param name - O nome da equipe ("Marketing").
 */
export function channelScene(name: string): ReactNode | null {
  if (!isHouseDecorEnabled()) return null
  const url = ILLUSTRATIONS[channelSceneKey(name)]
  if (url === undefined) return null
  return (
    <span className={styles.scene} aria-hidden="true" data-house-decor="scene">
      <img src={url} alt="" />
    </span>
  )
}

/** O mesmo ícone-cena como componente. */
export function ChannelSceneIcon({ name }: { readonly name: string }): ReactNode {
  return channelScene(name)
}

const STAMP_KEYS = ['stamp-feito', 'stamp-boa', 'stamp-uau'] as const

/**
 * The drawn stamp of an accepted delivery ("feito", "boa!" or "uau!"; BR-P4 #12): one per card, picked by a stable hash of `seed`
 * (the same card always wears the same stamp; different cards get different ones). The word is DRAWING, never UI: the caller keeps
 * the real text ("Aprovado") and the accessible name. `undefined` without the flag or the art: the usual paw stamp.
 * @param seed - Any stable text of the card (its id).
 */
export function houseStampUrl(seed: string): string | undefined {
  if (!isHouseDecorEnabled()) return undefined
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  return ILLUSTRATIONS[STAMP_KEYS[hash % STAMP_KEYS.length]!]
}

const CONFETTI_LEAVES = 8

/**
 * O confete de folhinhas de UM marco ("Sprint concluída"; BR-P4 #13): 8 folhas caem UMA vez (≤ 1,2 s no total) sobre o aviso. Nunca em
 * loop. Com reduced-motion viram as mesmas folhas PARADAS ao redor do título; em forced-colors some. Sem a flag (ou sem a arte) devolve
 * os filhos como estão: nem um nó a mais.
 * @param children - O aviso do marco (o `Toast` da sprint concluída).
 */
export function ConfettiMoment({ children }: { readonly children: ReactNode }): ReactNode {
  if (!isHouseDecorEnabled()) return children
  const url = ILLUSTRATIONS['confetti-leaves']
  if (url === undefined) return children
  return (
    <div className={styles.confettiHost} data-house-decor="confetti-host">
      {children}
      <span className={styles.confetti} aria-hidden="true" data-house-decor="confetti" style={{ '--confetti-url': `url("${url}")` } as CSSProperties}>
        {Array.from({ length: CONFETTI_LEAVES }, (_, index) => (
          <span key={index} className={styles.leaf} style={{ '--i': index } as CSSProperties} />
        ))}
      </span>
    </div>
  )
}
