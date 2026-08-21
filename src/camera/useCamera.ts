import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'nodevice'
  | 'insecure'
  | 'unsupported'
  | 'error'

export interface CameraState {
  status: CameraStatus
  message: string | null
  /** Actual negotiated stream resolution, once known. */
  resolution: { width: number; height: number } | null
  facingMode: string | null
}

const IDEAL_WIDTH = 1280
const IDEAL_HEIGHT = 720

/**
 * Live rear camera into a <video> element.
 *
 * Browser constraints that dictate the shape of this code:
 *
 * 1. getUserMedia requires a SECURE CONTEXT. https:// or localhost only.
 *    http://192.168.x.x is not secure, so a plain `vite --host` dev server
 *    is silently blocked on the phone. We detect and report that explicitly
 *    rather than surfacing a confusing NotAllowedError.
 *
 * 2. On iOS the <video> element MUST have playsInline + muted + autoplay, or
 *    Safari yanks playback into its native fullscreen player and our canvas
 *    never gets a frame. Set as real attributes, not just properties.
 *
 * 3. iOS suspends the stream when the tab is backgrounded or the phone locks,
 *    and does not always resume on its own. We re-issue play() on
 *    visibilitychange.
 *
 * 4. We ask for 1280x720 rather than the maximum available. The per-frame
 *    texture upload cost scales with pixels, and the image is about to be
 *    blurred anyway, so extra sensor resolution buys nothing and costs
 *    bandwidth on exactly the devices that can least afford it.
 */
export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>({
    status: 'idle',
    message: null,
    resolution: null,
    facingMode: null,
  })
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return

    if (!window.isSecureContext) {
      setState({
        status: 'insecure',
        message:
          'The camera needs a secure connection. Open this page over https:// (or on localhost).',
        resolution: null,
        facingMode: null,
      })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        status: 'unsupported',
        message: 'This browser does not expose camera access.',
        resolution: null,
        facingMode: null,
      })
      return
    }

    setState((s) => ({ ...s, status: 'requesting', message: null }))

    try {
      // `ideal`, not `exact`: on a tablet or laptop there may be no rear
      // camera at all, and we would rather show the front one than fail.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: IDEAL_WIDTH },
          height: { ideal: IDEAL_HEIGHT },
        },
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        return
      }

      video.srcObject = stream
      await video.play().catch(() => {
        // Autoplay rejection is recoverable: the element is muted and inline,
        // so a subsequent user gesture will start it. Not fatal.
      })

      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings?.() ?? {}
      setState({
        status: 'ready',
        message: null,
        resolution:
          settings.width && settings.height
            ? { width: settings.width, height: settings.height }
            : null,
        facingMode: settings.facingMode ?? null,
      })
    } catch (err) {
      const e = err as DOMException
      const name = e?.name ?? 'Error'
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState({
          status: 'denied',
          message:
            'Camera access was blocked. Allow it in your browser settings for this site, then reload.',
          resolution: null,
          facingMode: null,
        })
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setState({
          status: 'nodevice',
          message: 'No usable camera was found on this device.',
          resolution: null,
          facingMode: null,
        })
      } else {
        setState({
          status: 'error',
          message: `${name}: ${e?.message ?? 'unknown camera error'}`,
          resolution: null,
          facingMode: null,
        })
      }
    }
  }, [videoRef])

  // Attempt to start immediately. On a repeat visit the permission is already
  // granted, so the camera is live before the user can react - which is the
  // whole point of the product. On a first visit this triggers the prompt, and
  // a denial drops us onto the tap-to-start gate.
  useEffect(() => {
    void start()
    return stop
  }, [start, stop])

  // iOS pauses the stream on background/lock and does not reliably resume.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const video = videoRef.current
      if (video && video.paused) void video.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [videoRef])

  return { ...state, start, stop }
}
