import { spawnHilog, HilogOptions } from "@/lib/hdc";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const q = (key: string) => url.searchParams.get(key) ?? undefined;

  const options: HilogOptions = {
    level:  q("level"),
    type:   q("type"),
    tag:    q("tag"),
    domain: q("domain"),
    pid:    q("pid"),
    regex:  q("regex"),
    exit:   url.searchParams.get("exit") === "1",
    tail:   url.searchParams.has("tail") ? Number(url.searchParams.get("tail")) : undefined,
    head:   url.searchParams.has("head") ? Number(url.searchParams.get("head")) : undefined,
  };

  let proc: ReturnType<typeof spawnHilog> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      proc = spawnHilog(
        id,
        options,
        (data) => {
          try {
            controller.enqueue(new TextEncoder().encode(data));
          } catch {
            // controller already closed
          }
        },
        (_code) => {
          try { controller.close(); } catch { /* ignore */ }
        }
      );
    },
    cancel() {
      try { proc?.kill(); } catch { /* ignore */ }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
