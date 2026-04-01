import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RegistrationStore } from "../src/registrationStore.mjs";
import { LiveActivityRegistryService } from "../src/liveActivityRegistryService.mjs";
import { WidgetPushRegistryService } from "../src/widgetPushRegistryService.mjs";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

test("registration store saves and restores live activity and widget registrations", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "valorant-registrations-"));
  const filePath = path.join(tempDirectory, "registrations.json");

  const store = new RegistrationStore({
    filePath,
    logger: silentLogger
  });

  const liveRegistry = new LiveActivityRegistryService({
    logger: silentLogger
  });
  const widgetRegistry = new WidgetPushRegistryService({
    logger: silentLogger
  });

  liveRegistry.register({
    token: "a".repeat(64),
    activityID: "activity-1",
    matchID: "match-1",
    trackedTeamIDs: ["sentinels"]
  });
  widgetRegistry.register({
    token: "b".repeat(64),
    widgets: [{ kind: "ValorantScoreWidget", family: "systemMedium" }]
  });

  await store.save({
    liveActivities: liveRegistry.snapshot(),
    widgets: widgetRegistry.snapshot()
  });

  const restoredPayload = await store.load();

  const restoredLiveRegistry = new LiveActivityRegistryService({
    logger: silentLogger
  });
  const restoredWidgetRegistry = new WidgetPushRegistryService({
    logger: silentLogger
  });

  restoredLiveRegistry.restore(restoredPayload.liveActivities);
  restoredWidgetRegistry.restore(restoredPayload.widgets);

  assert.equal(restoredLiveRegistry.count(), 1);
  assert.equal(restoredWidgetRegistry.count(), 1);
  assert.equal(restoredLiveRegistry.registrationsForMatch("match-1")[0]?.activityID, "activity-1");
  assert.equal(restoredWidgetRegistry.registrations()[0]?.widgets[0]?.family, "systemMedium");
});
