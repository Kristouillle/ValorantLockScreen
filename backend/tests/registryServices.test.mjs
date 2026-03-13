import test from "node:test";
import assert from "node:assert/strict";
import { LiveActivityRegistryService } from "../src/liveActivityRegistryService.mjs";
import { FixedWindowRateLimiter } from "../src/rateLimiterService.mjs";
import { WidgetPushRegistryService } from "../src/widgetPushRegistryService.mjs";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

test("live activity registrations expire after the configured TTL", () => {
  let nowMs = 1_000;
  const registry = new LiveActivityRegistryService({
    registrationTtlMs: 100,
    logger: silentLogger,
    now: () => nowMs
  });

  registry.register({
    token: "a".repeat(64),
    activityID: "activity-1",
    matchID: "match-1",
    trackedTeamIDs: ["sentinels"]
  });

  nowMs = 1_050;
  assert.equal(registry.count(), 1);

  nowMs = 1_101;
  assert.equal(registry.count(), 0);
});

test("widget registrations return only fresh entries", () => {
  let nowMs = 2_000;
  const registry = new WidgetPushRegistryService({
    registrationTtlMs: 100,
    logger: silentLogger,
    now: () => nowMs
  });

  registry.register({
    token: "b".repeat(64),
    widgets: [{ kind: "ValorantScoreWidget", family: "systemSmall" }]
  });

  nowMs = 2_050;
  registry.register({
    token: "c".repeat(64),
    widgets: [{ kind: "ValorantScoreWidget", family: "systemMedium" }]
  });

  nowMs = 2_101;
  assert.deepEqual(
    registry.registrations().map((entry) => entry.token),
    ["c".repeat(64)]
  );
});

test("rate limiter blocks requests above the configured limit until the window resets", () => {
  let nowMs = 10_000;
  const limiter = new FixedWindowRateLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => nowMs
  });

  assert.equal(limiter.consume("matches:127.0.0.1").allowed, true);
  assert.equal(limiter.consume("matches:127.0.0.1").allowed, true);

  const blocked = limiter.consume("matches:127.0.0.1");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);

  nowMs = 11_001;
  const reset = limiter.consume("matches:127.0.0.1");
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 1);
});
