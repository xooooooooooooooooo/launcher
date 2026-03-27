import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { PanoramaRenderer, type CubemapPaths } from "../preview/PanoramaRenderer";
import { OverlayCompositor } from "../preview/OverlayCompositor";
import type { ScenePack, SceneEntity, ScreenEntity } from "../preview/types";

const SKYBOX_BASE = "./assets/skybox";

function buildPackFromRaw(
  raw: any,
  cubemap: CubemapPaths,
  activeModuleId: string
): { pack: ScenePack; camYaw: number; camPitch: number } {
  const cam = raw.camera || {};
  const camPos = cam.position || [0, 0, 0];

  const camYaw = ((cam.yaw ?? 0) * Math.PI) / 180;
  const camPitch = -((cam.pitch ?? 0) * Math.PI) / 180;

  const entities: SceneEntity[] = (raw.entities || []).map((e: any) => ({
    ...e,
    position: [
      (e.position[0] ?? 0) - camPos[0],
      (e.position[1] ?? 0) - (camPos[1] + 1.62),
      (e.position[2] ?? 0) - camPos[2],
    ],
  }));

  const capturedFov = typeof cam.fov === "number" ? cam.fov : 90;

  const pack: ScenePack = {
    moduleId: raw.moduleId || activeModuleId,
    sceneName: raw.sceneName || "unknown",
    capturedAt: raw.capturedAt || new Date().toISOString(),
    camera: { fov: capturedFov, position: [0, 0, 0], yaw: camYaw, pitch: camPitch },
    cubemapPaths: cubemap,
    entities,
    objects: raw.objects || [],
  };
  return { pack, camYaw, camPitch };
}

export interface PanoramaPreviewHandle {
  updateConfig: (cfg: Record<string, unknown>) => void;
}

interface PanoramaPreviewProps {
  activeModuleId: string;
}

export const PanoramaPreview = forwardRef<PanoramaPreviewHandle, PanoramaPreviewProps>(
  ({ activeModuleId }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PanoramaRenderer | null>(null);
  const compositorRef = useRef<OverlayCompositor | null>(null);

  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
  }>({ dragging: false, startX: 0, startY: 0, startYaw: 0, startPitch: 0 });

  // Tracks which scene is currently loaded — prevents loadScenePack spam on every poll tick
  const loadedSceneRef = useRef<string | null>(null);
  const cubemapLoadedRef = useRef(false);
  const [cubemapDebugLogs, setCubemapDebugLogs] = useState<string[]>([]);
  const [useTestSkybox, setUseTestSkybox] = useState(true);

  const addCubemapLog = (msg: string) => {
    setCubemapDebugLogs((prev) => [...prev.slice(-48), msg]);
  };

  const ipc = typeof window !== "undefined" && window.electron?.ipcRenderer;

  useImperativeHandle(ref, () => ({
    updateConfig: (cfg: Record<string, unknown>) => {
      compositorRef.current?.updateConfig(cfg);
    }
  }));

  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const isElectron =
      typeof window !== "undefined" && !!(window as any).require?.("electron");
    const cleanupFns: (() => void)[] = [];

    addCubemapLog("effect: isElectron=" + isElectron + " canvas=" + canvas.clientWidth + "x" + canvas.clientHeight);

    // Reset tracking refs on module change
    loadedSceneRef.current = null;
    cubemapLoadedRef.current = false;

    const renderer = new PanoramaRenderer(canvas, {
      fov: 90,
      autoRotateSpeed: 0,
      clearColor: 0x000000,
      forceProceduralCubemap: false,
      onCubemapLog: addCubemapLog,
    });
    rendererRef.current = renderer;

    const cubemapPlaceholder: CubemapPaths = {
      px: "", nx: "", py: "", ny: "", pz: "", nz: "",
    };

    // Load cubemap ONCE via IPC — never reload it on scene poll
    function loadCubemapViaIPC(modulePath: string) {
      if (cubemapLoadedRef.current) return;
      const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
      addCubemapLog("loading cubemap for " + modulePath);
      Promise.all(
        faces.map((face) => ipc.invoke("preview:load-cubemap-face", modulePath, face))
      )
        .then((urls) => {
          const all = urls.every((u) => typeof u === "string" && u.length > 0);
          addCubemapLog("IPC cubemap allValid=" + all);
          if (all) {
            cubemapLoadedRef.current = true;
            renderer.loadCubemapFromDataUrls({
              px: urls[0], nx: urls[1], py: urls[2],
              ny: urls[3], pz: urls[4], nz: urls[5],
            });
          } else {
            addCubemapLog("WARN: missing cubemap faces");
          }
        })
        .catch((err) => addCubemapLog("WARN cubemap IPC failed: " + String(err)));
    }

    // Apply scene — only calls loadScenePack when scene name actually changes
    function applyScene(raw: any, setViewAngles: boolean) {
      if (!raw?.camera) return;

      const sceneName: string = raw.sceneName || "unknown";
      const moduleId: string = raw.moduleId || activeModuleId;
      const sceneKey = `${moduleId}/${sceneName}`;

      // Load cubemap once we know the scene path
      if (isElectron && ipc && !cubemapLoadedRef.current) {
        loadCubemapViaIPC(`${moduleId}/${sceneName}`);
      }

      // Only call loadScenePack when scene changes — not every 2s poll tick
      if (loadedSceneRef.current !== sceneKey) {
        loadedSceneRef.current = sceneKey;
        addCubemapLog("loading scene: " + sceneKey);

        const { pack, camYaw, camPitch } = buildPackFromRaw(raw, cubemapPlaceholder, activeModuleId);
        renderer.loadScenePack(pack, true); // skipCubemap always true — IPC handles cubemap

        if (setViewAngles) {
          renderer.setAngles(camYaw, camPitch);
          yawRef.current = camYaw;
          pitchRef.current = camPitch;
        }
      } else if (setViewAngles) {
        const { camYaw, camPitch } = buildPackFromRaw(raw, cubemapPlaceholder, activeModuleId);
        renderer.setAngles(camYaw, camPitch);
        yawRef.current = camYaw;
        pitchRef.current = camPitch;
      }
    }

    if (useTestSkybox) {
      // Load standard standard 6-sided Minecraft panorama cube
      renderer.tryLoadCubemapFromUrls({
        px: SKYBOX_BASE + "/mc_default/panorama_1.png", // Right
        nx: SKYBOX_BASE + "/mc_default/panorama_3.png", // Left
        py: SKYBOX_BASE + "/mc_default/panorama_4.png", // Top
        ny: SKYBOX_BASE + "/mc_default/panorama_5.png", // Bottom
        pz: SKYBOX_BASE + "/mc_default/panorama_2.png", // Back
        nz: SKYBOX_BASE + "/mc_default/panorama_0.png", // Front
      });
    } else if (isElectron && ipc) {
      // Load latest scene — try with moduleId first, fall back to no args
      const loadScene = () =>
        ipc.invoke("preview:load-scene", activeModuleId)
          .then((raw: any) => {
            if (raw && raw.camera) return raw;
            // fallback: try without args (old IPC signature)
            return ipc.invoke("preview:load-scene");
          });

      loadScene()
        .then((raw: any) => {
          if (raw && raw.camera) {
            applyScene(raw, true);
          } else {
            // scene.json not available yet — still load the cubemap using latest scene folder
            addCubemapLog("WARN: load-scene returned no data, loading cubemap directly");
            ipc.invoke("preview:latest-scene-path", activeModuleId)
              .then((scenePath: string) => {
                if (scenePath) loadCubemapViaIPC(scenePath);
              })
              .catch(() => {
                // Last resort: try the most common path pattern (PlayerESP is guaranteed to exist in assets)
                loadCubemapViaIPC(`PlayerESP/scene_20260311_003507`);
              });
          }
        })
        .catch((err: any) => {
          addCubemapLog("WARN: preview:load-scene failed: " + String(err));
          // Still try to load cubemap with a direct face load
          loadCubemapViaIPC(`PlayerESP/scene_20260311_003507`);
        });

      const scenePoll = setInterval(() => {
        loadScene()
          .then((raw: any) => { if (raw?.camera) applyScene(raw, false); })
          .catch(() => {});
      }, 2000);
      cleanupFns.push(() => clearInterval(scenePoll));
    } else {
      // Non-Electron dev fallback
      const devScenePath = "./assets/scenes/PlayerESP/scene_20260311_003507";
      fetch(devScenePath + "/scene.json")
        .then((r) => r.json())
        .then((raw) => {
          const devCubemap: CubemapPaths = {
            px: devScenePath + "/cubemap_px.png",
            nx: devScenePath + "/cubemap_nx.png",
            py: devScenePath + "/cubemap_py.png",
            ny: devScenePath + "/cubemap_ny.png",
            pz: devScenePath + "/cubemap_pz.png",
            nz: devScenePath + "/cubemap_nz.png",
          };
          renderer.loadCubemap(devCubemap);
          applyScene(raw, true);
        })
        .catch(() => addCubemapLog("WARN: dev scene fetch failed"));
    }

    const compositor = new OverlayCompositor(overlay, {
      moduleId: activeModuleId,
      initialConfig: {},
      debugMode: false,
      drawImmediate: true,
    });
    compositorRef.current = compositor;

    renderer.onFrameReady = (entities: ScreenEntity[]) => {
      compositor.updateEntities(entities);
    };

    const parent = canvas.parentElement;
    const resize = () => {
      if (!parent) return;
      const width = parent.clientWidth || 800;
      const height = parent.clientHeight || 450;
      renderer.setSize(width, height);
      compositor.setSize(width, height);
    };
    resize();

    const ro = new ResizeObserver(() => resize());
    if (parent) ro.observe(parent);
    cleanupFns.push(() => ro.disconnect());

    addCubemapLog("starting render loop");
    renderer.start();

    return () => {
      cleanupFns.forEach((fn) => fn());
      compositorRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [activeModuleId, useTestSkybox]);

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!rendererRef.current) return;
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startYaw: yawRef.current,
      startPitch: pitchRef.current,
    };
  };

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!dragStateRef.current.dragging || !rendererRef.current) return;
    const { startX, startY, startYaw, startPitch } = dragStateRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const sensitivity = 0.005;
    const newYaw = startYaw + dx * sensitivity;
    const newPitch = startPitch + dy * sensitivity * -1;
    yawRef.current = newYaw;
    pitchRef.current = newPitch;
    rendererRef.current.setAngles(newYaw, newPitch);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    dragStateRef.current.dragging = false;
  };

  return (
    <div className="flex min-h-0 min-w-0 h-full w-full flex-col gap-3 relative">
      <div className="absolute top-3 right-3 z-10 flex items-center justify-end pointer-events-auto">
        <button
          type="button"
          onClick={() => setUseTestSkybox((v) => !v)}
          className="rounded border border-border bg-black/60 px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-black/80"
        >
          Skybox: {useTestSkybox ? "Standard Defaults" : "Live Capture"}
        </button>
      </div>

      <div
        className="relative mx-auto flex flex-1 w-full overflow-hidden border border-white/5 bg-black"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground z-10">
          Panorama Preview
        </div>
      </div>

      {cubemapDebugLogs.length > 0 && (
        <div className="shrink-0 max-h-40 overflow-auto rounded border border-amber-500/50 bg-black/90 p-2 font-mono text-[10px] text-amber-200">
          <div className="mb-1 font-semibold text-amber-400">Cubemap debug (last 50 lines)</div>
          {cubemapDebugLogs.map((line, i) => (
            <div key={i} className={line.startsWith("WARN") ? "text-amber-300" : ""}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
