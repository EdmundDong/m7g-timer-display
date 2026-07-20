import type {PageServerLoad} from './$types';
import * as store from '$lib/server/timerStore';

export const load: PageServerLoad = () => {
  return {timers: store.getAll()};
};
