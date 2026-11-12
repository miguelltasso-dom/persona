// Muse · 1ª janela (design/BOOT-SPEC.md) + "Acordando o time" (COLHEITA-MUSE §30). External file: works under the app CSP (script-src 'self').
// The scene asks nothing of the host and never polls: it reacts to what main tells it (failure, phase) and to the clock only for delay warnings.
(function () {
  'use strict'
  var COPY = {
    pt: {
      waking: 'Acordando o time…', arranging: 'Arrumando a casa…', slow: 'Ainda abrindo.', busy: 'O computador está ocupado, já já termina.',
      firstRun: 'Na primeira vez leva até um minuto.',
      placeOverview: 'Visão geral', placeProjects: 'Projetos', placeApprovals: 'Aprovações', placeTeam: 'Equipe', placeMemory: 'Memória da empresa',
      errorTitle: 'Não conseguimos abrir a Persona', errorTimeout: 'Não deu para abrir a casa agora.',
      errorGeneric: 'Isso costuma se resolver tentando de novo. Se continuar, feche a Persona pela bandeja e abra de novo.',
      errorLocked: 'Outra cópia da Persona pode estar aberta. Feche-a e tente de novo.',
      errorProfile: 'Algo nos dados locais não abriu. Seus arquivos continuam salvos.',
      retry: 'Tentar de novo', details: 'Detalhes para o suporte', diagNote: 'Já copiamos isto para você colar no suporte.',
    },
    en: {
      waking: 'Waking up the team…', arranging: 'Getting the house ready…', slow: 'Still opening.', busy: 'Your computer is busy, it’ll be done soon.',
      firstRun: 'The first time can take up to a minute.',
      placeOverview: 'Overview', placeProjects: 'Projects', placeApprovals: 'Approvals', placeTeam: 'Team', placeMemory: 'Company memory',
      errorTitle: 'We couldn’t open Persona', errorTimeout: 'We couldn’t open the house right now.',
      errorGeneric: 'Trying again usually fixes it. If it keeps happening, close Persona from the tray and open it again.',
      errorLocked: 'Another copy of Persona may be open. Close it and try again.',
      errorProfile: 'Something in the local data didn’t open. Your files are still safe.',
      retry: 'Try again', details: 'Details for support', diagNote: 'We copied this so you can paste it to support.',
    },
  }
  // Faces that ship with the boot assets (animal ids only, never names). Anything else read from storage is ignored.
  var FACES = ['atlas', 'bento', 'capivara', 'cervo', 'coelho', 'coruja', 'guaxinim', 'lobo-guara', 'lontra', 'luna', 'mico-leao-dourado', 'nina', 'ourico', 'panda', 'raposa', 'sol', 'tamandua', 'tucano']
  var FACES_KEY = 'persona.boot.faces.v1'
  var FACES_MAX = 5
  var SCENE_DELAY = 400 // a host that answers sooner never shows the scene
  var FACE_GAP = 120, FACE_ENTER = 360 // must match boot.css
  var SLOW_AFTER = 6000

  var q = new URL(document.currentScript.src).searchParams
  var overlay = document.getElementById('persona-boot-overlay')
  var root = overlay.shadowRoot
  var bridge = window.personaBoot
  var application = document.getElementById('root')
  if (application) { application.hidden = true; application.inert = true; application.setAttribute('aria-hidden', 'true') }
  var lang = !(q.get('lang') || '').startsWith('pt') ? 'en' : 'pt'
  var t = COPY[lang]
  if (q.get('theme') === 'dark' || q.get('theme') === 'light') { document.documentElement.dataset.theme = q.get('theme'); overlay.dataset.theme = q.get('theme') }
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
  document.title = 'Persona'
  root.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k] })

  var firstRun = q.get('first') === '1'
  // Spec: 25 s on a normal launch, 60 s on the first run (the database is created then). Demo can shorten with ?timeout=.
  var timeoutMs = (Number(q.get('timeout')) || (firstRun ? 60 : 25)) * 1000
  var cause = { locked: 'errorLocked', profile: 'errorProfile' }[q.get('cause')] || 'errorGeneric'
  var boot = root.querySelector('.boot')
  var splash = root.querySelector('.splash')
  var error = root.querySelector('.error')
  var status = root.getElementById('boot-status')
  var hint = root.getElementById('boot-hint')
  var facesBox = root.querySelector('.faces')
  var timers = []
  function later(ms, fn) { timers.push(setTimeout(fn, ms)) }
  function clear() { timers.forEach(clearTimeout); timers = [] }

  // What the scene knows before the host answers: the ids of the last session's faces (the shell writes them). None saved = the first opening,
  // which has its own scene (the animals arriving at the office with their backpacks) instead of faces.
  function rememberedFaces() {
    var out = []
    try {
      var saved = JSON.parse(localStorage.getItem(FACES_KEY) || 'null')
      if (Array.isArray(saved)) saved.forEach(function (id) { if (out.length < FACES_MAX && FACES.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id) })
    } catch (e) { out = [] /* storage blocked or corrupt: the first-opening scene */ }
    return out
  }

  var failed = false // the host reported a failure: the app never takes over by itself
  var finishing = false
  var sceneOn = false
  var sceneAt = 0
  var minStay = 0
  var slow = false
  var phase = 'starting'

  function renderStatus() {
    if (!sceneOn) return
    status.textContent = slow && phase === 'starting' ? t.slow : phase === 'host-ready' ? t.arranging : t.waking
    hint.hidden = !slow
    hint.textContent = slow ? (firstRun ? t.firstRun : t.busy) : ''
  }
  function showScene() {
    if (sceneOn || failed || finishing) return
    var ids = rememberedFaces()
    facesBox.replaceChildren()
    ids.forEach(function (id) {
      var face = document.createElement('span')
      face.className = 'face'
      var img = document.createElement('img')
      img.alt = ''; img.width = 96; img.height = 96; img.draggable = false
      img.src = '/__persona-boot-ui__/assets/faces/' + id + '.webp'
      face.appendChild(img); facesBox.appendChild(face)
    })
    sceneOn = true; sceneAt = Date.now()
    // The scene stays at least until its last piece has arrived: the last face, or the single first-opening picture.
    minStay = (ids.length > 0 ? (ids.length - 1) * FACE_GAP : 0) + FACE_ENTER + 60
    boot.dataset.variant = ids.length > 0 ? 'faces' : 'first'
    boot.dataset.scene = 'on'
    renderStatus()
  }
  function setPhase(next) {
    if (next !== 'starting' && next !== 'host-ready') return
    phase = next
    if (boot.dataset.state === 'splash') renderStatus()
  }

  function showSplash() {
    clear()
    failed = false
    boot.dataset.state = 'splash'
    error.hidden = true; splash.hidden = false
    slow = false; phase = 'starting'
    resetDetails()
    if (sceneOn) renderStatus(); else later(SCENE_DELAY, showScene)
    later(SLOW_AFTER, function () { slow = true; renderStatus() })
    later(timeoutMs, function () { showError(false) })
  }
  // A timeout is honest about slowness but is not a verdict: if the app paints later, it takes over (see painted()).
  function showError(hostFailure) {
    failed = hostFailure
    clear()
    boot.dataset.state = 'error'
    root.getElementById('boot-error-title').textContent = hostFailure ? t.errorTitle : t.errorTimeout
    root.getElementById('boot-error-body').textContent = t[cause]
    if (!hostFailure) diag.textContent = 'boot_timeout'
    splash.hidden = true; error.hidden = false
    root.getElementById('boot-retry').focus()
  }
  root.getElementById('boot-retry').addEventListener('click', function () { showSplash(); bridge.retry().catch(function () { showError(true) }) })
  // One way to the support details, folded: opening it the first time also asks main for the diagnostic (version, code, logs folder), which
  // main copies to the clipboard, and says so. The code line stays what the failure or the timeout reported.
  var details = root.getElementById('boot-details')
  var diag = root.getElementById('boot-diag')
  var diagNote = root.getElementById('boot-diag-note')
  var diagAsked = false
  function resetDetails() { diagAsked = false; details.open = false; diagNote.hidden = true; diag.textContent = 'boot_timeout' }
  details.addEventListener('toggle', function () {
    if (!details.open || diagAsked) return
    diagAsked = true
    bridge.diagnostic().then(function (text) { diag.textContent = diag.textContent + '\n' + text; diagNote.hidden = false }, function () { diagAsked = false })
  })
  // Esc never closes the boot window (spec).
  root.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.preventDefault() })

  var unsubscribe = bridge.subscribe(function (detail) {
    diag.textContent = detail.code + ' · ' + detail.message
    showError(true)
  })
  // Optional channel from main (Rivet): the host answered. Absent = the scene follows the clock only.
  var unsubscribePhase = typeof bridge.onPhase === 'function' ? bridge.onPhase(setPhase) : function () {}
  function stop() { clear(); observer.disconnect(); unsubscribe(); unsubscribePhase() }

  function finish() {
    if (failed) return
    var app = document.getElementById('root')
    app.hidden = false; app.inert = false; app.removeAttribute('aria-hidden')
    window.dispatchEvent(new Event('persona:first-paint'))
    overlay.classList.add('leaving')
    overlay.addEventListener('transitionend', function () { overlay.remove() }, { once: true })
  }
  function painted() {
    var app = document.getElementById('root')
    if (failed || finishing || !app || !document.querySelector('[data-persona-root], [data-persona-shell]') || !app.textContent.trim()) return
    requestAnimationFrame(function () {
      if (failed || finishing) return
      finishing = true
      stop()
      // Once the scene started it stays until the last face has arrived, so it never cuts mid-motion.
      var wait = sceneOn ? Math.max(0, sceneAt + minStay - Date.now()) : 0
      if (wait > 0) setTimeout(finish, wait); else finish()
    })
  }
  var observer = new MutationObserver(painted)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true })
  window.addEventListener('pagehide', function () { clear(); observer.disconnect(); unsubscribe(); unsubscribePhase() }, { once: true })
  showSplash(); painted()
})()
