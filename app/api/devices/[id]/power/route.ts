import { NextResponse } from "next/server";
import { runPowerShell } from "@/lib/hdc";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: {
    action: "wakeup" | "suspend" | "setmode" | "timeout";
    mode?: number;
    timeoutMs?: number;
    restore?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  if (!body.action) {
    return NextResponse.json({ error: "action 不能为空" }, { status: 400 });
  }

  try {
    const result = await runPowerShell(id, body.action, {
      mode:      body.mode,
      timeoutMs: body.timeoutMs,
      restore:   body.restore,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ success: false, output: err.message }, { status: 500 });
  }
}
