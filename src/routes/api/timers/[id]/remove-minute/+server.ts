import {json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import * as store from '$lib/server/timerStore';

export const POST: RequestHandler = ({params}) => {
  try {
    return json(store.adjustDuration(params.id, -60));
  } catch (err) {
    const status = (err as {status?: number}).status ?? 500;
    return json({error: (err as Error).message}, {status});
  }
};
