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
  var q = new URLSearchParams(location.search)
  var lang = q.get('lang') === 'en' ? 'en' : 'pt'
  var t = COPY[lang]
  if (q.get('theme') === 'dark' || q.get('theme') === 'light') document.documentElement.dataset.theme = q.get('theme')
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
  document.title = 'Persona'
  document.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (t[k]) el.textContent = t[k] })

  var firstRun = q.get('first') === '1'
  // Spec: 20 s on a normal launch, 60 s on the first run. Demo can shorten with ?timeout=.
  var timeoutMs = (Number(q.get('timeout')) || (firstRun ? 60 : 20)) * 1000
  var cause = { locked: 'errorLocked', profile: 'errorProfile' }[q.get('cause')] || 'errorGeneric'
  var boot = document.querySelector('.boot')
  var splash = document.querySelector('.splash')
  var error = document.querySelector('.error')
  var status = document.getElementById('boot-status')
  var hint = document.getElementById('boot-hint')
  var timers = []
  function later(ms, fn) { timers.push(setTimeout(fn, ms)) }
  function clear() { timers.forEach(clearTimeout); timers = [] }

  function showSplash() {
    clear()
    boot.dataset.state = 'splash'
    error.hidden = true; splash.hidden = false
    status.textContent = t.opening; hint.hidden = true
    later(3000, function () { status.textContent = t.calling })
    if (firstRun) later(8000, function () { hint.hidden = false })
    later(timeoutMs, showError)
  }
  function showError() {
    clear()
    boot.dataset.state = 'error'
    document.getElementById('boot-error-body').textContent = t[cause]
    splash.hidden = true; error.hidden = false
    document.getElementById('boot-retry').focus()
  }
  document.getElementById('boot-retry').addEventListener('click', showSplash)
  var copyBtn = document.getElementById('boot-copy')
  copyBtn.addEventListener('click', function () {
    var text = document.getElementById('boot-diag').textContent
    var done = function () { copyBtn.textContent = t.copied; setTimeout(function () { copyBtn.textContent = t.copyDiag }, 1800) }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {}); else done()
  })
  // Esc never closes the boot window (spec).
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.preventDefault() })

  if (q.get('state') === 'error') showError(); else showSplash()
})()
