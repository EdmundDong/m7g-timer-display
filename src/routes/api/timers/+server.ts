import {json} from '@sveltejs/kit';
import type {RequestHandler} from '@sveltejs/kit';
import * as store from '$lib/server/timerStore';
import type {CreateTimerInput} from '$lib/types';

export const GET: RequestHandler = () => {
  return json(store.getAll());
};

export const POST: RequestHandler = async ({request}) => {
  try {
    const input = (await request.json()) as CreateTimerInput;
    const timer = store.createTimer(input);
    return json(timer, {status: 201});
  } catch (err) {
    const status = (err as {status?: number}).status ?? 500;
    return json({error: (err as Error).message}, {status});
  }
};
