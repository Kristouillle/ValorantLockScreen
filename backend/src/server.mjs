import http from "node:http";
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";
import { APNSLiveActivityService } from "./apnsLiveActivityService.mjs";
import { createLogger, summarizeMatches } from "./logger.mjs";
import { LiveActivityRegistryService } from "./liveActivityRegistryService.mjs";
import { MatchFeedService } from "./matchFeedService.mjs";
import { RiotScheduleService } from "./riotScheduleService.mjs";
import { SimulatorService } from "./simulatorService.mjs";
import { WidgetPushRegistryService } from "./widgetPushRegistryService.mjs";

const logger = createLogger({
  level: config.logLevel
});

const liveActivityRegistry = new LiveActivityRegistryService({
  logger
});

const widgetPushRegistry = new WidgetPushRegistryService({
  logger
});

const apnsLiveActivityService = new APNSLiveActivityService({
  environment: config.apnsEnvironment,
  teamID: config.apnsTeamID,
  keyID: config.apnsKeyID,
  bundleID: config.apnsBundleID,
  privateKey: config.apnsPrivateKey,
  topic: config.apnsTopic,
  logger
});

const scheduleService = new RiotScheduleService({
  scheduleUrl: config.riotScheduleUrl,
  logger
});

const simulatorService = new SimulatorService({
  logger
});

const matchFeedService = new MatchFeedService({
  scheduleService,
  simulatorService,
  cacheTtlMs: config.cacheTtlMs,
  logger
});

const server = http.createServer(async (request, response) => {
  const requestID = randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    logger.info("request_started", {
      requestID,
      method: request.method,
      path: url.pathname,
      search: url.search
    });

    if (request.method === "OPTIONS") {
      return sendJSON(response, 204, null);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJSON(response, 200, {
        ok: true,
        service: "valorant-lock-screen-backend",
        now: new Date(),
        cacheTtlMs: config.cacheTtlMs,
        usingProtectedRiotKey: Boolean(config.riotApiKey),
        hasSimulatedMatch: Boolean(simulatorService.getMatch()),
        apnsConfigured: apnsLiveActivityService.isConfigured(),
        widgetPushConfigured: apnsLiveActivityService.isWidgetConfigured(),
        liveActivityRegistrationCount: liveActivityRegistry.count(),
        widgetPushRegistrationCount: widgetPushRegistry.count()
      });
    }

    if (request.method === "GET" && url.pathname === "/simulate") {
      return sendHTML(response, 200, renderSimulatorPage({
        teams: simulatorService.listTeams(),
        simulatedMatch: simulatorService.getMatch(),
        apnsConfigured: apnsLiveActivityService.isConfigured(),
        widgetPushConfigured: apnsLiveActivityService.isWidgetConfigured(),
        registrationCount: liveActivityRegistry.count(),
        widgetRegistrationCount: widgetPushRegistry.count()
      }));
    }

    if (request.method === "POST" && url.pathname === "/simulate") {
      const form = await parseForm(request);
      await handleSimulatorAction(form);
      return redirect(response, "/simulate");
    }

    if (request.method === "POST" && url.pathname === "/api/v1/live-activities/register") {
      const body = await parseJSON(request);
      const registration = liveActivityRegistry.register({
        token: body.token,
        activityID: body.activityID,
        matchID: body.matchID,
        trackedTeamIDs: body.trackedTeamIDs ?? []
      });

      logger.info("live_activity_register_request_completed", {
        requestID,
        activityID: registration.activityID,
        matchID: registration.matchID
      });

      return sendJSON(response, 200, {
        ok: true,
        apnsConfigured: apnsLiveActivityService.isConfigured()
      });
    }

    if (request.method === "POST" && url.pathname === "/api/v1/widget-push/register") {
      const body = await parseJSON(request);
      widgetPushRegistry.register({
        token: body.token,
        widgets: body.widgets ?? []
      });

      return sendJSON(response, 200, {
        ok: true,
        apnsConfigured: apnsLiveActivityService.isWidgetConfigured()
      });
    }

    if (request.method === "POST" && url.pathname === "/api/v1/live-activities/unregister") {
      const body = await parseJSON(request);
      liveActivityRegistry.unregister({
        token: body.token ?? null,
        activityID: body.activityID ?? null
      });

      return sendJSON(response, 200, {
        ok: true
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/matches") {
      const teamIDs = parseTeamIDs(url.searchParams);
      const allowPreviewFallback = parseBoolean(url.searchParams.get("allowPreviewFallback"));
      const { envelope, meta } = await matchFeedService.getFeed({
        teamIds: teamIDs,
        allowPreviewFallback
      });

      logger.info("match_feed_served", {
        requestID,
        durationMs: Date.now() - startedAt,
        requestedTeamIDs: meta.requestedTeamIDs,
        returnedMatchCount: meta.returnedMatchCount,
        totalMatchCount: meta.totalMatchCount,
        upstreamSource: meta.upstreamSource,
        cacheStatus: meta.cacheStatus,
        generatedAt:
          meta.generatedAt instanceof Date ? meta.generatedAt.toISOString() : meta.generatedAt
      });

      logger.info("match_feed_summary", {
        requestID,
        matches: summarizeMatches(envelope.matches)
      });

      if (config.logMatchPayloads) {
        logger.debug("match_feed_payload", {
          requestID,
          envelope
        });
      }

      return sendJSON(response, 200, envelope, {
        "Cache-Control": "public, max-age=15, stale-while-revalidate=15",
        "X-Valorant-Upstream-Source": meta.upstreamSource,
        "X-Valorant-Cache-Status": meta.cacheStatus,
        "X-Valorant-Returned-Match-Count": String(meta.returnedMatchCount)
      });
    }

    return sendJSON(response, 404, {
      error: "Not found"
    });
  } catch (error) {
    logger.error("request_failed", {
      requestID,
      durationMs: Date.now() - startedAt,
      error: error.message
    });
    return sendJSON(response, 502, {
      error: error.message
    });
  }
});

server.listen(config.port, config.host, () => {
  logger.info("server_started", {
    host: config.host,
    port: config.port,
    cacheTtlMs: config.cacheTtlMs,
    upstreamPollIntervalMs: config.upstreamPollIntervalMs,
    riotScheduleUrl: config.riotScheduleUrl,
    logLevel: config.logLevel,
    logMatchPayloads: config.logMatchPayloads,
    apnsConfigured: apnsLiveActivityService.isConfigured(),
    widgetPushConfigured: apnsLiveActivityService.isWidgetConfigured(),
    apnsEnvironment: config.apnsEnvironment,
    apnsTopic: apnsLiveActivityService.topic,
    widgetApnsTopic: apnsLiveActivityService.widgetTopic,
    apnsConfigPresence: {
      teamID: Boolean(config.apnsTeamID),
      keyID: Boolean(config.apnsKeyID),
      bundleID: Boolean(config.apnsBundleID),
      privateKey: Boolean(config.apnsPrivateKey),
      topic: Boolean(apnsLiveActivityService.topic)
    }
  });
});

const upstreamPollTimer = setInterval(() => {
  void pollUpstreamAndPush();
}, config.upstreamPollIntervalMs);
upstreamPollTimer.unref?.();

process.on("SIGINT", () => {
  clearInterval(upstreamPollTimer);
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  clearInterval(upstreamPollTimer);
  server.close(() => process.exit(0));
});

const sendJSON = (response, statusCode, payload, extraHeaders = {}) => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(payload === null ? "" : JSON.stringify(payload));
};

const sendHTML = (response, statusCode, payload, extraHeaders = {}) => {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    ...extraHeaders
  });
  response.end(payload);
};

const redirect = (response, location) => {
  response.writeHead(303, {
    Location: location
  });
  response.end("");
};

const parseTeamIDs = (searchParams) => {
  const values = searchParams.getAll("teamIds");

  if (values.length === 0) {
    return [];
  }

  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
};

const parseBoolean = (value) => ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());

const parseJSON = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
};

const parseForm = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  const params = new URLSearchParams(body);

  return Object.fromEntries(params.entries());
};

const handleSimulatorAction = (form) => {
  let result = null;

  switch (form.action) {
    case "create":
      result = {
        event: "update",
        match: simulatorService.createOrReplaceMatch({
          teamAID: form.teamAID,
          teamBID: form.teamBID,
          eventName: form.eventName,
          mapName: form.mapName,
          bestOf: form.bestOf
        })
      };
      break;
    case "roundA":
      result = {
        event: "update",
        match: simulatorService.incrementRound("A")
      };
      break;
    case "roundB":
      result = {
        event: "update",
        match: simulatorService.incrementRound("B")
      };
      break;
    case "mapA":
      result = makeSimulatorMatchResult(simulatorService.incrementMap("A"));
      break;
    case "mapB":
      result = makeSimulatorMatchResult(simulatorService.incrementMap("B"));
      break;
    case "renameMap":
      result = {
        event: "update",
        match: simulatorService.renameMap(form.mapName)
      };
      break;
    case "setState":
      result = {
        event: form.state === "completed" ? "end" : "update",
        match: simulatorService.setState(form.state)
      };
      break;
    case "clear": {
      const existingMatch = simulatorService.getMatch();
      simulatorService.clearMatch();
      if (existingMatch) {
        result = {
          event: "end",
          match: existingMatch
        };
      }
      break;
    }
    default:
      throw new Error(`Unknown simulator action: ${form.action}`);
  }

  if (result?.match) {
    return pushMatchUpdate(result.match, result.event);
  }

  return Promise.resolve();
};

const renderSimulatorPage = ({
  teams,
  simulatedMatch,
  apnsConfigured,
  widgetPushConfigured,
  registrationCount,
  widgetRegistrationCount
}) => {
  const teamOptions = teams
    .map((team) => `<option value="${escapeHTML(team.id)}">${escapeHTML(team.displayName)}</option>`)
    .join("");

  const current = simulatedMatch
    ? `
      <section class="card">
        <h2>Current Simulated Match</h2>
        <p class="meta">${escapeHTML(simulatedMatch.eventName)} • ${escapeHTML(simulatedMatch.state.toUpperCase())}</p>
        <div class="scoreboard">
          <div class="team">
            <strong>${escapeHTML(simulatedMatch.teamA.displayName)}</strong>
            <span>Rounds: ${simulatedMatch.score.teamAScore}</span>
            <span>Maps: ${simulatedMatch.score.mapWinsA ?? 0}</span>
          </div>
          <div class="center">
            <div class="score">${simulatedMatch.score.teamAScore} - ${simulatedMatch.score.teamBScore}</div>
            <div class="map">${escapeHTML(simulatedMatch.score.mapName ?? "Unknown Map")}</div>
            <div class="series">BO${simulatedMatch.score.bestOf ?? 3}</div>
          </div>
          <div class="team">
            <strong>${escapeHTML(simulatedMatch.teamB.displayName)}</strong>
            <span>Rounds: ${simulatedMatch.score.teamBScore}</span>
            <span>Maps: ${simulatedMatch.score.mapWinsB ?? 0}</span>
          </div>
        </div>

        <div class="actions">
          ${button("roundA", `${simulatedMatch.teamA.displayName} +1 Round`)}
          ${button("roundB", `${simulatedMatch.teamB.displayName} +1 Round`)}
          ${button("mapA", `${simulatedMatch.teamA.displayName} +1 Map`)}
          ${button("mapB", `${simulatedMatch.teamB.displayName} +1 Map`)}
          ${button("setState", "Mark Live", "live")}
          ${button("setState", "Mark Completed", "completed")}
          ${button("setState", "Mark Upcoming", "upcoming")}
          ${button("clear", "Clear Simulation")}
        </div>

        <form method="post" class="inline-form">
          <input type="hidden" name="action" value="renameMap" />
          <label>
            Map name
            <input type="text" name="mapName" value="${escapeHTML(simulatedMatch.score.mapName ?? "")}" />
          </label>
          <button type="submit">Rename Map</button>
        </form>
      </section>
    `
    : `
      <section class="card">
        <h2>No simulated match</h2>
        <p>Create one below. It will be merged into the normal backend feed and returned to the app.</p>
      </section>
    `;

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Valorant Match Simulator</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #10151d;
          --panel: #192231;
          --panel-alt: #243246;
          --text: #f4f7fb;
          --muted: #9eb0c8;
          --accent: #69d4ff;
          --accent-2: #74f0b8;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          background: radial-gradient(circle at top, #20304a 0%, var(--bg) 42%);
          color: var(--text);
          min-height: 100vh;
        }
        main {
          max-width: 1080px;
          margin: 0 auto;
          padding: 32px 20px 80px;
        }
        h1, h2 { margin: 0 0 12px; }
        p { color: var(--muted); }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
        }
        .status {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin: 0 0 20px;
          color: var(--muted);
        }
        .card {
          background: rgba(25, 34, 49, 0.92);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 20px;
          backdrop-filter: blur(12px);
        }
        label {
          display: grid;
          gap: 6px;
          color: var(--muted);
          font-size: 14px;
        }
        input, select, button {
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: var(--panel-alt);
          color: var(--text);
          font: inherit;
          padding: 12px 14px;
        }
        button {
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          color: #06101d;
          font-weight: 700;
          cursor: pointer;
        }
        form.stack {
          display: grid;
          gap: 14px;
        }
        .scoreboard {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 18px;
          align-items: center;
          margin: 18px 0;
        }
        .team {
          display: grid;
          gap: 8px;
          padding: 16px;
          background: rgba(255,255,255,0.04);
          border-radius: 16px;
        }
        .center {
          text-align: center;
        }
        .score {
          font-size: 40px;
          font-weight: 800;
          line-height: 1;
        }
        .map, .series, .meta {
          color: var(--muted);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 18px 0;
        }
        .actions form {
          margin: 0;
        }
        .inline-form {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: end;
        }
        .inline-form label {
          flex: 1 1 220px;
        }
      </style>
    </head>
    <body>
      <main>
        <h1>Valorant Match Simulator</h1>
        <p>Use this to inject a fake live match into the backend feed and test app/widget rendering without waiting for real Riot live data.</p>
        <p>For remote Live Activity testing, open the app once so it starts the Live Activity and uploads the push token, then lock the phone and use the controls below.</p>
        <div class="status">
          <span>APNs configured: <strong>${apnsConfigured ? "yes" : "no"}</strong></span>
          <span>Widget push configured: <strong>${widgetPushConfigured ? "yes" : "no"}</strong></span>
          <span>Registered Live Activities: <strong>${registrationCount}</strong></span>
          <span>Registered Widgets: <strong>${widgetRegistrationCount}</strong></span>
        </div>
        <div class="grid">
          <section class="card">
            <h2>Create or Replace Simulated Match</h2>
            <form method="post" class="stack">
              <input type="hidden" name="action" value="create" />
              <label>
                Team A
                <select name="teamAID">${teamOptions}</select>
              </label>
              <label>
                Team B
                <select name="teamBID">${teamOptions}</select>
              </label>
              <label>
                Event name
                <input type="text" name="eventName" value="Simulated Live Test" />
              </label>
              <label>
                Current map
                <input type="text" name="mapName" value="Ascent" />
              </label>
              <label>
                Series length
                <select name="bestOf">
                  <option value="3">BO3</option>
                  <option value="5">BO5</option>
                </select>
              </label>
              <button type="submit">Start Simulated Match</button>
            </form>
          </section>
          ${current}
        </div>
      </main>
    </body>
  </html>`;
};

const button = (action, label, stateValue = "") => `
  <form method="post">
    <input type="hidden" name="action" value="${escapeHTML(action)}" />
    ${stateValue ? `<input type="hidden" name="state" value="${escapeHTML(stateValue)}" />` : ""}
    <button type="submit">${escapeHTML(label)}</button>
  </form>
`;

const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

async function pollUpstreamAndPush() {
  try {
    const result = await matchFeedService.refreshFeed({
      allowPreviewFallback: false,
      force: true
    });

    if (result.changedMatches.length === 0) {
      return;
    }

    logger.info("upstream_poll_detected_changes", {
      changedMatchCount: result.changedMatches.length
    });

    for (const match of result.changedMatches) {
      await pushMatchUpdate(match, match.state === "completed" ? "end" : "update");
    }
  } catch (error) {
    logger.error("upstream_poll_failed", {
      error: error.message
    });
  }
}

const makeSimulatorMatchResult = (match) => ({
  event: match.state === "completed" ? "end" : "update",
  match
});

async function pushMatchUpdate(match, event) {
  const registrations = liveActivityRegistry.registrationsForMatch(match.id);
  const widgetRegistrations = widgetPushRegistry.registrations();

  if (registrations.length === 0) {
    logger.info("live_activity_push_skipped_no_registrations", {
      matchID: match.id,
      event
    });
  } else {
    logger.info("live_activity_push_started", {
      matchID: match.id,
      event,
      registrationCount: registrations.length
    });
  }

  for (const registration of registrations) {
    try {
      const result = await apnsLiveActivityService.sendMatchUpdate({
        token: registration.token,
        match,
        event
      });

      if (result.delivered === false && [400, 410].includes(result.status)) {
        liveActivityRegistry.unregister({
          token: registration.token,
          activityID: registration.activityID
        });
      }
    } catch (error) {
      logger.error("live_activity_push_failed", {
        matchID: match.id,
        activityID: registration.activityID,
        error: error.message
      });
    }
  }

  if (widgetRegistrations.length === 0) {
    logger.info("widget_push_skipped_no_registrations", {
      matchID: match.id,
      event
    });
    return;
  }

  logger.info("widget_push_started", {
    matchID: match.id,
    event,
    registrationCount: widgetRegistrations.length
  });

  for (const registration of widgetRegistrations) {
    try {
      const result = await apnsLiveActivityService.sendWidgetReload({
        token: registration.token
      });

      if (result.delivered === false && [400, 410].includes(result.status)) {
        widgetPushRegistry.unregister({
          token: registration.token
        });
      }
    } catch (error) {
      logger.error("widget_push_failed", {
        matchID: match.id,
        error: error.message
      });
    }
  }
}
