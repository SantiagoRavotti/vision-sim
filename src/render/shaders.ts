/**
 * All GLSL lives here. WebGL2 / GLSL ES 3.00.
 *
 * Pipeline (see VisionRenderer):
 *   video --INGEST--> L0 (screen space, linear light)
 *         --DOWNSAMPLE x n--> Ln
 *         --DISC BLUR--> Ln'
 *         --COMPOSITE--> canvas (gamma encoded)
 *
 * "Normal" vision takes the identical path with the blur pass skipped, so the
 * A/B comparison is not contaminated by a different resampling chain.
 */

/** Fullscreen quad. Drawn as a 4-vertex TRIANGLE_STRIP. */
export const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

/**
 * INGEST: crop the camera frame to cover the canvas, and move into linear
 * light so that everything downstream averages radiance rather than sRGB
 * code values (which is what a real lens does).
 *
 * We use the pow(c, 2.2) approximation instead of the exact piecewise sRGB
 * transfer function: one instruction cheaper, and the difference is far below
 * anything visible through a blur.
 */
export const FRAG_INGEST = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_coverScale;
uniform vec2 u_coverOffset;
uniform float u_toLinear; // 1.0 = linearise, 0.0 = pass through
void main() {
  vec2 uv = v_uv * u_coverScale + u_coverOffset;
  vec3 c = texture(u_src, uv).rgb;
  c = mix(c, pow(max(c, 0.0), vec3(2.2)), u_toLinear);
  outColor = vec4(c, 1.0);
}
`

/**
 * DOWNSAMPLE by exactly 2x. Four bilinear taps at +/-0.5 source texels, each
 * of which already averages a 2x2 block, giving a 4x4 box filter. Overkill for
 * a plain halving, but it keeps high-frequency detail from aliasing into the
 * blur as sparkle when the camera moves.
 */
export const FRAG_DOWNSAMPLE = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_srcTexel;
void main() {
  vec2 o = u_srcTexel * 0.5;
  vec3 c = texture(u_src, v_uv + vec2(-o.x, -o.y)).rgb
         + texture(u_src, v_uv + vec2( o.x, -o.y)).rgb
         + texture(u_src, v_uv + vec2(-o.x,  o.y)).rgb
         + texture(u_src, v_uv + vec2( o.x,  o.y)).rgb;
  outColor = vec4(c * 0.25, 1.0);
}
`

/**
 * DISC BLUR - the actual vision simulation.
 *
 * Optical defocus does NOT produce a Gaussian. A defocused point source images
 * as a near-uniform DISC: the shadow of the pupil. That is why real myopic
 * blur shows doubled edges and hard-ish bokeh circles around lights, and why a
 * Gaussian reads as a soft-focus photo filter instead of as bad eyesight.
 * So: equal weights over a disc, not a bell curve.
 *
 * Sample distribution is a Vogel / golden-angle spiral, with radius scaled by
 * sqrt(i/N) so samples are spread uniformly by AREA rather than clustering in
 * the middle. 32 taps is plenty because the caller guarantees the radius is
 * only ~6 working-space pixels (it downsamples first), so we are never trying
 * to cover a 35 px disc with 32 samples.
 *
 * u_radius is a vec2 so that Milestone 4 can pass an ELLIPSE (astigmatism)
 * with no change to this shader; u_axis rotates it. For pure myopia the two
 * components are equal and u_axis is irrelevant.
 */
export const FRAG_DISC_BLUR = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_srcTexel;
uniform vec2 u_radius;  // semi-axes, in source texels
uniform float u_axis;   // radians, CCW

const int TAPS = 32;
const float GOLDEN_ANGLE = 2.39996322972865332;

void main() {
  float ca = cos(u_axis);
  float sa = sin(u_axis);
  mat2 rot = mat2(ca, sa, -sa, ca);

  vec3 acc = texture(u_src, v_uv).rgb;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i) + 0.5;
    float a = fi * GOLDEN_ANGLE;
    float r = sqrt(fi / float(TAPS));
    vec2 unit = vec2(cos(a), sin(a)) * r;      // uniform over the unit disc
    vec2 off = rot * (unit * u_radius);        // scale to the ellipse, rotate
    acc += texture(u_src, v_uv + off * u_srcTexel).rgb;
  }
  outColor = vec4(acc / float(TAPS + 1), 1.0);
}
`

/**
 * COMPOSITE to the canvas: undo the linear-light transform. The default
 * framebuffer is treated as raw 8-bit by WebGL, so we re-encode by hand.
 */
export const FRAG_COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform float u_toGamma; // 1.0 = encode back to sRGB, 0.0 = pass through
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  c = mix(c, pow(max(c, 0.0), vec3(1.0 / 2.2)), u_toGamma);
  outColor = vec4(c, 1.0);
}
`
