/** pt-BR copy for real-app E2E (mirrors client-ui-persona locales; tests-only). */

export const onboarding = {
  step1Title: 'Como podemos te chamar?',
  step1Placeholder: 'Ex.: Miguel',
  step2VaultBadge: 'Memória da empresa',
  step3Title: 'Ferramentas de IA neste computador',
  step4TemplateBlank: 'Em branco',
  step5Title: 'Primeira entrega',
  step5TitleLegacy: 'Boas-vindas ao #geral',
  continue: 'Continuar',
  finish: 'Entrar na Persona',
  enterApp: 'Entrar sem pedir agora',
  requestNow: 'Pedir agora',
} as const

export const shell = {
  kanban: 'Quadros',
  /** NAV-SPEC A-1 (navPlaces, ON by default in v1.1): the rail place that opens on the board; "Quadros" is its first tab, no longer a rail item. */
  projects: 'Projetos',
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
