import { NextResponse } from "next/server";
import { getDeviceList, getHdcVersion } from "@/lib/hdc";

export async function GET() {
  try {
    const [devices, hdcVersion] = await Promise.all([
      getDeviceList(),
      getHdcVersion(),
    ]);
    return NextResponse.json({ devices, hdcVersion });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
