# How the vision simulation works

Living document. It records what the model assumes, why, and where it is wrong.
Numbers here are expected to change during calibration.

---

## 1. Reading a prescription

A spectacle prescription has three numbers per eye.

| Field | Name | Unit | Meaning |
|---|---|---|---|
| **SPH** | Sphere | diopters (D) | Uniform focusing error, the same in every direction. Negative = **myopia** (short-sighted, distance blurred). Positive = **hyperopia**. |
| **CYL** | Cylinder | diopters (D) | *Extra* focusing error present in one direction only — **astigmatism**. Written negative in the minus-cylinder notation used by nearly every optician. |
| **AXIS** | Axis | degrees, 0–180 | Which direction the cylinder applies to. 0° is horizontal, 90° vertical, measured anticlockwise (TABO convention). Meaningless when CYL = 0. |

A diopter is reciprocal metres: it is the focusing power a lens needs to have.
A **−4.00 D** eye needs a −4 D lens to see clearly at distance.

Example:

```
RIGHT EYE   SPH −3.50   CYL −1.25   AXIS 170°
```

This eye is 3.50 D short-sighted in the 170° meridian, and 4.75 D
(= 3.50 + 1.25) short-sighted in the perpendicular 80° meridian.

### Far point

A myopic eye can focus on anything nearer than its **far point**:

```
far point [m] = 1 / |SPH|
```

−1 D → 1 m. −4 D → 25 cm. −10 D → 10 cm.

This is why short-sighted people read perfectly well with their glasses off,
and it is the single biggest thing the current simulation gets wrong (§5).

---

## 2. Diopters to blur: the physical step

We do **not** map a slider to a blur radius with a made-up constant. The chain
has two steps, each independently checkable.

### Step 1 — diopters to an angle in the world

A defocused eye images a point source as a **disc**, not a point. The disc is
the shadow of the pupil, and it is called the *circle of confusion* or *blur
circle*. Its angular diameter, measured out in the scene, is to first order:

```
θ [rad] = (p [mm] / 1000) × |D| [D]
```

where `p` is the entrance pupil diameter and `D` the defocus in diopters. This
is the standard small-angle geometric-optics result: defocus of `D` diopters
displaces the conjugate focal plane by `D` m⁻¹, and projecting the pupil
aperture through that displacement gives a blur patch subtending `p × D`.

At the default `p = 4 mm` (a typical indoor pupil):

| Prescription | θ (mrad) | θ (arcmin) | θ (deg) |
|---|---|---|---|
| −0.50 D | 2.0 | 6.9 | 0.11 |
| −1.00 D | 4.0 | 13.8 | 0.23 |
| −2.00 D | 8.0 | 27.5 | 0.46 |
| −3.00 D | 12.0 | 41.3 | 0.69 |
| −4.00 D | 16.0 | 55.0 | 0.92 |
| −6.00 D | 24.0 | 82.5 | 1.38 |
| −10.00 D | 40.0 | 137.5 | 2.29 |

For scale: **20/20 acuity resolves about 1 arcmin**. So even −0.50 D smears
roughly seven resolution cells together — which is why a mild prescription
still makes a road sign unreadable.

Pupil size is a real physical lever, not a fudge factor. Pupils run ~2–3 mm in
bright sun and ~6–8 mm at night, so the same eye genuinely sees 2–3× worse in
the dark. Adjusting `pupilDiameterMm` is the honest way to model that.

### Step 2 — scene angle to screen pixels

The blur is a property of the **scene**, so it converts using how many pixels
the displayed image spends per radian of scene:

```
px_per_radian = canvasWidth_px / (hFOV × visibleFractionX)
blur_radius_px = θ × px_per_radian / 2 × empiricalGain
```

- `hFOV` — the camera's horizontal field of view. **No browser API exposes
  this**, so it is an assumed constant (default 68°). It is currently the
  largest single source of error: blur scales inversely with it.
- `visibleFractionX` — the video is cover-cropped to fill the screen, which
  narrows the effective field of view. A portrait screen showing a landscape
  stream may keep only ~26% of the frame width, which magnifies the image and
  therefore magnifies the blur. This term is what makes the model invariant to
  aspect ratio and orientation instead of silently changing with them.

Deliberately **absent** from this chain: the viewer's distance from the phone,
and the physical size of the screen. We simulate how the *scene* looks to an
impaired eye; the viewer then observes that scene through a display. Their own
viewing geometry is a second-order effect, absorbed by `empiricalGain`.

---

## 3. Why a disc and not a Gaussian

Optical defocus produces a **near-uniform disc** — flat-topped, hard-edged.
A Gaussian is smooth and heavy-tailed. The difference is not subtle:

- Real defocus shows **doubled edges**: a thin bright line becomes two lines.
- Point lights become **bokeh circles** with visible rims, not soft glows.
- Contrast at mid frequencies collapses in a characteristic way, and can even
  *invert* (spurious resolution). A Gaussian just fades everything smoothly.

A Gaussian reads as "soft-focus photo filter". A disc reads as "I can't see."
Since the entire value of this app is the second reaction, we use a disc:
32 equally weighted taps on a golden-angle (Vogel) spiral, with sample radius
scaled by `√(i/N)` so samples are uniform by **area** rather than clustering in
the centre.

## 4. Astigmatism (Milestone 4 — model defined, not yet exposed)

Astigmatism is **not** extra isotropic blur. Defocus simply varies by meridian:

```
D(φ) = SPH + CYL · sin²(φ − AXIS)
```

At the AXIS meridian the cylinder contributes nothing, so defocus is SPH; at
90° to it, defocus is SPH + CYL. Everything in between interpolates. The
consequence is that the point-spread function is an **ellipse**, with semi-axes
proportional to the defocus along and across the axis, rotated to AXIS. Between
the two focal lines lies **Sturm's interval**; the blur is smallest and most
nearly circular at the *circle of least confusion*, which sits at the
**spherical equivalent** `SPH + CYL/2`.

**This is why myopia and astigmatism are one shader.** `FRAG_DISC_BLUR` already
takes `u_radius` as a `vec2` of semi-axes plus a `u_axis` rotation. Pure myopia
is the degenerate case where both semi-axes are equal. Milestone 4 adds no new
render path — it only starts passing two different numbers.

The MVP collapses an astigmatic eye to its spherical equivalent, i.e. it draws
the circular cross-section of what is really an ellipse.

## 5. Known limitations

Ordered by how much they matter.

1. **No depth information.** The simulation blurs the entire frame uniformly,
   as if everything were beyond the far point. A real −4 D eye sees objects
   closer than 25 cm perfectly sharply. Near objects are therefore over-blurred.
   Fixing this needs a depth map (LiDAR, dual-camera disparity, or a monocular
   depth model) and is not available through `getUserMedia`.
2. **Camera FOV is assumed, not measured.** See §2. Directly scales all blur.
3. **The camera is not an eye.** It has already applied its own optics, noise
   reduction, sharpening and tone mapping, and it resolves far less detail than
   a healthy fovea. We are blurring an already-degraded image.
4. **Uniform across the visual field.** Real eyes have a sharp fovea and poor
   periphery, and refractive error varies off-axis. We apply one blur everywhere.
5. **Monocular.** One image, no binocular summation. Two eyes with different
   prescriptions partially compensate for each other in ways this cannot show.
6. **No accommodation.** A real eye constantly refocuses; young eyes can also
   partly compensate for hyperopia. Nothing here adapts.
7. **Geometric optics only.** Diffraction and higher-order aberrations (coma,
   spherical aberration, the halos and starbursts many people actually see)
   are ignored. Negligible at large defocus, dominant near 0 D.
8. **The viewer's own eyesight is in the loop.** They are looking at a small
   screen from ~35 cm, which already minifies the scene and adds their own
   optics on top.

## 6. Calibration

Every tunable lives in [`src/optics/calibration.ts`](../src/optics/calibration.ts).
Nothing optical is hardcoded in a shader or a component.

| Parameter | Default | Effect |
|---|---|---|
| `pupilDiameterMm` | 4.0 | Linear on blur size. Physically meaningful. |
| `cameraHFovDeg` | 68 | Inverse on blur size. An assumption. |
| `empiricalGain` | 1.0 | Final multiplier. The only unashamed fudge factor. |
| `linearLightBlur` | true | Average radiance, not sRGB code values. |
| `targetWorkingRadiusPx` | 6 | Quality vs. speed of the disc pass. |
| `maxDownsampleLevels` | 4 | Caps the pyramid at 1/16 scale. |
| `maxRenderLongEdgePx` | 1600 | Fill-rate guard on weak GPUs. |

The physics fixes the **relative** progression between −1 D and −6 D, and that
part should be trusted. The **absolute** amount is where a screen-based
simulation cannot be exact, and that is what `empiricalGain` is for. The
intended calibration method is comparison against ground truth: a person with a
known prescription looks at a real scene without correction, then at the app
simulating their own numbers, and reports which is blurrier.

## 7. Render pipeline

```
getUserMedia
  └─ <video> (playsInline, muted)
      └─ texImage2D on requestVideoFrameCallback   ← never on currentTime,
                                                     which is pinned at 0 for
                                                     MediaStream sources
          └─ INGEST      cover-crop + sRGB → linear      (full res)
              └─ DOWNSAMPLE ×n   4-tap box, halving      (→ 1/2ⁿ)
                  └─ DISC BLUR   32-tap Vogel spiral     (working res)
                      └─ COMPOSITE  linear → sRGB        (→ canvas)
```

The downsample count is chosen per frame so the blur radius in working-space
texels stays near `targetWorkingRadiusPx`. Consequence: **GPU cost is roughly
constant regardless of prescription strength.** A naive full-resolution disc
would cost O(radius²) and a −10 D setting would need a ~29 px radius — over
2500 texels per output pixel.

Intermediate targets are `RGBA16F` where `EXT_color_buffer_half_float` is
available, falling back to `RGBA8`. Half-float matters because linear-light
intermediates in 8 bits visibly band in the shadows.

"Normal" vision follows the **identical** path with the blur pass skipped, so
the A/B comparison is not contaminated by a different resampling chain.

## 8. References

- Sturm's conoid and meridional defocus: any clinical optics text, e.g.
  Bennett & Rabbetts, *Clinical Visual Optics*.
- Blur circle from defocus and pupil diameter (θ ≈ pD): Smith & Atchison,
  *The Eye and Visual Optical Instruments*.
- Spherical equivalent as the circle of least confusion: standard refraction
  practice (`SPH + CYL/2`).
- Vogel / golden-angle disc sampling: Vogel, *A better way to construct the
  sunflower head* (1979); widely used for bokeh in real-time rendering.
- Linear-light image filtering: Poynton, *Digital Video and HD*, on why
  averaging gamma-encoded values is wrong.
