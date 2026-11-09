/**
 * HT-0/HT-2/HT-4 (D-084): the tools a persona uses to operate the product itself — board, sprints, routines — served on the turn
 * lease like the brain and gestor tools. The domain, the ACL and every rule live in the HOST ports (`persona-host/src/harness-*.ts`);
 * this file only declares the tools and binds them to the run: `personaId`/`ticketId`/`assignmentId` come from the run that opened
 * the turn, never from the arguments (a forged one is refused by the gateway), and every call carries an id that is new for each
 * call of the lease (and different on every lease), so the host can make a retry of the SAME call act once while a deliberate
 * repeat (move, move back, move again) still acts.
 */

import { randomUUID } from 'node:crypto'
import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool, PersonaRunIdentity } from './persona-tools.ts'

/** Tool ids announced on a turn lease. Reads first; everything else changes the product. */
export const HARNESS_TOOLS = [
  'board_list',
  'board_card_move',
  'sprint_list',
  'sprint_create',
  'sprint_plan',
  'sprint_start',
  'sprint_close',
  'routine_list',
  'routine_create',
  'routine_update',
  'routine_pause',
  // HT-6 (D-084): bring a person to the team. Only a persona the person allowed to hire; a card in Aprovações unless she turned “Contratar direto” on.
  'persona_hire',
  // TEAM-4 (D-090 #4): ask the whole team's opinion about your draft. The cap of rounds, the daily cap and who is asked are the HOST's
  // (`persona-host/src/opinion-host.ts`); the model only says what it wants asked. The round closes itself (the host consolidates).
  'ask_team_opinion',
  // TEAM tools of a REAL persona (D-090, 05/11): the behaviors the host already runs as ports, now spoken by the live CLI. The limits, the
  // circle, the mandate and the cap are the HOST's (`persona-host/src/harness-team.ts` over `handoffs.ts`); the model only says whom and what.
  'ask_colleague',
  'pass_forward',
  'review_verdict',
] as const

export type HarnessToolName = typeof HARNESS_TOOLS[number]

/** One call, as the host receives it. */
export interface HarnessCall {
  readonly tool: HarnessToolName
  /** Who opened the turn (from the lease, never from the arguments). */
  readonly run: PersonaRunIdentity
  readonly args: Record<string, unknown>
  /** New for each call of the turn: the same id twice means a retry of the same call. */
  readonly callId: string
}

/** The host's side: which tools it has wired, and ONE dispatch that runs them and answers with a JSON sentence. */
export interface HarnessMcpPorts {
  /** Only these are announced (a tool with nothing behind it would make the model plan around a capability that is not there). */
  readonly tools?: readonly HarnessToolName[]
  call?: (input: HarnessCall) => Promise<string>
}

const OBJECT = { type: 'object', additionalProperties: false } as const
const STR = { type: 'string' } as const

const SCHEDULE = {
  type: 'object',
  additionalProperties: false,
  required: ['frequency'],
  description: 'When it runs. Never cron: pick a frequency and the time of day in the routine zone.',
  properties: {
    frequency: { type: 'string', enum: ['hourly', 'daily', 'weekdays', 'weekly', 'monthly'] },
    time: { type: 'string', description: 'HH:MM, local to the routine zone (ignored for hourly).' },
    days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: 'Weekly: 0 = Sunday … 6 = Saturday.' },
    monthDay: { type: 'integer', minimum: 1, maximum: 31 },
    everyHours: { type: 'integer', minimum: 1 },
  },
} as const

/** Name, description and input schema of each tool. The descriptions say what the person sees happen, in plain words. */
const DEFINITIONS: Readonly<Record<HarnessToolName, { description: string; inputSchema: Record<string, unknown> }>> = {
  board_list: {
    description: 'List the project board: the columns and the cards (id, title, column). Use it before moving a card.',
    inputSchema: { ...OBJECT, properties: {} },
  },
  board_card_move: {
    description: 'Move a card to another column of the board. Cards you own are yours to move on your own initiative; any card when the person asked.',
    inputSchema: { ...OBJECT, required: ['ticketId', 'columnId'], properties: { ticketId: STR, columnId: STR } },
  },
  sprint_list: {
    description: 'List the sprints of the project (id, name, status, cards).',
    inputSchema: { ...OBJECT, properties: {} },
  },
  sprint_create: {
    description: 'Open a planned sprint with a name and the objective. It can be undone (deleted) until it starts.',
    inputSchema: { ...OBJECT, required: ['name', 'objective'], properties: { name: STR, objective: STR, startsAt: STR, endsAt: STR } },
  },
  sprint_plan: {
    description: 'Set the cards of a sprint (replaces its current set). It can be undone.',
    inputSchema: { ...OBJECT, required: ['sprintId', 'ticketIds'], properties: { sprintId: STR, ticketIds: { type: 'array', items: STR } } },
  },
  sprint_start: {
    description: 'Start a planned sprint. It becomes active and the team gets its goal. This cannot be undone.',
    inputSchema: { ...OBJECT, required: ['sprintId'], properties: { sprintId: STR } },
  },
  sprint_close: {
    description: 'Close a sprint; the cards left go to the next sprint or to the backlog. This cannot be undone.',
    inputSchema: { ...OBJECT, required: ['sprintId', 'leftover'], properties: { sprintId: STR, leftover: { type: 'string', enum: ['next', 'backlog'] } } },
  },
  routine_list: {
    description: 'List the routines of the project (so you do not create a duplicate).',
    inputSchema: { ...OBJECT, properties: {} },
  },
  routine_create: {
    description: 'Create a routine you own: a name, what to do each time (prompt) and a friendly schedule. Limits apply per day and per persona.',
    inputSchema: {
      ...OBJECT, required: ['name', 'prompt', 'schedule'],
      properties: { name: STR, prompt: STR, schedule: SCHEDULE, ownerPersonaId: STR, timeZone: STR, silenceStart: STR, silenceEnd: STR },
    },
  },
  routine_update: {
    description: 'Edit a routine you own (name, prompt, schedule, zone, silence window).',
    inputSchema: {
      ...OBJECT, required: ['id'],
      properties: { id: STR, name: STR, prompt: STR, schedule: SCHEDULE, ownerPersonaId: STR, timeZone: STR, catchUp: STR, silenceStart: STR, silenceEnd: STR },
    },
  },
  routine_pause: {
    description: 'Pause or resume a routine you own.',
    inputSchema: { ...OBJECT, required: ['id', 'paused'], properties: { id: STR, paused: { type: 'boolean' } } },
  },
  persona_hire: {
    description: 'Ask to bring a new person to the team (name, function, what they do, and why if you have a real reason). '
      + 'Only personas the person allowed to hire can use it. The person decides in Aprovações: the hire only counts after she approves, '
      + 'unless she let you hire directly. The new person never gets more access than you have. You can have a couple of requests waiting at a time.',
    inputSchema: {
      ...OBJECT, required: ['name', 'title', 'description'],
      properties: {
        name: { type: 'string', description: 'The name of the new person.' },
        title: { type: 'string', description: 'Their function on the team, e.g. “Redação”.' },
        description: { type: 'string', description: 'What they do, in one or two sentences.' },
        reason: { type: 'string', description: 'Why the team needs them. Leave it out when you have no real reason.' },
      },
    },
  },
  ask_team_opinion: {
    description: 'Ask the team for a short opinion on your draft (text and/or attached images); each reply is marked liked / suggestion / attention. Rounds cost the person time and money and are limited: use only when worth it, then decide and go on. Art goes as an SVG saved in your draft: the host turns it into a PNG by itself when it is delivered or shown to the team, so never ask anyone to export a PNG.',
    inputSchema: {
      'type': 'object',
      'additionalProperties': false,
      'required': [
        'question',
        'draft',
      ],
      'properties': {
        'question': {
          'type': 'string',
        },
        'draft': {
          'type': 'object',
          'additionalProperties': false,
          'description': 'Text, attached images and/or art saved in your draft folder (at least one)',
          'properties': {
            'text': {
              'type': 'string',
            },
            'attachmentIds': {
              'type': 'array',
              'items': {
                'type': 'string',
              },
            },
            'files': {
              'type': 'array',
              'description': 'Art you SAVED in the draft folder of this task (e.g. "cartaz.svg"); the team sees it (an SVG is drawn as an image)',
              'items': {
                'type': 'string',
              },
            },
            'alt': {
              'type': 'string',
              'description': 'Short image description',
            },
          },
        },
        'audience': {
          'description': "'team' (default) | 'everyone' | colleague ids",
          'anyOf': [
            {
              'type': 'string',
              'enum': [
                'team',
                'everyone',
              ],
            },
            {
              'type': 'array',
              'items': {
                'type': 'string',
              },
            },
          ],
        },
      },
    },
  },
  ask_colleague: {
    description: 'Ask a colleague for help with part of YOUR task and wait for their delivery. Limited per task and per day; not someone already in this chain; two levels at most. After it succeeds, finish what you can and end your turn saying what you wait for; do not do their part. The colleague does NOT see your answer or this conversation: put what they need in done/files, never "below". Art goes as an SVG saved in your draft: the host turns it into a PNG by itself when it is delivered or shown to the team, so never ask anyone to export a PNG.',
    inputSchema: {
      'type': 'object',
      'additionalProperties': false,
      'required': [
        'colleague',
        'title',
      ],
      'properties': {
        'colleague': {
          'type': 'string',
          'description': 'Name or id',
        },
        'title': {
          'type': 'string',
          'description': 'Short title (the person reads it)',
        },
        'done': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
        },
        'needed': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
        },
        'files': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
          'description': 'Project-relative paths',
        },
        'decisions': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
        },
      },
    },
  },
  pass_forward: {
    description: 'Pass the work on to a colleague with a note: your part is done, the next is theirs, and you do not wait. Same limits as asking for help. Then deliver YOUR part; never theirs. Your whole answer of this turn goes along automatically: in the note say only what is missing and what you decided. Art goes as an SVG saved in your draft: the host turns it into a PNG by itself when it is delivered or shown to the team, so never ask anyone to export a PNG.',
    inputSchema: {
      'type': 'object',
      'additionalProperties': false,
      'required': [
        'colleague',
        'title',
      ],
      'properties': {
        'colleague': {
          'type': 'string',
          'description': 'Name or id',
        },
        'title': {
          'type': 'string',
          'description': 'Short title (the person reads it)',
        },
        'done': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
        },
        'needed': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
        },
        'files': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
          'description': 'Project-relative paths',
        },
        'decisions': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
        },
      },
    },
  },
  review_verdict: {
    description: 'Verdict on the work you review: "approve", or "changes" with at most 6 short points. Review tasks only; end with one short sentence.',
    inputSchema: {
      'type': 'object',
      'additionalProperties': false,
      'required': [
        'verdict',
      ],
      'properties': {
        'verdict': {
          'type': 'string',
          'enum': [
            'approve',
            'changes',
          ],
        },
        'points': {
          'type': 'array',
          'items': {
            'type': 'string',
          },
          'description': 'With "changes": what to adjust',
        },
      },
    },
  },
}

/** Identity belongs to the run. (`ticketId` is NOT here: for `board_card_move` it names the CARD.) */
const RUN_OWNED = ['personaId', 'assignmentId', 'workspaceId', 'projectId']

function missing(name: string): string {
  return `${name} unavailable`
}

/**
 * The harness tools bound to one run.
 * @param run - Assignment identity (never an argument).
 * @param ports - The host's dispatch and the list it wired.
 * @param toolLevel - Persona grant; the reads need `read`, the rest `write`.
 */
export function harnessMcpTools(run: PersonaRunIdentity, ports: HarnessMcpPorts, toolLevel: ToolLevel): PersonaMcpTool[] {
  let calls = 0
  // One nonce per lease: a second turn of the same Assignment (or a restart of the process) never reuses the id of an earlier call, so the
  // host's "same call twice acts once" can only ever match a real retry of the SAME call.
  const lease = randomUUID().slice(0, 8)
  return HARNESS_TOOLS
    .filter(name => ports.tools?.includes(name) === true)
    .map((name): PersonaMcpTool => ({
      name,
      description: DEFINITIONS[name].description,
      inputSchema: DEFINITIONS[name].inputSchema,
      handler: async (args) => {
        if (ports.call === undefined) return { content: missing(name) }
        calls += 1
        const clean = Object.fromEntries(Object.entries(args).filter(([key]) => !RUN_OWNED.includes(key)))
        return { content: await ports.call({ tool: name, run, args: clean, callId: `${run.assignmentId}:${lease}:${String(calls)}` }) }
      },
    }))
    .filter(tool => allowsTool(toolLevel, tool.name))
}
