import type { Calibration } from './calibration'
import type { EyeRx } from './prescription'
import { sphericalEquivalent } from './prescription'

/**
 * From diopters to pixels, in two honest steps.
 *
 * STEP 1 - diopters to an angle in the scene.
 *
 * An eye with |D| diopters of defocus and an entrance pupil of diameter p
 * images a point source as a disc (the "circle of confusion"). Its angular
 * diameter, as measured out in the world, is to first order:
 *
 *     theta [rad] = (p [mm] / 1000) * |D| [1/m]
 *
 * Derivation sketch: the pupil is the aperture, the retinal blur patch is the
 * shadow it casts when the image plane is displaced. A defocus of D diopters
 * displaces conjugate focus by D metres^-1; projecting the pupil through that
 * displacement gives a blur whose angular subtense in object space is p*D.
 * (This is the standard small-angle geometric-optics result; it ignores
 * diffraction and higher-order aberrations, both negligible at the blur
 * magnitudes this app deals with.)
 *
 * Worked values at p = 4 mm:
 *     -0.50 D ->  2.0 mrad  =  6.9 arcmin
 *     -1.00 D ->  4.0 mrad  = 13.8 arcmin
 *     -2.00 D ->  8.0 mrad  = 27.5 arcmin
 *     -4.00 D -> 16.0 mrad  = 0.92 deg
 *     -6.00 D -> 24.0 mrad  = 1.38 deg
 *    -10.00 D -> 40.0 mrad  = 2.29 deg
 *
 * For scale: normal 20/20 acuity resolves about 1 arcmin. So even -0.5 D
 * smears roughly 7 resolution cells together, which is exactly why a mild
 * prescription still ruins a road sign.
 *
 * STEP 2 - scene angle to canvas pixels.
 *
 * The blur is a property of the SCENE, so it must be converted using how many
 * pixels the camera spends per radian of scene:
 *
 *     pxPerRad = canvasWidthPx / (hFov * visibleFractionX)
 *
 * `visibleFractionX` is there because we crop the video to cover the screen,
 * which narrows the effective field of view. Without it, rotating the phone
 * or changing the stream aspect ratio would silently change the blur.
 *
 * Note what is NOT in this chain: the viewer's distance from the phone and
 * the physical size of the screen. That is intentional. We are simulating how
 * the SCENE looks to the impaired eye; the viewer then observes that scene
 * through the display. Their own viewing geometry is a second-order effect and
 * is absorbed by `empiricalGain`.
 */

/** Angular diameter of the circle of confusion, in radians. */
export function blurCircleAngularDiameterRad(defocusDiopters: number, pupilMm: number): number {
  return (pupilMm / 1000) * Math.abs(defocusDiopters)
}

export interface BlurGeometry {
  /** Pixels the displayed image spends per radian of scene angle. */
  pxPerRadian: number
  /** Fraction of the video's width actually visible after cover-cropping. */
  visibleFractionX: number
}

export function computeBlurGeometry(
  canvasWidthPx: number,
  visibleFractionX: number,
  cal: Calibration,
): BlurGeometry {
  const hFovRad = (cal.cameraHFovDeg * Math.PI) / 180
  const effectiveFovRad = hFovRad * visibleFractionX
  return {
    pxPerRadian: canvasWidthPx / effectiveFovRad,
    visibleFractionX,
  }
}

/**
 * Blur-disc RADIUS in canvas pixels for one eye.
 *
 * MVP uses the spherical equivalent, i.e. the circular cross-section of what
 * is really an ellipse. Milestone 4 replaces this single number with a pair
 * of semi-axes derived from defocusAtMeridian(), and the shader already takes
 * a radius per axis in anticipation.
 */
export function blurRadiusPx(eye: EyeRx, geometry: BlurGeometry, cal: Calibration): number {
  const defocus = sphericalEquivalent(eye)
  if (defocus === 0) return 0
  const thetaRad = blurCircleAngularDiameterRad(defocus, cal.pupilDiameterMm)
  const diameterPx = thetaRad * geometry.pxPerRadian
  return (diameterPx / 2) * cal.empiricalGain
}

/** Human-readable trace of the model, for the debug overlay. */
export function explainBlur(eye: EyeRx, geometry: BlurGeometry, cal: Calibration) {
  const defocus = sphericalEquivalent(eye)
  const thetaRad = blurCircleAngularDiameterRad(defocus, cal.pupilDiameterMm)
  return {
    defocusD: defocus,
    thetaMrad: thetaRad * 1000,
    thetaArcmin: (thetaRad * 180 * 60) / Math.PI,
    radiusPx: blurRadiusPx(eye, geometry, cal),
    pxPerRadian: geometry.pxPerRadian,
  }
}
