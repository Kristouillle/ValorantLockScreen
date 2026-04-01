import http from "node:http";
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";
import { APNSLiveActivityService } from "./apnsLiveActivityService.mjs";
import { createLogger, summarizeMatches } from "./logger.mjs";
import { LiveActivityRegistryService } from "./liveActivityRegistryService.mjs";
import { MatchFeedService } from "./matchFeedService.mjs";
import { RegistrationStore } from "./registrationStore.mjs";
import { FixedWindowRateLimiter } from "./rateLimiterService.mjs";
import { RiotScheduleService } from "./riotScheduleService.mjs";
import { SimulatorService } from "./simulatorService.mjs";
import { WidgetPushRegistryService } from "./widgetPushRegistryService.mjs";

const logger = createLogger({
  level: config.logLevel
});

const registrationStore = new RegistrationStore({
  filePath: config.registrationStorePath,
  logger
});

const liveActivityRegistry = new LiveActivityRegistryService({
  registrationTtlMs: config.registrationTtlMs,
  logger,
  onMutation: persistRegistrations
});

const widgetPushRegistry = new WidgetPushRegistryService({
  registrationTtlMs: config.registrationTtlMs,
  logger,
  onMutation: persistRegistrations
});

const persistedRegistrations = await registrationStore.load();
liveActivityRegistry.restore(persistedRegistrations.liveActivities);
widgetPushRegistry.restore(persistedRegistrations.widgets);

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

const matchRequestRateLimiter = new FixedWindowRateLimiter({
  limit: config.matchRequestLimit,
  windowMs: config.matchRequestWindowMs
});

const registrationRateLimiter = new FixedWindowRateLimiter({
  limit: config.registrationRequestLimit,
  windowMs: config.registrationRequestWindowMs
});

function persistRegistrations() {
  void registrationStore.save({
    liveActivities: liveActivityRegistry.snapshot(),
    widgets: widgetPushRegistry.snapshot()
  });
}

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
        simulatorEnabled: config.simulatorEnabled,
        hasSimulatedMatch: Boolean(simulatorService.getMatch()),
        apnsConfigured: apnsLiveActivityService.isConfigured(),
        widgetPushConfigured: apnsLiveActivityService.isWidgetConfigured(),
        liveActivityRegistrationCount: liveActivityRegistry.count(),
        widgetPushRegistrationCount: widgetPushRegistry.count()
      });
    }

    if (request.method === "GET" && url.pathname === "/simulate") {
      ensureSimulatorEnabled();
      if (!ensureSimulatorAuthorized(request, response)) {
        return;
      }
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
      ensureSimulatorEnabled();
      if (!ensureSimulatorAuthorized(request, response)) {
        return;
      }
      const form = await parseForm(request);
      await handleSimulatorAction(form);
      return redirect(response, "/simulate");
    }

    if (request.method === "POST" && url.pathname === "/api/v1/live-activities/register") {
      const rateLimitHeaders = enforceRateLimit({
        limiter: registrationRateLimiter,
        request,
        response,
        bucket: "live-activity-register"
      });
      if (!rateLimitHeaders) {
        return;
      }

      const body = await parseJSON(request);
      assertLiveActivityRegistration(body);
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
      }, rateLimitHeaders);
    }

    if (request.method === "POST" && url.pathname === "/api/v1/widget-push/register") {
      const rateLimitHeaders = enforceRateLimit({
        limiter: registrationRateLimiter,
        request,
        response,
        bucket: "widget-register"
      });
      if (!rateLimitHeaders) {
        return;
      }

      const body = await parseJSON(request);
      assertWidgetRegistration(body);
      widgetPushRegistry.register({
        token: body.token,
        widgets: body.widgets ?? []
      });

      return sendJSON(response, 200, {
        ok: true,
        apnsConfigured: apnsLiveActivityService.isWidgetConfigured()
      }, rateLimitHeaders);
    }

    if (request.method === "POST" && url.pathname === "/api/v1/live-activities/unregister") {
      const rateLimitHeaders = enforceRateLimit({
        limiter: registrationRateLimiter,
        request,
        response,
        bucket: "live-activity-unregister"
      });
      if (!rateLimitHeaders) {
        return;
      }

      const body = await parseJSON(request);
      assertLiveActivityUnregistration(body);
      liveActivityRegistry.unregister({
        token: body.token ?? null,
        activityID: body.activityID ?? null
      });

      return sendJSON(response, 200, {
        ok: true
      }, rateLimitHeaders);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/matches") {
      const rateLimitHeaders = enforceRateLimit({
        limiter: matchRequestRateLimiter,
        request,
        response,
        bucket: "matches"
      });
      if (!rateLimitHeaders) {
        return;
      }

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
        "X-Valorant-Returned-Match-Count": String(meta.returnedMatchCount),
        ...rateLimitHeaders
      });
    }

    return sendJSON(response, 404, {
      error: "Not found"
    });
  } catch (error) {
    const statusCode = error instanceof HTTPError ? error.statusCode : 502;

    logger.error("request_failed", {
      requestID,
      durationMs: Date.now() - startedAt,
      error: error.message,
      statusCode
    });
    return sendJSON(response, statusCode, {
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
    simulatorEnabled: config.simulatorEnabled,
    simulatorAuthConfigured: isSimulatorAuthConfigured(),
    maxRequestBodyBytes: config.maxRequestBodyBytes,
    registrationTtlMs: config.registrationTtlMs,
    registrationStorePath: config.registrationStorePath,
    matchRequestLimit: config.matchRequestLimit,
    matchRequestWindowMs: config.matchRequestWindowMs,
    registrationRequestLimit: config.registrationRequestLimit,
    registrationRequestWindowMs: config.registrationRequestWindowMs,
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  const body = await readRequestBody(request);

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HTTPError(400, "Invalid JSON body.");
  }
};

const parseForm = async (request) => {
  const body = await readRequestBody(request);
  const params = new URLSearchParams(body);

  return Object.fromEntries(params.entries());
};

const readRequestBody = async (request) => {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > config.maxRequestBodyBytes) {
    throw new HTTPError(413, "Request body too large.");
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > config.maxRequestBodyBytes) {
      throw new HTTPError(413, "Request body too large.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
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

const ensureSimulatorEnabled = () => {
  if (!config.simulatorEnabled) {
    throw new HTTPError(404, "Not found");
  }
};

const ensureSimulatorAuthorized = (request, response) => {
  if (!isSimulatorAuthConfigured()) {
    return true;
  }

  const credentials = parseBasicAuthorization(request.headers.authorization);
  const isAuthorized =
    credentials?.username === config.simulatorUsername &&
    credentials?.password === config.simulatorPassword;

  if (isAuthorized) {
    return true;
  }

  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Valorant Simulator", charset="UTF-8"'
  });
  response.end("Authentication required.");
  return false;
};

const assertLiveActivityRegistration = (body) => {
  if (!isHexToken(body?.token)) {
    throw new HTTPError(400, "Invalid live activity token.");
  }

  if (!isSafeIdentifier(body?.activityID)) {
    throw new HTTPError(400, "Invalid activity ID.");
  }

  if (!isSafeIdentifier(body?.matchID)) {
    throw new HTTPError(400, "Invalid match ID.");
  }

  if (!isTeamIDList(body?.trackedTeamIDs)) {
    throw new HTTPError(400, "Invalid tracked team IDs.");
  }
};

const assertWidgetRegistration = (body) => {
  if (!isHexToken(body?.token)) {
    throw new HTTPError(400, "Invalid widget push token.");
  }

  if (!Array.isArray(body?.widgets) || body.widgets.length > 8) {
    throw new HTTPError(400, "Invalid widget registration payload.");
  }

  for (const widget of body.widgets) {
    if (!isShortText(widget?.kind) || !isShortText(widget?.family)) {
      throw new HTTPError(400, "Invalid widget registration payload.");
    }
  }
};

const assertLiveActivityUnregistration = (body) => {
  const hasToken = body?.token != null;
  const hasActivityID = body?.activityID != null;

  if (!hasToken && !hasActivityID) {
    throw new HTTPError(400, "A token or activity ID is required.");
  }

  if (hasToken && !isHexToken(body.token)) {
    throw new HTTPError(400, "Invalid live activity token.");
  }

  if (hasActivityID && !isSafeIdentifier(body.activityID)) {
    throw new HTTPError(400, "Invalid activity ID.");
  }
};

const isHexToken = (value) =>
  typeof value === "string" && /^[a-f0-9]{32,512}$/iu.test(value.trim());

const isSafeIdentifier = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 160;

const isShortText = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;

const isTeamIDList = (value) =>
  Array.isArray(value) &&
  value.length <= 20 &&
  value.every((teamID) => typeof teamID === "string" && /^[a-z0-9-]{1,64}$/iu.test(teamID));

const enforceRateLimit = ({ limiter, request, response, bucket }) => {
  const result = limiter.consume(`${bucket}:${clientAddress(request)}`);
  const headers = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAtMs / 1_000))
  };

  if (result.allowed) {
    return headers;
  }

  sendJSON(response, 429, {
    error: "Rate limit exceeded."
  }, {
    ...headers,
    "Retry-After": String(result.retryAfterSeconds)
  });
  return null;
};

const clientAddress = (request) => {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim() !== "") {
    return forwardedFor.split(",")[0].trim();
  }

  const cfConnectingIP = request.headers["cf-connecting-ip"];
  if (typeof cfConnectingIP === "string" && cfConnectingIP.trim() !== "") {
    return cfConnectingIP.trim();
  }

  return request.socket.remoteAddress ?? "unknown";
};

const isSimulatorAuthConfigured = () =>
  Boolean(config.simulatorUsername && config.simulatorPassword);

const parseBasicAuthorization = (authorizationHeader) => {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const match = /^Basic\s+(.+)$/iu.exec(authorizationHeader);
  if (!match) {
    return null;
  }

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
};

class HTTPError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

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
          color-scheme: light;
          --bg: #f4faf5;
          --panel: rgba(255, 255, 255, 0.92);
          --panel-soft: rgba(255, 255, 255, 0.84);
          --panel-stroke: rgba(6, 146, 86, 0.16);
          --text: #102118;
          --muted: #5f7368;
          --accent: #069256;
          --accent-strong: #04653c;
          --shadow: 0 24px 60px rgba(15, 53, 31, 0.08);
          --copy-font: "Avenir Next", "Segoe UI", sans-serif;
          --display-font: "Iowan Old Style", "Palatino Linotype", serif;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: var(--copy-font);
          background:
            radial-gradient(circle at top left, rgba(6, 146, 86, 0.08), transparent 26%),
            radial-gradient(circle at 86% 10%, rgba(6, 146, 86, 0.06), transparent 18%),
            linear-gradient(180deg, #f8fcf8 0%, #f2f8f3 100%);
          color: var(--text);
          min-height: 100vh;
          position: relative;
        }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(6, 146, 86, 0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 146, 86, 0.045) 1px, transparent 1px),
            linear-gradient(rgba(6, 146, 86, 0.085) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 146, 86, 0.085) 1px, transparent 1px);
          background-size: 24px 24px, 24px 24px, 120px 120px, 120px 120px;
          background-position: 0 0, 0 0, -1px -1px, -1px -1px;
          opacity: 0.46;
        }
        main {
          position: relative;
          z-index: 1;
          max-width: 1180px;
          margin: 0 auto;
          padding: 36px 20px 80px;
        }
        h1, h2, p { margin: 0; }
        h1, h2 {
          font-family: var(--display-font);
          line-height: 0.96;
          letter-spacing: -0.03em;
        }
        p { color: var(--muted); }
        .hero-card,
        .card {
          border: 1px solid var(--panel-stroke);
          border-radius: 28px;
          background:
            radial-gradient(circle at top left, rgba(255, 255, 255, 0.7), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 250, 246, 0.9)),
            linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(217, 238, 226, 0.34));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.72),
            inset 0 -1px 0 rgba(255, 255, 255, 0.28),
            var(--shadow);
        }
        .hero-card {
          padding: 34px;
          margin-bottom: 24px;
        }
        .eyebrow {
          margin-bottom: 12px;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .hero-card h1 {
          font-size: clamp(2.8rem, 8vw, 4.8rem);
          margin-bottom: 18px;
        }
        .hero-copy {
          display: grid;
          gap: 12px;
          max-width: 860px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 24px;
        }
        .status {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 24px;
        }
        .status span {
          padding: 12px 16px;
          border-radius: 999px;
          border: 1px solid var(--panel-stroke);
          background: rgba(255, 255, 255, 0.72);
          color: var(--muted);
        }
        .status strong {
          color: var(--text);
        }
        .card {
          padding: 28px;
        }
        .card h2 {
          font-size: clamp(1.9rem, 4vw, 2.8rem);
          margin-bottom: 14px;
        }
        label {
          display: grid;
          gap: 8px;
          color: var(--muted);
          font-size: 0.95rem;
          font-weight: 600;
        }
        input, select, button {
          border-radius: 14px;
          border: 1px solid var(--panel-stroke);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 250, 247, 0.84));
          color: var(--text);
          font: inherit;
          padding: 12px 14px;
          width: 100%;
        }
        input:focus, select:focus {
          outline: 2px solid rgba(6, 146, 86, 0.18);
          outline-offset: 2px;
        }
        button {
          width: auto;
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          color: #f7fdf8;
          font-weight: 700;
          cursor: pointer;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        button:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(6, 101, 60, 0.18);
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
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(244, 249, 246, 0.78)),
            linear-gradient(135deg, rgba(255, 255, 255, 0.52), rgba(217, 238, 226, 0.22));
          border: 1px solid var(--panel-stroke);
          border-radius: 16px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64);
        }
        .center {
          text-align: center;
        }
        .score {
          font-size: clamp(2.3rem, 6vw, 3.6rem);
          font-weight: 800;
          line-height: 1;
          font-family: "SF Mono", "Menlo", monospace;
          color: var(--accent-strong);
        }
        .map, .series, .meta {
          color: var(--muted);
        }
        .meta {
          margin-bottom: 18px;
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
        @media (max-width: 720px) {
          main {
            padding-top: 20px;
          }
          .hero-card,
          .card {
            padding: 24px;
          }
          .scoreboard {
            grid-template-columns: 1fr;
          }
          .actions form,
          .actions button,
          .inline-form button {
            width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <main>
        <section class="hero-card">
          <p class="eyebrow">Internal simulator</p>
          <div class="hero-copy">
            <h1>Valorant Match Simulator</h1>
            <p>Inject a fake live match into the backend feed and test app and widget rendering without waiting for real Riot live data.</p>
            <p>For remote Live Activity testing, open the app once so it starts the Live Activity and uploads the push token, then lock the phone and drive the controls below.</p>
          </div>
          <div class="status">
            <span>APNs configured: <strong>${apnsConfigured ? "yes" : "no"}</strong></span>
            <span>Widget push configured: <strong>${widgetPushConfigured ? "yes" : "no"}</strong></span>
            <span>Registered Live Activities: <strong>${registrationCount}</strong></span>
            <span>Registered Widgets: <strong>${widgetRegistrationCount}</strong></span>
          </div>
        </section>
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
