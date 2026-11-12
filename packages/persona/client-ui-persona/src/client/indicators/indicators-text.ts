/**
 * "Seus números" (colheita item 19a): all the words of the feature, in pt-BR, in one typed dictionary (the texts are Muse's, design/COLHEITA-MUSE.md §19a).
 * The Visão geral and the thread share it, and neither owns a locale bundle for it.
 */

export const INDICATORS_PT = {
  'section.title': 'Seus números',
  'section.aria': 'Seus números, atualizados em silêncio',
  'empty.title': 'Nada fixado ainda',
  'empty.body': 'Peça um número a alguém da equipe, como “quanto vendemos ontem?”, e toque em Fixar.',
  'pin.button': 'Fixar na Visão geral',
  'pin.pinned': 'Fixado na Visão geral',
  'offer.group': 'Número de {name}',
  'modal.title': 'Fixar na Visão geral',
  'modal.eyebrow': 'Seus números',
  'modal.name': 'Nome do número',
  'modal.when': 'Quando atualizar',
  'modal.hourly': 'A cada hora',
  'modal.daily': 'Todo dia às 8h',
  'modal.alert': 'Avisar quando cair mais de {pct}%',
  'modal.test': 'Testar agora',
  'modal.testing': 'Testando…',
  'modal.tip': 'Teste antes de fixar: assim você vê o número de verdade.',
  'modal.result': 'Resultado do teste',
  'modal.pin': 'Fixar',
  'modal.pinning': 'Fixando…',
  'modal.cancel': 'Cancelar',
  'modal.close': 'Fechar',
  'modal.testFailed': 'O teste não deu certo.',
  'modal.pinFailed': 'Não deu para fixar agora.',
  'card.updatedAt': 'Atualizado às {time}',
  'card.updatedOn': 'Atualizado em {day} às {time}',
  'card.updating': 'Atualizando…',
  'card.failed': 'Não consegui atualizar',
  'card.why': 'Ver por quê',
  'card.hideWhy': 'Esconder',
  'card.stale': 'de {when}',
  'card.refresh': 'Atualizar agora',
  'card.unpin': 'Tirar da Visão geral',
  'card.more': 'Mais ações de {name}',
  'card.alert': 'Aviso',
  'goal.of': '{value} de {goal}',
  'goal.percent': '{percent}% da meta',
  'list.ok': 'ok',
  'list.attention': 'atenção',
  'list.more': '+{count} itens',
  'trend.up': 'subiu',
  'trend.down': 'caiu',
  'trend.flat': 'igual',
} as const

export type IndicatorsKey = keyof typeof INDICATORS_PT

/**
 * @param key - Dictionary key.
 * @param params - `{name}` placeholders.
 * @returns The pt-BR text.
 */
export function itext(key: IndicatorsKey, params: Readonly<Record<string, string | number>> = {}): string {
  return INDICATORS_PT[key].replace(/\{(\w+)\}/gu, (whole, name: string) => String(params[name] ?? whole))
}
