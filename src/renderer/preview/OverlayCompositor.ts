import type { ScreenEntity, ConfigSchema } from "./types";

type ModuleConfig = Record<string, unknown>;

export interface OverlayCompositorOptions {
  moduleId: string;
  initialConfig: ModuleConfig;
  /** If true, draw a local debug overlay instead of calling the JVM. */
  debugMode?: boolean;
  /** If true, draw hitboxes immediately every time entities are set (real-time, no JVM wait). */
  drawImmediate?: boolean;
}

/**
 * OverlayCompositor
 *
 * - Owns a transparent 2D canvas layered over the panorama canvas
 * - Receives projected ScreenEntity[] each frame from PanoramaRenderer
 * - Debounces expensive render requests to the JVM preview SDK
 * - Draws returned RGBA pixels to the overlay canvas
 *
 * NOTE: This implementation assumes Electron with nodeIntegration enabled so
 * we can access ipcRenderer via window.require("electron").
 */
export class OverlayCompositor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ipc =
    typeof window !== "undefined" && (window as any).require?.("electron")?.ipcRenderer;

  private moduleId: string;
  private config: ModuleConfig;
  private lastEntities: ScreenEntity[] = [];
  private lastSchema: ConfigSchema | null = null;

  private pendingRender = false;
  private readonly debugMode: boolean;
  private readonly drawImmediate: boolean;

  constructor(canvas: HTMLCanvasElement, options: OverlayCompositorOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OverlayCompositor: 2D context unavailable");

    this.canvas = canvas;
    this.ctx = ctx;
    this.moduleId = options.moduleId;
    this.config = { ...options.initialConfig };
    this.debugMode = !!options.debugMode;
    this.drawImmediate = !!options.drawImmediate;
  }

  setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setModule(moduleId: string, initialConfig: ModuleConfig): void {
    this.moduleId = moduleId;
    this.config = { ...initialConfig };
    this.lastEntities = [];
    this.clear();
  }

  updateConfig(newConfig: ModuleConfig): void {
    this.config = { ...newConfig };
    this.requestRender();
  }

  updateEntities(entities: ScreenEntity[]): void {
    this.lastEntities = entities;
    if (this.drawImmediate) {
      this.drawDebugOverlay();
      return;
    }
    this.requestRender();
  }

  getSchema(): Promise<ConfigSchema | null> {
    if (!this.ipc) return Promise.resolve(null);
    return this.ipc.invoke("preview:schema", this.moduleId).then((schema: ConfigSchema) => {
      this.lastSchema = schema;
      return schema;
    });
  }

  private requestRender(): void {
    if (this.debugMode || !this.ipc) {
      this.drawDebugOverlay();
      return;
    }

    if (this.pendingRender) return;
    this.pendingRender = true;

    this.ipc
      .invoke("preview:render", this.moduleId, this.config, this.lastEntities)
      .then((resp: { width: number; height: number; data: string } | null) => {
        this.pendingRender = false;
        if (resp?.data != null && resp.width > 0 && resp.height > 0) {
          this.drawFrame(resp.width, resp.height, resp.data);
        } else {
          this.drawDebugOverlay();
        }
      })
      .catch(() => {
        this.pendingRender = false;
        this.drawDebugOverlay();
      });
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawFrame(width: number, height: number, base64Rgba: string): void {
    const bytes = new Uint8ClampedArray(
      atob(base64Rgba)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
    const imageData = new ImageData(bytes, width, height);

    this.clear();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (width === cw && height === ch) {
      this.ctx.putImageData(imageData, 0, 0);
    } else {
      const tmp = document.createElement("canvas");
      tmp.width = width;
      tmp.height = height;
      tmp.getContext("2d")!.putImageData(imageData, 0, 0);
      this.ctx.drawImage(tmp, 0, 0, width, height, 0, 0, cw, ch);
    }
  }

  /** Simple local overlay for testing without preview-sdk.jar. */
  private drawDebugOverlay(): void {
    this.clear();
    if (!this.lastEntities.length) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.save();
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#55ff55";
    this.ctx.globalAlpha = 0.9;

    for (const e of this.lastEntities) {
      const x = Math.max(0, Math.min(w, e.x));
      const y = Math.max(0, Math.min(h, e.y));
      const width = Math.max(2, Math.min(w - x, e.width));
      const height = Math.max(4, Math.min(h - y, e.height));
      this.ctx.strokeRect(x, y, width, height);
    }

    this.ctx.restore();
  }
}

