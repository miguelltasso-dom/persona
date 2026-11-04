// Muse · 1ª janela (design/BOOT-SPEC.md). External file: works under the app CSP (script-src 'self').
// In the app, Rivet replaces the timers with real host phases and the 'persona:first-paint' signal.
(function () {
  'use strict'
  var COPY = {
    pt: {
      opening: 'Abrindo a Persona…', calling: 'Chamando a equipe…', firstRun: 'Na primeira vez leva até um minuto.',
      errorTitle: 'Não conseguimos abrir a Persona',
      errorGeneric: 'Isso costuma se resolver tentando de novo. Se continuar, reinicie o computador.',
      errorLocked: 'Outra cópia da Persona pode estar aberta. Feche-a e tente de novo.',
      errorProfile: 'Algo nos dados locais não abriu. Seus arquivos continuam salvos.',
      retry: 'Tentar de novo', copyDiag: 'Copiar diagnóstico', copied: 'Diagnóstico copiado', details: 'Detalhes para o suporte',
    },
    en: {
      opening: 'Opening Persona…', calling: 'Calling the team…', firstRun: 'The first time can take up to a minute.',
      errorTitle: 'We couldn’t open Persona',
      errorGeneric: 'Trying again usually fixes it. If it keeps happening, restart your computer.',
      errorLocked: 'Another copy of Persona may be open. Close it and try again.',
      errorProfile: 'Something in the local data didn’t open. Your files are still safe.',
      retry: 'Try again', copyDiag: 'Copy diagnostics', copied: 'Diagnostics copied', details: 'Details for support',
    },
  }
  var q = new URL(document.currentScript.src).searchParams
  var overlay = document.getElementById('persona-boot-overlay')
  var root = overlay.shadowRoot
  var bridge = window.personaBoot
  var lang = !q.get('lang').startsWith('pt') ? 'en' : 'pt'
  var t = COPY[lang]
  if (q.get('theme') === 'dark' || q.get('theme') === 'light') document.documentElement.dataset.theme = q.get('theme')
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
  document.title = 'Persona'
  root.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k] })

  var firstRun = q.get('first') === '1'
  // Spec: 20 s on a normal launch, 60 s on the first run. Demo can shorten with ?timeout=.
  var timeoutMs = (Number(q.get('timeout')) || (firstRun ? 60 : 20)) * 1000
  var cause = { locked: 'errorLocked', profile: 'errorProfile' }[q.get('cause')] || 'errorGeneric'
  var boot = root.querySelector('.boot')
  var splash = root.querySelector('.splash')
  var error = root.querySelector('.error')
  var status = root.getElementById('boot-status')
  var hint = root.getElementById('boot-hint')
  var timers = []
  function later(ms, fn) { timers.push(setTimeout(fn, ms)) }
  function clear() { timers.forEach(clearTimeout); timers = [] }

  function showSplash() {
    clear()
    failed = false
    boot.dataset.state = 'splash'
    error.hidden = true; splash.hidden = false
    status.textContent = t.opening; hint.hidden = true
    later(3000, function () { status.textContent = t.calling })
    if (firstRun) later(8000, function () { hint.hidden = false })
    later(timeoutMs, showError)
  }
  function showError() {
    failed = true
    clear()
    boot.dataset.state = 'error'
    root.getElementById('boot-error-body').textContent = t[cause]
    splash.hidden = true; error.hidden = false
    root.getElementById('boot-retry').focus()
  }
  root.getElementById('boot-retry').addEventListener('click', function () { showSplash(); bridge.retry().catch(function () { showError() }) })
  var copyBtn = root.getElementById('boot-copy')
  copyBtn.addEventListener('click', function () {
    var text = root.getElementById('boot-diag').textContent
    var done = function () { copyBtn.textContent = t.copied; setTimeout(function () { copyBtn.textContent = t.copyDiag }, 1800) }
    bridge.diagnostic().then(function (text) { root.getElementById('boot-diag').textContent = text; done() }, showError)
  })
  // Esc never closes the boot window (spec).
  root.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.preventDefault() })

  var failed = false
  var unsubscribe = bridge.subscribe(function (detail) {
    failed = true
    root.getElementById('boot-diag').textContent = detail.code + ' · ' + detail.message
    showError()
  })
  function painted() {
    var app = document.getElementById('root')
    if (failed || !app || !app.textContent.trim()) return
    requestAnimationFrame(function () {
      if (failed) return
      clear(); observer.disconnect(); unsubscribe()
      window.dispatchEvent(new Event('persona:first-paint'))
      overlay.classList.add('leaving')
      overlay.addEventListener('transitionend', function () { overlay.remove() }, { once: true })
    })
  }
  var observer = new MutationObserver(painted)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  window.addEventListener('pagehide', function () { clear(); observer.disconnect(); unsubscribe() }, { once: true })
  showSplash(); painted()
})()
