import type { RendererStats } from '../render/VisionRenderer'
import type { Calibration } from '../optics/calibration'
import type { CameraState } from '../camera/useCamera'
import { explainBlur, computeBlurGeometry } from '../optics/defocus'
import { farPointMetres, type EyeRx } from '../optics/prescription'

interface Props {
  stats: RendererStats
  cal: Calibration
  camera: CameraState
  eye: EyeRx
  onClose: () => void
}

/**
 * Development instrumentation. Shows the full diopters -> arcmin -> pixels
 * chain so a wrong number can be traced to the step that produced it, rather
 * than guessed at. Not part of the shipped experience.
 */
export function DebugPanel({ stats, cal, camera, eye, onClose }: Props) {
  const geom = computeBlurGeometry(stats.canvasWidth || 1, stats.visibleFractionX, cal)
  const x = explainBlur(eye, geom, cal)
  const fp = farPointMetres(eye)

  const rows: Array<[string, string]> = [
    ['fps', `${stats.fps}`],
    ['canvas', `${stats.canvasWidth} x ${stats.canvasHeight}`],
    ['stream', camera.resolution ? `${camera.resolution.width} x ${camera.resolution.height}` : '-'],
    ['facing', camera.facingMode ?? '-'],
    ['half-float RT', stats.halfFloat ? 'yes' : 'no (RGBA8)'],
    ['linear-light blur', cal.linearLightBlur ? 'on' : 'off'],
    ['—', ''],
    ['defocus', `${x.defocusD.toFixed(2)} D`],
    ['pupil', `${cal.pupilDiameterMm.toFixed(1)} mm`],
    ['blur angle', `${x.thetaMrad.toFixed(2)} mrad / ${x.thetaArcmin.toFixed(1)}′`],
    ['assumed hFOV', `${cal.cameraHFovDeg}° (visible ${(stats.visibleFractionX * 100).toFixed(0)}%)`],
    ['px per radian', `${geom.pxPerRadian.toFixed(0)}`],
    ['gain', `${cal.empiricalGain.toFixed(2)}`],
    ['—', ''],
    ['radius (full res)', `${stats.radiusPx.toFixed(2)} px`],
    ['downsample', `1/${Math.pow(2, stats.downsampleLevels)}`],
    ['radius (working)', `${stats.workingRadiusPx.toFixed(2)} px`],
    ['far point', fp === Infinity ? '∞' : `${fp.toFixed(2)} m`],
  ]

  return (
    <div className="debug">
      <div className="debug-head">
        <strong>debug</strong>
        <button type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v], i) =>
            k === '—' ? (
              <tr key={i}>
                <td colSpan={2}>
                  <hr />
                </td>
              </tr>
            ) : (
              <tr key={i}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
