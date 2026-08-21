# Vision Sim

A mobile-first web app that approximates how the world looks to someone with
uncorrected myopia. Point the phone camera at a scene, dial in a prescription,
hand the phone over.

Runs entirely in the browser — no app store, no install required. WebGL2
fragment shaders transform the live camera feed in real time.

> This is an approximate visual simulation based on refractive error.
> Individual vision varies, and this application is not a medical or
> diagnostic tool.

The optical model, its assumptions and its limitations are documented in
[`docs/vision-simulation.md`](docs/vision-simulation.md).

---

## Requirements

- **Node 20.18+** (the toolchain is pinned to Vite 6 for exactly this reason;
  Vite 7+ requires Node 20.19+)
- A phone with a rear camera, running iOS Safari or Android Chrome

## Setup

```bash
npm install
```

## Running it

### On this computer

```bash
npm run dev
```

Then open <http://localhost:5173/vision-sim/>.

`localhost` counts as a secure context even over plain HTTP, so the camera
works without any certificate. Handy for UI work; useless for judging the
simulation, because a laptop webcam is not a phone camera.

### On your phone, over the local network

```bash
npm run dev:phone
```

This adds a self-signed HTTPS certificate and binds to all interfaces. It
prints a `Network:` URL such as `https://10.30.0.76:5173/vision-sim/` — open
that on the phone.

**`getUserMedia` requires a secure context, and `http://192.168.x.x` is not
one.** A plain `vite --host` will silently refuse the camera on the phone,
which is why HTTPS is not optional here.

Your phone will warn about the self-signed certificate. Accept it:

- **iOS Safari** — *Show Details* → *visit this website* → *Visit Website*
- **Android Chrome** — *Advanced* → *Proceed to … (unsafe)*

Both the phone and this computer must be on the same network, and Windows
Firewall must allow Node to accept inbound connections on the dev port
(Windows prompts the first time).

### Deployed

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). No certificate
warnings, and it works over mobile data.

## Build

```bash
npm run build     # tsc -b && vite build  ->  dist/
npm run preview   # serve dist/ locally
```

## GitHub Pages notes

A project repo is served from `https://<user>.github.io/<repo>/`, so the base
path has to be threaded through everything. It is defined **once**, as `BASE`
in [`vite.config.ts`](vite.config.ts), and flows to:

- asset URLs (Vite's `base`)
- the PWA manifest's `start_url` and `scope`
- the service worker registration scope and its `navigateFallback`
- `public/.nojekyll`, so GitHub does not run Jekyll over the build output

If the repo is ever renamed, change `BASE` and nothing else.

## Fullscreen and "Add to Home Screen"

**iPhone has no Fullscreen API.** Safari will always show its own toolbars.
The only way to get a genuinely full-screen viewfinder on iOS is to install the
PWA: *Share* → *Add to Home Screen*, then launch from the icon. The manifest
declares `display: standalone`, so it opens with no browser chrome at all.

On Android Chrome the same install flow is offered via the address-bar menu.

## Project layout

```
src/
  camera/       getUserMedia + the iOS <video> constraints
  optics/       prescription model, defocus maths, calibration constants
  render/       WebGL2 renderer, GLSL, GL helpers
  components/   slider, hold-to-compare, debug panel
docs/
  vision-simulation.md    the optical model, assumptions, limitations
```

The layers are kept apart on purpose: `optics/` knows nothing about WebGL,
`render/` knows nothing about diopters (it is handed a radius in pixels), and
`calibration.ts` holds every tunable number in the project.

## Debug panel

Tap the **fps** chip. It shows the whole diopters → milliradians → arcminutes →
pixels chain, plus stream resolution, downsample factor and whether half-float
render targets are active — so a number that looks wrong can be traced to the
step that produced it.

In dev builds the renderer is also exposed as `window.__vision` for poking at
from a remote console.
