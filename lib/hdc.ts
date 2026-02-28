/**
 * HDC (HarmonyOS Device Connector) 命令行工具封装
 * 参考 hdc_helper.py 逻辑用 TypeScript 重写
 */

import { execSync, spawn } from "child_process";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

export interface HdcDevice {
  id: string;
  status: string;
}

/** 执行命令，返回 stdout 字符串；失败返回 null */
export function runCommand(cmd: string, ignoreError = false): string | null {
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 30000,
    });
    return output.trim();
  } catch (e: unknown) {
    if (!ignoreError) {
      const err = e as { stderr?: string; message?: string };
      console.error(`命令执行失败: ${cmd}`);
      console.error(err?.stderr || err?.message || String(e));
    }
    return null;
  }
}

/** 获取连接设备列表 */
export function getDeviceList(): HdcDevice[] {
  const output = runCommand("hdc list targets", true);
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "[Empty]")
    .map((id) => ({ id, status: "online" }));
}

/** 安装 HAP 包到指定设备，返回 { success, message } */
export function installHap(
  deviceId: string,
  hapFilePath: string,
  packageName: string
): { success: boolean; message: string } {
  const tempDir = uuidv4().replace(/-/g, "");

  // 强制停止应用
  runCommand(`hdc -t ${deviceId} shell aa force-stop ${packageName}`, true);
  // 卸载旧版本
  runCommand(`hdc -t ${deviceId} uninstall ${packageName}`, true);

  // 创建临时目录
  const mkResult = runCommand(
    `hdc -t ${deviceId} shell mkdir data/local/tmp/${tempDir}`
  );
  if (mkResult === null)
    return { success: false, message: "创建临时目录失败" };

  // 上传 HAP 文件
  const sendResult = runCommand(
    `hdc -t ${deviceId} file send "${hapFilePath}" "data/local/tmp/${tempDir}"`
  );
  if (sendResult === null) return { success: false, message: "上传 HAP 失败" };

  // 安装
  const installResult = runCommand(
    `hdc -t ${deviceId} shell bm install -p data/local/tmp/${tempDir}`
  );
  if (installResult === null) return { success: false, message: "安装失败" };

  // 清理临时目录
  runCommand(
    `hdc -t ${deviceId} shell rm -rf data/local/tmp/${tempDir}`,
    true
  );

  return { success: true, message: installResult };
}

/** 启动 Ability 并运行测试库 */
export function startAbility(
  deviceId: string,
  packageName: string,
  abilityName: string,
  libPath: string
): string | null {
  const cmd = `hdc -t ${deviceId} shell aa start -a ${abilityName} -b ${packageName} --ps runTestLib ${libPath}`;
  return runCommand(cmd, true);
}

/** 检查进程是否在运行 */
export function checkProcessRunning(
  deviceId: string,
  packageName: string
): boolean {
  const escaped = packageName.replace(/\./g, "\\.");
  const first = escaped[0];
  const rest = escaped.slice(1);
  const cmd = `hdc -t ${deviceId} shell "ps -ef | grep [${first}]${rest}"`;
  const output = runCommand(cmd, true);
  return !!output && output.trim().length > 0;
}

/** 强制终止应用进程 */
export function killProcess(deviceId: string, packageName: string): void {
  runCommand(`hdc -t ${deviceId} shell aa force-stop ${packageName}`, true);
}

/** 获取崩溃日志列表原始输出 */
export function getFaultLogs(deviceId: string): string {
  const output = runCommand(
    `hdc -t ${deviceId} shell hidumper -s 1201 -a "-p Faultlogger"`,
    true
  );
  return output || "";
}

/** 解析崩溃日志列表，返回与指定包名相关的崩溃日志文件名 */
export function parseCrashLogs(
  faultOutput: string,
  packageName: string
): string[] {
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

/** 下载崩溃日志到本地 */
export function downloadFaultLog(
  deviceId: string,
  filename: string,
  localDir: string
): boolean {
  const remotePath = `/data/log/faultlog/faultlogger/${filename}`;
  const localPath = path.join(localDir, filename);
  const result = runCommand(
    `hdc -t ${deviceId} file recv ${remotePath} ${localPath}`,
    true
  );
  return result !== null;
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
