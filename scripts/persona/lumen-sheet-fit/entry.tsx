// Lumen: the review sheet inside a stand-in for the real shell (bundle 6, pre-accept `dialogo`). Built by scripts/persona/lumen-sheet-fit.mjs. Not shipped with the app.
// What matters is the box the sheet's `position: fixed` backdrop resolves against: in the real shell the page area (`main`) keeps an IDENTITY
// transform after its enter animation, so the backdrop is that area (58 px shorter than the window, under the tab bar), not the window.
import { createRoot } from 'react-dom/client'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import { KanbanReviewSheet } from '../../../packages/persona/client-ui-persona/src/client/review/KanbanReviewSheet.tsx'
import { REVIEW_DEV_TASK_TITLE, REVIEW_DEV_TICKET_ID } from '../../../packages/persona/client-ui-persona/src/client/review/review-dev-sample.ts'

try {
  // The capture-only sample of "Revisar mudanças" (it says "Exemplo" and never reaches a host).
  localStorage.setItem('persona.devSeed.v1', '1')
  localStorage.setItem('persona.devSeed.review', '1')
} catch { /* storage blocked */ }

if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.setAttribute('data-ds-dark-theme', 'true')
// The app's body has no margin (the browser default 8 px would push the whole stand-in 8 px out of the window).
document.body.style.margin = '0'

// The rail is 296 px wide at 1440 and collapsed (64 px) below that, as in the real shell.
const RAIL = window.innerWidth >= 1200 ? 296 : 64

createRoot(document.getElementById('root')!).render(
  <div data-persona-root="" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--persona-paper)', color: 'var(--persona-ink)' }}>
    <aside aria-hidden="true" style={{ flex: 'none', width: RAIL, background: 'var(--persona-rail)' }} />
    <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ flex: 'none', height: 58 }} />
      <main data-gallery-main="" style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', transform: 'matrix(1, 0, 0, 1, 0, 0)' }}>
        <KanbanReviewSheet
          persona={{} as never}
          scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
          ticketId={REVIEW_DEV_TICKET_ID}
          taskTitle={REVIEW_DEV_TASK_TITLE}
          onClose={() => {}}
          onMutate={() => {}}
        />
      </main>
    </div>
  </div>,
)
