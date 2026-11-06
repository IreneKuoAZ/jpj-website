/**
 * Hero Ribbons — animated light-ribbon background for the BetterDirect AI hero.
 * Replaces the static hero background image with a live Three.js scene.
 *
 * Usage:
 *   import { initHeroRibbons } from './hero-ribbons.js';
 *   const ribbons = initHeroRibbons(document.querySelector('.hero-canvas'), { speed: 1, lines: 0.45, lineWidth: 0.3 });
 *   // later (route change, unmount):  ribbons.destroy();
 *
 * The container should be position:relative/absolute with a size; the canvas fills it.
 * Requires `three` (tested with 0.169.0).
 */
import * as THREE from 'three';

// Colors are written in sRGB 0–1 and passed straight to the shaders.
const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export const DEFAULT_PALETTE = {
  background: '#05030f',
  glow: '#2a0d5c',        // haze behind the trough
  lineLeft: '#b45cff',    // violet
  lineMid: '#ecdcff',     // lilac-white hot core
  lineRight: '#7d7cff',   // periwinkle
  heroRight: '#a8dcff',   // icy blue-white on the hero line
  sheetLeft: '#7424e0',
  sheetMid: '#8a3cf0',
  sheetRight: '#2a4be0',
  indigo: '#5a52ff',
  cyan: '#3fb8ff',
};

/*
 * Each ribbon is a curve  y = y0 + c·|x − tx|^1.8  (cL left of the trough, cR right of it)
 * plus two slow sine waves. Units: y runs −1 (bottom) … 1 (top); x runs −1 (left edge) … 1
 * (right edge) on a 2.1:1 desktop hero. Narrower screens crop in from the sides rather than
 * squeezing the curve.
 * kind 'line'  = thin bright stroke with halo
 * kind 'sheet' = band of light with a crisp top edge, fading downward
 * width is in y units (2 = full hero height). Optional core / glow / glowAmt override the
 * stroke sharpness, halo falloff and halo strength.
 */
export const DEFAULT_RIBBONS = [
  // sheets (drawn first, underneath)
  { kind: 'sheet', y0: -0.95, tx: 0.05, cL: 0.40, cR: 0.12, width: 0.70, amt: 0.32, depth: 0.30, wave: 0.03, freq: 2.2, speed: 0.16, phase: 0.0, edge: 0.25 },
  { kind: 'sheet', y0: -0.75, tx: -0.06, cL: 0.95, cR: 0.55, width: 1.00, amt: 0.70, depth: 0.55, wave: 0.03, freq: 2.6, speed: 0.20, phase: 1.7, edge: 0.60 },
  { kind: 'sheet', y0: -0.69, tx: 0.02, cL: 0.90, cR: 0.95, width: 0.55, amt: 0.22, depth: 0.70, wave: 0.03, freq: 2.0, speed: 0.18, phase: 3.1, edge: 0.30, tint: 'indigo' },
  { kind: 'sheet', y0: -0.84, tx: -0.30, cL: 0.08, cR: 0.32, width: 0.80, amt: 0.70, depth: 0.45, wave: 0.03, freq: 2.8, speed: 0.22, phase: 4.4, edge: 0.85, tint: 'blue' },
  // thin lines
  { kind: 'line', y0: -0.69, tx: 0.00, cL: 1.00, cR: 1.00, width: 0.12, amt: 0.40, depth: 1.10, wave: 0.02, freq: 2.4, speed: 0.22, phase: 3.9, tint: 'indigo' },
  { kind: 'line', y0: -0.72, tx: -0.06, cL: 0.70, cR: 0.45, width: 0.12, amt: 0.45, depth: 0.95, wave: 0.02, freq: 3.0, speed: 0.30, phase: 0.6 },
  { kind: 'line', y0: -0.75, tx: -0.04, cL: 0.52, cR: 0.30, width: 0.12, amt: 0.30, depth: 0.85, wave: 0.02, freq: 3.4, speed: 0.26, phase: 2.2 },
  { kind: 'line', y0: -0.73, tx: -0.10, cL: 0.20, cR: 0.25, width: 0.12, amt: 0.20, depth: 0.70, wave: 0.02, freq: 3.8, speed: 0.34, phase: 1.1 },
  // hero line: brightest, white-hot at the trough, glinting on the right
  { kind: 'line', y0: -0.72, tx: -0.06, cL: 1.05, cR: 0.59, width: 0.34, core: 2100, glow: 14, glowAmt: 0.42, amt: 1.00, depth: 1.25, wave: 0.015, freq: 2.8, speed: 0.28, phase: 0.0, hot: 1.0, sparkle: 1.0, tint: 'hero' },
];

const RIBBON_VERT = /* glsl */ `
  uniform float uTime, uAspect;
  uniform float uLineWidth, uLines, uIsLine;
  uniform float uY0, uTx, uCL, uCR, uWidth, uWave, uFreq, uSpeed, uPhase, uDepth;
  varying vec2  vUv;
  varying float vX;

  // Design x (−1…1 across a ~2:1 hero) from world x (−aspect…aspect). Like background-size:
  // cover, narrower screens crop the sides; portrait phones get a gentler crop so the sweep shows.
  float refAspect() { return max(uAspect, mix(1.3, 2.0, smoothstep(0.8, 1.4, uAspect))); }

  float curveY(float x, float t) {
    float xn = x / refAspect();
    float tx = uTx + sin(t * 0.11 + uPhase) * 0.05;
    float dx = xn - tx;
    float c  = dx < 0.0 ? uCL : uCR;
    float y  = uY0 + c * pow(abs(dx), 1.8);   // long diagonal sweeps into a soft trough
    y += sin(xn * uFreq + t * uSpeed + uPhase) * uWave;
    y += sin(xn * uFreq * 0.53 - t * uSpeed * 0.7 + uPhase * 1.7) * uWave * 0.8;
    y += sin(t * 0.17 + uPhase * 2.3) * 0.022;                           // slow breathing
    return y;
  }

  void main() {
    vUv = uv;
    float t  = uTime;
    float x  = position.x * uAspect * 1.15;
    float y  = curveY(x, t);
    float e  = 0.01;
    float dy = (curveY(x + e, t) - curveY(x - e, t)) / (2.0 * e);
    vec2  n  = normalize(vec2(-dy, 1.0));
    float soft = mix(1.0, mix(1.5, 1.0, uLines), uIsLine);   // soft mode spreads lines into glow
    float w  = uWidth * uLineWidth * soft * (1.0 + 0.18 * sin(x * 0.8 + t * 0.35 + uPhase));
    vec2  p  = vec2(x, y) + n * (uv.y - 0.5) * w;
    vX = x / uAspect;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform float uTime, uPhase, uSpeed;
  uniform vec3  uColA, uColB, uColC;
  uniform float uCore, uGlow, uCoreAmt, uGlowAmt, uSkew, uAmt, uHot, uSparkle, uIntensity, uLines, uIsLine;
  varying vec2  vUv;
  varying float vX;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float d  = (vUv.y - 0.5) * 2.0;            // -1 below … 0 centre … 1 above
    // uLines: 0 = glow only (no crisp strokes or edges), 1 = crisp strokes on top of the glow
    float L    = uLines;
    float skew = uIsLine > 0.5 ? uSkew : mix(2.5, uSkew, L);   // sheets: softer top edge in glow mode
    float dk   = d > 0.0 ? d * skew : d;                        // fast fall-off above, long fall-off below
    float gk   = uIsLine > 0.5 ? uGlow * mix(0.6, 1.0, L) : uGlow;
    float core = exp(-dk * dk * uCore);
    float glow = exp(-dk * dk * gk);
    float ga   = uIsLine > 0.5 ? uGlowAmt * mix(1.3, 1.0, L) : uGlowAmt;
    float a = core * uCoreAmt * L + glow * ga;

    // light travels slowly along the ribbon
    float pulse = 0.62 + 0.38 * (0.5 + 0.5 * sin(vX * 2.4 - uTime * 0.45 + uPhase));
    a *= pulse;

    float s = clamp(vX * 0.5 + 0.5, 0.0, 1.0);  // 0 = left edge, 1 = right edge
    vec3 col = mix(uColA, uColB, smoothstep(0.05, 0.47, s));
    col = mix(col, uColC, smoothstep(0.45, 0.85, s));

    // white-hot centre near the trough
    float centre = exp(-pow((vX + 0.08) * 1.9, 2.0));
    col += vec3(1.0, 0.94, 1.0) * (pow(core, 2.0) * L + glow * (1.0 - L) * 0.08) * uHot * (0.35 + 1.1 * centre);

    // glints along the right half of the hero line
    float sp = pow(0.5 + 0.5 * sin(vX * 240.0 - uTime * 2.2 + sin(vX * 31.0 + uTime) * 5.0), 14.0);
    col += vec3(0.75, 0.9, 1.0) * core * sp * uSparkle * L * smoothstep(0.45, 0.8, s) * 1.6;

    // fade the far ends so nothing pops at the frame edge
    a *= smoothstep(-1.18, -1.0, vX) * (1.0 - smoothstep(1.0, 1.18, vX));

    col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;  // dither against banding
    gl_FragColor = vec4(col, clamp(a * uAmt * uIntensity, 0.0, 1.0));
  }
`;

const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BG_FRAG = /* glsl */ `
  uniform vec2  uRes;
  uniform float uDpr, uGridSize, uGridAmt, uTime;
  uniform vec3  uBg, uGlow;
  varying vec2  vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / uRes.y;
    vec3 col = uBg;

    // violet haze rising from the bottom, strongest under the trough
    vec2 p = (uv - vec2(0.45, -0.08)) * vec2(aspect * 0.5, 1.0);
    col += uGlow * exp(-dot(p, p) * 5.0) * 0.6;
    // soft side glows where the ribbons leave the frame
    col += vec3(0.20, 0.05, 0.42) * exp(-pow((uv.x - 0.0) * 4.5, 2.0) - pow((uv.y - 0.5) * 2.6, 2.0)) * 0.6;
    col += vec3(0.05, 0.12, 0.42) * exp(-pow((uv.x - 1.0) * 4.5, 2.0) - pow((uv.y - 0.5) * 3.0, 2.0)) * 0.35;

    // faint blueprint grid with brighter dots at intersections
    vec2 px = gl_FragCoord.xy / uDpr;
    vec2 g  = abs(fract(px / uGridSize + 0.5) - 0.5) * uGridSize;   // distance to nearest line, CSS px
    float line = max(1.0 - smoothstep(0.0, 1.0, g.x), 1.0 - smoothstep(0.0, 1.0, g.y));
    float node = 1.0 - smoothstep(0.0, 1.6, length(g));
    float gridMask = smoothstep(0.0, 0.35, uv.y) * (0.6 + 0.4 * uv.y);
    col += vec3(0.55, 0.5, 1.0) * (line * 0.035 + node * 0.10) * uGridAmt * gridMask;

    col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function initHeroRibbons(container, opts = {}) {
  const o = {
    speed: 1,            // time multiplier
    intensity: 1,        // overall brightness of ribbons
    lines: 0.45,         // 0 = soft glow only, 1 = crisp light strokes and sheet edges
    lineWidth: 0.3,      // thickness of the line ribbons (stroke + halo), sheets unaffected
    grid: 1,             // grid opacity, 0 = off
    gridSize: 96,        // CSS px
    maxDpr: 2,
    palette: {},
    ribbons: DEFAULT_RIBBONS,
    ...opts,
  };
  const pal = { ...DEFAULT_PALETTE, ...o.palette };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    // No WebGL: leave the container's CSS background (keep the old image there as a fallback).
    console.warn('[hero-ribbons] WebGL unavailable, using CSS fallback.', err);
    return { destroy() {}, set() {}, pause() {}, play() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxDpr));
  renderer.setClearColor(pal.background, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

  const shared = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uIntensity: { value: o.intensity },
    uLineWidth: { value: o.lineWidth },
    uLines: { value: o.lines },
  };

  // background
  const bgMat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: shared.uTime,
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: renderer.getPixelRatio() },
      uGridSize: { value: o.gridSize },
      uGridAmt: { value: o.grid },
      uBg: { value: hex(pal.background) },
      uGlow: { value: hex(pal.glow) },
    },
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);

  // ribbons
  const group = new THREE.Group();
  scene.add(group);
  const ribbonGeo = new THREE.PlaneGeometry(2, 1, 360, 1);
  const tints = {
    line: [hex(pal.lineLeft), hex(pal.lineMid), hex(pal.lineRight)],
    hero: [hex(pal.lineLeft), hex(pal.lineMid), hex(pal.heroRight)],
    sheet: [hex(pal.sheetLeft), hex(pal.sheetMid), hex(pal.sheetRight)],
    indigo: [hex(pal.sheetLeft), hex(pal.indigo), hex(pal.indigo)],
    blue: [hex(pal.sheetMid), hex(pal.sheetRight), hex(pal.cyan)],
  };
  const materials = [];

  o.ribbons.forEach((r, i) => {
    const isLine = r.kind === 'line';
    const cols = tints[r.tint] || (isLine ? tints.line : tints.sheet);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: shared.uTime,
        uAspect: shared.uAspect,
        uIntensity: shared.uIntensity,
        uLineWidth: isLine ? shared.uLineWidth : { value: 1 },
        uLines: shared.uLines,
        uIsLine: { value: isLine ? 1 : 0 },
        uY0: { value: r.y0 }, uTx: { value: r.tx }, uCL: { value: r.cL }, uCR: { value: r.cR },
        uWidth: { value: r.width }, uWave: { value: r.wave }, uFreq: { value: r.freq },
        uSpeed: { value: r.speed }, uPhase: { value: r.phase }, uDepth: { value: r.depth },
        uColA: { value: cols[0] }, uColB: { value: cols[1] }, uColC: { value: cols[2] },
        uCore: { value: r.core ?? (isLine ? 350 : 260) },
        uGlow: { value: r.glow ?? (isLine ? 9 : 3.2) },
        uCoreAmt: { value: isLine ? 1.0 : (r.edge ?? 0.35) },
        uGlowAmt: { value: r.glowAmt ?? (isLine ? 0.22 : 1.0) },
        uSkew: { value: isLine ? 1.0 : 6.0 },
        uAmt: { value: r.amt },
        uHot: { value: r.hot ?? (isLine ? 0.25 : 0.0) },
        uSparkle: { value: r.sparkle ?? 0 },
      },
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(ribbonGeo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = i;
    group.add(mesh);
  });

  // sizing
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -aspect; camera.right = aspect; camera.top = 1; camera.bottom = -1;
    camera.updateProjectionMatrix();
    shared.uAspect.value = aspect;
    bgMat.uniforms.uRes.value.set(w, h);
    bgMat.uniforms.uDpr.value = renderer.getPixelRatio();
    if (!running) renderOnce();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // loop
  let running = false, visible = true, paused = false, raf = 0, last = 0;
  let t = 8; // start mid-motion so the first frame already looks composed
  const renderOnce = () => renderer.render(scene, camera);
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t += dt * o.speed;
    shared.uTime.value = t;
    renderOnce();
  };
  const update = () => {
    const should = visible && !paused && !document.hidden && !reduceMotion;
    if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  };
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
  io.observe(container);
  document.addEventListener('visibilitychange', update);

  shared.uTime.value = t;
  resize();
  renderOnce();
  update();

  return {
    /** Change speed / intensity / lines / lineWidth / grid at runtime. */
    set(next = {}) {
      if (next.speed !== undefined) o.speed = next.speed;
      if (next.intensity !== undefined) shared.uIntensity.value = next.intensity;
      if (next.lineWidth !== undefined) shared.uLineWidth.value = next.lineWidth;
      if (next.lines !== undefined) shared.uLines.value = next.lines;
      if (next.grid !== undefined) bgMat.uniforms.uGridAmt.value = next.grid;
      if (!running) renderOnce();
    },
    pause() { paused = true; update(); },
    play() { paused = false; update(); },
    get paused() { return paused; },
    reducedMotion: reduceMotion,
    destroy() {
      paused = true; update();
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', update);
      ribbonGeo.dispose(); bg.geometry.dispose(); bgMat.dispose();
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}