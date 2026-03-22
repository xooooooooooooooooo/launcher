import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SteveModel } from "./SteveModel";
import type { PreviewOptions } from "./StevePreview";

const defaultOpts: PreviewOptions = { espEnabled: false, espMode: "box", espNametag: false, targetHud: false };

/** Fallback when skinview3d / CDN skin fails (e.g. offline or CORS). */
export function StevePreviewFallback({ previewOptions = defaultOpts }: { previewOptions?: PreviewOptions }) {
  const opts = { ...defaultOpts, ...previewOptions };
  return (
    <div className="relative h-full min-h-[240px] w-full rounded-lg overflow-hidden bg-zinc-900/80 border border-border">
      <Canvas
        camera={{ position: [0, 0.8, 2.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#18181b"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 5, 2]} intensity={2.2} castShadow />
        <directionalLight position={[-2, 3, -1]} intensity={1.2} />
        <Suspense
          fallback={
            <mesh>
              <boxGeometry args={[0.5, 1, 0.3]} />
              <meshStandardMaterial color="#6b8cae" wireframe />
            </mesh>
          }
        >
          <SteveModel previewOptions={opts} />
        </Suspense>
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={1.5}
          maxDistance={5}
          maxPolarAngle={Math.PI / 2 + 0.2}
        />
      </Canvas>
      {opts.espNametag && (
        <div className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          Steve
        </div>
      )}
      {opts.targetHud && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium text-primary">
          Target HUD
        </div>
      )}
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        Offline fallback model · Use network for real Minecraft skin
      </p>
    </div>
  );
}

