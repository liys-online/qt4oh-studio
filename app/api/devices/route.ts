import { NextResponse } from "next/server";
import { getDeviceList } from "@/lib/hdc";

export async function GET() {
  try {
    const devices = getDeviceList();
    return NextResponse.json({ devices });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
