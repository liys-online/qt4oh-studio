// preload.ts - 预加载脚本（contextBridge 隔离）
// 目前不需要暴露额外 API，保留空模板供扩展
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});
