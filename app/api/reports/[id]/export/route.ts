import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession, computeSummary } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { parseXmlReport } from "@/lib/xml-report";
import { getDeviceInfo } from "@/lib/hdc";
// ── 常量 ──────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  success: "通过", failed: "失败", timeout: "超时",
  crash: "崩溃", interrupted: "中断", pending: "等待", running: "运行中",
};

// ARGB (Alpha + RGB)
const STATUS_BG: Record<string, string> = {
  success: "FFD1FAE5", failed: "FFFEE2E2", timeout: "FFFEF3C7",
  crash: "FFFEE2E2", interrupted: "FFFFEDD5", pending: "FFF1F5F9", running: "FFF1F5F9",
};
const STATUS_FG: Record<string, string> = {
  success: "FF059669", failed: "FFDC2626", timeout: "FFD97706",
  crash: "FFEF4444", interrupted: "FFEA580C", pending: "FF64748B", running: "FF64748B",
};

function safeName(name: string, maxLen = 31) {
  return name.replace(/[/\\?*[\]:]/g, "_").slice(0, maxLen);
}

function headerStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FF1D252C" }, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
}

function applyStatus(cell: ExcelJS.Cell, status: string) {
  const label = STATUS_LABEL[status] ?? status;
  cell.value = label;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_BG[status] ?? "FFF1F5F9" } };
  cell.font = { bold: true, color: { argb: STATUS_FG[status] ?? "FF64748B" }, size: 11 };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

// 函数级 type → 标签 / 颜色（对应 XmlTestFunction.type）
const FUNC_TYPE_LABEL: Record<string, string> = {
  pass: "pass", fail: "fail", xfail: "xfail", skip: "skip", error: "error",
};
const FUNC_TYPE_BG: Record<string, string> = {
  pass: "FFD1FAE5", fail: "FFFEE2E2", xfail: "FFFEF3C7",
  skip: "FFF1F5F9", error: "FFFEE2E2",
};
const FUNC_TYPE_FG: Record<string, string> = {
  pass: "FF059669", fail: "FFDC2626", xfail: "FFD97706",
  skip: "FF64748B", error: "FFEF4444",
};

function applyFuncType(cell: ExcelJS.Cell, type: string) {
  const t = type.toLowerCase();
  cell.value = FUNC_TYPE_LABEL[t] ?? type;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNC_TYPE_BG[t] ?? "FFF1F5F9" } };
  cell.font = { bold: true, color: { argb: FUNC_TYPE_FG[t] ?? "FF64748B" }, size: 11 };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

// ── 路由处理 ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  const summary = computeSummary(session.results);
  const deviceInfo = await getDeviceInfo(session.deviceId).catch(() => null);
  const wb = new ExcelJS.Workbook();
  wb.creator = "qt4oh-studio";
  wb.created = new Date();

  // ── Sheet 1：概览 ────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet("概览");
    ws.columns = [{ width: 16 }, { width: 52 }];

    const infoRows: [string, string | number][] = [
      ["会话 ID", session.id],
      ["HAP 包", session.hapFile],
      ["设备 ID", session.deviceId],
      ["设备名称", deviceInfo?.name ?? "-"],
      ["品牌", deviceInfo?.brand ?? "-"],
      ["型号", deviceInfo?.model ?? "-"],
      ["系统版本", deviceInfo?.softwareVersion ?? "-"],
      ["API 版本", deviceInfo?.apiVersion ?? "-"],
      ["CPU ABI", deviceInfo?.cpuAbiList ?? "-"],
      ["状态", session.status === "completed" ? "已完成" : session.status === "running" ? "运行中" : "已停止"],
      ["开始时间", formatDateTime(session.startTime)],
      ["结束时间", session.endTime ? formatDateTime(session.endTime) : "-"],
    ];
    for (const [k, v] of infoRows) {
      const row = ws.addRow([k, v]);
      row.getCell(1).font = { bold: true, color: { argb: "FF64748B" }, size: 10 };
      row.getCell(2).font = { size: 10 };
      row.height = 18;
    }

    ws.addRow([]);

    // 统计表头
    const statHeader = ws.addRow(["指标", "数值"]);
    statHeader.eachCell((c) => headerStyle(c));
    statHeader.height = 20;

    const statRows: [string, number | string, string?][] = [
      ["测试总数", summary.total],
      ["通过", summary.success, "success"],
      ["失败", summary.failed, "failed"],
      ["超时", summary.timeout, "timeout"],
      ["崩溃", summary.crash, "crash"],
      ["中断", summary.interrupted ?? 0, "interrupted"],
      ["通过率", summary.total > 0 ? `${Math.round((summary.success / summary.total) * 100)}%` : "-"],
    ];
    for (const [label, value, status] of statRows) {
      const row = ws.addRow([label, value]);
      row.height = 18;
      row.getCell(1).font = { bold: true, size: 10 };
      if (status) {
        applyStatus(row.getCell(2), status);
        // applyStatus 会覆盖 value 为标签文字，恢复为数值
        row.getCell(2).value = value as number;
      } else {
        row.getCell(2).font = { bold: true, size: 11 };
        row.getCell(2).alignment = { horizontal: "center" };
      }
    }
  }

  // ── Sheet 2：模块统计 ─────────────────────────────────────────────────────────
  const byModule: Record<string, { total: number; success: number; failed: number; timeout: number; crash: number; results: typeof session.results }> = {};
  for (const r of session.results) {
    const m = r.module || "未知";
    byModule[m] ??= { total: 0, success: 0, failed: 0, timeout: 0, crash: 0, results: [] };
    byModule[m].total++;
    byModule[m].results.push(r);
    if (r.status === "success") byModule[m].success++;
    else if (r.status === "failed" || r.status === "interrupted") byModule[m].failed++;
    else if (r.status === "timeout") byModule[m].timeout++;
    else if (r.status === "crash") byModule[m].crash++;
  }

  {
    const ws = wb.addWorksheet("模块统计");
    ws.columns = [
      { width: 28 }, { width: 8 }, { width: 8 }, { width: 8 },
      { width: 8 }, { width: 8 }, { width: 10 },
    ];
    const hdr = ws.addRow(["模块", "总计", "通过", "失败", "超时", "崩溃", "通过率"]);
    hdr.height = 20;
    hdr.eachCell((c) => headerStyle(c));

    for (const [mod, s] of Object.entries(byModule)) {
      const rate = s.total > 0 ? `${Math.round((s.success / s.total) * 100)}%` : "-";
      const row = ws.addRow([mod, s.total, s.success, s.failed, s.timeout, s.crash, rate]);
      row.height = 18;
      row.getCell(1).font = { size: 10, color: { argb: "FF1D252C" } };
      // 通过 列绿色
      row.getCell(3).font = { bold: true, color: { argb: "FF059669" }, size: 10 };
      // 失败/超时/崩溃 红/橙
      if (s.failed > 0) row.getCell(4).font = { bold: true, color: { argb: "FFDC2626" }, size: 10 };
      if (s.timeout > 0) row.getCell(5).font = { bold: true, color: { argb: "FFD97706" }, size: 10 };
      if (s.crash > 0) row.getCell(6).font = { bold: true, color: { argb: "FFEF4444" }, size: 10 };
      // 通过率
      const pr = s.total > 0 ? s.success / s.total : 0;
      row.getCell(7).font = {
        bold: true, size: 10,
        color: { argb: pr >= 0.8 ? "FF059669" : pr >= 0.5 ? "FFD97706" : "FFDC2626" },
      };
      row.eachCell((c) => { c.alignment ??= {}; c.alignment.vertical = "middle"; });
    }
  }

  // ── Sheet 3+：每个模块单独一页（每个测试函数一行，同用例合并单元格）────────────
  for (const [mod, { results }] of Object.entries(byModule)) {
    const ws = wb.addWorksheet(safeName(mod));
    ws.columns = [
      { header: "用例名",   width: 36 },
      { header: "架构",     width: 8  },
      { header: "测试函数", width: 44 },
      { header: "状态",     width: 10 },
      { header: "耗时(ms)", width: 12 },
      { header: "路径",     width: 60 },
    ];

    // 表头样式
    const hdrRow = ws.getRow(1);
    hdrRow.height = 20;
    hdrRow.eachCell((c) => headerStyle(c));

    for (const r of results) {
      const durationMs = r.startTime && r.endTime
        ? new Date(r.endTime).getTime() - new Date(r.startTime).getTime()
        : null;

      // 解析测试函数列表
      type FuncEntry = { name: string; hasFailed: boolean; type: string; durationMs?: number };
      let funcs: FuncEntry[] = [];
      let caseLabel = r.name; // 默认用库名，解析成功后改为测试类名
      if (r.reportContent) {
        try {
          const parsed = parseXmlReport(r.reportContent);
          if (parsed.testCaseName) caseLabel = parsed.testCaseName;
          if (parsed.functions.length > 0) {
            funcs = parsed.functions.map((f) => ({ name: f.name, hasFailed: f.hasFailed, type: f.type, durationMs: f.durationMs }));
          }
        } catch { /* 忽略解析错误 */ }
      }
      if (funcs.length === 0) funcs = [{ name: "-", hasFailed: false, type: r.status }];

      const startRowNum = ws.rowCount + 1; // 当前下一行索引（1-based）

      for (const fn of funcs) {
        const row = ws.addRow([
          caseLabel,
          r.arch || "-",
          fn.name === "-" ? "-" : `${fn.name}${fn.hasFailed ? "  ✗" : "  ✓"}`,
          "",  // 状态：由 applyFuncType 填充
          fn.name === "-" ? (durationMs != null ? durationMs : "-") : (fn.durationMs != null ? fn.durationMs : "-"),
          r.path || "-",
        ]);
        row.height = 20;

        // 用例名
        row.getCell(1).font = { size: 11, color: { argb: "FF1D252C" } };
        row.getCell(1).alignment = { vertical: "middle", wrapText: false };
        // 架构
        row.getCell(2).font = { size: 11 };
        row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
        // 测试函数
        if (fn.hasFailed) {
          row.getCell(3).font = { size: 11, color: { argb: "FFDC2626" } };
        } else {
          row.getCell(3).font = { size: 11, color: { argb: "FF059669" } };
        }
        row.getCell(3).alignment = { vertical: "middle" };
        // 函数级状态（颜色填充）
        applyFuncType(row.getCell(4), fn.name === "-" ? r.status : fn.type);
        // 耗时
        row.getCell(5).font = { size: 11 };
        row.getCell(5).alignment = { vertical: "middle", horizontal: "right" };
        // 路径
        row.getCell(6).font = { size: 11, color: { argb: "FF64748B" } };
        row.getCell(6).alignment = { vertical: "middle", wrapText: false };
      }

      const endRowNum = ws.rowCount; // 最后一行索引（1-based）

      // 多行时只合并用例名、架构、路径（状态和耗时每函数独立）
      if (endRowNum > startRowNum) {
        for (const col of [1, 2, 6]) {
          ws.mergeCells(startRowNum, col, endRowNum, col);
        }
      }
    }

    // 冻结首行
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  }

  // ── 写出 ──────────────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(buf as ArrayBuffer);

  const hapName = session.hapFile.replace(/\.hap$/i, "").replace(/[^\w\u4e00-\u9fa5.-]/g, "_");
  const filename = `测试报告_${hapName}_${session.id.slice(0, 8)}.xlsx`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
