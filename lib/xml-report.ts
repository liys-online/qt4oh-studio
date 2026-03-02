/**
 * Qt Test XML 报告解析工具
 * XML 格式：
 *   <TestCase name="tst_XXX">
 *     <TestFunction name="funcName">
 *       <Incident type="pass|fail|xfail|skip" file="" line="0">
 *         <DataTag>...</DataTag>   (可选)
 *       </Incident>
 *       <Duration msecs="..."/>
 *     </TestFunction>
 *     <Duration msecs="..."/>
 *   </TestCase>
 */

export interface XmlTestFunction {
  name: string;
  /** pass / fail / xfail / skip / error */
  type: string;
  /** 失败详情（Message 元素文本） */
  message?: string;
  /** DataTag（数据驱动子用例） */
  dataTags: string[];
  /** Description（xfail 说明等） */
  descriptions: string[];
  /** 单函数总耗时 ms */
  durationMs?: number;
  /** 是否有任何失败/error incident */
  hasFailed: boolean;
}

export interface XmlReportResult {
  testCaseName: string;
  qtVersion?: string;
  totalDurationMs?: number;
  functions: XmlTestFunction[];
  /** 整体是否通过：所有函数均无 fail/error，且不含 xfail 降级 */
  passed: boolean;
}

/** 简易手写 XML 解析（避免引入额外依赖） */
export function parseXmlReport(xml: string): XmlReportResult {
  // 提取 TestCase name
  const testCaseName = xml.match(/<TestCase\s+name="([^"]+)"/)?.[1] ?? "";
  const qtVersion = xml.match(/<QtVersion>([^<]+)<\/QtVersion>/)?.[1];

  // 提取总耗时（最后一个裸 Duration，即 TestCase 级别）
  const durationMatches = [...xml.matchAll(/<Duration\s+msecs="([^"]+)"/g)];
  const totalDurationMs = durationMatches.length > 0
    ? parseFloat(durationMatches[durationMatches.length - 1][1])
    : undefined;

  // 逐个提取 TestFunction 块
  const funcBlocks = [...xml.matchAll(/<TestFunction\s+name="([^"]+)">([\s\S]*?)<\/TestFunction>/g)];
  const functions: XmlTestFunction[] = funcBlocks.map((m) => {
    const name = m[1];
    const body = m[2];

    // 所有 Incident
    const incidents = [...body.matchAll(/<Incident\s+type="([^"]+)"[^>]*>([\s\S]*?)<\/Incident>|<Incident\s+type="([^"]+)"[^/]*\/>/g)];
    const incidentTypes = incidents.map((inc) => (inc[1] || inc[3] || "").toLowerCase());

    // DataTags
    const dataTags = [...body.matchAll(/<DataTag><!\[CDATA\[([^\]]*)\]\]><\/DataTag>|<DataTag>([^<]*)<\/DataTag>/g)]
      .map((dt) => dt[1] ?? dt[2] ?? "");

    // Descriptions
    const descriptions = [...body.matchAll(/<Description><!\[CDATA\[([\s\S]*?)\]\]><\/Description>|<Description>([^<]*)<\/Description>/g)]
      .map((d) => (d[1] ?? d[2] ?? "").trim()).filter(Boolean);

    // Message（失败详情）
    const message = body.match(/<Message>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Message>/)?.[1]
      ?? body.match(/<Message>([^<]*)<\/Message>/)?.[1];

    // Duration
    const durationMatch = body.match(/<Duration\s+msecs="([^"]+)"/);
    const durationMs = durationMatch ? parseFloat(durationMatch[1]) : undefined;

    // 是否失败
    const hasFailed = incidentTypes.some((t) => t === "fail" || t === "error");
    const dominantType = hasFailed ? "fail" : (incidentTypes[0] ?? "pass");

    return { name, type: dominantType, message, dataTags, descriptions, durationMs, hasFailed };
  });

  const passed = functions.length > 0 && !functions.some((f) => f.hasFailed);

  return { testCaseName, qtVersion, totalDurationMs, functions, passed };
}
