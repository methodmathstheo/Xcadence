import { engine } from "@/lib/engine/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events. The first frame is a full snapshot of every market; each
 * subsequent frame carries only the quotes that moved on that tick, plus the
 * clock, the index and the tape.
 */
export async function GET(req: Request) {
  const world = await engine.ensureLoaded();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: unknown, event?: string) => {
        if (closed) return;
        try {
          const prefix = event ? `event: ${event}\n` : "";
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send(engine.frame(world, true), "snapshot");
      const unsubscribe = engine.subscribe((frame) => send(frame));

      // Keeps intermediaries from buffering the connection shut when the
      // market is paused and no frames are flowing.
      const keepAlive = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 15_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
