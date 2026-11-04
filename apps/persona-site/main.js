// Persona landing (Muse): pt is the source in the HTML; this file swaps to en and toggles the theme.
// Without JS the page is complete in pt and follows the system theme.
(function () {
  'use strict'
  var EN = {
    skip: 'Skip to content',
    navLabel: 'Sections',
    'nav.how': 'How it works', 'nav.features': 'Features', 'nav.privacy': 'Privacy', 'nav.price': 'Price',
    'lang.label': 'PT', 'lang.aria': 'Switch to Portuguese',
    'theme.aria': 'Toggle light and dark theme',
    'cta.short': 'Download',
    'cta.main': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>Download for Windows',
    'cta.how': 'See how it works',
    'cta.trigger': 'No account, no card. Your conversations stay on your PC.',
    'role.atlas': 'Coordinator', 'role.bento': 'Engineering', 'role.nina': 'Research', 'role.sol': 'Relationships', 'role.luna': 'Watch',
    'hero.eyebrow': 'Windows app · free and open source',
    'hero.title': 'Your AI team, with<br>names, faces and limits.',
    'hero.sub': 'Build a team of personas that works on your computer. You ask in the channel, they split the tasks, and you only approve what matters.',
    'proof.title': 'This is the real app, not a mockup',
    'proof.alt': 'Persona’s overview: what needs you comes first and, next to it, what each persona is doing right now.',
    'proof.caption': 'When you open the app, what needs you comes first; next to it, what each persona is doing right now.',
    'team.eyebrow': 'The team',
    'team.title': 'Each persona has a personality and a job',
    'team.lead': 'You start with these five. Change the name, the animal, the role and the limits of any of them, or hire more.',
    'who.atlas': 'Reads your request, splits it into tasks and calls whoever knows how. Can also hire new personas, always with your ok.',
    'who.bento': 'Writes code, runs the tests and only delivers when they pass.',
    'who.nina': 'Researches, compares and sums it up in a few points, saying where each one came from.',
    'who.sol': 'Answers clients in your brand’s tone and tells you when something needs you.',
    'who.luna': 'Keeps an eye out: if someone stops halfway, she nudges them and asks for news.',
    'how.eyebrow': 'How it works',
    'how.title': 'You don’t have to manage every AI',
    'how.lead': 'Instead of copying and pasting between tabs, you talk to a team that organizes itself.',
    'how.1.t': 'Build the team',
    'how.1.b': 'Pick a ready-made team or describe who you need. You adjust name, role and limits before hiring.',
    'how.1.alt': 'Persona’s “Build your team” screen, with ready-made teams and the five animals of the suggested team.',
    'how.2.t': 'Ask in the channel',
    'how.2.b': 'Write in #general the way you would to a colleague. The Coordinator splits the work and shows who took what.',
    'how.2.alt': 'The #general channel with the team strip and the command menu open in the message box.',
    'how.3.t': 'Approve what matters',
    'how.3.b': 'Hires, spending and sensitive deliveries wait for you. Everything else moves on its own, within the limits you set.',
    'how.3.alt': 'Approvals screen with a proposal from Atlas and the Accept, Review and Edit buttons.',
    'feat.eyebrow': 'Features',
    'feat.title': 'Built so you can trust what the team does',
    'f.card.t': 'Every persona has a card', 'f.card.b': 'Who they are, what they are doing right now, who can talk to them and how much quota is left.',
    'f.card.alt': 'Nina’s card with what she is doing now, who can talk to her and who is responsible.',
    'f.health.t': 'The 2-day test', 'f.health.b': 'Pretend you disappeared for 48 hours and see what would get stuck, before it happens.',
    'f.health.alt': 'Team health with a score of 76 and the 2-day test.',
    'f.org.t': 'Who looks after whom', 'f.org.b': 'Owners and backups in an org chart that stays readable with 150 personas.',
    'f.org.alt': 'The “Who looks after whom” org chart with 151 personas grouped by owner and the search highlighted.',
    'f.teach.t': 'Teach by showing your screen', 'f.teach.b': 'Record what you do. The persona builds the step by step and only learns it after you review.',
    'f.teach.alt': 'The “Teach Nina by showing your screen” window, explaining what is recorded, where it stays and who sees it.',
    'f.usage.t': 'Usage and limits, no surprises', 'f.usage.b': 'See what is left on each account and when it refills. Pool accounts from the same provider when you want.',
    'f.usage.alt': 'Usage and limits showing the quota left per account.',
    'f.conn.t': 'Use the AIs you already have', 'f.conn.b': 'Claude, Codex, DeepSeek and others. Persona uses the login you already have, no password asked.',
    'f.conn.alt': 'Connections with the AI tools found on the computer and the account swap policy.',
    'priv.eyebrow': 'Privacy',
    'priv.title': 'It runs on your PC, not on our server',
    'priv.1': 'The app hosts the team. There is no Persona server in the middle.',
    'priv.2': 'Direct messages, keys and the Vault (what the team knows about your company) stay on your computer.',
    'priv.3': 'Passwords and bank details are blocked before they reach the Vault.',
    'priv.4': 'The AIs you connect only receive what the persona sends them, through your own accounts.',
    'price.eyebrow': 'Price', tbd: 'to confirm',
    'price.title': 'Free and open source',
    'price.lead': 'Persona charges nothing. You use the AI accounts you already have, and their cost is with each provider.',
    'price.1': 'A team with no limit on personas',
    'price.2': 'Every screen: boards, routines, Vault and approvals',
    'price.3': 'Open code you can check',
    'dl.title': 'Build your team today',
    'dl.lead': 'Download, open it, and the Coordinator guides you in 5 quick steps.',
    'dl.meta': 'Windows 10 or 11, 64-bit',
    'dl.code': 'See the code on GitHub',
    'foot.made': 'Team art by Brush.',
    'foot.credits': 'Built on <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> (MIT), <a href="https://github.com/botiverse/oar">OAR</a> (Apache-2.0) and ideas from <a href="https://github.com/pingdotgg/t3code">t3code</a> (MIT).',
    'foot.static': 'Static page, no trackers.',
  }
  var META = {
    en: { title: 'Persona · your AI team, with names, faces and limits', description: 'Build a team of AI personas that works on your computer. You ask in the channel, they split the tasks, and you approve what matters.', lang: 'en' },
  }

  var root = document.documentElement
  var store = {
    get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) { /* private mode: ignore */ } },
  }

  // Snapshot the pt source once, so switching back is exact.
  var PT = {}
  var ptMeta = { title: document.title, description: document.querySelector('meta[name=description]').content, lang: 'pt-BR' }
  function each(attr, fn) { document.querySelectorAll('[' + attr + ']').forEach(function (el) { fn(el, el.getAttribute(attr)) }) }
  each('data-i18n', function (el, k) { if (!(k in PT)) PT[k] = el.textContent })
  each('data-i18n-html', function (el, k) { if (!(k in PT)) PT[k] = el.innerHTML })
  each('data-i18n-aria', function (el, k) { if (!(k in PT)) PT[k] = el.getAttribute('aria-label') })
  each('data-i18n-alt', function (el, k) { if (!(k in PT)) PT[k] = el.getAttribute('alt') })

  function apply(lang) {
    var d = lang === 'en' ? EN : PT
    each('data-i18n', function (el, k) { if (d[k] !== undefined) el.textContent = d[k] })
    each('data-i18n-html', function (el, k) { if (d[k] !== undefined) el.innerHTML = d[k] })
    each('data-i18n-aria', function (el, k) { if (d[k] !== undefined) el.setAttribute('aria-label', d[k]) })
    each('data-i18n-alt', function (el, k) { if (d[k] !== undefined) el.setAttribute('alt', d[k]) })
    var m = lang === 'en' ? META.en : ptMeta
    root.lang = m.lang
    document.title = m.title
    document.querySelector('meta[name=description]').content = m.description
  }

  var params = new URLSearchParams(location.search)
  var lang = params.get('lang') || store.get('persona-site-lang') || ((navigator.language || '').toLowerCase().indexOf('pt') === 0 ? 'pt' : 'en')
  if (lang === 'en') apply('en')
  document.getElementById('lang').addEventListener('click', function () {
    lang = lang === 'en' ? 'pt' : 'en'
    apply(lang)
    store.set('persona-site-lang', lang)
  })

  var themeBtn = document.getElementById('theme')
  function current() { return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') }
  var initial = params.get('theme')
  if (initial === 'light' || initial === 'dark') root.dataset.theme = initial
  themeBtn.setAttribute('aria-pressed', String(current() === 'dark'))
  themeBtn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    themeBtn.setAttribute('aria-pressed', String(next === 'dark'))
    store.set('persona-site-theme', next)
  })
})()
