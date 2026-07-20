# m7g-timer-display

A countdown timer strip for vMix browser sources, with an operator console and a REST/SSE
API for driving timers from external controllers (e.g. a Bitfocus Companion button panel).

The vMix source page renders a thin colored strip along one edge of an otherwise fully
transparent page: green for the first half of the timer, yellow until the last "red zone"
seconds, red for the red zone. The strip depletes as time passes and disappears entirely
once the remaining time drops below a configurable threshold. Multiple independent, named
timers can run at once, each with its own vMix source URL.

## Stack

SvelteKit + `@sveltejs/adapter-node`. State is held in memory on the server (no database) -
this is a live-show tool, not a persistence layer. Restarting the server wipes all timers
and invalidates any `/source/<id>` URLs already configured in vMix, so don't restart the
server mid-show.

## Running it

```sh
npm install

# development (hot reload)
npm run dev

# production-style run (recommended for an actual show - stable long-running process)
npm run build
npm start          # listens on PORT, default 3000
```

Other scripts: `npm test` (Vitest), `npm run check` (svelte-check, type-checked), `npm run
lint` (Prettier + type-checked ESLint), `npm run format` (Prettier `--write`).

Point vMix's Browser Source input at `http://<host>:<port>/source/<timerId>`. Open
`http://<host>:<port>/` as the operator console to create and control timers.

## Operator console

- Create a timer with a name (or leave it blank - it's auto-named `Timer1`, `Timer2`, ...,
  reusing numbers freed up by deleted timers) and a duration.
- Start / Pause / Resume / Reset, plus `+1:00` / `−1:00` buttons to adjust the running
  duration on the fly (`−1:00` is disabled once removing a minute would hit 0).
- Settings (red zone length, disappear threshold, strip position, erode direction, mirror)
  are editable at any time, including while the timer is running.
- Each timer has a copyable `/source/<id>` URL for pasting into vMix.

### Strip placement and direction

- **Position** - which edge of the screen the strip sits against: `top` (default),
  `bottom`, `left`, or `right`. `top`/`bottom` strips run horizontally; `left`/`right`
  strips run vertically along that edge.
- **Erode from** - which end of the strip's own timeline the elapsed portion disappears
  from first (`left`/`right` for horizontal strips, mapped to `top`/`bottom` for vertical
  ones).
- **Mirror** - flips the strip's timeline (which end is green vs. red, and which end it
  erodes from). It does **not** change which screen edge the strip is anchored to - that's
  controlled by Position alone.

## API

All endpoints are plain JSON over HTTP, no authentication. `id` is a URL-safe slug derived
from the timer's name at creation time (e.g. "Lower Third" -> `lower-third`) and never
changes afterward, even if the timer is renamed later.

| Method | Path                            | Body                                                                               | Notes                                                                                      |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/timers`                   | -                                                                                  | List all timers                                                                            |
| POST   | `/api/timers`                   | `{name?, durationSec, redZoneSec?, disappearSec?, erodeFrom?, position?, mirror?}` | Create a timer. 409 if the derived id is already in use                                    |
| PATCH  | `/api/timers/:id`               | Any subset of the same fields                                                      | Auto-creates `:id` if it doesn't exist yet (see below)                                     |
| DELETE | `/api/timers/:id`               | -                                                                                  | 404 if `:id` doesn't exist - **not** auto-created                                          |
| POST   | `/api/timers/:id/start`         | -                                                                                  | Auto-creates `:id` if unknown, then starts it                                              |
| POST   | `/api/timers/:id/pause`         | -                                                                                  | Auto-creates `:id` if unknown (409, since a fresh timer isn't running)                     |
| POST   | `/api/timers/:id/resume`        | -                                                                                  | Auto-creates `:id` if unknown (409, since a fresh timer isn't paused)                      |
| POST   | `/api/timers/:id/reset`         | -                                                                                  | Auto-creates `:id` if unknown                                                              |
| POST   | `/api/timers/:id/add-minute`    | -                                                                                  | Auto-creates `:id` if unknown, adds 60s to the duration                                    |
| POST   | `/api/timers/:id/remove-minute` | -                                                                                  | Auto-creates `:id` if unknown; 409 if removing 60s would hit 0                             |
| GET    | `/api/timers/stream`            | -                                                                                  | Server-Sent Events, full timer list on every change (console)                              |
| GET    | `/api/timers/:id/stream`        | -                                                                                  | Server-Sent Events, single timer (vMix source page). 404 if unknown - **not** auto-created |

**Auto-create on unknown id:** every endpoint above except `DELETE` and the per-timer
`stream` will create a timer named after `:id` (title-cased, e.g. `lower-third-1` ->
"Lower Third 1") with default settings (60s duration, 10s red zone, 10s disappear, top
position) if `:id` doesn't already exist, then proceed with the requested action. This
means an external controller can drive timers purely by id without the operator creating
them in the console first.

## Bitfocus Companion setup

Companion's built-in **Generic HTTP** module can hit any of the action endpoints directly -
no request body is needed for `start`/`pause`/`resume`/`reset`/`add-minute`/`remove-minute`.

1. Add a **Generic HTTP** connection in Companion, pointed at
   `http://<host-running-this-app>:<port>`.
2. Pick a stable, URL-safe id for the timer you want that button panel to control (e.g.
   `lower-third-1`) and reuse it across every button for that timer.
3. Create one button per action, each firing an HTTP request:
   - **Start**: `POST /api/timers/lower-third-1/start`
   - **Pause**: `POST /api/timers/lower-third-1/pause`
   - **Resume**: `POST /api/timers/lower-third-1/resume`
   - **Reset**: `POST /api/timers/lower-third-1/reset`
   - **+1 min**: `POST /api/timers/lower-third-1/add-minute`
   - **−1 min**: `POST /api/timers/lower-third-1/remove-minute`
4. Because unknown ids auto-create on first use, the very first button press (typically
   Start) brings the timer into existence with sensible defaults - there's no need to
   pre-create it in the operator console. It'll then show up there too, so you can rename
   it or tweak its settings (red zone, position, etc.) at any time.
5. Point the matching vMix Browser Source at `http://<host>:<port>/source/lower-third-1`.

**Limitation:** Companion's Generic HTTP module fires requests but doesn't poll for
feedback, so out of the box a button won't visually reflect the timer's running/paused
state. Live status/feedback would require a custom Companion module (or a community HTTP
polling module) reading `GET /api/timers/lower-third-1` - not set up here.
