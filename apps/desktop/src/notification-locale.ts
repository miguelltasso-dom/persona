/** Native notification copy; unsupported shell locales use English. */
export const notificationMessages = {
  en: {
    done: '{persona} finished', review: '{persona} has changes for you to review',
    needsYou: '{persona} needs you', question: '{persona} asked', failed: '{persona} couldn’t finish',
    reviewBody: '“{task}” · Nothing changes in your folder until you apply.',
    grouped: 'While you were away', needsOne: '{count} thing needs you', needsMany: '{count} things need you',
    doneOne: '{count} delivery', doneMany: '{count} deliveries', unknownFailure: 'This task needs your help.',
    failures: {
      not_logged_in: 'The AI is not connected on this computer.', cli_not_found: 'The AI is not installed on this computer.',
      model_unavailable: 'The selected model is unavailable.', quota_exhausted: 'The AI account has reached its limit.',
      budget_exhausted: 'The monthly budget has been reached.', provider_unreachable: 'The AI service could not be reached.',
      engine_unavailable: 'The AI is unavailable on this computer.', app_offline: 'The team is offline.',
    } as Readonly<Record<string, string>>,
  },
  pt: {
    done: '{persona} terminou', review: '{persona} deixou mudanças para você revisar',
    needsYou: '{persona} precisa de você', question: '{persona} perguntou', failed: '{persona} não conseguiu terminar',
    reviewBody: '“{task}” · Nada muda na sua pasta até você aplicar.',
    grouped: 'Enquanto você estava fora', needsOne: '{count} coisa espera você', needsMany: '{count} coisas esperam você',
    doneOne: '{count} entrega', doneMany: '{count} entregas', unknownFailure: 'Esta tarefa precisa da sua ajuda.',
    failures: {
      not_logged_in: 'A IA não está conectada neste computador.', cli_not_found: 'A IA não está instalada neste computador.',
      model_unavailable: 'O modelo escolhido não está disponível.', quota_exhausted: 'A conta da IA chegou ao limite.',
      budget_exhausted: 'O orçamento deste mês acabou.', provider_unreachable: 'Não consegui falar com o serviço de IA agora.',
      engine_unavailable: 'A IA não está disponível neste computador.', app_offline: 'A equipe está fora do ar.',
    } as Readonly<Record<string, string>>,
  },
} as const

/** @param locale - Desktop locale ID. @returns Portuguese or English native notification copy. */
export function nativeNotificationMessages(locale: string): typeof notificationMessages.pt | typeof notificationMessages.en {
  return locale.toLowerCase().startsWith('pt') ? notificationMessages.pt : notificationMessages.en
}
