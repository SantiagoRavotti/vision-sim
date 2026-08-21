/**
 * Prescription data model.
 *
 * Deliberately stores the FULL clinical form (SPH / CYL / AXIS, both eyes)
 * from day one, even though the MVP UI only writes `od.sph`. This costs
 * nothing now and means per-eye simulation, saved profiles, QR-encoded
 * prescriptions and astigmatism are additive later, not a rewrite.
 *
 * Sign convention: minus-cylinder notation, as written on almost every
 * European/US spectacle prescription. SPH and CYL are therefore negative
 * for myopia and for astigmatism respectively.
 */

export interface EyeRx {
  /** Spherical power, diopters. Negative = myopic. */
  sph: number
  /** Cylinder power, diopters. Negative in minus-cyl notation. */
  cyl: number
  /** Cylinder axis, degrees, 0..180 (TABO convention). */
  axis: number
}

export interface Prescription {
  /** Oculus dexter - right eye. */
  od: EyeRx
  /** Oculus sinister - left eye. */
  os: EyeRx
}

export const EMMETROPIC_EYE: EyeRx = { sph: 0, cyl: 0, axis: 0 }

export const EMMETROPIC_RX: Prescription = {
  od: { ...EMMETROPIC_EYE },
  os: { ...EMMETROPIC_EYE },
}

/** Convenience: build a symmetric prescription from a single eye. */
export function symmetric(eye: EyeRx): Prescription {
  return { od: { ...eye }, os: { ...eye } }
}

/**
 * Spherical equivalent = SPH + CYL/2.
 *
 * This is the "circle of least confusion" inside Sturm's interval - the plane
 * where an astigmatic eye's blur patch is smallest and roughly circular.
 * Clinically it is the single number that best summarises an astigmatic Rx.
 */
export function sphericalEquivalent(eye: EyeRx): number {
  return eye.sph + eye.cyl / 2
}

/**
 * Defocus power along a given meridian, in diopters.
 *
 *   D(phi) = SPH + CYL * sin^2(phi - AXIS)
 *
 * In minus-cylinder notation the AXIS names the meridian that carries only
 * SPH (the cylinder contributes zero there); the perpendicular meridian
 * carries the full SPH + CYL. This single function is the whole of
 * astigmatism: it is why the point-spread function becomes an ELLIPSE rather
 * than a circle, and it is why myopia and astigmatism can share one shader.
 *
 * Not used by the MVP UI yet - it is the hook Milestone 4 plugs into.
 */
export function defocusAtMeridian(eye: EyeRx, meridianDeg: number): number {
  const d = ((meridianDeg - eye.axis) * Math.PI) / 180
  const s = Math.sin(d)
  return eye.sph + eye.cyl * s * s
}

/**
 * Distance in metres beyond which a myopic eye can no longer focus.
 * Not yet used to modulate the image (we have no depth map) but reported in
 * the UI/docs because it is the honest limit of the current simulation.
 */
export function farPointMetres(eye: EyeRx): number {
  const se = sphericalEquivalent(eye)
  return se < 0 ? 1 / -se : Infinity
}
