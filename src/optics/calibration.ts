/**
 * EVERY tunable number in the simulation lives here.
 *
 * Nothing optical is hardcoded in the shaders or the UI. Milestone 3
 * ("does this actually feel plausible?") is expected to change these values,
 * possibly a lot. Treat none of them as sacred.
 */
export interface Calibration {
  /**
   * Entrance pupil diameter, mm. This is the physical lever that converts
   * diopters of defocus into an angular blur size: theta ~= pupil * |D|.
   *
   * Real pupils: ~2-3 mm in bright daylight, ~4-5 mm indoors, ~6-8 mm at
   * night. Bigger pupil = more blur for the same prescription, which is why
   * myopes genuinely see worse at night. 4.0 mm models a typical indoor
   * scene, which is where this app gets used ("at a party").
   */
  pupilDiameterMm: number

  /**
   * Assumed horizontal field of view of the phone's rear camera, degrees.
   *
   * IMPORTANT: no browser API exposes the real FOV. getUserMedia gives us
   * pixels, never optics. So this is an assumption, and it is currently the
   * single largest source of error in the model - blur size scales inversely
   * with it. Most phone main cameras sit around 65-75 deg horizontal.
   */
  cameraHFovDeg: number

  /**
   * Dimensionless fudge factor, applied last.
   *
   * Exists because the viewer is looking at a SCREEN, not at the room: the
   * display minifies the scene, their own eye adds its own blur, and the
   * camera has already thrown away detail. The physics gets us the right
   * *relative* progression between -1 D and -6 D; this closes the absolute
   * gap. Keep it at 1.0 until we have evidence.
   */
  empiricalGain: number

  /**
   * Blur in linear light rather than in gamma-encoded sRGB.
   *
   * Physically correct: a lens averages radiance, not display code values.
   * Visible difference: bright objects bleed into dark ones properly instead
   * of looking muddy. Exposed so we can A/B it.
   */
  linearLightBlur: boolean

  /**
   * The disc-blur pass runs at whatever resolution keeps the blur radius near
   * this many pixels. Larger prescriptions simply get downsampled harder, so
   * GPU cost stays roughly CONSTANT instead of growing with the square of the
   * blur radius. Lower = faster and softer; higher = sharper bokeh edges.
   */
  targetWorkingRadiusPx: number

  /** Safety rail on the downsample chain (1/2^n). 4 => down to 1/16 scale. */
  maxDownsampleLevels: number

  /** Cap the render target's long edge, px. Guards low-end GPU fill rate. */
  maxRenderLongEdgePx: number
}

export const DEFAULT_CALIBRATION: Calibration = {
  pupilDiameterMm: 4.0,
  cameraHFovDeg: 68,
  empiricalGain: 1.0,
  linearLightBlur: true,
  targetWorkingRadiusPx: 6,
  maxDownsampleLevels: 4,
  maxRenderLongEdgePx: 1600,
}
