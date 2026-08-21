import {
  createProgram,
  createQuad,
  createRenderTarget,
  deleteRenderTarget,
  type Program,
  type RenderTarget,
} from './gl'
import { FRAG_COMPOSITE, FRAG_DISC_BLUR, FRAG_DOWNSAMPLE, FRAG_INGEST, VERT } from './shaders'
import type { Calibration } from '../optics/calibration'

/**
 * Given the current canvas width and how much of the video is visible after
 * cover-cropping, return the blur-disc radius in canvas pixels. Supplied by
 * the caller so that all optics stays out of the render layer.
 */
export type RadiusProvider = (canvasWidthPx: number, visibleFractionX: number) => number

export interface RendererStats {
  fps: number
  canvasWidth: number
  canvasHeight: number
  /** How many 2x downsample steps the current blur radius needed. */
  downsampleLevels: number
  /** Blur radius in canvas pixels (full resolution). */
  radiusPx: number
  /** Blur radius in working-space texels, i.e. what the shader actually saw. */
  workingRadiusPx: number
  /** Fraction of the video width visible after cover-cropping. */
  visibleFractionX: number
  halfFloat: boolean
}

export class VisionRenderer {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private video: HTMLVideoElement | null = null

  private vao: WebGLVertexArrayObject
  private pIngest: Program
  private pDownsample: Program
  private pBlur: Program
  private pComposite: Program

  private videoTex: WebGLTexture
  /** Pyramid: levels[i] is at 1/2^i of canvas resolution. */
  private levels: RenderTarget[] = []
  /** Blur output, one per level so the blur never reads and writes one texture. */
  private scratch: RenderTarget[] = []

  private internalFormat: number
  private texType: number
  private halfFloat: boolean

  private rafId = 0
  private running = false
  /**
   * Set by requestVideoFrameCallback when the decoder presents a new frame.
   * NOTE: video.currentTime must NOT be used for this - for a MediaStream
   * source it stays pinned at 0, so a currentTime-based check uploads exactly
   * one frame and then freezes the image forever.
   */
  private frameDirty = true
  private rvfcHandle = 0
  private useRvfc = false

  private simulate = true
  private radiusProvider: RadiusProvider = () => 0
  private cal: Calibration

  private frameTimes: number[] = []
  private stats: RendererStats
  private onStats?: (s: RendererStats) => void
  private onContextLost?: () => void

  constructor(canvas: HTMLCanvasElement, cal: Calibration) {
    this.canvas = canvas
    this.cal = cal

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      // Lets the compositor skip a sync point. Measurably lower camera latency.
      desynchronized: true,
    })
    if (!gl) throw new Error('WebGL2 is not available in this browser.')
    this.gl = gl

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.running = false
      this.onContextLost?.()
    })

    // Rendering to RGBA16F keeps linear-light intermediates free of banding in
    // the shadows. 8-bit linear storage crushes dark tones visibly on OLED.
    this.halfFloat = !!gl.getExtension('EXT_color_buffer_half_float')
    this.internalFormat = this.halfFloat ? gl.RGBA16F : gl.RGBA8
    this.texType = this.halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE

    this.vao = createQuad(gl)
    this.pIngest = createProgram(gl, VERT, FRAG_INGEST, [
      'u_src',
      'u_coverScale',
      'u_coverOffset',
      'u_toLinear',
    ])
    this.pDownsample = createProgram(gl, VERT, FRAG_DOWNSAMPLE, ['u_src', 'u_srcTexel'])
    this.pBlur = createProgram(gl, VERT, FRAG_DISC_BLUR, [
      'u_src',
      'u_srcTexel',
      'u_radius',
      'u_axis',
    ])
    this.pComposite = createProgram(gl, VERT, FRAG_COMPOSITE, ['u_src', 'u_toGamma'])

    this.videoTex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // With flip-Y on upload, texture v=0 is the bottom of the image, matching
    // the GL convention. Saves flipping coordinates in four separate shaders.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    this.stats = {
      fps: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      downsampleLevels: 0,
      radiusPx: 0,
      workingRadiusPx: 0,
      visibleFractionX: 1,
      halfFloat: this.halfFloat,
    }
  }

  setVideo(video: HTMLVideoElement | null) {
    this.cancelRvfc()
    this.video = video
    this.frameDirty = true
    this.useRvfc = !!video && typeof video.requestVideoFrameCallback === 'function'
    this.scheduleRvfc()
  }

  /**
   * requestVideoFrameCallback fires once per *decoded* frame, which is the only
   * reliable "is there something new to upload?" signal for a live stream.
   * Chrome and Safari 15.4+ have it; where it is missing we simply upload every
   * animation frame, which is correct but slightly wasteful.
   */
  private scheduleRvfc() {
    const video = this.video
    if (!this.useRvfc || !video) return
    this.rvfcHandle = video.requestVideoFrameCallback!(() => {
      this.frameDirty = true
      this.scheduleRvfc()
    })
  }

  private cancelRvfc() {
    if (this.rvfcHandle && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.rvfcHandle)
    }
    this.rvfcHandle = 0
  }

  setCalibration(cal: Calibration) {
    this.cal = cal
  }

  setSimulate(on: boolean) {
    this.simulate = on
  }

  setRadiusProvider(fn: RadiusProvider) {
    this.radiusProvider = fn
  }

  setStatsCallback(fn: (s: RendererStats) => void) {
    this.onStats = fn
  }

  setContextLostCallback(fn: () => void) {
    this.onContextLost = fn
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.drawFrame()
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  dispose() {
    this.stop()
    this.cancelRvfc()
    const gl = this.gl
    for (const rt of [...this.levels, ...this.scratch]) deleteRenderTarget(gl, rt)
    this.levels = []
    this.scratch = []
    gl.deleteTexture(this.videoTex)
    gl.deleteVertexArray(this.vao)
    for (const p of [this.pIngest, this.pDownsample, this.pBlur, this.pComposite]) {
      gl.deleteProgram(p.program)
    }
  }

  // ---------------------------------------------------------------- internals

  /**
   * Size the drawing buffer to the CSS box times devicePixelRatio, capped so a
   * low-end GPU is not asked to fill 3+ megapixels several times per frame.
   */
  private syncSize(): boolean {
    const cssW = this.canvas.clientWidth
    const cssH = this.canvas.clientHeight
    if (cssW === 0 || cssH === 0) return false

    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    let w = Math.round(cssW * dpr)
    let h = Math.round(cssH * dpr)
    const long = Math.max(w, h)
    if (long > this.cal.maxRenderLongEdgePx) {
      const k = this.cal.maxRenderLongEdgePx / long
      w = Math.round(w * k)
      h = Math.round(h * k)
    }

    if (this.canvas.width !== w || this.canvas.height !== h || this.levels.length === 0) {
      this.canvas.width = w
      this.canvas.height = h
      this.allocateTargets(w, h)
    }
    return true
  }

  private allocateTargets(w: number, h: number) {
    const gl = this.gl
    for (const rt of [...this.levels, ...this.scratch]) deleteRenderTarget(gl, rt)
    this.levels = []
    this.scratch = []
    const n = this.cal.maxDownsampleLevels + 1
    for (let i = 0; i < n; i++) {
      const div = Math.pow(2, i)
      const lw = Math.max(1, Math.floor(w / div))
      const lh = Math.max(1, Math.floor(h / div))
      this.levels.push(createRenderTarget(gl, lw, lh, this.internalFormat, this.texType))
      this.scratch.push(createRenderTarget(gl, lw, lh, this.internalFormat, this.texType))
    }
  }

  /** Cover-crop: fill the canvas, cropping the overflowing axis symmetrically. */
  private coverTransform(vw: number, vh: number, cw: number, ch: number) {
    const videoAspect = vw / vh
    const canvasAspect = cw / ch
    let fx = 1
    let fy = 1
    if (videoAspect > canvasAspect) {
      fx = canvasAspect / videoAspect // video too wide -> crop the sides
    } else {
      fy = videoAspect / canvasAspect // video too tall -> crop top and bottom
    }
    return {
      scaleX: fx,
      scaleY: fy,
      offsetX: (1 - fx) / 2,
      offsetY: (1 - fy) / 2,
      visibleFractionX: fx,
    }
  }

  private blit(rt: RenderTarget | null, w: number, h: number) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fbo : null)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private drawFrame() {
    const gl = this.gl
    const video = this.video
    if (!video || video.readyState < 2 || !this.syncSize()) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw === 0 || vh === 0) return

    const cw = this.canvas.width
    const ch = this.canvas.height

    // Only re-upload when the decoder has actually produced a new frame. The
    // rAF loop runs at display rate, which may exceed the camera frame rate.
    if (this.frameDirty || !this.useRvfc) {
      this.frameDirty = false
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    }

    const cover = this.coverTransform(vw, vh, cw, ch)
    const radiusPx = this.simulate ? this.radiusProvider(cw, cover.visibleFractionX) : 0

    // Pick a working resolution that keeps the blur radius near the target, so
    // the disc pass costs about the same at -0.5 D as at -10 D.
    let levelIdx = 0
    let workingRadius = radiusPx
    while (
      workingRadius > this.cal.targetWorkingRadiusPx &&
      levelIdx < this.cal.maxDownsampleLevels
    ) {
      workingRadius *= 0.5
      levelIdx++
    }
    const doBlur = radiusPx > 0.35

    const toLinear = this.cal.linearLightBlur ? 1 : 0
    gl.bindVertexArray(this.vao)
    gl.disable(gl.BLEND)
    gl.activeTexture(gl.TEXTURE0)

    // --- Pass 1: ingest (crop + linearise) into level 0 ---
    gl.useProgram(this.pIngest.program)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.uniform1i(this.pIngest.uniforms.u_src, 0)
    gl.uniform2f(this.pIngest.uniforms.u_coverScale, cover.scaleX, cover.scaleY)
    gl.uniform2f(this.pIngest.uniforms.u_coverOffset, cover.offsetX, cover.offsetY)
    gl.uniform1f(this.pIngest.uniforms.u_toLinear, toLinear)
    this.blit(this.levels[0], this.levels[0].width, this.levels[0].height)

    let source = this.levels[0]

    if (doBlur) {
      // --- Passes 2..n: halve down to the working level ---
      gl.useProgram(this.pDownsample.program)
      gl.uniform1i(this.pDownsample.uniforms.u_src, 0)
      for (let i = 1; i <= levelIdx; i++) {
        const src = this.levels[i - 1]
        const dst = this.levels[i]
        gl.bindTexture(gl.TEXTURE_2D, src.tex)
        gl.uniform2f(this.pDownsample.uniforms.u_srcTexel, 1 / src.width, 1 / src.height)
        this.blit(dst, dst.width, dst.height)
      }

      // --- Disc blur at the working level ---
      const src = this.levels[levelIdx]
      const dst = this.scratch[levelIdx]
      gl.useProgram(this.pBlur.program)
      gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.uniform1i(this.pBlur.uniforms.u_src, 0)
      gl.uniform2f(this.pBlur.uniforms.u_srcTexel, 1 / src.width, 1 / src.height)
      // Circular for now. Milestone 4 passes two different semi-axes here.
      gl.uniform2f(this.pBlur.uniforms.u_radius, workingRadius, workingRadius)
      gl.uniform1f(this.pBlur.uniforms.u_axis, 0)
      this.blit(dst, dst.width, dst.height)
      source = dst
    }

    // --- Final: composite to the canvas (re-encode gamma) ---
    gl.useProgram(this.pComposite.program)
    gl.bindTexture(gl.TEXTURE_2D, source.tex)
    gl.uniform1i(this.pComposite.uniforms.u_src, 0)
    gl.uniform1f(this.pComposite.uniforms.u_toGamma, toLinear)
    this.blit(null, cw, ch)

    gl.bindVertexArray(null)
    this.tickStats(
      cw,
      ch,
      doBlur ? levelIdx : 0,
      radiusPx,
      doBlur ? workingRadius : 0,
      cover.visibleFractionX,
    )
  }

  private tickStats(
    cw: number,
    ch: number,
    levels: number,
    radiusPx: number,
    workingRadiusPx: number,
    visibleFractionX: number,
  ) {
    const now = performance.now()
    this.frameTimes.push(now)
    while (this.frameTimes.length > 0 && now - this.frameTimes[0] > 1000) {
      this.frameTimes.shift()
    }
    const s = this.stats
    s.fps = this.frameTimes.length
    s.canvasWidth = cw
    s.canvasHeight = ch
    s.downsampleLevels = levels
    s.radiusPx = radiusPx
    s.workingRadiusPx = workingRadiusPx
    s.visibleFractionX = visibleFractionX
    this.onStats?.(s)
  }
}
