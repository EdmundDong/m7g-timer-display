import type {RequestHandler} from './$types';
import * as store from '$lib/server/timerStore';

export const GET: RequestHandler = ({params, request}) => {
  if (!store.getOne(params.id)) return new Response(null, {status: 404});

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const current = store.getOne(params.id);
      if (current) send('snapshot', current);

      unsubscribe = store.subscribeTimer(params.id, (evt) => {
        if (evt.type === 'deleted') {
          send('deleted', {});
          controller.close();
          unsubscribe?.();
          clearInterval(heartbeat);
        } else {
          send('snapshot', evt.timer);
        }
      });

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
