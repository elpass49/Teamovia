/**
 * widget-embed.js
 * Snippet d'intégration Teamovia — à placer sur le site client
 *
 * Usage :
 * <script
 *   src="https://widget.teamovia.com/widget-embed.js"
 *   data-workspace-token="votre-token-public"
 *   data-agent-name="Support Dubois"
 *   data-primary-color="#4F6EF7"
 *   defer
 * ></script>
 *
 * Paramètres :
 *   data-workspace-token  (requis) Token public du workspace
 *   data-api-url          (optionnel) URL de l'API Teamovia
 *   data-agent-name       (optionnel) Nom affiché dans le header
 *   data-primary-color    (optionnel) Couleur accent en hex
 *   data-user-ref         (optionnel) Email ou ID de l'utilisateur connecté
 */
;(function () {
  if (document.getElementById('tw-widget-frame')) return

  const script = document.currentScript
  const token  = script?.dataset?.workspaceToken

  if (!token) {
    console.warn('[Teamovia] data-workspace-token manquant — widget non chargé')
    return
  }

  const params = new URLSearchParams({
    token:   token,
    name:    script?.dataset?.agentName   ?? '',
    color:   script?.dataset?.primaryColor ?? '',
    userRef: script?.dataset?.userRef      ?? '',
    apiUrl:  script?.dataset?.apiUrl       ?? 'https://api.teamovia.com/v1',
  })

  const iframe = document.createElement('iframe')
  iframe.id    = 'tw-widget-frame'
  iframe.src   = `https://widget.teamovia.com/widget.html?${params}`
  iframe.style.cssText = [
    'position:fixed',
    'bottom:0', 'right:0',
    'width:440px', 'height:680px',
    'border:none',
    'z-index:999999',
    'pointer-events:none',
    'background:transparent',
  ].join(';')
  iframe.setAttribute('title', 'Chat support')
  iframe.setAttribute('allow', 'none')

  document.body.appendChild(iframe)

  // Activer le pointer-events dès que l'iframe est prête
  iframe.addEventListener('load', () => {
    iframe.style.pointerEvents = 'auto'
  })

  // Responsive : plein écran sur mobile
  function resize () {
    if (window.innerWidth <= 440) {
      iframe.style.width  = '100%'
      iframe.style.height = '92dvh'
    } else {
      iframe.style.width  = '440px'
      iframe.style.height = '680px'
    }
  }
  window.addEventListener('resize', resize)
  resize()
})()
