import { useCallback, useEffect, useState } from 'react'

/**
 * A `beforeinstallprompt` event. Not in the DOM lib because it is a Chromium
 * extension to the spec rather than a standard.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallRoute =
  /** Chromium fired beforeinstallprompt - we can trigger the native flow. */
  | 'native'
  /** iOS Safari: no programmatic install exists, so we explain Share sheet. */
  | 'ios-safari'
  /** iOS in Chrome/Firefox/Edge: "Add to Home Screen" makes a bookmark, not a
   *  standalone app, so the Safari instructions would be actively misleading. */
  | 'ios-other-browser'
  /** Already installed, or the browser cannot install. Show nothing. */
  | 'none'

export interface InstallState {
  /** True when running from a home-screen icon rather than a browser tab. */
  isStandalone: boolean
  route: InstallRoute
  /** Runs the native Chromium install flow. Only meaningful for route 'native'. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo/

function detectIOS(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports itself as a Mac; touch points are the tell-tale.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function detectStandalone(): boolean {
  // display-mode covers Chromium and modern Safari. navigator.standalone is
  // the legacy iOS-only flag, still the reliable signal on older iOS.
  const byDisplayMode = ['standalone', 'fullscreen', 'minimal-ui'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  )
  const legacyIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return byDisplayMode || legacyIOS
}

/**
 * Decides whether to offer installation, and by which route.
 *
 * The rule the product cares about: never show an install CTA to someone who
 * is already running the installed app, and never show one where installing is
 * impossible - a dead-end button is worse than no button.
 */
export function useInstallState(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  // Bumped purely to force a re-render; the display mode itself is read fresh
  // during render rather than cached in state, so it can never go stale.
  const [, bumpEnvTick] = useState(0)
  const isStandalone = detectStandalone()

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // Preventing the default is what lets us decide *when* to show the
      // prompt; without it Chromium may show its own mini-infobar instead.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // The display mode changes without a reload when the user launches from the
    // icon, or on desktop when a window is installed mid-session.
    const mq = window.matchMedia('(display-mode: standalone)')
    const onModeChange = () => bumpEnvTick((n) => n + 1)
    mq.addEventListener('change', onModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      mq.removeEventListener('change', onModeChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // A beforeinstallprompt event is single-use; holding on to it would give a
    // button that silently does nothing the second time.
    setDeferred(null)
    return outcome
  }, [deferred])

  let route: InstallRoute = 'none'
  if (!isStandalone && !installed) {
    if (deferred) {
      route = 'native'
    } else if (detectIOS()) {
      route = IOS_NON_SAFARI.test(navigator.userAgent) ? 'ios-other-browser' : 'ios-safari'
    }
  }

  return { isStandalone, route, promptInstall }
}

/** Simple connectivity flag, used for a friendly notice rather than a broken UI. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
