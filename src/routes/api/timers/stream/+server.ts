import type {RequestHandler} from '@sveltejs/kit';
import * as store from '$lib/server/timerStore';

export const GET: RequestHandler = ({request}) => {
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (list: unknown) =>
        controller.enqueue(enc.encode(`event: snapshot\ndata: ${JSON.stringify(list)}\n\n`));

      send(store.getAll());
      unsubscribe = store.subscribeAll(send);
      heartbeat = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 15000);
    },
    cancel() {
      unsubscribe?.();
      clearInterval(heartbeat);
    },
  });

  request.signal.addEventListener('abort', () => {
    unsubscribe?.();
    clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
