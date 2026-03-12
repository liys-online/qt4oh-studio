/**
 * HDC (HarmonyOS Device Connector) 命令行工具封装
 * 全部使用异步 exec，避免阻塞 Node.js event loop
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

const HDC_ENV_PATH = process.env.HDC_PATH;
const IS_WINDOWS = process.platform === "win32";
const HDC_EXE = IS_WINDOWS ? "hdc.exe" : "hdc";

/** 根据当前平台和架构返回 public/hdc 子目录名，如 darwin-arm64 / linux-x64 / win-x64 */
function getPlatformDir(): string {
  const plat = process.platform; // darwin / linux / win32
  const arch = process.arch;     // arm64 / x64
  if (plat === "win32") return "win-x64";
  if (plat === "darwin") return `darwin-${arch}`;
  return `linux-${arch}`;
}

function resolveBundledHdcPath(): string | null {
  const platformDir = getPlatformDir();
  const candidates = [
    HDC_ENV_PATH,
    // Electron 打包后：hdc 通过 extraResources 放在 resourcesPath 根目录
    process.resourcesPath ? path.join(process.resourcesPath, HDC_EXE) : null,
    // 开发模式：按平台子目录查找
    path.join(process.cwd(), "public", "hdc", platformDir, HDC_EXE),
    // 兼容旧的平铺结构
    path.join(process.cwd(), "public", HDC_EXE),
    path.join(process.cwd(), HDC_EXE),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        // 确保在 macOS/Linux 上 hdc 拥有执行权限
        if (!IS_WINDOWS) {
          try {
            fs.accessSync(p, fs.constants.X_OK);
          } catch {
            fs.chmodSync(p, 0o755);
          }
        }
        return p;
      }
    } catch {
      // ignore lookup errors
    }
  }
  return null;
}

const HDC_BIN = resolveBundledHdcPath() || "hdc";

/**
 * 构建执行 hdc 时的环境变量。
 * macOS 需注入 DYLD_LIBRARY_PATH，确保 hdc 能找到同目录下的 libusb_shared.dylib。
 */
function buildHdcEnv(): NodeJS.ProcessEnv {
  if (process.platform !== "darwin" || !process.resourcesPath) {
    return process.env;
  }
  const libDir = process.resourcesPath;
  const existing = process.env.DYLD_LIBRARY_PATH ?? "";
  return {
    ...process.env,
    DYLD_LIBRARY_PATH: existing ? `${libDir}:${existing}` : libDir,
  };
}

const HDC_ENV = buildHdcEnv();

function buildHdcCommand(args: string): string {
  // Quote path if it contains spaces
  const bin = HDC_BIN.includes(" ") ? `"${HDC_BIN}"` : HDC_BIN;
  return `${bin} ${args}`.trim();
}

export interface HdcDevice {
  id: string;
  status: string;
}

/** 异步执行命令，返回 stdout；失败返回 null */
export async function runCommand(
  cmd: string,
  ignoreError = false,
  onCommand?: (cmd: string) => void
): Promise<string | null> {
  onCommand?.(cmd);
  try {
    const { stdout } = await execAsync(cmd, {
      windowsHide: true,
      timeout: 60000,
      env: HDC_ENV,
    });
    return stdout.trim();
  } catch (e: unknown) {
    if (!ignoreError) {
      const err = e as { stderr?: string; message?: string };
      console.error(`命令执行失败: ${cmd}`);
      console.error(err?.stderr || err?.message || String(e));
    }
    return null;
  }
}

/** 获取 HDC 工具版本，返回版本字符串；失败返回 null */
export async function getHdcVersion(): Promise<string | null> {
  const output = await runCommand(buildHdcCommand("-v"), true);
  if (!output) return null;
  // 输出示例: "Ver: 3.1.0a" 或 "HDC 3.0.0b3"
  const match = output.match(/[\d]+\.[\d]+\.[\d]+[\w]*/i);
  return match ? match[0] : output;
}

export interface DeviceInfo {
  name: string | null;
  brand: string | null;
  model: string | null;
  softwareVersion: string | null;
  apiVersion: string | null;
  cpuAbiList: string | null;
}

/** 并行获取指定设备的详细硬件/系统参数 */
export async function getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
  const get = (param: string) =>
    runCommand(buildHdcCommand(`-t ${deviceId} shell param get ${param}`), true);
  const [name, brand, model, softwareVersion, apiVersion, cpuAbiList] =
    await Promise.all([
      get("const.product.name"),
      get("const.product.brand"),
      get("const.product.model"),
      get("const.product.software.version"),
      get("const.ohos.apiversion"),
      get("const.product.cpu.abilist"),
    ]);
  return { name, brand, model, softwareVersion, apiVersion, cpuAbiList };
}

/** 获取连接设备列表 */
export async function getDeviceList(): Promise<HdcDevice[]> {
  const output = await runCommand(buildHdcCommand("list targets"), true);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "[Empty]")
    .map((id) => ({ id, status: "online" }));
}

/** 安装 HAP 包到指定设备，返回 { success, message } */
export async function installHap(
  deviceId: string,
  hapFilePath: string,
  packageName: string,
  onCommand?: (cmd: string) => void
): Promise<{ success: boolean; message: string }> {
  const tempDir = uuidv4().replace(/-/g, "");

  await runCommand(buildHdcCommand(`-t ${deviceId} shell aa force-stop ${packageName}`), true, onCommand);
  await runCommand(buildHdcCommand(`-t ${deviceId} uninstall ${packageName}`), true, onCommand);

  const mkResult = await runCommand(
    buildHdcCommand(`-t ${deviceId} shell mkdir data/local/tmp/${tempDir}`),
    false,
    onCommand
  );
  if (mkResult === null) return { success: false, message: "创建临时目录失败" };

  const sendResult = await runCommand(
    buildHdcCommand(`-t ${deviceId} file send "${hapFilePath}" "data/local/tmp/${tempDir}"`),
    false,
    onCommand
  );
  if (sendResult === null) return { success: false, message: "上传 HAP 失败" };

  const installResult = await runCommand(
    buildHdcCommand(`-t ${deviceId} shell bm install -p data/local/tmp/${tempDir}`),
    false,
    onCommand
  );
  if (installResult === null) return { success: false, message: "安装失败" };

  await runCommand(
    buildHdcCommand(`-t ${deviceId} shell rm -rf data/local/tmp/${tempDir}`),
    true,
    onCommand
  );

  return { success: true, message: installResult };
}

/** 启动 Ability 并运行测试库 */
export async function startAbility(
  deviceId: string,
  packageName: string,
  abilityName: string,
  libPath: string,
  onCommand?: (cmd: string) => void
): Promise<string | null> {
  const cmd = buildHdcCommand(`-t ${deviceId} shell aa start -a ${abilityName} -b ${packageName} --ps runTestLib ${libPath}`);
  return runCommand(cmd, true, onCommand);
}

/** 检查进程是否在运行 */
export async function checkProcessRunning(
  deviceId: string,
  packageName: string
): Promise<boolean> {
  const escaped = packageName.replace(/\./g, "\\.");
  const first = escaped[0];
  const rest = escaped.slice(1);
  const cmd = buildHdcCommand(`-t ${deviceId} shell "ps -ef | grep [${first}]${rest}"`);
  const output = await runCommand(cmd, true);
  return !!output && output.trim().length > 0;
}

/** 强制终止应用进程 */
export async function killProcess(deviceId: string, packageName: string): Promise<void> {
  await runCommand(buildHdcCommand(`-t ${deviceId} shell aa force-stop ${packageName}`), true);
}

/** 获取崩溃日志列表原始输出 */
export async function getFaultLogs(deviceId: string): Promise<string> {
  const output = await runCommand(
    buildHdcCommand(`-t ${deviceId} shell hidumper -s 1201 -a "-p Faultlogger"`),
    true
  );
  return output || "";
}

/** 解析崩溃日志列表（纯同步，无命令调用） */
export function parseCrashLogs(faultOutput: string, packageName: string): string[] {
  const result: string[] = [];
  const lines = faultOutput.split("\n");
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "******") {
      if (inList) break;
      inList = true;
      continue;
    }
    if (inList && line.startsWith("cppcrash-") && line.includes(packageName)) {
      result.push(line);
    }
  }
  return result;
}

/**
 * 从设备下载测试结果 XML 报告
 * 远端路径：/data/app/el2/100/base/<packageName>/files/<libPath>
 * 本地路径：<localDir>/<libPath>（保留子目录结构）
 * 返回实际保存的本地路径，失败返回 null
 */
export async function downloadTestReport(
  deviceId: string,
  packageName: string,
  libPath: string,
  localDir: string,
  onCommand?: (cmd: string) => void
): Promise<string | null> {
  // libPath 形如 tests/qtbase/char/libtst_qatomicinteger_char.so
  // XML 报告与 .so 同目录同名，扩展名换成 .xml
  const xmlRelPath = libPath.replace(/\.so$/, ".xml");
  const remotePath = `/data/app/el2/100/base/${packageName}/files/${xmlRelPath}`;
  const localPath = path.join(localDir, xmlRelPath);
  const localDirPath = path.dirname(localPath);
  if (!fs.existsSync(localDirPath)) fs.mkdirSync(localDirPath, { recursive: true });
  const result = await runCommand(
    buildHdcCommand(`-t ${deviceId} file recv "${remotePath}" "${localPath}"`),
    true,
    onCommand
  );
  return result !== null && fs.existsSync(localPath) ? localPath : null;
}

/** 下载崩溃日志到本地 */
export async function downloadFaultLog(
  deviceId: string,
  filename: string,
  localDir: string
): Promise<boolean> {
  const remotePath = `/data/log/faultlog/faultlogger/${filename}`;
  const localPath = path.join(localDir, filename);
  const result = await runCommand(
    buildHdcCommand(`-t ${deviceId} file recv ${remotePath} ${localPath}`),
    true
  );
  return result !== null;
}

/** 下载崩溃日志内容（下载到系统临时目录，读取后删除，返回文本内容）*/
export async function downloadFaultLogContent(
  deviceId: string,
  filename: string
): Promise<string | null> {
  const remotePath = `/data/log/faultlog/faultlogger/${filename}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qt4oh-crash-"));
  const localPath = path.join(tmpDir, filename);
  try {
    const result = await runCommand(
      buildHdcCommand(`-t ${deviceId} file recv ${remotePath} ${localPath}`),
      true
    );
    if (result === null || !fs.existsSync(localPath)) return null;
    return fs.readFileSync(localPath, "utf-8");
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * 下载测试报告 XML 内容（下载到系统临时目录，读取后删除，返回文本内容）
 * 远端路径：/data/app/el2/100/base/<packageName>/files/<libPath>.xml
 */
export async function downloadTestReportContent(
  deviceId: string,
  packageName: string,
  libPath: string,
  onCommand?: (cmd: string) => void
): Promise<string | null> {
  const xmlRelPath = libPath.replace(/\.so$/, ".xml");
  const remotePath = `/data/app/el2/100/base/${packageName}/files/${xmlRelPath}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qt4oh-xml-"));
  const localPath = path.join(tmpDir, path.basename(xmlRelPath));
  try {
    const result = await runCommand(
      buildHdcCommand(`-t ${deviceId} file recv "${remotePath}" "${localPath}"`),
      true,
      onCommand
    );
    if (result === null || !fs.existsSync(localPath)) return null;
    return fs.readFileSync(localPath, "utf-8");
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * 在设备上执行非交互式 shell 命令
 * @param deviceId 设备 ID
 * @param command  要执行的命令字符串
 * @param bundleName 可选，指定可调试应用包名（-b bundlename），在应用数据沙箱目录内执行
 * @returns { stdout, stderr, exitCode }
 */
export async function runShellCommand(
  deviceId: string,
  command: string,
  bundleName?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const bFlag = bundleName ? `-b ${bundleName} ` : "";
  // 用双引号包裹命令，以支持管道、重定向等 shell 特性
  const fullCmd = buildHdcCommand(`-t ${deviceId} shell ${bFlag}"${command.replace(/"/g, '\\"')}"`);
  return new Promise((resolve) => {
    exec(fullCmd, { windowsHide: true, timeout: 60000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error?.code ?? 0,
      });
    });
  });
}

/**
 * 截取设备屏幕画面
 * 1. hdc shell snapshot_display -f /data/local/tmp/<uuid>.jpeg
 * 2. hdc file recv /data/local/tmp/<uuid>.jpeg <localTmpFile>
 * 返回本地临时文件路径（调用方负责删除），失败返回 null
 */
export async function takeScreenshot(deviceId: string): Promise<string | null> {
  const filename = `screenshot_${uuidv4().replace(/-/g, "")}.jpeg`;
  const remotePath = `/data/local/tmp/${filename}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qt4oh-screenshot-"));
  const localPath = path.join(tmpDir, filename);

  // Step 1: 截图到设备临时目录
  const snapResult = await runCommand(
    buildHdcCommand(`-t ${deviceId} shell snapshot_display -f ${remotePath}`),
    false
  );
  if (snapResult === null) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return null;
  }

  // Step 2: 从设备拉取文件到本地
  const recvResult = await runCommand(
    buildHdcCommand(`-t ${deviceId} file recv ${remotePath} ${localPath}`),
    false
  );
  if (recvResult === null || !fs.existsSync(localPath)) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return null;
  }

  // 删除设备上的临时文件（忽略失败）
  await runCommand(buildHdcCommand(`-t ${deviceId} shell rm -f ${remotePath}`), true);

  return localPath;
}

/**
 * 执行 power-shell 命令
 * - wakeup:   亮屏
 * - suspend:  熄屏
 * - setmode:  设置电源模式 (mode: 600=正常 601=省电 602=性能 603=超级省电)
 * - timeout:  自动熄屏时间 (timeoutMs: 毫秒数 | restore: true 恢复系统默认)
 */
export async function runPowerShell(
  deviceId: string,
  action: "wakeup" | "suspend" | "setmode" | "timeout",
  opts?: { mode?: number; timeoutMs?: number; restore?: boolean }
): Promise<{ success: boolean; output: string }> {
  let subCmd: string;
  switch (action) {
    case "wakeup":   subCmd = "wakeup"; break;
    case "suspend":  subCmd = "suspend"; break;
    case "setmode":  subCmd = `setmode ${opts?.mode ?? 600}`; break;
    case "timeout":
      subCmd = opts?.restore ? "timeout -r" : `timeout -o ${opts?.timeoutMs ?? 15000}`;
      break;
  }
  const cmd = buildHdcCommand(`-t ${deviceId} shell "power-shell ${subCmd}"`);
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      resolve({ success: !error, output: output || (error ? error.message : "执行成功") });
    });
  });
}

/** 使用 spawn 异步执行 hdc 命令，实时回调输出（用于 SSE 流式日志） */
export function spawnCommand(
  cmd: string,
  args: string[],
  onData: (data: string) => void,
  onClose: (code: number) => void
) {
  const proc = spawn(cmd, args, { windowsHide: true, env: HDC_ENV });
  proc.stdout.on("data", (chunk: Buffer) => onData(chunk.toString()));
  proc.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()));
  proc.on("close", onClose);
  return proc;
}

export interface HilogOptions {
  /** -L 日志级别 D/I/W/E/F，多个用逗号分隔 */
  level?: string;
  /** -t 日志类型 app/core/init/kmsg */
  type?: string;
  /** -T tag 过滤 */
  tag?: string;
  /** -D domain 过滤 */
  domain?: string;
  /** -P pid 过滤 */
  pid?: string;
  /** -e 正则表达式过滤 */
  regex?: string;
  /** -x 非阻塞（读完即退出），默认 false（持续阻塞流） */
  exit?: boolean;
  /** -z 只读最后 n 行 */
  tail?: number;
  /** -a 只读前 n 行 */
  head?: number;
}

/**
 * 用 spawn 启动 hdc shell hilog，实时回调输出
 * 支持全部 hilog 过滤参数
 */
export function spawnHilog(
  deviceId: string,
  options: HilogOptions,
  onData: (data: string) => void,
  onClose: (code: number) => void
) {
  const args: string[] = ["-t", deviceId, "shell", "hilog"];

  if (options.exit) args.push("-x");
  if (options.level) args.push("-L", options.level.toUpperCase());
  if (options.type) args.push("-t", options.type);
  if (options.tag) args.push("-T", options.tag);
  if (options.domain) args.push("-D", options.domain);
  if (options.pid) args.push("-P", options.pid);
  if (options.regex) args.push("-e", options.regex);
  if (options.tail != null) args.push("-z", String(options.tail));
  if (options.head != null) args.push("-a", String(options.head));

  const bin = HDC_BIN;
  const proc = spawn(bin, args, { windowsHide: true, env: HDC_ENV });
  proc.stdout.on("data", (chunk: Buffer) => onData(chunk.toString()));
  proc.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()));
  proc.on("close", onClose);
  return proc;
}
