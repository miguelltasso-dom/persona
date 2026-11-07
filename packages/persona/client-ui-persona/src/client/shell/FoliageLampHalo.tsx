/**
 * Halo da luminária na folhagem do rail (NIGHT-THEME-SPEC §5, Muse 20:29/20:55): um brilho pequeno (~45 px de raio) em volta da luminária
 * da arte v2 da folhagem ESCURA, para a luz do chat parecer vir de lá. Só no escuro, atrás de `persona.flag.lampLight` (quem monta decide) e
 * SÓ com a arte v2 (544×520; a v1 não tem luminária, então o halo não existe). Camada `aria-hidden` atrás de tudo, dentro de `.foliage`:
 * nunca fica atrás do texto da pílula nem da engrenagem. O centro da luminária vem do retângulo REAL com que a arte é desenhada
 * (`object-fit: cover`, ancorada embaixo no centro), medido por ResizeObserver: nada de coordenada fixa de tela.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { HALO_SIZE, foliageLampOffset, isFoliageV2 } from '../chat/lamp-light.ts'
import styles from './PersonaSidebar.module.css'

export function FoliageLampHalo(): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [point, setPoint] = useState<{ readonly x: number; readonly y: number } | null>(null)

  useLayoutEffect(() => {
    const halo = ref.current
    const container = halo?.parentElement
    const image = container?.querySelector<HTMLImageElement>('img[data-persona-foliage-dark]')
    if (container === null || container === undefined || image === null || image === undefined) return undefined
    const compute = (): void => {
      const natural = { width: image.naturalWidth, height: image.naturalHeight }
      if (!isFoliageV2(natural)) { setPoint(null); return }
      const rect = container.getBoundingClientRect()
      setPoint(foliageLampOffset({ width: rect.width, height: rect.height }, natural))
    }
    compute()
    image.addEventListener('load', compute)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(compute)
    observer?.observe(container)
    return () => {
      image.removeEventListener('load', compute)
      observer?.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      className={styles.halo}
      aria-hidden="true"
      hidden={point === null}
      data-persona-lamp-halo={point === null ? undefined : ''}
      style={point === null ? undefined : { left: Math.round(point.x - HALO_SIZE / 2), top: Math.round(point.y - HALO_SIZE / 2) }}
    />
  )
}
