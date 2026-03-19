import * as THREE from "three";
import type { ScenePack, SceneEntity, ScreenEntity } from "./types";

/**
 * PanoramaRenderer
 *
 * - Owns its own THREE.Scene, PerspectiveCamera and WebGLRenderer
 * - Loads a 6-face cubemap as the scene background from a ScenePack
 * - Auto-rotates camera yaw on each animation frame
 * - Projects 3D entities into 2D screen-space boxes and emits them each frame
 *
 * CUBEMAP NOTES:
 * - Screenshots are assumed to be 1920x1080, captured at 80° vertical FOV in Minecraft
 * - camera.fov is always read from scene.json (80.0), never hardcoded
 * - CUBEMAP_OFFSET_Y = 180 because Three.js camera default looks at -Z, pz is in +Z slot
 */

// Fine-tune offsets in degrees if a residual seam remains after loading real scenes.
const CUBEMAP_OFFSET_X = 5;   // pitch offset
const CUBEMAP_OFFSET_Y = 180; // yaw offset — camera faces pz (+Z slot)

// --- EXACT FOV CALCULATION ---
// This multiplier manually zooms the image to eliminate seam discontinuities.
// For Minecraft 80 FOV screenshots, 0.98 or 0.975 creates a seamless connection 
// by cropping slightly inside the bounds.
const CUBEMAP_FOV_SCALE = 0.98;

// --- FACE ALIGNMENT TUNING ---
// If the top (ceiling) or bottom (floor) faces are rotated incorrectly, change these values.
// Rotation values: 0 = 0°, 1 = 90° CW, 2 = 180°, 3 = 270° CW (-90°)
const TOP_FACE_ROTATION = 0;   // Reset from 1 to 0 to fix the Sky rendering
const TOP_FACE_FLIP_H = false;

const BOTTOM_FACE_ROTATION = 2; // Fixed upside-down rendering of bottom ny face
const BOTTOM_FACE_FLIP_H = false;

// Use these to slide the exact center of the front and back crops left or right.
// + numbers move the crop box Right (which moves the picture Left on screen)
// - numbers move the crop box Left (which moves the picture Right on screen)
const FRONT_FACE_OFFSET_X = 0; // Minecraft backward face (pz) mapped to Three.js +Z
const BACK_FACE_OFFSET_X = 0;  // Minecraft forward face (nz) mapped to Three.js -Z

export interface CubemapPaths {
  px: string;
  nx: string;
  py: string;
  ny: string;
  pz: string;
  nz: string;
}

export interface PanoramaRendererOptions {
  /** Initial vertical field of view in degrees. Should match scene.json capture FOV. */
  fov?: number;
  /** Auto-rotation speed in radians per animation frame. */
  autoRotateSpeed?: number;
  /** Clear color used before the cubemap is fully loaded. */
  clearColor?: number;
  /** If true, skip image load and use a procedural colored cube (debug). */
  forceProceduralCubemap?: boolean;
  /** Optional log sink for in-app debug panel (e.g. when DevTools unavailable). */
  onCubemapLog?: (msg: string) => void;
}

export class PanoramaRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;

  private autoRotateSpeed: number;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private readonly forceProceduralCubemap: boolean;
  private disableCameraOffset: boolean = false;

  private currentPack: ScenePack | null = null;

  private yaw = 0;
  private pitch = 0;

  private skyboxMesh: THREE.Mesh | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private activeBlobUrls: string[] = [];

  private readonly onCubemapLog: ((msg: string) => void) | undefined;

  private revokeBlobUrls(): void {
    this.activeBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    this.activeBlobUrls = [];
  }

  private log(...args: unknown[]): void {
    const msg =
      "[Cubemap] " +
      args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
    if (this.onCubemapLog) this.onCubemapLog(msg);
    console.log(...args);
  }

  private warn(...args: unknown[]): void {
    const msg =
      "[Cubemap] " +
      args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
    if (this.onCubemapLog) this.onCubemapLog("WARN " + msg);
    console.warn(...args);
  }

  /** Called once per rendered frame with the projected entities. */
  public onFrameReady: (entities: ScreenEntity[]) => void = () => { };

  constructor(canvas: HTMLCanvasElement, options: PanoramaRendererOptions = {}) {
    this.canvas = canvas;
    this.autoRotateSpeed = options.autoRotateSpeed ?? 0;
    this.forceProceduralCubemap = options.forceProceduralCubemap ?? false;
    this.onCubemapLog = options.onCubemapLog;

    const width = canvas.clientWidth || canvas.width || 800;
    const height = canvas.clientHeight || canvas.height || 600;
    const aspect = width / Math.max(1, height);
    const fov = options.fov ?? 78;

    this.scene = new THREE.Scene();

    // Camera sits at world origin. rotation.order = YXZ so yaw/pitch work intuitively.
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(options.clearColor ?? 0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Keep camera aspect + renderer size in sync with the canvas element.
    this.resizeObserver = new ResizeObserver(() => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        // Always use the FOV from the loaded scene, not a hardcoded value.
        if (this.currentPack?.camera?.fov) {
          this.camera.fov = this.currentPack.camera.fov;
        }
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(w, h, false);
      }
    });
    this.resizeObserver.observe(this.canvas);

    if (this.forceProceduralCubemap) {
      this.scene.background = this.createProceduralCubemap();
      this.log("constructor: procedural cubemap set (debug mode)");
    }
  }

  // ---------------------------------------------------------------------------
  // CUBEMAP LOADING
  // ---------------------------------------------------------------------------

  /**
   * Core loader: loads 6 square PNG faces and builds a CubeTexture.
   *
   * Screenshots are already square (1009×1009) from the capture tool.
   * No cropping needed — just per-face orientation corrections.
   *
   * URL order: [px, nx, py, ny, pz, nz]
   * Three.js CubeTexture slots: [+X, -X, +Y, -Y, +Z, -Z]
   *
   * Per-face transforms confirmed by edge pixel analysis:
   *   index 0 (px → +X): no transform
   *   index 1 (nx → -X): no transform
   *   index 2 (py → +Y): rotate 90° CW (capture tool records it rotated)
   *   index 3 (ny → -Y): flip horizontal (bottom edge connects to pz bottom)
   *   index 4 (pz → +Z): no transform
   *   index 5 (nz → -Z): no transform
   *
   * CUBEMAP_OFFSET_Y = 180° so camera starts looking at pz (+Z slot).
   */
  private loadSquareCubeTexture(
    urls: string[],
    onSuccess: (tex: THREE.CubeTexture) => void,
    onErr: () => void
  ): void {
    let loaded = 0;
    let failed = false;
    const canvases: HTMLCanvasElement[] = new Array(6);

    urls.forEach((url, i) => {
      const img = new Image();
      if (url.startsWith("http")) img.crossOrigin = "anonymous";

      img.onload = () => {
        if (failed) return;

        // The source images are exactly 1009x1009 pixels (already square).
        // Since an 80 FOV square doesn't cover 90 degrees entirely, we must "zoom in"
        // by cropping a slightly smaller center square and scaling it up to fit the canvas.
        const faceSize = img.width; // 1009

        // Clamp scale to max 1.0 to prevent black bar artifacts from out-of-bounds rendering
        // However, if the FOV was < 90, scale will be > 1.0 (black bars) and we allow it so it is mathematically seamless.
        const safeScale = CUBEMAP_FOV_SCALE;
        const cropSize = faceSize * safeScale;
        const cropStart = (faceSize - cropSize) / 2;

        const canvas = document.createElement("canvas");
        // Canvas geometry size
        canvas.width = faceSize;
        canvas.height = faceSize;
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const applyTransform = (rotation: number, flipH: boolean, offsetX: number = 0) => {
          ctx.translate(faceSize / 2, faceSize / 2);
          if (rotation !== 0) ctx.rotate(rotation * (Math.PI / 2));
          if (flipH) ctx.scale(-1, 1);
          ctx.translate(-faceSize / 2, -faceSize / 2);
          ctx.drawImage(img, cropStart + offsetX, cropStart, cropSize, cropSize, 0, 0, faceSize, faceSize);
        };

        if (i === 2) {
          // py (up face / top)
          applyTransform(TOP_FACE_ROTATION, TOP_FACE_FLIP_H);
        } else if (i === 3) {
          // ny (down face / bottom)
          applyTransform(BOTTOM_FACE_ROTATION, BOTTOM_FACE_FLIP_H);
        } else if (i === 4) {
          // pz (front face / Three.js +Z)
          applyTransform(0, false, FRONT_FACE_OFFSET_X);
        } else if (i === 5) {
          // nz (back face / Three.js -Z)
          applyTransform(0, false, BACK_FACE_OFFSET_X);
        } else {
          // px, nx (left/right sides)
          // No transform needed for sides
          ctx.drawImage(img, cropStart, cropStart, cropSize, cropSize, 0, 0, faceSize, faceSize);
        }

        canvases[i] = canvas;
        loaded++;

        if (loaded === 6) {
          const cubeTex = new THREE.CubeTexture(canvases);
          cubeTex.colorSpace = THREE.SRGBColorSpace;
          cubeTex.generateMipmaps = false;
          cubeTex.minFilter = THREE.LinearFilter;
          cubeTex.magFilter = THREE.LinearFilter;
          cubeTex.wrapS = THREE.ClampToEdgeWrapping;
          cubeTex.wrapT = THREE.ClampToEdgeWrapping;
          cubeTex.needsUpdate = true;
          onSuccess(cubeTex);
        }
      };

      img.onerror = () => {
        if (!failed) { failed = true; onErr(); }
      };

      img.src = url;
    });
  }

  /**
   * Load a 6-face cubemap from CubemapPaths and set it as scene.background.
   */
  loadCubemap(paths: CubemapPaths): void {
    if (this.forceProceduralCubemap) {
      this.log("loadCubemap: debug mode, using procedural cube");
      this.scene.background = this.createProceduralCubemap();
      return;
    }

    this.log("loadCubemap: loading", paths);

    // Standard Three.js CubeTexture slot order: [+X, -X, +Y, -Y, +Z, -Z]
    // The previous mapping had left/right and front/back swapped based on the user's feedback.
    // Correct mapping for Minecraft screenshots:
    const urlOrder = [
      paths.nx, // → Three.js +X slot (left screenshot is actually right side in Three.js world due to looking inward)
      paths.px, // → Three.js -X slot
      paths.py, // → Three.js +Y slot (up)
      paths.ny, // → Three.js -Y slot (down)
      paths.nz, // → Three.js +Z slot 
      paths.pz, // → Three.js -Z slot
    ];

    this.loadSquareCubeTexture(
      urlOrder,
      (cubeTexture) => {
        this.log("loadCubemap: success, setting scene.background");
        this.scene.background = cubeTexture;
      },
      () => {
        this.warn("loadCubemap: failed, falling back to procedural cube");
        this.setProceduralCubemap();
      }
    );
  }

  /**
   * Try loading a cubemap from URLs without falling back on error.
   * Useful for scene:// protocol in Electron where load may silently fail.
   */
  tryLoadCubemapFromUrls(paths: CubemapPaths): void {
    const urlOrder = [paths.nx, paths.px, paths.py, paths.ny, paths.nz, paths.pz];
    this.loadSquareCubeTexture(
      urlOrder,
      (cubeTexture) => {
        this.log("tryLoadCubemapFromUrls: success");
        this.scene.background = cubeTexture;
      },
      () => {
        this.warn("tryLoadCubemapFromUrls: failed, keeping current background");
      }
    );
  }

  /** Immediately set the debug procedural colored cubemap. */
  setProceduralCubemap(): void {
    this.scene.background = this.createProceduralCubemap();
  }

  /**
   * Load cubemap from base64 data URLs sent over Electron IPC.
   */
  loadCubemapFromDataUrls(dataUrls: {
    px: string;
    nx: string;
    py: string;
    ny: string;
    pz: string;
    nz: string;
  }): void {
    // Swapping nx/px and nz/pz exactly like loadCubemap
    const order = [
      dataUrls.nx,
      dataUrls.px,
      dataUrls.py,
      dataUrls.ny,
      dataUrls.nz,
      dataUrls.pz,
    ];

    this.log("loadCubemapFromDataUrls: converting base64 → blob URLs");

    const fallback = () => {
      this.warn("loadCubemapFromDataUrls: falling back to procedural");
      this.setProceduralCubemap();
    };

    const dataUrlToBlobUrl = (dataUrl: string): string | null => {
      try {
        const comma = dataUrl.indexOf(",");
        if (comma === -1) return dataUrl;
        const base64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        return URL.createObjectURL(blob);
      } catch (e) {
        this.warn("dataUrlToBlobUrl failed:", e);
        return null;
      }
    };

    const objectUrls: string[] = [];
    for (let i = 0; i < 6; i++) {
      const blobUrl = dataUrlToBlobUrl(order[i]);
      if (!blobUrl) {
        fallback();
        return;
      }
      objectUrls.push(blobUrl);
    }

    this.revokeBlobUrls();
    this.activeBlobUrls = objectUrls.slice();

    this.loadSquareCubeTexture(
      objectUrls,
      (cubeTexture) => {
        this.log("loadCubemapFromDataUrls: success");
        this.scene.background = cubeTexture;
      },
      fallback
    );
  }

  /**
   * Load a cubemap from a single image.
   * Auto-detects layout based on aspect ratio:
   * - 4:3 -> Horizontal Cross
   * - 3:2 -> 3x2 Grid (+X, -X, +Y / -Y, +Z, -Z)
   */
  loadCubemapFromImage(url: string, allowAltPath = true): void {
    const img = new Image();
    if (url.startsWith("http")) img.crossOrigin = "anonymous";
    img.onload = () => {
      const aspect = img.width / img.height;
      let faceSize = 0;
      let px, nx, py, ny, pz, nz;

      const makeFace = (gx: number, gy: number, size: number, flipH: boolean = false, rotateCW: number = 0): HTMLCanvasElement => {
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.translate(size/2, size/2);
          if (rotateCW) ctx.rotate((rotateCW * Math.PI) / 2);
          if (flipH) ctx.scale(-1, 1);
          ctx.translate(-size/2, -size/2);
          ctx.drawImage(img, gx * size, gy * size, size, size, 0, 0, size, size);
        }
        return c;
      };

      if (Math.abs(aspect - 1.5) < 0.1) {
        // 3x2 Grid Layout
        this.disableCameraOffset = true;
        faceSize = img.width / 3;
        
        // Auto-orient Top and Bottom to match Front. 
        // We know py(Top) connects to nz(Front), and ny(Bottom) connects to nz(Front).
        // By default, assume standard uniform Blockade format or user custom:
        px = makeFace(2, 1, faceSize, true, 0); // Right (+X)
        nx = makeFace(0, 1, faceSize, true, 0); // Left (-X)
        pz = makeFace(2, 0, faceSize, true, 0); // Back (+Z) 
        nz = makeFace(1, 1, faceSize, true, 0); // Front / Ninja (-Z)
        
        // Quick visual seam matcher to auto-orient py and ny
        const getEdgeDiff = (c1: HTMLCanvasElement, edge1: 'top'|'bottom', c2: HTMLCanvasElement, edge2: 'top'|'bottom') => {
            const ctx1 = c1.getContext('2d')!; const ctx2 = c2.getContext('2d')!;
            const d1 = ctx1.getImageData(0, edge1 === 'top' ? 0 : faceSize-1, faceSize, 1).data;
            const d2 = ctx2.getImageData(0, edge2 === 'top' ? 0 : faceSize-1, faceSize, 1).data;
            let err = 0;
            for(let i=0; i<d1.length; i+=4) err += Math.abs(d1[i]-d2[i]);
            return err;
        };

        // Top(py) Bottom edge connects to Front(nz) Top edge
        let bestPyRot = 0, bestPyErr = Infinity;
        for (let r=0; r<4; r++) {
            const pyTest = makeFace(0, 0, faceSize, false, r);
            const err = getEdgeDiff(pyTest, 'bottom', nz, 'top');
            if (err < bestPyErr) { bestPyErr = err; bestPyRot = r; }
        }
        py = makeFace(0, 0, faceSize, false, bestPyRot);

        // Bottom(ny) Top edge connects to Front(nz) Bottom edge
        let bestNyRot = 0, bestNyErr = Infinity;
        for (let r=0; r<4; r++) {
            const nyTest = makeFace(1, 0, faceSize, false, r);
            const err = getEdgeDiff(nyTest, 'top', nz, 'bottom');
            if (err < bestNyErr) { bestNyErr = err; bestNyRot = r; }
        }
        ny = makeFace(1, 0, faceSize, false, bestNyRot);

      } else {
        // 4x3 Cross Layout
        this.disableCameraOffset = true;
        faceSize = Math.min(img.width / 4, img.height / 3);
        px = makeFace(2, 1, faceSize);
        nx = makeFace(0, 1, faceSize);
        py = makeFace(1, 0, faceSize);
        ny = makeFace(1, 2, faceSize);
        pz = makeFace(1, 1, faceSize);
        nz = makeFace(3, 1, faceSize);
      }

      if (faceSize <= 0) return;

      const cubeTexture = new THREE.CubeTexture([px, nx, py, ny, pz, nz]);
      cubeTexture.colorSpace = THREE.SRGBColorSpace;
      cubeTexture.generateMipmaps = false;
      cubeTexture.minFilter = THREE.LinearFilter;
      cubeTexture.magFilter = THREE.LinearFilter;
      cubeTexture.wrapS = THREE.ClampToEdgeWrapping;
      cubeTexture.wrapT = THREE.ClampToEdgeWrapping;
      cubeTexture.needsUpdate = true;
      this.scene.background = cubeTexture;
    };

    img.onerror = () => {
      this.warn("loadCubemapFromImage: failed to load " + url);
      if (allowAltPath) {
        const alt = url.startsWith("/") ? url.slice(1) : "/" + url;
        this.warn("loadCubemapFromImage: retrying with " + alt);
        this.loadCubemapFromImage(alt, false);
      }
    };

    img.src = url;
  }

  // ---------------------------------------------------------------------------
  // SCENE PACK
  // ---------------------------------------------------------------------------

  /**
   * Load a full ScenePack (cubemap paths + camera metadata + entities).
   * Sets camera FOV from scene.json — never hardcoded.
   */
  loadScenePack(pack: ScenePack, skipCubemap = false): void {
    this.log("loadScenePack:", pack.moduleId, pack.sceneName, "skipCubemap=", skipCubemap);
    this.currentPack = pack;

    // Use the FOV that was active when the screenshots were captured (defaulting to 78).
    this.camera.fov = pack.camera?.fov ?? 78;

    // CRITICAL: Camera MUST stay at world origin (0,0,0) for cubemap rendering.
    // The cubemap faces are baked screenshots — moving the camera away from origin
    // breaks the projection entirely. Do NOT set position from scene.json here.
    this.camera.position.set(0, 0, 0);

    this.camera.updateProjectionMatrix();

    if (!skipCubemap) {
      this.loadCubemap(pack.cubemapPaths);
    }
  }

  // ---------------------------------------------------------------------------
  // ENTITY PROJECTION
  // ---------------------------------------------------------------------------

  /**
   * Project all entities in the current ScenePack into 2D screen-space boxes.
   * Returns an empty array when no pack is loaded.
   */
  projectEntities(entities: SceneEntity[]): ScreenEntity[] {
    const w = this.canvas.clientWidth || this.renderer.domElement.width || 1;
    const h = this.canvas.clientHeight || this.renderer.domElement.height || 1;

    const cameraMatrixInverse = this.camera.matrixWorldInverse;

    return entities
      .map((entity) => {
        const [ex, ey, ez] = entity.position;
        const height = entity.height ?? 1.8;
        const width = entity.width ?? 0.6;

        // Cull entities behind the camera in view space.
        const camSpace = new THREE.Vector3(ex, ey + height / 2, ez).applyMatrix4(
          cameraMatrixInverse
        );
        if (camSpace.z >= 0) return null;

        // Project feet and head to NDC.
        const feet = new THREE.Vector3(ex, ey, ez).project(this.camera);
        const head = new THREE.Vector3(ex, ey + height, ez).project(this.camera);

        // Skip if both points are fully outside clip space.
        const outOfView =
          (feet.x < -1 && head.x < -1) ||
          (feet.x > 1 && head.x > 1) ||
          (feet.y < -1 && head.y < -1) ||
          (feet.y > 1 && head.y > 1);
        if (outOfView) return null;

        const sx = (feet.x * 0.5 + 0.5) * w;
        const sy = (1 - (feet.y * 0.5 + 0.5)) * h;
        const ex2 = (head.x * 0.5 + 0.5) * w;
        const ey2 = (1 - (head.y * 0.5 + 0.5)) * h;

        const boxHeight = Math.abs(ey2 - sy);
        const boxWidth = boxHeight * (width / height);

        return {
          id: entity.id,
          type: entity.type,
          x: sx - boxWidth / 2,
          y: Math.min(sy, ey2),
          width: boxWidth,
          height: boxHeight,
          metadata: entity.metadata ?? {},
        };
      })
      .filter((e): e is ScreenEntity => e !== null);
  }

  // ---------------------------------------------------------------------------
  // RESIZE / SIZE
  // ---------------------------------------------------------------------------

  /**
   * Manually update renderer and camera to a new size.
   * Prefer letting the ResizeObserver handle this automatically.
   */
  setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    if (this.currentPack?.camera?.fov) {
      this.camera.fov = this.currentPack.camera.fov;
    }
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------------------
  // CONTROLS
  // ---------------------------------------------------------------------------

  /** Adjust auto-rotation speed in radians per frame. 0 = disabled. */
  setAutoRotateSpeed(speed: number): void {
    this.autoRotateSpeed = speed;
  }

  /**
   * Set camera look direction in radians.
   * Called by mouse-drag / touch handlers in the UI layer.
   */
  setAngles(yaw: number, pitch: number): void {
    this.yaw = yaw;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, pitch));
  }

  // ---------------------------------------------------------------------------
  // RENDER LOOP
  // ---------------------------------------------------------------------------

  /** Start the requestAnimationFrame loop. Safe to call multiple times. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = () => {
      if (!this.isRunning) return;

      const yOff = this.disableCameraOffset ? 0 : CUBEMAP_OFFSET_Y;
      const xOff = this.disableCameraOffset ? 0 : CUBEMAP_OFFSET_X;

      this.camera.rotation.y = this.yaw + THREE.MathUtils.degToRad(yOff);
      this.camera.rotation.x = this.pitch + THREE.MathUtils.degToRad(xOff);
      this.camera.rotation.z = 0;
      this.camera.updateMatrixWorld(true);

      if (this.autoRotateSpeed) {
        this.yaw += this.autoRotateSpeed;
      }

      this.renderer.render(this.scene, this.camera);

      if (this.currentPack) {
        const projected = this.projectEntities(this.currentPack.entities);
        this.onFrameReady(projected);
      }

      this.animationFrameId = window.requestAnimationFrame(loop);
    };

    this.animationFrameId = window.requestAnimationFrame(loop);
  }

  /** Stop the animation loop. */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // DEBUG
  // ---------------------------------------------------------------------------

  debugCubemapState(): void {
    const bg = this.scene.background;
    this.log(
      "scene.background type=" +
      (bg ? bg.constructor?.name ?? typeof bg : "null"),
      "skyboxMesh=" + !!this.skyboxMesh,
      "isCubeTexture=" + (bg instanceof THREE.CubeTexture)
    );
  }

  // ---------------------------------------------------------------------------
  // PROCEDURAL FALLBACK
  // ---------------------------------------------------------------------------

  private createProceduralCubemap(): THREE.CubeTexture {
    const size = 64;
    const colors = [
      "#e74c3c", // +X red
      "#3498db", // -X blue
      "#2ecc71", // +Y green
      "#9b59b6", // -Y purple
      "#f1c40f", // +Z yellow
      "#1abc9c", // -Z teal
    ];

    const canvases = colors.map((color) => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d")!;
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);
      return c;
    });

    const cubeTexture = new THREE.CubeTexture(canvases);
    cubeTexture.colorSpace = THREE.SRGBColorSpace;
    cubeTexture.generateMipmaps = false;
    cubeTexture.minFilter = THREE.LinearFilter;
    cubeTexture.magFilter = THREE.LinearFilter;
    cubeTexture.wrapS = THREE.ClampToEdgeWrapping;
    cubeTexture.wrapT = THREE.ClampToEdgeWrapping;
    cubeTexture.needsUpdate = true;
    return cubeTexture;
  }

  // ---------------------------------------------------------------------------
  // DISPOSE
  // ---------------------------------------------------------------------------

  /** Dispose all GPU resources. Call when the owning React component unmounts. */
  dispose(): void {
    this.stop();
    this.revokeBlobUrls();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.skyboxMesh) {
      this.scene.remove(this.skyboxMesh);
      if (this.skyboxMesh.geometry) this.skyboxMesh.geometry.dispose();
      this.skyboxMesh = null;
    }

    this.renderer.dispose();

    if (this.scene.background instanceof THREE.CubeTexture) {
      this.scene.background.dispose();
    }
  }
}