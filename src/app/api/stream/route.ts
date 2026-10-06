import { engine } from "@/lib/engine/engine";
import { currentUser } from "@/lib/auth/session";
import type { StreamFrame } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events. The first frame is a full snapshot of every market; each
 * subsequent frame carries only the quotes that moved on that tick, plus the
 * clock, the index and the tape.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  const world = await engine.ensureLoaded();
  // A signed-in viewer's book has to exist before the first frame, or their
  // account block reads as null until the next request happens to create it.
  if (user) await engine.ensureBook(user.id);
  const userId = user?.id ?? null;
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

      send(engine.frame(world, true, userId), "snapshot");
      const unsubscribe = engine.subscribe(userId, (frame: StreamFrame) => send(frame));

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
