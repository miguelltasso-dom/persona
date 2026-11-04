import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * The hooks the host merges into every slot's props (usePanelInfo, useRemoteAccess, useSessions, ...). The shell specs
 * render the Persona components directly and never call them, so an empty bag typed as the full contract keeps the
 * strict client program honest without faking ten hooks.
 */
export const globalStandardProps = {} as GlobalStandardProps
