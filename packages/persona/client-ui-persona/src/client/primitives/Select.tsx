/**
 * Select do design system (cena 16 da Muse; DESIGN-SYSTEM §"sem <select> nativo sem estilo"): o `<select>` nativo com a borda, o raio,
 * o fundo e a fonte dos tokens. É o mesmo elemento: teclado, leitor de tela e `aria-*` ficam como são.
 */

import type { ReactNode, SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function Select({ className, children, ...rest }: SelectProps): ReactNode {
  const merged = [styles.select, className ?? ''].filter(Boolean).join(' ')
  return <select className={merged} {...rest}>{children}</select>
}
