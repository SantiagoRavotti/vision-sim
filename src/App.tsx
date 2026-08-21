import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './camera/useCamera'
import { VisionRenderer, type RendererStats } from './render/VisionRenderer'
import { DEFAULT_CALIBRATION, type Calibration } from './optics/calibration'
import { blurRadiusPx, computeBlurGeometry } from './optics/defocus'
import type { EyeRx } from './optics/prescription'
import { DiopterSlider, formatDiopters } from './components/DiopterSlider'
import { HoldToCompare } from './components/HoldToCompare'
import { DebugPanel } from './components/DebugPanel'

const EMPTY_STATS: RendererStats = {
  fps: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  downsampleLevels: 0,
  radiusPx: 0,
  workingRadiusPx: 0,
  visibleFractionX: 1,
  halfFloat: false,
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<VisionRenderer | null>(null)

  const camera = useCamera(videoRef)

  const [myopiaD, setMyopiaD] = useState(2.0)
  const [holding, setHolding] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [stats, setStats] = useState<RendererStats>(EMPTY_STATS)
  const [glError, setGlError] = useState<string | null>(null)
  const [cal] = useState<Calibration>(DEFAULT_CALIBRATION)

  // The render loop must never wait on a React commit, so it reads the current
  // prescription and calibration through refs rather than through closures that
  // would need re-registering on every slider tick.
  const eye: EyeRx = { sph: -myopiaD, cyl: 0, axis: 0 }
  const eyeRef = useRef(eye)
  eyeRef.current = eye
  const calRef = useRef(cal)
  calRef.current = cal

  // --- renderer lifecycle -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: VisionRenderer
    try {
      renderer = new VisionRenderer(canvas, calRef.current)
    } catch (e) {
      setGlError((e as Error).message)
      return
    }
    rendererRef.current = renderer

    renderer.setRadiusProvider((widthPx, visibleFractionX) => {
      const geometry = computeBlurGeometry(widthPx, visibleFractionX, calRef.current)
      return blurRadiusPx(eyeRef.current, geometry, calRef.current)
    })

    // Throttled: the loop produces stats every frame, React needs them twice a
    // second at most.
    let lastPush = 0
    renderer.setStatsCallback((s) => {
      const now = performance.now()
      if (now - lastPush < 500) return
      lastPush = now
      setStats({ ...s })
    })
    renderer.setContextLostCallback(() =>
      setGlError('The graphics context was lost. Reload the page.'),
    )

    renderer.setVideo(videoRef.current)
    renderer.start()

    // Calibration handle: lets us poke uniforms and read state from the phone's
    // remote console without a rebuild. Dev builds only.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__vision = { renderer, videoRef, canvas }
    }

    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setSimulate(!holding)
  }, [holding])

  useEffect(() => {
    if (camera.status === 'ready') rendererRef.current?.setVideo(videoRef.current)
  }, [camera.status])

  const retry = useCallback(() => {
    setGlError(null)
    void camera.start()
  }, [camera])

  const blocked =
    camera.status === 'denied' ||
    camera.status === 'insecure' ||
    camera.status === 'unsupported' ||
    camera.status === 'nodevice' ||
    camera.status === 'error'

  return (
    <div className="app">
      {/* Must stay in the layout tree and must be inline + muted, or iOS
          Safari takes playback into its native fullscreen player. */}
      <video
        ref={videoRef}
        className="hidden-video"
        playsInline
        muted
        autoPlay
        disablePictureInPicture
      />

      <canvas ref={canvasRef} className="stage" />

      <div className="topbar">
        <button
          type="button"
          className="pill pill-mono"
          onClick={() => setShowDebug((v) => !v)}
          aria-label="Toggle debug panel"
        >
          {stats.fps} fps
        </button>
        <button
          type="button"
          className="pill"
          onClick={() => setShowInfo(true)}
          aria-label="About this simulation"
        >
          i
        </button>
      </div>

      {showDebug && (
        <DebugPanel
          stats={stats}
          cal={cal}
          camera={camera}
          eye={eye}
          onClose={() => setShowDebug(false)}
        />
      )}

      <div className="bottom">
        <DiopterSlider value={myopiaD} onChange={setMyopiaD} />
        <HoldToCompare holding={holding} onHoldChange={setHolding} disabled={myopiaD === 0} />
      </div>

      {(blocked || glError || camera.status === 'requesting') && (
        <div className="gate">
          <div className="gate-card">
            {glError ? (
              <>
                <h1>Graphics problem</h1>
                <p>{glError}</p>
              </>
            ) : camera.status === 'requesting' ? (
              <>
                <h1>Starting camera…</h1>
                <p>Allow camera access when your browser asks.</p>
              </>
            ) : (
              <>
                <h1>Camera unavailable</h1>
                <p>{camera.message}</p>
                <button type="button" className="cta" onClick={retry}>
                  Try again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showInfo && (
        <div className="gate" onClick={() => setShowInfo(false)}>
          <div className="gate-card" onClick={(e) => e.stopPropagation()}>
            <h1>About this simulation</h1>
            <p>
              This shows an approximation of how a scene looks to an eye with{' '}
              <strong>{formatDiopters(myopiaD)}</strong> of myopia and no correction, based on the
              size of the retinal blur circle that amount of defocus produces.
            </p>
            <p className="fine">
              It is an approximate visual simulation based on refractive error. Individual vision
              varies, and this application is not a medical or diagnostic tool.
            </p>
            <button type="button" className="cta" onClick={() => setShowInfo(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
