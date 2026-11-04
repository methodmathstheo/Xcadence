import { engine } from "@/lib/engine/engine";
import { currentUser } from "@/lib/auth/session";
import { claimStream, clientIp, tooMany } from "@/lib/http/limits";
import type { StreamFrame } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events. The first frame is a full snapshot of every market; each
 * subsequent frame carries only the quotes that moved on that tick, plus the
 * clock, the index and the tape.
 */
export async function GET(req: Request) {
  // Each stream holds a response open for as long as the tab is. A handful
  // per address and a ceiling for the venue, released when the tab goes.
  const release = claimStream(clientIp(req));
  if (!release) return tooMany(30_000);

  const user = await currentUser();
  const world = await engine.ensureLoaded();
  // A signed-in viewer's book has to exist before the first frame, or their
  // account block reads as null until the next request happens to create it.
  if (user) await engine.ensureBook(user.id);
  const userId = user?.id ?? null;
  const encoder = new TextEncoder();

  // Every way out runs through cleanup, so the connection slot, the
  // subscription and the timer are released exactly once however the stream
  // ends: the tab closing, the socket dropping, the consumer cancelling, or
  // an enqueue failing because the consumer has already gone.
  let cleanup: () => void = () => release();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let keepAlive: ReturnType<typeof setInterval> | null = null;

      cleanup = () => {
        if (closed) return;
        closed = true;
        release();
        if (keepAlive) clearInterval(keepAlive);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const send = (data: unknown, event?: string) => {
        if (closed) return;
        try {
          const prefix = event ? `event: ${event}\n` : "";
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      req.signal.addEventListener("abort", cleanup);
      send(engine.frame(world, true, userId), "snapshot");
      if (closed) return;
      unsubscribe = engine.subscribe(userId, (frame: StreamFrame) => send(frame));

      // Keeps intermediaries from buffering the connection shut when the
      // market is paused and no frames are flowing.
      keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);
    },
    cancel() {
      cleanup();
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
