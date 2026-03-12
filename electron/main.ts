import { app, BrowserWindow, shell, Menu, ipcMain, dialog } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";

const PORT = 3000;
let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

/** 跨平台解析 Node.js 可执行文件路径 */
function resolveNodeBin(): string {
  const isWindows = process.platform === "win32";

  if (app.isPackaged) {
    if (isWindows) {
      // Windows: 使用随包附带的 node.exe
      return path.join(process.resourcesPath, "node.exe");
    } else {
      // macOS / Linux: 使用随包附带的 node，确保有执行权限
      const nodePath = path.join(process.resourcesPath, "node");
      try { fs.chmodSync(nodePath, 0o755); } catch { /* ignore */ }
      return nodePath;
    }
  }
  return "node"; // 开发模式
}

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;
    const appPath = app.getAppPath();

    const cmd = resolveNodeBin();

    // asar 内部文件无法被外部进程直接读取，需指向 app.asar.unpacked
    const unpackedPath = isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked")
      : appPath;
    const nextBin = path.join(unpackedPath, "node_modules", "next", "dist", "bin", "next");
    const args = [nextBin, "start", "--port", String(PORT)];

    console.log("[main] unpackedPath:", unpackedPath);
    console.log("[main] nextBin:", nextBin);
    console.log("[main] cmd:", cmd);

    nextProcess = spawn(cmd, args, {
      cwd: unpackedPath,
      env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: app.getPath("userData") },
      stdio: "pipe",
    });

    nextProcess.stdout?.on("data", (data: Buffer) => {
      console.log("[next]", data.toString());
    });

    nextProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[next]", data.toString());
    });

    // 轮询等待 Next.js 就绪
    const startTime = Date.now();
    const checkReady = () => {
      http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          retry();
        }
      }).on("error", () => {
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > 30000) {
        reject(new Error("Next.js server failed to start within 30 seconds"));
        return;
      }
      setTimeout(checkReady, 500);
    };

    setTimeout(checkReady, 1000);
  });
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "qt4oh-studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: "#f8faff",
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  // 就绪后再显示，避免白屏闪烁
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // 外部链接在默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (err) {
    console.error("Failed to start server:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    // macOS：关闭窗口时保留 Next.js server，点击 Dock 图标可直接复用
  } else {
    // Windows / Linux：退出时一并终止 server
    if (nextProcess) {
      nextProcess.kill();
      nextProcess = null;
    }
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (nextProcess) {
      // server 仍在运行，直接创建窗口
      createWindow();
    } else {
      // server 已停止（异常退出等情况），重新启动
      startNextServer()
        .then(() => createWindow())
        .catch((err) => {
          console.error("Failed to restart server:", err);
          app.quit();
        });
    }
  }
});

app.on("before-quit", () => {
  // 真正退出时（Cmd+Q 或菜单退出）终止 server
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});

// ── IPC：导出 Excel 并弹出原生保存对话框 ─────────────────────────────────────
ipcMain.handle("save-excel-export", async (_event, sessionId: string, suggestedName: string) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;

  const { canceled, filePath: savePath } = await dialog.showSaveDialog(win!, {
    title: "保存 Excel 报告",
    defaultPath: suggestedName,
    filters: [{ name: "Excel 文件", extensions: ["xlsx"] }],
  });
  if (canceled || !savePath) return null;

  // 从本地 Next.js server 获取 xlsx 内容
  const buf = await new Promise<Buffer>((resolve, reject) => {
    const get = savePath.startsWith("https") ? https.get : http.get;
    http.get(`http://localhost:${PORT}/api/reports/${encodeURIComponent(sessionId)}/export`, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });

  fs.writeFileSync(savePath, buf);
  return savePath;
});
