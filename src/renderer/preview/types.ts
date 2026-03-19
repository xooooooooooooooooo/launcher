export interface SceneCamera {
  fov: number;
  position: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface SceneEntityMetadata {
  [key: string]: unknown;
}

export interface SceneEntity {
  type: string;
  id: string;
  position: [number, number, number];
  yaw: number;
  pitch: number;
  height?: number;
  width?: number;
  metadata?: SceneEntityMetadata;
}

export interface SceneObject {
  type: string;
  position: [number, number, number];
  [key: string]: unknown;
}

export interface ScenePack {
  moduleId: string;
  sceneName: string;
  capturedAt: string;
  camera: SceneCamera;
  entities: SceneEntity[];
  objects: SceneObject[];
  cubemapPaths: {
    px: string;
    nx: string;
    py: string;
    ny: string;
    pz: string;
    nz: string;
  };
}

export interface ScreenEntity {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata: SceneEntityMetadata;
}

export type ConfigFieldType = "color" | "slider" | "toggle" | "dropdown" | "sectionHeader";

export interface ConfigFieldBase {
  id: string;
  label: string;
  type: ConfigFieldType;
}

export interface ColorField extends ConfigFieldBase {
  type: "color";
  default: string;
}

export interface SliderField extends ConfigFieldBase {
  type: "slider";
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface ToggleField extends ConfigFieldBase {
  type: "toggle";
  default: boolean;
}

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownField extends ConfigFieldBase {
  type: "dropdown";
  options: DropdownOption[];
  default: string;
}

export interface SectionHeaderField extends ConfigFieldBase {
  type: "sectionHeader";
}

export type ConfigField =
  | ColorField
  | SliderField
  | ToggleField
  | DropdownField
  | SectionHeaderField;

export interface ConfigSchema {
  moduleId: string;
  fields: ConfigField[];
}

