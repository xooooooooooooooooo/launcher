import { useEffect, useRef } from "react";
import { useSettings } from "@/context/SettingsContext";
import type { ShaderPresetId } from "@/context/SettingsContext";

// Try WebGL/GLSL first; fallback to Canvas 2D. Multiple presets.

const DEFAULT_VERTEX = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT_GOLD_ORBS = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv -= 0.5;
    uv.x *= u_resolution.x / u_resolution.y;
    float t = u_time * 0.15;
    float d1 = length(uv - vec2(sin(t) * 0.4, cos(t * 0.7) * 0.3));
    float d2 = length(uv - vec2(cos(t * 0.8) * 0.35, sin(t * 0.6) * 0.4));
    float d3 = length(uv - vec2(sin(t + 2.0) * 0.25, cos(t * 0.5 + 1.0) * 0.25));
    float glow1 = exp(-d1 * 3.5) * 0.6;
    float glow2 = exp(-d2 * 2.8) * 0.5;
    float glow3 = exp(-d3 * 4.0) * 0.45;
    vec3 gold = vec3(0.98, 0.82, 0.45);
    vec3 dark = vec3(0.14, 0.15, 0.2);
    vec3 mid  = vec3(0.2, 0.19, 0.24);
    vec3 col = mix(dark, mid, uv.y + 0.5);
    col = mix(col, gold, glow1 + glow2 * 0.85);
    col = mix(col, gold * 0.95, glow3 * 0.8);
    float vig = 1.0 - 0.2 * length(uv);
    col *= vig;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Starfield: hash-based twinkling stars
const FRAGMENT_STARS = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv -= 0.5;
    uv.x *= u_resolution.x / u_resolution.y;
    vec2 id = floor(uv * 120.0);
    float n = hash(id);
    if (n < 0.92) {
      gl_FragColor = vec4(0.06, 0.07, 0.12, 1.0);
      return;
    }
    vec2 gv = fract(uv * 120.0) - 0.5;
    float dist = length(gv);
    float size = 0.15 + n * 0.2;
    float star = smoothstep(size, size * 0.3, dist);
    float twinkle = 0.4 + 0.6 * sin(u_time * 2.0 + n * 6.28);
    vec3 col = vec3(0.95, 0.92, 0.98) * star * twinkle;
    vec3 dark = vec3(0.06, 0.07, 0.12);
    col += dark * (1.0 - star);
    float vig = 1.0 - 0.3 * length(uv);
    col *= vig;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Aurora: flowing curtain bands
const FRAGMENT_AURORA = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv -= 0.5;
    uv.x *= u_resolution.x / u_resolution.y;
    float t = u_time * 0.2;
    float band1 = sin(uv.x * 4.0 + t) * 0.5 + 0.5;
    float band2 = sin(uv.x * 3.0 + t * 1.3 + 1.0) * 0.5 + 0.5;
    float mask = exp(-uv.y * 2.0) * (1.0 - smoothstep(0.3, 0.8, abs(uv.y)));
    vec3 green = vec3(0.2, 0.9, 0.5);
    vec3 blue = vec3(0.2, 0.5, 0.9);
    vec3 col = vec3(0.08, 0.09, 0.18);
    col = mix(col, green, band1 * mask * 0.5);
    col = mix(col, blue, band2 * mask * 0.4);
    float vig = 1.0 - 0.25 * length(uv);
    col *= vig;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Waves: concentric ripples
const FRAGMENT_WAVES = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv -= 0.5;
    uv.x *= u_resolution.x / u_resolution.y;
    float dist = length(uv);
    float wave = sin(dist * 12.0 - u_time * 2.0) * 0.5 + 0.5;
    wave *= exp(-dist * 1.2);
    vec3 dark = vec3(0.08, 0.1, 0.18);
    vec3 accent = vec3(0.3, 0.6, 0.95);
    vec3 col = mix(dark, accent, wave * 0.5);
    float vig = 1.0 - 0.2 * length(uv);
    col *= vig;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const FRAGMENT_SHADERS: Record<ShaderPresetId, string> = {
  "gold-orbs": FRAGMENT_GOLD_ORBS,
  stars: FRAGMENT_STARS,
  aurora: FRAGMENT_AURORA,
  waves: FRAGMENT_WAVES,
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("Shader compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// ----- Canvas 2D fallbacks -----
const DARK = "#1a1c26";
const MID = "#252830";
const GOLD = "rgba(255, 215, 120, 0.65)";
const GOLD_SOFT = "rgba(255, 215, 120, 0.45)";

function runCanvas2DGoldOrbs(
  container: HTMLDivElement,
  canvas: HTMLCanvasElement,
  dpr: number
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  let w = 0, h = 0;
  const resize = () => {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const start = performance.now() / 1000;
  let frameId: number;
  const loop = () => {
    resize();
    if (w < 10 || h < 10) {
      frameId = requestAnimationFrame(loop);
      return;
    }
    const t = performance.now() / 1000 - start;
    const speed = 0.15;
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, DARK);
    base.addColorStop(0.5, MID);
    base.addColorStop(1, DARK);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const r1 = 0.4 * Math.min(w, h), r2 = 0.35 * Math.min(w, h), r3 = 0.25 * Math.min(w, h);
    const x1 = cx + Math.sin(t * speed) * r1 * (w / h);
    const y1 = cy + Math.cos(t * 0.7 * speed) * r1;
    const x2 = cx + Math.cos(t * 0.8 * speed) * r2 * (w / h);
    const y2 = cy + Math.sin(t * 0.6 * speed) * r2;
    const x3 = cx + Math.sin(t * speed + 2) * r3 * (w / h);
    const y3 = cy + Math.cos(t * 0.5 * speed + 1) * r3;
    const rad = (r: number) => Math.max(80, r * 0.8);
    const drawOrb = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(0.4, color.replace(/[\d.]+\)/, "0.15)"));
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    drawOrb(x1, y1, rad(r1), GOLD);
    drawOrb(x2, y2, rad(r2), GOLD);
    drawOrb(x3, y3, rad(r3), GOLD_SOFT);
    const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    vig.addColorStop(0, "transparent");
    vig.addColorStop(0.65, "transparent");
    vig.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    frameId = requestAnimationFrame(loop);
  };
  resize();
  requestAnimationFrame(resize);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  frameId = requestAnimationFrame(loop);
  return () => {
    ro.disconnect();
    cancelAnimationFrame(frameId);
  };
}

// Deterministic "random" for star positions
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function runCanvas2DStars(
  container: HTMLDivElement,
  canvas: HTMLCanvasElement,
  dpr: number
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  let w = 0, h = 0;
  const resize = () => {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const start = performance.now() / 1000;
  let frameId: number;
  const loop = () => {
    resize();
    if (w < 10 || h < 10) {
      frameId = requestAnimationFrame(loop);
      return;
    }
    const t = performance.now() / 1000 - start;
    ctx.fillStyle = "#0f101a";
    ctx.fillRect(0, 0, w, h);
    const cols = Math.ceil(w / 8);
    const rows = Math.ceil(h / 8);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const n = hash(i, j);
        if (n < 0.92) continue;
        const x = (i + 0.5) * (w / cols);
        const y = (j + 0.5) * (h / rows);
        const twinkle = 0.4 + 0.6 * Math.sin(t * 2 + n * Math.PI * 2);
        const radius = 0.5 + n * 1.2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
        g.addColorStop(0, `rgba(255,252,255,${0.9 * twinkle})`);
        g.addColorStop(0.5, `rgba(255,252,255,${0.3 * twinkle})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const vig = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    vig.addColorStop(0, "transparent");
    vig.addColorStop(0.7, "transparent");
    vig.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    frameId = requestAnimationFrame(loop);
  };
  resize();
  requestAnimationFrame(resize);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  frameId = requestAnimationFrame(loop);
  return () => {
    ro.disconnect();
    cancelAnimationFrame(frameId);
  };
}

function runCanvas2DAurora(
  container: HTMLDivElement,
  canvas: HTMLCanvasElement,
  dpr: number
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  let w = 0, h = 0;
  const resize = () => {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const start = performance.now() / 1000;
  let frameId: number;
  const loop = () => {
    resize();
    if (w < 10 || h < 10) {
      frameId = requestAnimationFrame(loop);
      return;
    }
    const t = performance.now() / 1000 - start;
    ctx.fillStyle = "#0a0c18";
    ctx.fillRect(0, 0, w, h);
    const cy = h * 0.35;
    for (let i = 0; i < 4; i++) {
      const phase = t * 0.2 + i * 1.2;
      const y = cy + Math.sin(phase) * 25 + i * 20;
      const band = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      band.addColorStop(0, "transparent");
      band.addColorStop(0.4, `rgba(50,220,140,${0.12 * (0.5 + 0.5 * Math.sin(phase * 0.7))})`);
      band.addColorStop(0.5, `rgba(80,200,240,${0.1 * (0.5 + 0.5 * Math.sin(phase * 0.7 + 1))})`);
      band.addColorStop(0.6, `rgba(50,220,140,${0.08 * (0.5 + 0.5 * Math.sin(phase * 0.7 + 2))})`);
      band.addColorStop(1, "transparent");
      ctx.fillStyle = band;
      ctx.fillRect(0, y - 60, w, 120);
    }
    frameId = requestAnimationFrame(loop);
  };
  resize();
  requestAnimationFrame(resize);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  frameId = requestAnimationFrame(loop);
  return () => {
    ro.disconnect();
    cancelAnimationFrame(frameId);
  };
}

function runCanvas2DWaves(
  container: HTMLDivElement,
  canvas: HTMLCanvasElement,
  dpr: number
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => { };
  let w = 0, h = 0;
  const resize = () => {
    w = Math.max(1, container.clientWidth);
    h = Math.max(1, container.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const start = performance.now() / 1000;
  let frameId: number;
  const loop = () => {
    resize();
    if (w < 10 || h < 10) {
      frameId = requestAnimationFrame(loop);
      return;
    }
    const t = performance.now() / 1000 - start;
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const maxR = Math.max(w, h) * 0.7;
    for (let i = 0; i < 25; i++) {
      const r = (i / 25) * maxR + (t * 40) % 30;
      const wave = Math.sin(r * 0.15 - t * 2) * 0.5 + 0.5;
      const alpha = wave * 0.15 * Math.exp(-r / maxR);
      ctx.strokeStyle = `rgba(80,160,255,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    vig.addColorStop(0, "transparent");
    vig.addColorStop(0.6, "transparent");
    vig.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    frameId = requestAnimationFrame(loop);
  };
  resize();
  requestAnimationFrame(resize);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  frameId = requestAnimationFrame(loop);
  return () => {
    ro.disconnect();
    cancelAnimationFrame(frameId);
  };
}

const CANVAS2D_RUNNERS: Record<ShaderPresetId, (c: HTMLDivElement, canvas: HTMLCanvasElement, dpr: number) => () => void> = {
  "gold-orbs": runCanvas2DGoldOrbs,
  stars: runCanvas2DStars,
  aurora: runCanvas2DAurora,
  waves: runCanvas2DWaves,
};

const CLEAR_COLORS: Record<ShaderPresetId, [number, number, number]> = {
  "gold-orbs": [0.14, 0.15, 0.2],
  stars: [0.06, 0.07, 0.12],
  aurora: [0.08, 0.09, 0.18],
  waves: [0.08, 0.1, 0.18],
};

export function ShaderBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const { settings } = useSettings();
  const shaderPreset = settings.shaderPreset ?? "gold-orbs";

  useEffect(() => {
    const container = containerRef.current;
    const webglCanvas = webglCanvasRef.current;
    const fallbackCanvas = fallbackCanvasRef.current;
    if (!container || !webglCanvas || !fallbackCanvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fragmentSource = FRAGMENT_SHADERS[shaderPreset];
    const clearColor = CLEAR_COLORS[shaderPreset];

    const gl = webglCanvas.getContext("webgl", {
      alpha: false,
      failIfMajorPerformanceCriterion: false,
    }) as WebGLRenderingContext | null;

    if (gl) {
      const vert = compileShader(gl, gl.VERTEX_SHADER, DEFAULT_VERTEX);
      const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      if (vert && frag) {
        const program = gl.createProgram();
        if (program) {
          gl.attachShader(program, vert);
          gl.attachShader(program, frag);
          gl.linkProgram(program);
          if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.useProgram(program);
            const positionLoc = gl.getAttribLocation(program, "a_position");
            const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
            const timeLoc = gl.getUniformLocation(program, "u_time");
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(
              gl.ARRAY_BUFFER,
              new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
              gl.STATIC_DRAW
            );
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
            gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);

            let w = 0, h = 0;
            const resize = () => {
              w = Math.max(1, container.clientWidth);
              h = Math.max(1, container.clientHeight);
              webglCanvas.width = w * dpr;
              webglCanvas.height = h * dpr;
              webglCanvas.style.width = `${w}px`;
              webglCanvas.style.height = `${h}px`;
              gl.viewport(0, 0, webglCanvas.width, webglCanvas.height);
            };
            let frameId: number;
            const start = performance.now() / 1000;
            const loop = () => {
              resize();
              if (webglCanvas.width >= 10 && webglCanvas.height >= 10) {
                const t = performance.now() / 1000 - start;
                gl.uniform2f(resolutionLoc, webglCanvas.width, webglCanvas.height);
                gl.uniform1f(timeLoc, t);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
              }
              frameId = requestAnimationFrame(loop);
            };
            resize();
            const ro = new ResizeObserver(resize);
            ro.observe(container);
            frameId = requestAnimationFrame(loop);
            webglCanvas.style.display = "block";
            fallbackCanvas.style.display = "none";
            return () => {
              ro.disconnect();
              cancelAnimationFrame(frameId);
              gl.deleteProgram(program);
              gl.deleteShader(vert);
              gl.deleteShader(frag);
            };
          }
        }
      }
    }

    webglCanvas.style.display = "none";
    fallbackCanvas.style.display = "block";
    return CANVAS2D_RUNNERS[shaderPreset](container, fallbackCanvas, dpr);
  }, [shaderPreset]);

  return (
    <div ref={containerRef} className="absolute inset-0 h-full w-full min-h-full min-w-full">
      <canvas
        ref={webglCanvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ display: "block" }}
      />
      <canvas
        ref={fallbackCanvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ display: "none" }}
      />
    </div>
  );
}
