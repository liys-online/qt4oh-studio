import { app, BrowserWindow, shell, Menu } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as http from "http";

const PORT = 3000;
let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;
    const appPath = app.getAppPath();

    // 打包后使用随附的 node.exe，开发时使用系统 node
    let cmd: string;
    if (isPackaged) {
      // extraResources 会被复制到 resources/ 目录（app.asar 的同级目录）
      cmd = path.join(process.resourcesPath, "node.exe");
    } else {
      cmd = "node";
    }

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
  // 关闭 Next.js 进程
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
