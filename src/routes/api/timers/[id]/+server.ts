import {json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import * as store from '$lib/server/timerStore';
import type {PatchTimerInput} from '$lib/types';

export const PATCH: RequestHandler = async ({params, request}) => {
  try {
    const patch = (await request.json()) as PatchTimerInput;
    const timer = store.patchTimer(params.id, patch);
    return json(timer);
  } catch (err) {
    const status = (err as {status?: number}).status ?? 500;
    return json({error: (err as Error).message}, {status});
  }
};

export const DELETE: RequestHandler = ({params}) => {
  try {
    store.deleteTimer(params.id);
    return new Response(null, {status: 204});
  } catch (err) {
    const status = (err as {status?: number}).status ?? 500;
    return json({error: (err as Error).message}, {status});
  }
};
