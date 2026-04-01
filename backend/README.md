# Backend

Minimal Node backend for the Valorant lock screen app.

The backend reads environment variables from `backend/.env` automatically. A starter template lives at [backend/.env.example](/Users/cviens/Documents/Programmation/Personnal/valorant/backend/.env.example).

## What it does

- polls Riot's official VALORANT Esports schedule page
- normalizes matches into the app's JSON shape
- caches the feed in memory to reduce upstream traffic
- optionally falls back to preview fixtures when the Riot fetch fails
- registers Live Activity push tokens
- registers WidgetKit push tokens
- sends APNs pushes for both Live Activities and widgets when the match feed changes

## Run locally

```bash
cd backend
npm start
```

Environment variables:

- `HOST`
- `PORT`
- `MATCH_CACHE_TTL_MS`
- `UPSTREAM_POLL_INTERVAL_MS`
- `SIMULATOR_ENABLED`
- `SIMULATOR_USERNAME`
- `SIMULATOR_PASSWORD`
- `MAX_REQUEST_BODY_BYTES`
- `REGISTRATION_TTL_MS`
- `REGISTRATION_STORE_PATH`
- `MATCH_REQUEST_LIMIT`
- `MATCH_REQUEST_WINDOW_MS`
- `REGISTRATION_REQUEST_LIMIT`
- `REGISTRATION_REQUEST_WINDOW_MS`
- `RIOT_SCHEDULE_URL`
- `RIOT_API_KEY`
- `LOG_LEVEL`
- `LOG_MATCH_PAYLOADS`
- `APNS_ENVIRONMENT`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY`
- `APNS_TOPIC`

`RIOT_API_KEY` is reserved for future protected Riot endpoints. The current schedule scraper does not require it.

For simulator-only local development, the default `HOST=127.0.0.1` is fine. For testing from a physical iPhone on your LAN, run the backend with `HOST=0.0.0.0` and point the app at your Mac's LAN IP.

## Logging

The backend now logs:

- each incoming request
- cache hit vs cache refresh vs preview fallback
- Riot schedule fetch start/success
- a summary of the matches returned to the app

Set `LOG_MATCH_PAYLOADS=true` if you also want the full JSON envelope printed to stdout.

## Production hardening defaults

- `SIMULATOR_ENABLED` defaults to `false`; enable it explicitly in your local `backend/.env`
- if `SIMULATOR_USERNAME` and `SIMULATOR_PASSWORD` are both set, `/simulate` requires HTTP Basic auth
- POST request bodies are capped by `MAX_REQUEST_BODY_BYTES` (`16384` by default)
- push registrations persist to `REGISTRATION_STORE_PATH` (default: `backend/data/registrations.json`)
- push registrations still expire after `REGISTRATION_TTL_MS` (`86400000`, or 24 hours, by default)
- `GET /api/v1/matches` is rate-limited in process via `MATCH_REQUEST_LIMIT` per `MATCH_REQUEST_WINDOW_MS`
- registration endpoints are rate-limited in process via `REGISTRATION_REQUEST_LIMIT` per `REGISTRATION_REQUEST_WINDOW_MS`

For public deployment, keep `/simulate` disabled unless you explicitly need it for staging or manual testing.
If you keep `/simulate` enabled in production, protect it with simulator credentials.
If your production filesystem is ephemeral, point `REGISTRATION_STORE_PATH` at a persistent volume or disk path.

## Live Activity Pushes

The backend can register Live Activity push tokens and send ActivityKit updates through APNs.

Required APNs env:

- `APNS_ENVIRONMENT=sandbox` for debug/dev signed builds
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY`

`APNS_TOPIC` defaults to `${APNS_BUNDLE_ID}.push-type.liveactivity`.

You can put all of these directly in [backend/.env](/Users/cviens/Documents/Programmation/Personnal/valorant/backend/.env).

The iOS app must also be signed with Push Notifications enabled. The current code uploads the per-activity push token to:

- `POST /api/v1/live-activities/register`
- `POST /api/v1/live-activities/unregister`

## Widget Pushes

The backend can also register WidgetKit push tokens and send widget reload pushes through APNs.

These pushes use the same APNs `.p8` token auth values as the Live Activity path:

- `APNS_ENVIRONMENT`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY`

The widget APNs topic is derived from the app bundle id, not the widget bundle id:

- `${APNS_BUNDLE_ID}.push-type.widgets`

The widget extension uploads push tokens to:

- `POST /api/v1/widget-push/register`

Widget pushes are background widget reload triggers, not visible alert notifications.

## Health and debug checks

`GET /health` includes:

- `apnsConfigured`
- `simulatorEnabled`
- `widgetPushConfigured`
- `liveActivityRegistrationCount`
- `widgetPushRegistrationCount`

`GET /simulate` also shows whether APNs is configured and how many Live Activities / widgets are currently registered.

## API

`GET /health`

`GET /api/v1/matches?teamIds=sentinels,paper-rex&allowPreviewFallback=true`

`GET /simulate`

`POST /api/v1/live-activities/register`

`POST /api/v1/live-activities/unregister`

`POST /api/v1/widget-push/register`

Use `/simulate` in a browser to create an in-memory fake live match, increment round scores, increment map wins, rename the current map, or clear the simulation. The simulated match is merged into `/api/v1/matches`, so the iOS app will see it as if it were part of the live feed.

The response is a `MatchEnvelope` JSON payload with ISO-8601 timestamps so the iOS app can decode it directly.

## Suggested Test Flow

1. Start the backend with APNs env vars configured.
2. Open the app on a physical iPhone and select a team that will match your simulated series.
3. Create a simulated live match at `/simulate`.
4. Refresh the app once so it starts the Live Activity and uploads the push token.
5. Lock the phone.
6. Use the `/simulate` buttons to increment rounds/maps and watch the Live Activity update via APNs.

## Suggested Widget Push Test Flow

1. Start the backend with APNs env vars configured.
2. Install the app on a physical iPhone and add the home widget.
3. Open the app once so the widget can read shared settings and the extension can register its widget push token.
4. Check `GET /health` and confirm `widgetPushRegistrationCount` is greater than `0`.
5. Use `/simulate` to change the live match state.
6. Watch backend logs for:
   - `widget_push_registered`
   - `widget_push_started`
   - `widget_push_failed` if APNs rejects a token
