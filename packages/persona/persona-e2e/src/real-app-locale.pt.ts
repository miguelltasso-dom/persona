/** pt-BR copy for real-app E2E (mirrors client-ui-persona locales; tests-only). */

export const onboarding = {
  step1Title: 'Como podemos te chamar?',
  step1Placeholder: 'Ex.: Miguel',
  step2VaultBadge: 'Cofre da empresa',
  step3Title: 'Ferramentas de IA neste computador',
  step4TemplateBlank: 'Em branco',
  step5Title: 'Boas-vindas ao #geral',
  continue: 'Continuar',
  finish: 'Entrar na Persona',
} as const

export const shell = {
  kanban: 'Quadros',
  channels: 'Canais',
  team: 'Equipe',
} as const

export const chat = {
  /** Matches `persona.chat` `composer.placeholderChannel` (dirD #geral field). */
  composerPlaceholder: 'Escreva uma mensagem em #geral…',
  composerPlaceholderLegacy: 'Mensagem para #geral…',
  /** WAVE2 default assunto "Geral" via `composer.placeholderInSubject`. */
  composerPlaceholderInSubject: 'Mensagem em Geral…',
  send: 'Enviar',
} as const
