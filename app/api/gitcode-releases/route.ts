import { NextResponse } from "next/server";

const ACCESS_TOKEN = process.env.GITCODE_REPO_TOKEN || "a1S-4miobjD1nczbXiM3Yujj";
const RELEASES_URL = `https://gitcode.com/api/v5/repos/Li-Yaosong/ohostest/releases`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  type: string;
}

export interface Release {
  tag_name: string;
  name: string;
  body: string;
  created_at: string;
  prerelease: boolean;
  hapAssets: ReleaseAsset[];
}

/** GET /api/gitcode-releases — 返回含 .hap 附件的 release 列表 */
export async function GET() {
  try {
    const res = await fetch(`${RELEASES_URL}?access_token=${ACCESS_TOKEN}&per_page=20`, {
      headers: { Accept: "application/json" },
      // 不缓存，每次获取最新
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `GitCode API 错误 (${res.status}): ${text}` }, { status: 502 });
    }

    const releases = (await res.json()) as Array<{
      tag_name: string;
      name: string;
      body: string;
      created_at: string;
      prerelease: boolean;
      assets: ReleaseAsset[];
    }>;

    // 只保留包含 .hap 附件的 release
    const filtered: Release[] = releases
      .map((r) => ({
        tag_name: r.tag_name,
        name: r.name,
        body: r.body,
        created_at: r.created_at,
        prerelease: r.prerelease,
        hapAssets: (r.assets || []).filter(
          (a) => a.type === "attach" && a.name.endsWith(".hap")
        ),
      }))
      .filter((r) => r.hapAssets.length > 0);

    return NextResponse.json({ releases: filtered });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
