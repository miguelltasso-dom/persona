/**
 * "Seus números" (colheita item 19a) · the BODY of an indicator: the six kinds, drawn from data (`IndicatorUiData`). Shared by the pinned card
 * and the preview in the thread. A trend always carries its words; a bar chart and a line never animate their drawing; nothing counts up
 * (it is data, not a party).
 */

import type { ReactNode } from 'react'
import {
  barFractions,
  goalPercentOf,
  linePoints,
  trendToneOf,
  type IndicatorUiData,
} from './indicators-model.ts'
import { itext } from './indicators-text.ts'
import styles from './IndicatorBody.module.css'

const LINE_W = 240
const LINE_H = 56
const LIST_VISIBLE = 4

function Arrow({ direction }: { readonly direction: 'up' | 'down' | 'flat' }): ReactNode {
  const path = direction === 'up' ? 'M8 13V3M3.5 7.5 8 3l4.5 4.5' : direction === 'down' ? 'M8 3v10M3.5 8.5 8 13l4.5-4.5' : 'M3 8h10M9 4l4 4-4 4'
  return (
    <svg className={styles.arrow} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IndicatorBody({ data }: { readonly data: IndicatorUiData }): ReactNode {
  switch (data.kind) {
    case 'numero': {
      const tone = trendToneOf(data.trend)
      return (
        <div className={styles.number}>
          <p className={styles.value} data-indicator-value>{data.value}</p>
          {data.trend !== undefined && (
            <p className={`${styles.trend} ${styles[tone]}`} data-tone={tone}>
              <Arrow direction={data.trend.direction} />
              <span>{data.trend.text}</span>
              <span className="persona-sr-only"> ({itext(data.trend.direction === 'up' ? 'trend.up' : data.trend.direction === 'down' ? 'trend.down' : 'trend.flat')})</span>
            </p>
          )}
        </div>
      )
    }
    case 'meta': {
      const percent = goalPercentOf(data)
      const unit = data.unit === undefined ? '' : ` ${data.unit}`
      return (
        <div className={styles.goal}>
          <p className={styles.value}>{itext('goal.of', { value: `${String(data.value)}${unit}`, goal: String(data.goal) })}</p>
          <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={itext('goal.percent', { percent })}>
            <div className={styles.fill} style={{ width: `${String(percent)}%` }} />
          </div>
          <p className={styles.small}>{itext('goal.percent', { percent })}</p>
        </div>
      )
    }
    case 'barras': {
      const fractions = barFractions(data.points)
      return (
        <ul className={styles.bars} aria-label={data.points.map(point => `${point.label}: ${String(point.value)}`).join(', ')}>
          {data.points.map((point, index) => (
            <li key={`${point.label}:${String(index)}`} className={styles.bar} title={`${point.label}: ${String(point.value)}`}>
              <span className={styles.barFill} style={{ height: `${String(Math.max(Math.round((fractions[index] ?? 0) * 100), 3))}%` }} />
              <span className={styles.barLabel}>{point.label}</span>
            </li>
          ))}
        </ul>
      )
    }
    case 'linha': {
      const last = data.points.at(-1)
      const first = data.points[0]
      return (
        <div className={styles.line}>
          <svg viewBox={`0 0 ${String(LINE_W)} ${String(LINE_H)}`} width="100%" height={LINE_H} preserveAspectRatio="none" role="img" aria-label={data.points.map(point => `${point.label}: ${String(point.value)}`).join(', ')}>
            <polyline points={linePoints(data.points, LINE_W, LINE_H)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <p className={styles.lineEnds}>
            <span>{first === undefined ? '' : `${first.label}: ${String(first.value)}`}</span>
            <span>{last === undefined ? '' : `${last.label}: ${String(last.value)}`}</span>
          </p>
        </div>
      )
    }
    case 'lista': {
      const shown = data.items.slice(0, LIST_VISIBLE)
      const more = data.items.length - shown.length
      return (
        <ul className={styles.list}>
          {shown.map((item, index) => (
            <li key={`${item.text}:${String(index)}`} className={styles.item} data-state={item.state}>
              <span className={`${styles.mark} ${item.state === 'ok' ? styles.markOk : styles.markWarn}`} aria-hidden="true">{item.state === 'ok' ? '✓' : '!'}</span>
              <span>{item.text}</span>
              <span className="persona-sr-only"> ({itext(item.state === 'ok' ? 'list.ok' : 'list.attention')})</span>
            </li>
          ))}
          {more > 0 && <li className={styles.more}>{itext('list.more', { count: more })}</li>}
        </ul>
      )
    }
    case 'resumo':
      return (
        <div className={styles.summary} tabIndex={0}>
          {data.sentences.map((sentence, index) => <p key={`${sentence}:${String(index)}`}>{sentence}</p>)}
        </div>
      )
  }
}
