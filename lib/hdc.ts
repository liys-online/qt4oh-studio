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

function resolveBundledHdcPath(): string | null {
  const candidates = [
    HDC_ENV_PATH,
    path.join(process.cwd(), "public", "hdc.exe"),
    path.join(process.cwd(), "hdc.exe"),
    process.resourcesPath ? path.join(process.resourcesPath, "hdc.exe") : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore lookup errors
    }
  }
  return null;
}

const HDC_BIN = resolveBundledHdcPath() || "hdc";

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

/** 使用 spawn 异步执行 hdc 命令，实时回调输出（用于 SSE 流式日志） */
export function spawnCommand(
  cmd: string,
  args: string[],
  onData: (data: string) => void,
  onClose: (code: number) => void
) {
  const proc = spawn(cmd, args, { windowsHide: true });
  proc.stdout.on("data", (chunk: Buffer) => onData(chunk.toString()));
  proc.stderr.on("data", (chunk: Buffer) => onData(chunk.toString()));
  proc.on("close", onClose);
  return proc;
}
