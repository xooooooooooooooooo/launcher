import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SkinViewer } from "skinview3d";
import { toast } from "sonner";

const DEFAULT_STEVE_SKIN_URL =
  "https://crafatar.com/skins/8667ba71b85a4004af54457a9734eed7?overlay=false";
const FALLBACK_SKIN_URL =
  "https://mc-heads.net/skin/8667ba71b85a4004af54457a9734eed7.png";

declare global {
  interface Window {
    require?: (id: string) => { ipcRenderer?: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } };
  }
}

function loadSkinIntoViewer(
  viewer: SkinViewer,
  img: HTMLImageElement
): void {
  if (img.complete && img.naturalWidth) viewer.loadSkin(img);
  else img.onload = () => viewer.loadSkin(img);
}

export type EspMode = "box" | "glow" | "shader" | "outline";

export type EspShaderPreset = "classic" | "outline" | "chalk" | "chromatic" | "neon" | "ghost" | "scanline";

export type PreviewOptions = {
  /** Master toggle: ESP on/off */
  espEnabled?: boolean;
  /** Selected ESP mode when enabled */
  espMode?: EspMode;
  /** Shader preset for glow/shader modes (classic, outline, chalk, chromatic, neon, ghost, scanline) */
  espShaderPreset?: EspShaderPreset;
  espNametag?: boolean;
  /** Nametag Style: "modern" (Pill) oder "minecraft" (Vanilla-Schriftzug) */
  espNametagStyle?: "modern" | "minecraft";
  espSkeleton?: boolean;
  espTracers?: boolean;
  targetHud?: boolean;
  /** ESP Color (hex string) */
  espColor?: string;
  /** Bloom Radius for shader effects (pixel units) */
  espBloomRadius?: number;
  /** Bloom Intensity/Opacity (0-1) */
  espBloomIntensity?: number;
  /** Same GLSL as in-game ESP → exact preview. Fragment shader (optional). */
  espCustomFragmentShader?: string;
  /** Custom Skin URL */
  espSkinUrl?: string;
  /** Minecraft Username to fetch skin */
  espSkinUsername?: string;
};

const defaultPreviewOptions: PreviewOptions = {
  espEnabled: false,
  espMode: "box",
  espShaderPreset: "classic",
  espNametag: false,
  espNametagStyle: "modern",
  espSkeleton: false,
  espTracers: false,
  targetHud: false,
  espColor: "#55ff55",
  espBloomRadius: 8,
  espBloomIntensity: 0.6,
};

// Minecraft player hitbox: 0.6 × 1.8 × 0.6 (W×H×D). skinview3d model ~20 units tall.
const MC_HITBOX_W = 20 * (0.6 / 1.8);
const MC_HITBOX_H = 20;
const MC_HITBOX_D = MC_HITBOX_W;
const MC_CENTER_Y = -2;
/** Classic Minecraft ESP green (#55FF55) */
const MC_ESP_GREEN = 0x55ff55;

export function StevePreview({ previewOptions = defaultPreviewOptions }: { previewOptions?: PreviewOptions }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [skinLoaded, setSkinLoaded] = useState(false);
  const opts = { ...defaultPreviewOptions, ...previewOptions };

  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(canvas);

    const width = containerRef.current.clientWidth || 400;
    const height = containerRef.current.clientHeight || 280;

    let viewer: SkinViewer;
    viewer = new SkinViewer({
      canvas,
      width,
      height,
      background: 0x18181b,
      zoom: 0.9,
      enableControls: true,
    });

    viewerRef.current = viewer;
    viewer.autoRotate = false;
    viewer.cameraLight.intensity = 2.2;
    viewer.globalLight.intensity = 1.6;
    viewer.controls.enablePan = false;

    const tryLocalSkin = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = tryFetchSkin;
      img.onload = () => {
        loadSkinIntoViewer(viewer, img);
        setSkinLoaded(true);
      };
      img.src = "./steve.png";
    };

    const tryFetchSkin = async () => {
      const ipc = typeof window !== "undefined" && window.require?.("electron")?.ipcRenderer;
      if (ipc) {
        const result = await ipc.invoke("fetch-skin", DEFAULT_STEVE_SKIN_URL) as { ok: boolean; base64?: string };
        if (result?.ok && result.base64) {
          const img = new Image();
          img.onerror = () => undefined;
          img.onload = () => {
            loadSkinIntoViewer(viewer, img);
            setSkinLoaded(true);
          };
          img.src = `data:image/png;base64,${result.base64}`;
          return;
        }
        const fallback = await ipc.invoke("fetch-skin", FALLBACK_SKIN_URL) as { ok: boolean; base64?: string };
        if (fallback?.ok && fallback.base64) {
          const img = new Image();
          img.onerror = () => undefined;
          img.onload = () => {
            loadSkinIntoViewer(viewer, img);
            setSkinLoaded(true);
          };
          img.src = `data:image/png;base64,${fallback.base64}`;
          return;
        }
      }
      // Wenn Remote-Skin nicht geht, bleibt das Modell ohne Texture sichtbar.
    };

    tryLocalSkin();

    const onResize = () => {
      if (!containerRef.current || !viewerRef.current) return;
      const w = containerRef.current.clientWidth || 400;
      const h = containerRef.current.clientHeight || 280;
      viewerRef.current.width = w;
      viewerRef.current.height = h;
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  // Box ESP: Minecraft hitbox wireframe (matches in-game drawBox)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !opts.espEnabled || opts.espMode !== "box") return;
    const geo = new THREE.BoxGeometry(MC_HITBOX_W, MC_HITBOX_H, MC_HITBOX_D);
    const edges = new THREE.EdgesGeometry(geo, 0);
    const color = new THREE.Color(opts.espColor || MC_ESP_GREEN);
    const mat = new THREE.LineBasicMaterial({ color });
    const line = new THREE.LineSegments(edges, mat);
    line.position.set(0, MC_CENTER_Y, 0);
    viewer.playerWrapper.add(line as unknown as THREE.Object3D);
    return () => {
      viewer.playerWrapper.remove(line);
      edges.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, [opts.espEnabled, opts.espMode, opts.espColor]);

  // Glow ESP: colored layer on the skin – clone each skin mesh with green transparent material (same shape, no box)
  useEffect(() => {
    const viewer = viewerRef.current;
    // Wenn Shader ESP aktiv ist, nicht zusätzlich Glow-Layer aufbauen
    if (!viewer || !opts.espEnabled || opts.espMode !== "glow") return;
    let cancelled = false;
    const clones: THREE.Mesh[] = [];
    const addGlow = () => {
      if (cancelled) return;
      viewer.playerObject.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        if (!mesh.geometry) return;
        const geo = mesh.geometry.clone();
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(opts.espColor || MC_ESP_GREEN),
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.BackSide,
        });
        const clone = new THREE.Mesh(geo, mat);
        clone.renderOrder = 1;
        clone.scale.multiplyScalar(1.02);
        mesh.parent?.add(clone as unknown as THREE.Object3D);
        clones.push(clone);
      });
      return () => {
        clones.forEach((c) => {
          c.parent?.remove(c);
          c.geometry.dispose();
          (c.material as THREE.Material).dispose();
        });
      };
    };
    let cleanup: (() => void) | undefined;
    const t = setTimeout(() => {
      cleanup = addGlow();
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
      cleanup?.();
    };
  }, [opts.espEnabled, opts.espMode, opts.espColor]);

  // Shader ESP: same – colored layer on the skin, slightly softer opacity (like shader pass)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !opts.espEnabled || opts.espMode !== "shader") return;

    let cancelled = false;
    const cloned: {
      solid: THREE.Mesh;
      outline: THREE.LineSegments;
    }[] = [];

    const addShader = () => {
      if (cancelled) return;

      viewer.playerObject.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        if (!mesh.geometry) return;

        const geo = mesh.geometry.clone();
        // Transparenter Shader-Body: grüne „Füllung“ wie im Client, aber leicht durchsichtig
        const solidMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(opts.espColor || MC_ESP_GREEN),
          transparent: true,
          opacity: opts.espBloomIntensity || 0.45,
          depthWrite: false,
        });
        const solid = new THREE.Mesh(geo, solidMat);
        solid.position.copy(mesh.position);
        solid.rotation.copy(mesh.rotation);
        solid.scale.copy(mesh.scale);
        solid.renderOrder = 1;

        // Schwarze Outline um denselben Körper (Kanten der Geometrie)
        const edgeGeo = new THREE.EdgesGeometry(geo, 1);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x000000,
          transparent: false,
        });
        const outline = new THREE.LineSegments(edgeGeo, edgeMat);
        outline.renderOrder = 2;
        solid.add(outline as unknown as THREE.Object3D);

        mesh.parent?.add(solid as unknown as THREE.Object3D);
        cloned.push({ solid, outline });
      });

      return () => {
        cloned.forEach(({ solid, outline }) => {
          // Klone entfernen und entsorgen
          solid.parent?.remove(solid);
          solid.geometry.dispose();
          (solid.material as THREE.Material).dispose();
          outline.geometry.dispose();
          (outline.material as THREE.Material).dispose();
        });
      };
    };

    let cleanup: (() => void) | undefined;
    const t = setTimeout(() => {
      cleanup = addShader();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(t);
      cleanup?.();
    };
  }, [opts.espEnabled, opts.espMode, opts.espColor]);

  // Nametag on model
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.nameTag = opts.espNametag ? "Steve" : null;
  }, [opts.espNametag]);

  const openOpenGLPreview = () => {
    const ipc = typeof window !== "undefined" && (window as Window & { require?: (id: string) => { ipcRenderer?: { invoke: (ch: string, ...a: unknown[]) => Promise<unknown> } } }).require?.("electron")?.ipcRenderer;
    if (!ipc) {
      toast.error("Open Preview only works in the desktop app (Electron).");
      return;
    }
    ipc.invoke("open-esp-preview", opts.espEnabled ? (opts.espMode ?? "box") : "box").then((res: unknown) => {
      const r = res as { ok?: boolean; error?: string };
      if (r && !r.ok && r.error) toast.error(r.error);
    }).catch(() => toast.error("Could not open preview."));
  };

  return (
    <div className="relative h-full min-h-[240px] w-full rounded-lg overflow-hidden bg-zinc-900/80 border border-border">
      <div ref={containerRef} className="h-full min-h-[240px] w-full" />
      <button
        type="button"
        onClick={openOpenGLPreview}
        className="absolute top-2 right-2 rounded bg-primary/90 px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow hover:bg-primary"
      >
        Open Preview
      </button>
      {opts.targetHud && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium text-primary">
          Target HUD
        </div>
      )}
    </div>
  );
}

