import { NextResponse } from "next/server";
import { runShellCommand } from "@/lib/hdc";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { command?: string; bundleName?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const command = (body.command ?? "").trim();
  if (!command) {
    return NextResponse.json({ error: "command 不能为空" }, { status: 400 });
  }

  try {
    const result = await runShellCommand(id, command, body.bundleName);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    return NextResponse.json({
      output,
      exitCode: result.exitCode,
      error: result.exitCode !== 0 ? true : undefined,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message, output: err.message }, { status: 500 });
  }
}
