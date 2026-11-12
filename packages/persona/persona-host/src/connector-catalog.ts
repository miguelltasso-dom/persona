/**
 * Item 26, slice 26.4 (host): the curated catalog of business tools the team can use, with what is honestly connectable TODAY.
 *
 * The data is ours (PLUGINS-GAP §3): a small business in Brazil, one sentence per tool in plain Portuguese, and a `via` that says how it
 * connects. A provider nobody confirmed gets `unconfirmed` and is shown as "Em breve" — the catalog never promises a connection that does
 * not exist. Nothing here touches the network or a secret: `linked` comes from the grants the team already has and from the connectors of
 * the person's own account, both read elsewhere.
 */

/** The categories the screen groups by (PLUGINS-GAP §3, 26.4). */
export type ConnectorCategory = 'sales' | 'payments' | 'support' | 'agenda' | 'documents' | 'social' | 'management'

/** How a tool connects. `unconfirmed`: we did not verify an official server yet — the card says "Em breve". */
export type ConnectorVia = 'claude-account' | 'official' | 'token' | 'unconfirmed'

/** One curated tool. */
export interface ConnectorCatalogEntry {
  readonly id: string
  readonly name: string
  readonly category: ConnectorCategory
  /** What the persona does with it, in plain Portuguese. */
  readonly sentence: string
  readonly via: ConnectorVia
  /** The official server address, only for a `via` we verified. */
  readonly url?: string
}

/** One card on the wire. */
export interface ConnectorCatalogCardView extends ConnectorCatalogEntry {
  /** The card can be connected in this wave: never an unconfirmed provider. */
  readonly promised: boolean
  /** The team already has it: a grant of a persona or a connector of the person's own account. */
  readonly linked: boolean
}

/** The catalog as the screen reads it. */
export interface ConnectorCatalogView {
  readonly categories: readonly { readonly id: ConnectorCategory; readonly name: string }[]
  readonly cards: readonly ConnectorCatalogCardView[]
}

/** The category names, in the order the screen shows them. */
export const CONNECTOR_CATEGORIES: readonly { readonly id: ConnectorCategory; readonly name: string }[] = [
  { id: 'sales', name: 'Vendas e loja' },
  { id: 'payments', name: 'Pagamentos' },
  { id: 'support', name: 'Atendimento' },
  { id: 'agenda', name: 'Agenda e e-mail' },
  { id: 'documents', name: 'Documentos' },
  { id: 'social', name: 'Redes sociais' },
  { id: 'management', name: 'Gestão' },
]

/**
 * The curated catalog. `via: 'official'` only where PLUGINS-GAP lists an official server without "(confirmar)"; everything else that the
 * document flags as uncertain stays `unconfirmed` (the card says "Em breve" and offers no button).
 */
export const CONNECTOR_CATALOG: readonly ConnectorCatalogEntry[] = [
  // Agenda e e-mail: today these come from the person's own claude.ai account (ISO-5).
  { id: 'gmail', name: 'Gmail', category: 'agenda', via: 'claude-account', sentence: 'Ler e responder os e-mails do negócio.' },
  { id: 'google-calendar', name: 'Google Agenda', category: 'agenda', via: 'claude-account', sentence: 'Marcar e consultar compromissos.' },
  { id: 'google-drive', name: 'Google Drive', category: 'agenda', via: 'claude-account', sentence: 'Procurar e abrir os arquivos do time.' },
  { id: 'google-sheets', name: 'Google Planilhas', category: 'agenda', via: 'claude-account', sentence: 'Ler e atualizar planilhas.' },
  { id: 'outlook', name: 'Outlook / Microsoft 365', category: 'agenda', via: 'unconfirmed', sentence: 'Ler e responder e-mails e compromissos da Microsoft.' },
  // Pagamentos.
  { id: 'stripe', name: 'Stripe', category: 'payments', via: 'official', url: 'https://mcp.stripe.com', sentence: 'Ver cobranças e criar links de pagamento.' },
  { id: 'mercado-pago', name: 'Mercado Pago', category: 'payments', via: 'unconfirmed', sentence: 'Ver vendas e cobranças do Mercado Pago.' },
  { id: 'asaas', name: 'Asaas', category: 'payments', via: 'unconfirmed', sentence: 'Emitir e consultar cobranças.' },
  { id: 'pagbank', name: 'PagBank', category: 'payments', via: 'unconfirmed', sentence: 'Consultar recebimentos.' },
  { id: 'pagarme', name: 'Pagar.me', category: 'payments', via: 'unconfirmed', sentence: 'Consultar transações.' },
  // Vendas e loja.
  { id: 'shopify', name: 'Shopify', category: 'sales', via: 'official', url: 'https://mcp.shopify.dev/mcp', sentence: 'Ver pedidos e atualizar produtos.' },
  { id: 'nuvemshop', name: 'Nuvemshop', category: 'sales', via: 'unconfirmed', sentence: 'Ver pedidos e estoque da loja.' },
  { id: 'mercado-livre', name: 'Mercado Livre', category: 'sales', via: 'unconfirmed', sentence: 'Ver anúncios, perguntas e vendas.' },
  { id: 'tray', name: 'Tray', category: 'sales', via: 'unconfirmed', sentence: 'Ver pedidos da loja.' },
  { id: 'loja-integrada', name: 'Loja Integrada', category: 'sales', via: 'unconfirmed', sentence: 'Ver pedidos da loja.' },
  // Atendimento.
  { id: 'whatsapp-business', name: 'WhatsApp Business', category: 'support', via: 'unconfirmed', sentence: 'Responder clientes pelo WhatsApp.' },
  { id: 'telegram', name: 'Telegram', category: 'support', via: 'token', sentence: 'Receber e responder mensagens no Telegram.' },
  { id: 'slack', name: 'Slack', category: 'support', via: 'token', sentence: 'Receber e responder mensagens no Slack.' },
  { id: 'discord', name: 'Discord', category: 'support', via: 'token', sentence: 'Receber e responder mensagens no Discord.' },
  { id: 'email-imap', name: 'E-mail da empresa (IMAP)', category: 'support', via: 'token', sentence: 'Ler a caixa de entrada e avisar o que chegou.' },
  // Documentos.
  { id: 'canva', name: 'Canva', category: 'documents', via: 'unconfirmed', sentence: 'Criar e ajustar peças de divulgação.' },
  { id: 'nfe', name: 'Nota fiscal (NF-e)', category: 'documents', via: 'unconfirmed', sentence: 'Emitir e consultar notas fiscais.' },
  // Redes sociais.
  { id: 'instagram', name: 'Instagram', category: 'social', via: 'unconfirmed', sentence: 'Ver mensagens e publicar novidades.' },
  { id: 'facebook', name: 'Facebook', category: 'social', via: 'unconfirmed', sentence: 'Ver mensagens da página.' },
  { id: 'google-business', name: 'Google Meu Negócio', category: 'social', via: 'unconfirmed', sentence: 'Ver avaliações e responder clientes.' },
  // Gestão.
  { id: 'notion', name: 'Notion', category: 'management', via: 'official', url: 'https://mcp.notion.com/mcp', sentence: 'Ler e escrever as páginas do time.' },
  { id: 'trello', name: 'Trello', category: 'management', via: 'unconfirmed', sentence: 'Ver e mover cartões do quadro.' },
  { id: 'asana', name: 'Asana', category: 'management', via: 'unconfirmed', sentence: 'Ver e criar tarefas.' },
  { id: 'bling', name: 'Bling', category: 'management', via: 'unconfirmed', sentence: 'Ver pedidos e estoque do ERP.' },
  { id: 'omie', name: 'Omie', category: 'management', via: 'unconfirmed', sentence: 'Ver pedidos e financeiro do ERP.' },
  { id: 'conta-azul', name: 'Conta Azul', category: 'management', via: 'unconfirmed', sentence: 'Ver o financeiro do negócio.' },
  { id: 'tiny', name: 'Tiny', category: 'management', via: 'unconfirmed', sentence: 'Ver pedidos e estoque do ERP.' },
  { id: 'hubspot', name: 'HubSpot', category: 'management', via: 'unconfirmed', sentence: 'Ver contatos e negociações.' },
  { id: 'rd-station', name: 'RD Station', category: 'management', via: 'unconfirmed', sentence: 'Ver contatos e campanhas.' },
  { id: 'pipedrive', name: 'Pipedrive', category: 'management', via: 'unconfirmed', sentence: 'Ver negociações do funil.' },
]

/** What the catalog needs to know about the team's live state. */
export interface ConnectorCatalogState {
  /** Connectors the team already granted to a persona (names as the CLI shows them). */
  readonly granted: readonly string[]
  /** Connectors of the person's own account (names as the bridge lists them). */
  readonly account: readonly string[]
}

/**
 * Build the catalog the screen shows.
 * @param state - What the team already has.
 * @returns Categories and cards, with `linked` and `promised` decided here (never by the screen).
 */
export function connectorCatalog(state: ConnectorCatalogState): ConnectorCatalogView {
  const names = [...state.granted, ...state.account].map(normalize)
  return {
    categories: CONNECTOR_CATEGORIES,
    cards: CONNECTOR_CATALOG.map(entry => ({
      ...entry,
      promised: entry.via !== 'unconfirmed',
      linked: names.some(name => name.includes(normalize(entry.name)) || normalize(entry.name).includes(name)),
    })),
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}
