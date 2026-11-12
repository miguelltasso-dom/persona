/**
 * Moldura fixa das abas de Configurações (revisão do Carbon, quill-b8-lote2, item 2): o corpo rola dentro dela, abaixo da barra de
 * abas, e a guilhotina de 12 px no topo vale só quando o corpo já rolou (scrollTop > 0). A máscara fica na moldura, então não rola
 * junto com o conteúdo.
 */

import type { ReactNode } from 'react'
import { useState } from 'react'
import styles from './SettingsScrollFrame.module.css'

export interface SettingsScrollFrameProps {
  readonly children: ReactNode
}

export function SettingsScrollFrame({ children }: SettingsScrollFrameProps): ReactNode {
  const [scrolled, setScrolled] = useState(false)
  return (
    <div
      className={styles.frame}
      data-scrolled={scrolled ? 'true' : 'false'}
      onScrollCapture={(event) => {
        const target = event.target
        if (target instanceof HTMLElement) setScrolled(target.scrollTop > 0)
      }}
    >
      {children}
    </div>
  )
}
