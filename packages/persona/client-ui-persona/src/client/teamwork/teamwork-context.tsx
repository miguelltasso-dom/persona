/**
 * EQUIPE REAL (D-090): quem a tela sabe nomear. O chip "Pedido por {A}" precisa do NOME e do rosto de {A}; o cartão do quadro só tem o
 * id da persona. Quem monta o quadro conectado lê a equipe UMA vez e entrega esta tabela por contexto (sem atravessar 4 componentes);
 * sem ela (sem flag, sem equipe lida) o chip não existe: nunca "Pedido por 3f9a…".
 */

import { createContext, useContext, type ReactNode } from 'react'
import { bindLocale } from '../preview/locale-bind.ts'

export interface TeamworkPersona {
  readonly name: string
  readonly avatarSrc?: string | undefined
}

export interface TeamworkContextValue {
  /** A persona pelo id do host; `undefined` quando a equipe não a conhece (o chip, então, não aparece). */
  readonly personaFor: (personaId: string) => TeamworkPersona | undefined
  /** Abre o "Caminho do trabalho" do cartão (só existe quando há o que mostrar). */
  readonly openPath?: ((cardId: string) => void) | undefined
}

const TeamworkContext = createContext<TeamworkContextValue | undefined>(undefined)

export function TeamworkProvider({ value, children }: { readonly value: TeamworkContextValue; readonly children: ReactNode }): ReactNode {
  return <TeamworkContext.Provider value={value}>{children}</TeamworkContext.Provider>
}

/** `undefined` fora do provedor (telas sem equipe real): quem usa não desenha nada. */
export function useTeamwork(): TeamworkContextValue | undefined {
  return useContext(TeamworkContext)
}

/**
 * Texto novo com o mesmo recurso das demais telas: o locale gerado desta build pode não ter a chave ainda (o gen roda numa janela
 * combinada) e a tela nunca mostra uma chave crua. O fallback é o mesmo texto do JSON de origem.
 */
export function teamworkText(
  dict: Readonly<Record<string, string>>,
  key: string,
  fallback: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const text = bindLocale(dict, key, params)
  if (text !== key && text.length > 0) return text
  return Object.entries(params).reduce((line, [name, value]) => line.split(`{${name}}`).join(String(value)), fallback)
}
