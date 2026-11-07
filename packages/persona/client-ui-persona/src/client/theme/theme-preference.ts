/**
 * TH-1 (Configurações › Aparência): a escolha de tema da pessoa — Sistema, Claro ou Escuro.
 *
 * A fonte da verdade é a preferência do host (`ctx.theme`, do ui-theme): `setTheme` grava no Config do usuário e publica `theme/change`;
 * o `ThemePresenter` escreve `html[data-ds-theme-source]` e o `body`, e o `install-color-scheme` normaliza o atributo do Persona AO VIVO.
 * Este módulo é só a ponte: lê/escreve essa preferência, mantém um ESPELHO no localStorage e sabe aplicar a escolha sozinho quando não há
 * serviço de tema (galeria, prévia web).
 *
 * NA ABERTURA (sem piscar o tema errado): no app real quem pinta primeiro é o boot do host (`ui-theme/src/boot-theme.ts`): a cada carga da
 * página ele embute a preferência SALVA NO CONFIG DO USUÁRIO — cor do canvas no `<head>`, `html[data-ds-theme-source]` e o `body` — antes de qualquer
 * plugin. O Persona só completa: o boot escreve a PRESENÇA (`""`) e a paleta casa o valor "true" ({@link applyStoredThemeEarly}). O espelho
 * serve onde não há esse boot (galeria, prévia web) e a `PERSONA_THEME` (tema forçado do app instalado) vence os dois.
 */

import {
  THEME_SOURCE_ATTRIBUTE,
  applyPersonaColorScheme,
  readForcedTheme,
  resolvePersonaDark,
  type ThemeChoice,
} from './install-color-scheme.ts'

export { readForcedTheme, type ThemeChoice }

/** As três escolhas, na ordem dos cartões (Sistema primeiro: é o padrão). */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system'

/** Espelho da escolha no localStorage: só acelera a primeira pintura; o Config do usuário manda. */
export const THEME_MIRROR_KEY = 'persona.theme'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark'
}

function localStore(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** A escolha espelhada, ou `undefined` (nunca gravada, valor inválido ou storage bloqueado). */
export function readThemeMirror(store: Pick<Storage, 'getItem'> | undefined = localStore()): ThemeChoice | undefined {
  try {
    const value = store?.getItem(THEME_MIRROR_KEY)
    return isThemeChoice(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function writeThemeMirror(choice: ThemeChoice, store: Pick<Storage, 'setItem'> | undefined = localStore()): void {
  try {
    store?.setItem(THEME_MIRROR_KEY, choice)
  } catch {
    /* storage bloqueado (janela privada, dados limpos): o Config do usuário segue valendo */
  }
}

/**
 * Escreve a escolha como o `ThemePresenter` do host escreveria: `html[data-ds-theme-source]` (`system`/`light`/`dark`) e o
 * `color-scheme` do `<html>` (controles nativos e barras de rolagem). "Sistema" devolve o `color-scheme` ao navegador.
 */
export function applyThemeSource(root: HTMLElement, choice: ThemeChoice): void {
  if (root.getAttribute(THEME_SOURCE_ATTRIBUTE) !== choice) root.setAttribute(THEME_SOURCE_ATTRIBUTE, choice)
  if (choice === 'system') root.style.removeProperty('color-scheme')
  else root.style.colorScheme = choice
}

/**
 * Pinta o tema salvo ANTES do app montar (sem piscar o tema errado na abertura): o tema forçado, senão o espelho. Não sobrescreve o que o
 * host já escreveu. Sem `body` ainda (script no `<head>`), só o `<html>` é marcado; o `install-color-scheme` completa quando o `body` existir.
 */
export function applyStoredThemeEarly(doc: Document = document, win: Window = window): void {
  const forced = readForcedTheme(win)
  const choice = forced ?? readThemeMirror()
  const root = doc.documentElement
  if (choice !== undefined && root.getAttribute(THEME_SOURCE_ATTRIBUTE) === null) applyThemeSource(root, choice)
  const body = doc.body as HTMLElement | null
  if (body === null) return
  // Nada se sabe do tema (sem o boot do host, sem espelho, sem forçado): fica para o instalador, que segue o sistema.
  if (root.getAttribute(THEME_SOURCE_ATTRIBUTE) === null && forced === undefined) return
  // Com o boot do host o `html[data-ds-theme-source]` já traz o Config do usuário; o `body` dele vem com a PRESENÇA (`""`), e aqui vira o valor "true".
  applyPersonaColorScheme(body, resolvePersonaDark(root, win.matchMedia('(prefers-color-scheme: dark)').matches, forced))
}

/** O que o painel precisa: ler, trocar e ouvir a escolha. */
export interface ThemeBridge {
  /** Onde a escolha fica guardada: `config` (Config do usuário, via o serviço de tema do host) ou `local` (só neste navegador). */
  readonly persistence: 'config' | 'local'
  /** A escolha gravada (não a resolvida: "Sistema" continua "Sistema" mesmo com o Windows no escuro). */
  read(): ThemeChoice
  /** Troca ao vivo e persiste. */
  write(choice: ThemeChoice): void
  /** Avisa de toda troca (feita aqui, em Configurações do DSW ou vinda do Config). Devolve o cancelamento. */
  subscribe(listener: (choice: ThemeChoice) => void): () => void
}

/** O pedaço do `ThemeRuntime` do ui-theme que usamos (o Persona não depende do pacote; o serviço é opcional). */
interface ThemeServiceLike {
  getTheme(): { readonly preference: string }
  setTheme(id: string): void
}

interface ThemeContextLike {
  get(name: 'theme'): unknown
  on(event: 'theme/change', listener: (snapshot: { readonly preference: string }) => void): () => void
}

function isThemeService(value: unknown): value is ThemeServiceLike {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ThemeServiceLike>
  return typeof candidate.getTheme === 'function' && typeof candidate.setTheme === 'function'
}

/** Um tema registrado por plugin (id fora das três escolhas) conta como "Sistema" para este painel. */
function choiceOf(preference: string): ThemeChoice {
  return isThemeChoice(preference) ? preference : DEFAULT_THEME_CHOICE
}

function findThemeService(ctx: unknown): ThemeServiceLike | undefined {
  try {
    const service = (ctx as ThemeContextLike).get('theme')
    return isThemeService(service) ? service : undefined
  } catch {
    return undefined
  }
}

/**
 * Sem serviço de tema (galeria, prévia web): grava o espelho e aplica a escolha no `<html>`; o observador do `install-color-scheme`
 * troca o `body` na hora. A escolha vale só neste navegador.
 */
export function createLocalThemeBridge(doc: Document = document): ThemeBridge {
  const listeners = new Set<(choice: ThemeChoice) => void>()
  return {
    persistence: 'local',
    read: () => readThemeMirror() ?? DEFAULT_THEME_CHOICE,
    write(choice) {
      writeThemeMirror(choice)
      applyThemeSource(doc.documentElement, choice)
      for (const listener of listeners) listener(choice)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** A ponte do app: o serviço de tema do host quando existe (grava no Config do usuário), senão a local. */
export function createThemeBridge(ctx: unknown): ThemeBridge {
  const service = findThemeService(ctx)
  if (service === undefined) return createLocalThemeBridge()
  const events = ctx as ThemeContextLike
  return {
    persistence: 'config',
    read: () => choiceOf(service.getTheme().preference),
    write(choice) {
      service.setTheme(choice)
      writeThemeMirror(choice)
      // Medido no shell real (bundle 3): neste perfil o `ThemePresenter` do host NÃO escreve no DOM, então `setTheme` gravava a preferência e nada mudava na
      // tela. O Persona aplica a escolha sozinho (os mesmos valores que o presenter escreveria, então os dois juntos não se contradizem).
      if (typeof document !== 'undefined') applyThemeSource(document.documentElement, choice)
    },
    subscribe: listener => events.on('theme/change', (snapshot) => { listener(choiceOf(snapshot.preference)) }),
  }
}

/**
 * Mantém o DOM e o espelho em dia com a preferência do host: toda troca (aqui, no modal de Configurações do DSW, ou vinda do Config
 * quando ele chega depois da abertura) escreve `html[data-ds-theme-source]`/`color-scheme` e o espelho que a próxima abertura usa. Sem isto o
 * tema só mudava se o `ThemePresenter` do host estivesse ativo, e no shell real (bundle 3) ele não está. O `install-color-scheme` troca o `body`.
 * @returns cancelamento (testes); o app nunca o chama.
 */
export function installThemeSync(ctx: unknown): () => void {
  if (findThemeService(ctx) === undefined) return () => undefined
  return (ctx as ThemeContextLike).on('theme/change', (snapshot) => {
    if (!isThemeChoice(snapshot.preference)) return
    writeThemeMirror(snapshot.preference)
    if (typeof document !== 'undefined') applyThemeSource(document.documentElement, snapshot.preference)
  })
}
