/**
 * 应用数据目录集中管理
 * - 打包 Electron：由主进程通过 APP_DATA_DIR 环境变量注入（app.getPath('userData')）
 * - 开发模式：使用项目 data/ 目录
 */
import * as path from "path";

export const APP_DATA_DIR = process.env.APP_DATA_DIR || path.join(process.cwd(), "data");

export const UPLOAD_DIR = path.join(APP_DATA_DIR, "uploads");
export const FAULTLOG_DIR = path.join(APP_DATA_DIR, "Faultlogger");
export const REPORTS_BASE_DIR = path.join(APP_DATA_DIR, "reports");
export const LOGS_DIR = path.join(APP_DATA_DIR, "logs");
export const SESSIONS_FILE = path.join(APP_DATA_DIR, "sessions.json");
