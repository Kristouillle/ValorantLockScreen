import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv();

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value == null) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const normalizeString = (value) => {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
};

export const config = {
  host: normalizeString(process.env.HOST) ?? "127.0.0.1",
  port: parseInteger(process.env.PORT, 8787),
  cacheTtlMs: parseInteger(process.env.MATCH_CACHE_TTL_MS, 30_000),
  upstreamPollIntervalMs: parseInteger(process.env.UPSTREAM_POLL_INTERVAL_MS, 30_000),
  simulatorEnabled: parseBoolean(process.env.SIMULATOR_ENABLED, process.env.NODE_ENV !== "production"),
  simulatorUsername: normalizeString(process.env.SIMULATOR_USERNAME),
  simulatorPassword: normalizeString(process.env.SIMULATOR_PASSWORD),
  maxRequestBodyBytes: parseInteger(process.env.MAX_REQUEST_BODY_BYTES, 16_384),
  registrationTtlMs: parseInteger(process.env.REGISTRATION_TTL_MS, 24 * 60 * 60 * 1_000),
  matchRequestLimit: parseInteger(process.env.MATCH_REQUEST_LIMIT, 120),
  matchRequestWindowMs: parseInteger(process.env.MATCH_REQUEST_WINDOW_MS, 60_000),
  registrationRequestLimit: parseInteger(process.env.REGISTRATION_REQUEST_LIMIT, 30),
  registrationRequestWindowMs: parseInteger(process.env.REGISTRATION_REQUEST_WINDOW_MS, 60_000),
  riotScheduleUrl:
    normalizeString(process.env.RIOT_SCHEDULE_URL) ?? "https://valorantesports.com/en-US/schedule",
  riotApiKey: normalizeString(process.env.RIOT_API_KEY),
  logLevel: normalizeString(process.env.LOG_LEVEL) ?? "info",
  logMatchPayloads: parseBoolean(process.env.LOG_MATCH_PAYLOADS, false),
  apnsEnvironment: normalizeString(process.env.APNS_ENVIRONMENT) ?? "sandbox",
  apnsTeamID: normalizeString(process.env.APNS_TEAM_ID),
  apnsKeyID: normalizeString(process.env.APNS_KEY_ID),
  apnsBundleID: normalizeString(process.env.APNS_BUNDLE_ID),
  apnsPrivateKey: normalizePrivateKey(normalizeString(process.env.APNS_PRIVATE_KEY)),
  apnsTopic: normalizeString(process.env.APNS_TOPIC)
};

function normalizePrivateKey(value) {
  if (!value) {
    return null;
  }

  return value.replaceAll("\\n", "\n");
}

function loadDotEnv() {
  const currentFile = fileURLToPath(import.meta.url);
  const envPath = path.resolve(path.dirname(currentFile), "..", ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const fileContents = fs.readFileSync(envPath, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
