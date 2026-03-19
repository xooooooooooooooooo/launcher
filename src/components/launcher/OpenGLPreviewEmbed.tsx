import { useEffect, useRef } from "react";
import * as skinview3d from "skinview3d";
import * as THREE from "three";
import type { PreviewOptions, EspShaderPreset } from "./StevePreview";

type OpenGLPreviewEmbedProps = { previewOptions: PreviewOptions };

const DEFAULT_STEVE_SKIN_URL = "https://crafatar.com/skins/8667ba71b85a4004af54457a9734eed7?overlay=false";
const FALLBACK_SKIN_URL = "https://mc-heads.net/skin/8667ba71b85a4004af54457a9734eed7.png";

// RisePostProcessor - Screen-Space Effect Engine (Authentic Minecraft Integration)
const RisePostProcessor = {
  calculateGaussianKernel: (radius: number) => {
    const sigma = Math.max(0.1, radius / 2);
    const kernel = new Float32Array(128);
    let sum = 0;
    for (let i = 0; i <= radius; i++) {
      const val = Math.exp(-(i * i) / (2 * sigma * sigma)) / (Math.sqrt(2 * Math.PI) * sigma);
      kernel[i] = val;
      sum += (i === 0 ? val : val * 2);
    }
    // Prevent NaN
    if (sum === 0) sum = 1;
    for (let i = 0; i <= radius; i++) kernel[i] /= sum;
    return kernel;
  },

  getUniforms: (color: THREE.Color, resolution: THREE.Vector2) => ({
    u_diffuse_sampler: { value: null },
    u_other_sampler: { value: null },
    u_texel_size: { value: new THREE.Vector2(1 / resolution.x, 1 / resolution.y) },
    u_direction: { value: new THREE.Vector2(1, 0) },
    u_radius: { value: 12.0 },
    u_kernel: { value: RisePostProcessor.calculateGaussianKernel(12) },
    u_color: { value: new THREE.Vector3(color.r, color.g, color.b) },
    u_time: { value: 0 },
    u_alpha: { value: 1.0 },
    u_discard: { value: 1.0 } // 1.0 = Outline mode, 0.0 = Fill mode
  }),

  // Adapted Authentic blooming/blur shader (Native WebGL2)
  blurFragment: `
    precision mediump float;
    uniform sampler2D u_diffuse_sampler;
    uniform sampler2D u_other_sampler;
    uniform vec2 u_texel_size;
    uniform vec2 u_direction;
    uniform float u_radius;
    uniform float u_kernel[128];
    uniform float u_discard;
    in vec2 vUv;
    out vec4 pc_fragColor;

    void main(void) {
        vec2 uv = vUv;

        // Outline logic: discard if inside the original shape (vertical pass only)
        if (u_direction.x == 0.0 && u_discard > 0.5) {
            float alpha = texture(u_other_sampler, uv).a;
            if (alpha > 0.0) discard;
        }

        vec4 pixel_color = texture(u_diffuse_sampler, uv);
        pixel_color.rgb *= pixel_color.a;
        pixel_color *= u_kernel[0];

        for (int i = 1; i <= 64; i++) {
            if (float(i) > u_radius) break;
            vec2 offset = float(i) * u_texel_size * u_direction;
            vec4 left = texture(u_diffuse_sampler, uv - offset);
            vec4 right = texture(u_diffuse_sampler, uv + offset);

            left.rgb *= left.a;
            right.rgb *= right.a;
            pixel_color += (left + right) * u_kernel[i];
        }

        if (pixel_color.a <= 0.0) {
            pc_fragColor = vec4(0.0);
        } else {
            pc_fragColor = vec4(pixel_color.rgb / pixel_color.a, pixel_color.a);
        }
    }
  `,

  // Glow ESP - Simple soft glow effect (outline only)
  bloomFragmentGlow: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      pc_fragColor = vec4(u_color, glow.a * u_alpha);
    }
  `,

  // Outline ESP - Clean edge detection outline
  bloomFragmentOutlineMode: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    uniform vec2 u_texel_size;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec2 uv = vUv;
      float center = texture(tGlow, uv).a;
      
      // Sobel edge detection
      float tl = texture(tGlow, uv + vec2(-u_texel_size.x, u_texel_size.y)).a;
      float t = texture(tGlow, uv + vec2(0.0, u_texel_size.y)).a;
      float tr = texture(tGlow, uv + vec2(u_texel_size.x, u_texel_size.y)).a;
      float l = texture(tGlow, uv + vec2(-u_texel_size.x, 0.0)).a;
      float r = texture(tGlow, uv + vec2(u_texel_size.x, 0.0)).a;
      float bl = texture(tGlow, uv + vec2(-u_texel_size.x, -u_texel_size.y)).a;
      float b = texture(tGlow, uv + vec2(0.0, -u_texel_size.y)).a;
      float br = texture(tGlow, uv + vec2(u_texel_size.x, -u_texel_size.y)).a;
      
      float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
      float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
      float edge = sqrt(gx * gx + gy * gy);
      
      // Only show edges, not filled areas
      float outline = step(0.1, edge) * (1.0 - step(0.3, center));
      pc_fragColor = vec4(u_color, outline * u_alpha);
    }
  `,

  // Final Bloom Composite - Base (Classic) - For Shader ESP
  bloomFragmentClassic: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      pc_fragColor = vec4(u_color, glow.a * u_alpha);
    }
  `,

  // Outline - Clean outline only (no fill, crisp edge)
  bloomFragmentOutline: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      float edge = smoothstep(0.0, 0.35, glow.a) * (1.0 - smoothstep(0.35, 0.7, glow.a));
      float a = edge * u_alpha;
      pc_fragColor = vec4(u_color, a);
    }
  `,

  // Chalk - Desaturated, dusty look
  bloomFragmentChalk: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    uniform float u_time;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      float gray = dot(u_color, vec3(0.299, 0.587, 0.114));
      vec3 chalkColor = mix(vec3(gray), u_color, 0.4);
      pc_fragColor = vec4(chalkColor, glow.a * u_alpha * 0.9);
    }
  `,

  // Chromatic - RGB split / chromatic aberration
  bloomFragmentChromatic: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    uniform vec2 u_texel_size;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      float offset = 8.0 * u_texel_size.x;
      float r = texture(tGlow, vUv - vec2(offset, 0.0)).a;
      float g = texture(tGlow, vUv).a;
      float b = texture(tGlow, vUv + vec2(offset, 0.0)).a;
      float a = max(max(r, g), b);
      vec3 col = vec3(r * 1.0, g * 1.0, b * 1.0) * u_color;
      pc_fragColor = vec4(col, a * u_alpha);
    }
  `,

  // Neon - Brighter, more saturated
  bloomFragmentNeon: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      vec3 neonColor = pow(u_color, vec3(0.8));
      pc_fragColor = vec4(neonColor, glow.a * u_alpha * 1.2);
    }
  `,

  // Ghost - Translucent, faint
  bloomFragmentGhost: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      vec3 ghostColor = mix(vec3(1.0), u_color, 0.6);
      pc_fragColor = vec4(ghostColor, glow.a * u_alpha * 0.5);
    }
  `,

  // Scanline - Retro CRT-style scanlines
  bloomFragmentScanline: `
    precision mediump float;
    uniform sampler2D tGlow;
    uniform vec3 u_color;
    uniform float u_alpha;
    uniform float u_time;
    in vec2 vUv;
    out vec4 pc_fragColor;
    void main() {
      vec4 glow = texture(tGlow, vUv);
      float scanline = 0.95 + 0.05 * sin(vUv.y * 400.0 + u_time * 3.0);
      pc_fragColor = vec4(u_color, glow.a * u_alpha * scanline);
    }
  `,

  getBloomFragment: (preset: EspShaderPreset): string => {
    switch (preset) {
      case "outline": return RisePostProcessor.bloomFragmentOutline;
      case "chalk": return RisePostProcessor.bloomFragmentChalk;
      case "chromatic": return RisePostProcessor.bloomFragmentChromatic;
      case "neon": return RisePostProcessor.bloomFragmentNeon;
      case "ghost": return RisePostProcessor.bloomFragmentGhost;
      case "scanline": return RisePostProcessor.bloomFragmentScanline;
      default: return RisePostProcessor.bloomFragmentClassic;
    }
  },

  vertexShader: `
    out vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  // Rounded Quad (RQ) Shader for UI - High Performance Anti-Aliased Corners
  rqFragment: `
    #version 300 es
    precision mediump float;
    uniform vec2 u_size;
    uniform float u_radius;
    uniform vec4 u_color;
    uniform sampler2D u_text_sampler;
    in vec2 vUv;
    out vec4 pc_fragColor;

    void main() {
        // 1. Distance field for rounded box (User provided logic converted to WebGL2)
        vec2 q = (abs(vUv - 0.5) + 0.5) * u_size - u_size + u_radius;
        float dist = length(max(q, 0.0)) - u_radius + 0.5;
        float bgAlpha = smoothstep(1.0, 0.0, dist) * 0.65;
        
        // 2. Composite (Over operator)
        vec4 textColor = texture(u_text_sampler, vUv);
        vec3 finalRGB = mix(vec3(0.0), textColor.rgb, textColor.a);
        float finalAlpha = max(bgAlpha, textColor.a);
        
        pc_fragColor = vec4(finalRGB, finalAlpha);
    }
  `
};

export function OpenGLPreviewEmbed({ previewOptions }: OpenGLPreviewEmbedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);
  const espBoxRef = useRef<THREE.LineSegments | null>(null);

  // Nametag als Canvas-Texture (zwei Stile: "modern" Pill, "minecraft" Vanilla-Schriftzug)
  const createNameTag = (text: string) => {
    const tCanvas = document.createElement("canvas");
    const tCtx = tCanvas.getContext("2d");
    if (!tCtx) return null;

    const fontSize = 40;
    tCtx.font = `900 ${fontSize}px "Rajdhani", "Inter", system-ui, sans-serif`;
    const textWidth = tCtx.measureText(text).width;

    // Logische Größe (für Geometrie) und High-DPI-Skalierung für saubere Ecken
    const logicalWidth = textWidth + 64;
    const logicalHeight = fontSize + 32;
    const dpr = window.devicePixelRatio || 1;
    const scaleFactor = Math.max(2, dpr); // mindestens 2x Auflösung für schönere Rundung

    tCanvas.width = logicalWidth * scaleFactor;
    tCanvas.height = logicalHeight * scaleFactor;

    // Im High-DPI-Raum zeichnen
    const r = logicalHeight / 2;
    tCtx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0); // wir arbeiten in logischen Koordinaten
    tCtx.clearRect(0, 0, logicalWidth, logicalHeight);

    const style = previewOptions.espNametagStyle ?? "modern";

    if (style === "modern") {
      // Hintergrund als starke „Pill“ (Radius = halbe Höhe)
      tCtx.fillStyle = "rgba(0,0,0,0.25)";
      tCtx.beginPath();
      tCtx.moveTo(r, 0);
      tCtx.lineTo(logicalWidth - r, 0);
      tCtx.quadraticCurveTo(logicalWidth, 0, logicalWidth, r);
      tCtx.lineTo(logicalWidth, logicalHeight - r);
      tCtx.quadraticCurveTo(logicalWidth, logicalHeight, logicalWidth - r, logicalHeight);
      tCtx.lineTo(r, logicalHeight);
      tCtx.quadraticCurveTo(0, logicalHeight, 0, logicalHeight - r);
      tCtx.lineTo(0, r);
      tCtx.quadraticCurveTo(0, 0, r, 0);
      tCtx.closePath();
      tCtx.fill();

      // Text
      tCtx.font = `900 ${fontSize}px "Rajdhani", "Inter", system-ui, sans-serif`;
      tCtx.fillStyle = "#ffffff";
      tCtx.textBaseline = "middle";
      tCtx.textAlign = "center";
      tCtx.fillText(text, logicalWidth / 2, logicalHeight / 2);
    } else {
      // Minecraft-Style: nur weißer Text mit schwarzer Outline, kein Kasten
      tCtx.font = `bold ${fontSize}px "Minecraftia", "Rajdhani", "Inter", system-ui, sans-serif`;
      tCtx.textBaseline = "middle";
      tCtx.textAlign = "center";
      const cx = logicalWidth / 2;
      const cy = logicalHeight / 2;
      const o = 1.5;
      tCtx.fillStyle = "black";
      tCtx.fillText(text, cx - o, cy);
      tCtx.fillText(text, cx + o, cy);
      tCtx.fillText(text, cx, cy - o);
      tCtx.fillText(text, cx, cy + o);
      tCtx.fillText(text, cx - o, cy - o);
      tCtx.fillText(text, cx + o, cy - o);
      tCtx.fillText(text, cx - o, cy + o);
      tCtx.fillText(text, cx + o, cy + o);
      tCtx.fillStyle = "#ffffff";
      tCtx.fillText(text, cx, cy);
    }

    const tTex = new THREE.CanvasTexture(tCanvas);
    tTex.minFilter = THREE.LinearFilter;
    tTex.magFilter = THREE.LinearFilter;
    tTex.needsUpdate = true;

    const scale = 0.5;
    const w = (logicalWidth * scale) / 10;
    const h = (logicalHeight * scale) / 10;

    const mat = new THREE.MeshBasicMaterial({
      map: tTex,
      transparent: true,
      color: 0xffffff,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.name = "Nametag";
    // Sicherstellen, dass der Nametag NICHT im ESP-Glow-Pass (Layer 1) landet
    mesh.layers.disable(1);
    return mesh;
  };

  // Helper to create Skeleton ESP
  const createSkeleton = () => {
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: previewOptions.espColor || "#55ff55" });

    // Simple stick-figure representation based on limb centers
    // In skinview3d, limbs are separate groups. We can define joints relative to them.
    const addBone = (p1: THREE.Vector3, p2: THREE.Vector3) => {
      const g = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const l = new THREE.Line(g, mat);
      l.layers.enable(1);
      group.add(l);
    };

    // Body (approximate centers for stick figure)
    // Head: 0, 20 | Neck: 0, 16 | Waist: 0, 8 | Shoulders: +-4, 16 | Hips: +-2, 8
    const neck = new THREE.Vector3(0, 16, 0);
    const waist = new THREE.Vector3(0, 8, 0);
    addBone(new THREE.Vector3(0, 20, 0), neck); // Head to neck
    addBone(neck, waist); // Spine

    // Arms
    addBone(neck, new THREE.Vector3(-6, 14, 0)); // Right arm
    addBone(neck, new THREE.Vector3(6, 14, 0));  // Left arm
    // Legs
    addBone(waist, new THREE.Vector3(-2, 0, 0)); // Right leg
    addBone(waist, new THREE.Vector3(2, 0, 0));  // Left leg

    return group;
  };

  // Helper to create a Manual OpenGL Steve (Fail-Safe)
  const createManualSteve = () => {
    const group = new THREE.Group();
    group.name = "ManualSteve";

    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x00ffff }); // Cyan
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x0000ff }); // Blue

    const addBox = (w: number, h: number, d: number, pos: THREE.Vector3, mat: THREE.Material) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, mat);
      m.position.copy(pos);
      m.layers.enable(1); // Enable ESP Layer 1
      group.add(m);
    };

    // Head (8x8x8)
    addBox(8, 8, 8, new THREE.Vector3(0, 28, 0), skinMat);
    // Body (8x12x4)
    addBox(8, 12, 4, new THREE.Vector3(0, 18, 0), shirtMat);
    // Arms (4x12x4)
    addBox(4, 12, 4, new THREE.Vector3(-6, 18, 0), skinMat);
    addBox(4, 12, 4, new THREE.Vector3(6, 18, 0), skinMat);
    // Legs (4x12x4)
    addBox(4, 12, 4, new THREE.Vector3(-2, 6, 0), pantsMat);
    addBox(4, 12, 4, new THREE.Vector3(2, 6, 0), pantsMat);

    return group;
  };

  const settingsRef = useRef(previewOptions);
  useEffect(() => { settingsRef.current = previewOptions; }, [previewOptions]);

  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Initialize Viewer
    const parent = canvasRef.current.parentElement;
    const initialWidth = parent?.clientWidth || 300;
    const initialHeight = parent?.clientHeight || 400;

    const viewer = new skinview3d.SkinViewer({
      canvas: canvasRef.current,
      width: initialWidth,
      height: initialHeight,
      enableControls: true,
      nameTag: null, // use only our custom rounded nametag
    });
    (viewer as any).nameTag = null; // ensure library nametag is never shown

    viewer.renderer.setClearColor(0x0a0a0a, 1);
    viewer.renderer.autoClear = false; // Essential for additive overlays
    viewerRef.current = viewer;

    // 2. Setup OrbitControls (Force enable for interaction)
    if (viewer.controls) {
      viewer.controls.enabled = true;
      viewer.controls.enableZoom = true;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = false;
      viewer.controls.rotateSpeed = 0.5;
      viewer.controls.zoomSpeed = 0.5;
    }

    // 2.1 Initial camera framing – keep model visually centered
    try {
      const camera = viewer.camera as any as THREE.PerspectiveCamera;
      const controls: any = (viewer as any).controls;
      // Fixed framing tuned for 2-block-tall player model
      const target = new THREE.Vector3(0, 18, 0); // around torso
      const dist = 52;
      camera.position.set(0, target.y + 6, dist);
      camera.near = 0.1;
      camera.far = 500;
      camera.updateProjectionMatrix();
      if (controls?.target) {
        controls.target.copy(target);
        controls.minDistance = 20;
        controls.maxDistance = 80;
        controls.update?.();
      } else {
        camera.lookAt(target);
      }
    } catch (e) {
      console.warn("[Preview] initial camera framing failed", e);
    }

    // 3. Environment & Studio Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 2.0);
    ambient.layers.enable(1); // Enable for capture pass too!
    viewer.scene.add(ambient as any);

    const pointLight = new THREE.PointLight(0xffffff, 2.5);
    pointLight.position.set(0, 20, 50);
    pointLight.layers.enable(1); // Enable for capture pass too!
    viewer.scene.add(pointLight as any);

    // 4. Manual Steve (Fail-Safe Geometry)
    const manualSteve = createManualSteve();
    viewer.playerObject.add(manualSteve as any);

    // 5. Post-Processing Buffers (Rise Authentic)
    const res = new THREE.Vector2(initialWidth, initialHeight);
    const renderTarget = new THREE.WebGLRenderTarget(res.x, res.y);
    const blurTargetH = new THREE.WebGLRenderTarget(res.x, res.y);
    const blurTargetV = new THREE.WebGLRenderTarget(res.x, res.y);

    const blurMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: RisePostProcessor.getUniforms(new THREE.Color(previewOptions.espColor || "#55ff55"), res),
      vertexShader: RisePostProcessor.vertexShader,
      fragmentShader: RisePostProcessor.blurFragment,
      transparent: true, depthTest: false, depthWrite: false
    });

    const createBloomMaterial = (fragmentShader: string) =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          tGlow: { value: null },
          u_color: { value: new THREE.Vector3(0, 1, 0) },
          u_time: { value: 0 },
          u_alpha: { value: 1.0 },
          u_texel_size: { value: new THREE.Vector2(1 / res.x, 1 / res.y) }
        },
        vertexShader: RisePostProcessor.vertexShader,
        fragmentShader,
        transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending
      });

    // Glow ESP material (simple glow, no presets)
    const glowMat = createBloomMaterial(RisePostProcessor.bloomFragmentGlow);

    // Outline ESP material (edge detection outline)
    const outlineMat = createBloomMaterial(RisePostProcessor.bloomFragmentOutlineMode);

    // Shader ESP materials (with presets)
    const bloomMats: Record<EspShaderPreset, THREE.ShaderMaterial> = {
      classic: createBloomMaterial(RisePostProcessor.bloomFragmentClassic),
      outline: createBloomMaterial(RisePostProcessor.bloomFragmentOutline),
      chalk: createBloomMaterial(RisePostProcessor.bloomFragmentChalk),
      chromatic: createBloomMaterial(RisePostProcessor.bloomFragmentChromatic),
      neon: createBloomMaterial(RisePostProcessor.bloomFragmentNeon),
      ghost: createBloomMaterial(RisePostProcessor.bloomFragmentGhost),
      scanline: createBloomMaterial(RisePostProcessor.bloomFragmentScanline)
    };

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bloomMats.classic);
    quad.frustumCulled = false;
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadScene = new THREE.Scene();
    quadScene.add(quad);

    const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    console.log("OpenGL Shaders Initialized: WebGL2 Mode");

    // 5. Safe-Interception Rendering Loop
    const originalRender = viewer.render.bind(viewer);
    // Keep model feet on grid (y=0)
    const anchorFeetToGrid = () => {
      const po = viewer.playerObject;
      const skin = po.skin;
      const manual = po.getObjectByName("ManualSteve");
      if (skin?.visible) {
        skin.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(skin);
        if (!box.isEmpty()) {
          const feetY = box.min.y;
          skin.position.y -= feetY; // shift so feet (bottom) are at y=0
        }
      }
      if (manual) {
        manual.position.y = 0;
      }
    };
    viewer.render = () => {
      // Step A: Keep model feet on grid (y=0)
      anchorFeetToGrid();

      // Step B: Billboarding - Forced orientation for custom shader nametags
      viewer.scene.traverse((obj) => {
        if (obj.name === "Nametag") {
          obj.quaternion.copy(viewer.camera.quaternion);
        }
      });

      // Step C: Call original library render (handles controls, events, and Layer 0)
      viewer.camera.layers.set(0);
      originalRender();

      const opts = settingsRef.current;
      if (opts.espEnabled) {
        const r = viewer.renderer;
        const scene = viewer.scene;
        const camera = viewer.camera;

        // Step B: Capture silhouettes for ESP (Layer 1)
        r.setRenderTarget(renderTarget as any);
        r.setClearColor(0x000000, 0);
        r.clear();
        camera.layers.set(1);
        scene.overrideMaterial = silhouetteMaterial as any; // Force solid capture
        r.render(scene as any, camera);
        scene.overrideMaterial = null;

        // Step C: Apply Minecraft Gaussian Blur (skip for outline mode)
        const time = performance.now() * 0.001;
        const color = new THREE.Color(opts.espColor || "#55ff55");
        
        if (opts.espMode === "outline") {
          // Outline ESP: Direct edge detection on silhouette (no blur needed)
          r.setRenderTarget(null);
          r.clearDepth();
          quad.material = outlineMat;
          outlineMat.uniforms.u_color.value.set(color.r, color.g, color.b);
          outlineMat.uniforms.tGlow.value = renderTarget.texture; // Use original silhouette for edge detection
          outlineMat.uniforms.u_time.value = time;
          if (outlineMat.uniforms.u_texel_size) {
            const tw = renderTarget.width;
            const th = renderTarget.height;
            outlineMat.uniforms.u_texel_size.value.set(1 / tw, 1 / th);
          }
          outlineMat.uniforms.u_alpha.value = opts.espBloomIntensity ?? 0.8;
          r.render(quadScene as any, quadCamera as any);
        } else {
          // Glow and Shader ESP: Apply Gaussian Blur
          const radius = Math.floor(opts.espBloomRadius || 8);
          const pulsedRadius = radius + Math.sin(time * 2) * (radius * 0.2);

          blurMat.uniforms.u_radius.value = pulsedRadius;
          // Always outline the model (glow around edges), never fill the interior
          blurMat.uniforms.u_discard.value = 1.0;

          // Recalculate kernel for authentic Gaussian look
          blurMat.uniforms.u_kernel.value = RisePostProcessor.calculateGaussianKernel(pulsedRadius);

          quad.material = blurMat;
          blurMat.uniforms.u_diffuse_sampler.value = renderTarget.texture;
          blurMat.uniforms.u_direction.value.set(1.0, 0.0);
          r.setRenderTarget(blurTargetH as any);
          r.clear();
          r.render(quadScene as any, quadCamera as any);

          blurMat.uniforms.u_diffuse_sampler.value = blurTargetH.texture;
          blurMat.uniforms.u_other_sampler.value = renderTarget.texture;
          blurMat.uniforms.u_direction.value.set(0.0, 1.0);
          r.setRenderTarget(blurTargetV as any);
          r.clear();
          r.render(quadScene as any, quadCamera as any);

          // Step D: Final Additive Composite onto the main render
          r.setRenderTarget(null);
          r.clearDepth();
          
          if (opts.espMode === "glow") {
            // Glow ESP: Simple glow effect (no shader presets)
            quad.material = glowMat;
            glowMat.uniforms.u_color.value.set(color.r, color.g, color.b);
            glowMat.uniforms.tGlow.value = blurTargetV.texture;
            glowMat.uniforms.u_time.value = time;
            glowMat.uniforms.u_alpha.value = opts.espBloomIntensity ?? 0.6;
          } else if (opts.espMode === "shader") {
            // Shader ESP: Use shader presets
            const preset: EspShaderPreset = opts.espShaderPreset ?? "classic";
            const bloomMat = bloomMats[preset];
            quad.material = bloomMat;
            bloomMat.uniforms.u_color.value.set(color.r, color.g, color.b);
            bloomMat.uniforms.tGlow.value = blurTargetV.texture;
            bloomMat.uniforms.u_time.value = time;
            if (bloomMat.uniforms.u_texel_size) {
              const tw = renderTarget.width;
              const th = renderTarget.height;
              bloomMat.uniforms.u_texel_size.value.set(1 / tw, 1 / th);
            }
            // Pulse slightly for Shader mode
            const pulse = 0.8 + Math.sin(time * 4) * 0.2;
            bloomMat.uniforms.u_alpha.value = (opts.espBloomIntensity ?? 0.6) * pulse;
          }
          r.render(quadScene as any, quadCamera as any);
        }
      }
    };

    // 7. Resizing (High-DPI / DPR Aware)
    const ro = new ResizeObserver(() => {
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(parent.clientWidth);
      const h = Math.floor(parent.clientHeight);
      if (w === 0 || h === 0) return;
      console.log(`OpenGL Preview Resized: ${w}x${h} (DPR: ${dpr})`);

      // Update renderer with correct physical resolution
      viewer.width = w;
      viewer.height = h;
      viewer.renderer.setPixelRatio(dpr);
      viewer.renderer.setSize(w, h);

      // Update post-processing buffers to full physical resolution
      const rw = Math.floor(w * dpr);
      const rh = Math.floor(h * dpr);
      res.set(w, h); // Keep logical res for uniforms
      renderTarget.setSize(rw, rh);
      blurTargetH.setSize(rw, rh);
      blurTargetV.setSize(rw, rh);
      blurMat.uniforms.u_texel_size.value.set(1 / rw, 1 / rh);
    });
    if (parent) ro.observe(parent);

    return () => {
      ro.disconnect();
      viewer.dispose();
      renderTarget.dispose();
      blurTargetH.dispose();
      blurTargetV.dispose();
      viewerRef.current = null;
    };
  }, []);

  // 7. Reactive Skin Loading
  useEffect(() => {
    if (!viewerRef.current) return;
    const v = viewerRef.current;

    const applySkin = (url: string) => {
      const img = new Image();
      // Only set crossOrigin for external URLs, not data URLs
      if (!url.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        v.loadSkin(img);
        // Hide manual fallback once skin is loaded
        const manual = v.playerObject.getObjectByName("ManualSteve");
        if (manual) manual.visible = false;

        // Refresh Layer 1; feet are anchored every frame by render loop
        setTimeout(() => {
          v.playerObject.traverse((node: any) => {
            if (node.isMesh) node.layers.enable(1);
          });
          v.render();
        }, 100);
        setTimeout(() => v.render(), 400);
      };
      img.src = url;
    };

    const fetchViaIPC = async (u: string) => {
      const ipc = typeof window !== "undefined" && window.require?.("electron")?.ipcRenderer;
      if (ipc) {
        try {
          const res = await ipc.invoke("fetch-skin", u) as { ok: boolean; base64?: string };
          if (res?.ok && res.base64) {
            applySkin(`data:image/png;base64,${res.base64}`);
            return true;
          }
        } catch (e) {
          console.error("Skin fetch failed", e);
        }
      }
      return false;
    };

    if (previewOptions.espSkinUrl) {
      applySkin(previewOptions.espSkinUrl);
    } else if (previewOptions.espSkinUsername) {
      const u = `https://crafatar.com/skins/${previewOptions.espSkinUsername}?overlay=true`;
      fetchViaIPC(u);
    } else {
      // Proxy fetch for default skin to bypass CORS
      fetchViaIPC(DEFAULT_STEVE_SKIN_URL);
    }
  }, [previewOptions.espSkinUrl, previewOptions.espSkinUsername]);

  // 8. Reactive Updates
  useEffect(() => {
    if (!viewerRef.current) return;
    const v = viewerRef.current;

    // Ensure layers are correctly toggled for player meshes
    v.playerObject.traverse((node: any) => {
      if (!node.isMesh) return;
      // Nametag soll nie im ESP-Glow/Outline landen -> nie Layer 1
      if (node.name === "Nametag") {
        node.layers.disable(1);
        return;
      }
      // Player sollte nur in Nicht-Box-Modi boomen
      if (previewOptions.espEnabled && (previewOptions.espMode === "glow" || previewOptions.espMode === "shader" || previewOptions.espMode === "outline")) {
        node.layers.enable(1);
      } else {
        node.layers.disable(1);
      }
    });

    (v as any).nameTag = null; // remove library nametag (sharp corners) so only our rounded one shows
    const oldTag = v.playerObject.getObjectByName("Nametag");
    if (oldTag) v.playerObject.remove(oldTag);
    if (previewOptions.espNametag) {
      const s = createNameTag(previewOptions.espSkinUsername || "Steve");
      if (s) {
        s.name = "Nametag";
        try {
          const po: any = v.playerObject as any;
          const skin = po?.skin;
          const manual = po?.getObjectByName?.("ManualSteve");
          const obj = skin?.visible ? skin : manual ?? po;
          if (obj) {
            obj.updateMatrixWorld?.(true);
            const box = new THREE.Box3().setFromObject(obj);
            if (!box.isEmpty()) {
              // Fester Offset knapp über dem Kopf (leicht abgesenkt)
              const y = box.max.y + 1;
              s.position.set(0, y, 0);
            } else {
              s.position.set(0, 30, 0);
            }
          } else {
            s.position.set(0, 30, 0);
          }
        } catch {
          s.position.set(0, 30, 0);
        }
        v.playerObject.add(s as any);
      }
    }

    const skel = v.playerObject.getObjectByName("Skeleton");
    if (skel) v.playerObject.remove(skel);
    if (previewOptions.espEnabled && previewOptions.espSkeleton) {
      const s = createSkeleton();
      s.name = "Skeleton";
      v.playerObject.add(s as any);
    }

    const box = v.playerObject.getObjectByName("Hitbox");
    if (box) v.playerObject.remove(box);
    if (previewOptions.espEnabled && previewOptions.espMode === "box") {
      const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(32 * (0.6 / 1.8), 32, 32 * (0.6 / 1.8)));
      const b = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: previewOptions.espColor || "#55ff55" }));
      b.name = "Hitbox"; b.position.set(0, 16, 0);
      // Enable Layer 1 so the bloom engine captures the box!
      b.layers.enable(1);
      v.playerObject.add(b as any);
    }
    v.render(); // Force re-render to apply changes immediately
  }, [previewOptions.espColor, previewOptions.espEnabled, previewOptions.espMode, previewOptions.espShaderPreset, previewOptions.espNametag, previewOptions.espSkinUsername, previewOptions.espSkinUrl]);

  return (
    <div className="h-full w-full bg-transparent rounded-lg overflow-hidden border border-border relative">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute top-2 left-2 pointer-events-none text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">
        Skin Preview
      </div>
    </div>
  );
}
