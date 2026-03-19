import { spawn, type ChildProcess } from "child_process";
import { ipcMain } from "electron";
import * as readline from "readline";
import * as path from "path";

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
}

export class PreviewBridge {
  private jvm: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();

  start(): void {
    if (this.jvm) return;

    const jarPath = path.join(process.resourcesPath || __dirname, "assets", "preview-sdk.jar");
    this.jvm = spawn("java", ["-jar", jarPath], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    const rl = readline.createInterface({ input: this.jvm.stdout! });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        const requestId = msg.requestId as string | undefined;
        if (!requestId) return;
        const entry = this.pending.get(requestId);
        if (!entry) return;
        this.pending.delete(requestId);
        entry.resolve(msg);
      } catch (e) {
        console.error("[PreviewBridge] Failed to parse message:", e);
      }
    });

    this.jvm.on("exit", (code) => {
      console.warn("[PreviewBridge] JVM exited with code", code);
      this.jvm = null;
      for (const [, entry] of this.pending) {
        entry.reject(new Error("JVM exited"));
      }
      this.pending.clear();
      setTimeout(() => this.start(), 1000);
    });
  }

  private send(payload: object): Promise<any> {
    if (!this.jvm || !this.jvm.stdin) {
      return Promise.reject(new Error("Preview SDK process not running"));
    }

    const requestId = crypto.randomUUID();
    const message = JSON.stringify({ ...payload, requestId }) + "\n";

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.jvm!.stdin!.write(message);
    });
  }

  registerIpcHandlers(): void {
    ipcMain.handle("preview:schema", async (_event, moduleId: string) => {
      const resp = await this.send({ type: "schema", module: moduleId });
      return resp.schema ?? null;
    });

    ipcMain.handle(
      "preview:render",
      async (_event, moduleId: string, config: object, entities: any[]) => {
        const resp = await this.send({
          type: "render",
          module: moduleId,
          config,
          entities,
        });
        if (resp.type !== "frame") return null;
        return { width: resp.width, height: resp.height, data: resp.data };
      },
    );
  }
}

