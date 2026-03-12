// preload.ts - 预加载脚本（contextBridge 隔离）
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  /**
   * 弹出原生保存对话框，将导出的 Excel 文件保存到用户选择的路径。
   * @returns 保存成功返回路径；用户取消返回 null；失败 reject。
   */
  saveExcelExport: (sessionId: string, suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke("save-excel-export", sessionId, suggestedName),
});
