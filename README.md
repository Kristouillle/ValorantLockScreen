# Valorant Lock Screen

Minimal iPhone app + widget extension for tracking selected Valorant teams on the lock screen, plus an in-repo backend that owns upstream Riot fetches.

## What is included

- SwiftUI iPhone app for selecting teams and reading normalized match data from the backend
- WidgetKit lock screen widget
- ActivityKit Live Activity for one active match
- Shared data models, cache, and repository abstraction
- Local Node backend for Riot schedule polling, caching, and preview fallback
- Unit tests for match prioritization logic

## Current limitations

- Riot's public VALORANT developer APIs do not currently expose a straightforward public pro-esports live match feed in the format this app needs on a dev key.
- The backend currently polls Riot's official VALORANT Esports schedule page, normalizes the matches, and exposes them as JSON for the app.
- True round-by-round live scores still require richer upstream data than the current schedule feed provides.

## Logo assets

Use monochrome template assets so the widget can inherit the lock screen tint color.

Recommended setup in Xcode:

1. Create an image set for each team logo in the asset catalog.
2. Name the image set to match `logoAssetName` in `Shared/Models/Team.swift`.
3. Use a single-color PDF with transparent background.
4. Set `Render As` to `Template Image` in the asset inspector.
5. Keep the artwork square and simple so tinting stays clean.

If you want to keep raw source files outside Xcode first, store them in a folder such as `BrandAssets/` and then import them into the asset catalog manually.

## Setup

1. Start the backend:
   - `cd backend`
   - `npm start`
   - for a physical iPhone on your LAN, run with `HOST=0.0.0.0 npm start`
   - optional APNs config for automatic Live Activity and widget pushes lives in `backend/.env`
2. Open `ValorantLockScreen.xcodeproj` in Xcode.
3. Update the signing team and bundle identifiers.
4. Update the app group identifier in:
   - `ValorantLockScreenApp/ValorantLockScreen.entitlements`
   - `ValorantLockScreenWidget/ValorantLockScreenWidget.entitlements`
   - `Shared/Storage/AppGroup.swift`
5. In Xcode, enable required capabilities:
   - app target: `Push Notifications`, `App Groups`
   - widget target: `Push Notifications`, `App Groups`
6. If you are running on a physical iPhone, point `VALORANT_BACKEND_BASE_URL` at your Mac's LAN IP or a deployed HTTPS backend.
7. Run the app on an iPhone.
   - app + Live Activity flow: iOS 17 or newer
   - widget push refreshes: require the newer widget target deployment version currently configured in the project
8. Leave preview fallback enabled only if you want the backend to serve mock fixtures when Riot fetches fail.

## First successful device test

1. Start the backend and confirm `GET /health` returns `ok: true`.
2. Install the app on a physical iPhone with both app and widget capabilities enabled.
3. Add the home-screen widget manually.
4. Open the app once, select teams, and confirm the backend URL points at your running backend.
5. Check `GET /health` again and verify registration counts:
   - `liveActivityRegistrationCount`
   - `widgetPushRegistrationCount`
6. Open `GET /simulate` in a browser, create a simulated live match, then use it to test:
   - app refresh
   - Live Activity pushes
   - widget push refreshes

## Push behavior

- Live Activity updates come from ActivityKit/APNs and are the main live-score surface.
- Home-screen and lock-screen widgets can refresh via widget pushes, but they are still more budgeted/opportunistic than Live Activities.
- Both push paths use the backend's APNs `.p8` token auth configuration.

## Website

- `website/` contains the static marketing site and legal pages.
- You can preview it locally by opening `website/index.html` directly in a browser.
- `website/privacy.html` and `website/terms.html` are still placeholders and should be replaced before public launch.

## Production notes

- For real distribution, host the backend on HTTPS and point the app at that deployed backend instead of a LAN IP.
- The website, privacy policy, and terms pages are part of the eventual Riot production-key and App Store submission path.

## Project layout

- `Shared/`: models, repositories, persistence, and pure logic
- `backend/`: Node API for Riot schedule fetches and normalized match responses
- `website/`: static product site and legal pages
- `ValorantLockScreenApp/`: host app UI and polling/orchestration
- `ValorantLockScreenWidget/`: lock screen widget and Live Activity UI
- `ValorantLockScreenTests/`: resolver tests
