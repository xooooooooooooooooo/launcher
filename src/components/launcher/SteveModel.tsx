/**
 * Blocky Minecraft-style Steve model built from boxes.
 * Proportions match classic Steve: head, torso, arms, legs.
 * Use for Target HUD / ESP preview in Config.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group } from "three";
import type { PreviewOptions } from "./StevePreview";

// Minecraft-style colors (approximate)
const SKIN = "#c6b089";
const SHIRT = "#6b8cae";
const PANTS = "#4a6fa5";
const HAIR = "#2d1b0e";
const SHOE = "#2d1b0e";

/** Single body part. Glow/Shader = same shape as skin but as a colored layer (no box). */
function Box({
  position,
  scale,
  color,
  colorLayerGlow,
  colorLayerShader,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  colorLayerGlow?: boolean;
  colorLayerShader?: boolean;
}) {
  const showLayer = colorLayerGlow || colorLayerShader;
  const layerOpacity = colorLayerShader ? 0.25 : 0.35;
  return (
    <group position={position} scale={scale}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} />
      </mesh>
      {/* Colored layer: same shape as skin, like a second skin in green */}
      {showLayer && (
        <mesh renderOrder={1} scale={[1.03, 1.03, 1.03]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color="#55ff55"
            transparent
            opacity={layerOpacity}
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </group>
  );
}

// Minecraft hitbox 0.6×1.8×0.6 → in our scale (height 4): 1.333×4×1.333, center y=2
const MC_HITBOX_W = 4 * (0.6 / 1.8);
const MC_HITBOX_H = 4;
const MC_HITBOX_D = MC_HITBOX_W;
const MC_ESP_GREEN = 0x55ff55;

/** Box ESP: hitbox wireframe only (like RenderUtils.drawBox in-game). Glow/Shader are on the skin model above. */
function ESPBox() {
  const line = useMemo(() => {
    const g = new THREE.BoxGeometry(MC_HITBOX_W, MC_HITBOX_H, MC_HITBOX_D);
    const edges = new THREE.EdgesGeometry(g, 0);
    const mat = new THREE.LineBasicMaterial({ color: MC_ESP_GREEN });
    const seg = new THREE.LineSegments(edges, mat);
    seg.position.set(0, 2, 0);
    return seg;
  }, []);
  return <primitive object={line} />;
}

const defaultPreviewOptions: PreviewOptions = { espEnabled: false, espMode: "box", espNametag: false, targetHud: false };

export function SteveModel({ previewOptions = defaultPreviewOptions }: { previewOptions?: PreviewOptions }) {
  const group = useRef<Group>(null);
  const opts = { ...defaultPreviewOptions, ...previewOptions };

  // Steve proportions (block units). Origin at feet, Y up.
  // Head 8x8x8 -> 1,1,1 at y=3.5
  // Body 8x12x4 -> 1, 1.5, 0.5 at y=2.25
  // Arms 4x12x4 -> 0.5, 1.5, 0.5 at y=2.25, x=±0.75
  // Legs 4x12x4 -> 0.5, 1.5, 0.5 at y=0.75, x=±0.25
  const s = 0.5; // scale down so Steve fits in view
  const headY = 3.5 * s;
  const bodyY = 2.25 * s;
  const armLegY = 0.75 * s;

  return (
    <group ref={group} position={[0, -0.5, 0]} scale={s}>
      {/* Head (skin + hair) – Glow/Shader = colored layer same shape as skin */}
      <Box
        position={[0, headY, 0]}
        scale={[1, 1, 1]}
        color={SKIN}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[0, headY + 0.5, 0]}
        scale={[1, 0.2, 1]}
        color={HAIR}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[0.4, headY + 0.15, 0]}
        scale={[0.2, 0.5, 1]}
        color={HAIR}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[-0.4, headY + 0.15, 0]}
        scale={[0.2, 0.5, 1]}
        color={HAIR}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />

      {/* Body */}
      <Box
        position={[0, bodyY, 0]}
        scale={[1, 1.5, 0.5]}
        color={SHIRT}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />

      {/* Arms */}
      <Box
        position={[0.75, bodyY, 0]}
        scale={[0.5, 1.5, 0.5]}
        color={SKIN}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[-0.75, bodyY, 0]}
        scale={[0.5, 1.5, 0.5]}
        color={SKIN}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />

      {/* Legs + shoes */}
      <Box
        position={[0.25, armLegY, 0]}
        scale={[0.5, 1.5, 0.5]}
        color={PANTS}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[-0.25, armLegY, 0]}
        scale={[0.5, 1.5, 0.5]}
        color={PANTS}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[0.25, armLegY - 0.75, 0]}
        scale={[0.5, 0.2, 0.5]}
        color={SHOE}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      <Box
        position={[-0.25, armLegY - 0.75, 0]}
        scale={[0.5, 0.2, 0.5]}
        color={SHOE}
        colorLayerGlow={opts.espEnabled && opts.espMode === "glow"}
        colorLayerShader={opts.espEnabled && opts.espMode === "shader"}
      />
      {opts.espEnabled && opts.espMode === "box" && <ESPBox />}
    </group>
  );
}
