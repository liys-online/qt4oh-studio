import { NextResponse } from "next/server";
import { getDeviceInfo } from "@/lib/hdc";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const info = await getDeviceInfo(id);
    return NextResponse.json({ info });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
