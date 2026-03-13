import test from "node:test";
import assert from "node:assert/strict";
import { MatchFeedService } from "../src/matchFeedService.mjs";
import { SimulatorService } from "../src/simulatorService.mjs";

const baseNow = new Date("2026-03-12T18:00:00Z");
const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

const makeMatch = ({ id, teamAID, teamBID }) => ({
  id,
  eventName: "VCT Test",
  startTime: baseNow,
  teamA: {
    id: teamAID,
    slug: teamAID,
    displayName: teamAID,
    logoAssetName: `team-${teamAID}`
  },
  teamB: {
    id: teamBID,
    slug: teamBID,
    displayName: teamBID,
    logoAssetName: `team-${teamBID}`
  },
  state: "upcoming",
  score: {
    teamAScore: 0,
    teamBScore: 0,
    mapName: null,
    mapWinsA: null,
    mapWinsB: null,
    bestOf: 3
  },
  source: "test",
  lastUpdated: baseNow
});

test("filters matches by requested team IDs", async () => {
  const service = new MatchFeedService({
    scheduleService: {
      async fetchMatches() {
        return [
          makeMatch({ id: "match-1", teamAID: "sentinels", teamBID: "fnatic" }),
          makeMatch({ id: "match-2", teamAID: "paper-rex", teamBID: "g2-esports" })
        ];
      }
    },
    logger: silentLogger,
    now: () => baseNow
  });

  const envelope = await service.getEnvelope({
    teamIds: ["paper-rex"],
    allowPreviewFallback: false
  });

  assert.equal(envelope.matches.length, 1);
  assert.equal(envelope.matches[0].id, "match-2");
});

test("uses preview fixtures when Riot fetch fails and fallback is allowed", async () => {
  const service = new MatchFeedService({
    scheduleService: {
      async fetchMatches() {
        throw new Error("network unavailable");
      }
    },
    logger: silentLogger,
    now: () => baseNow
  });

  const envelope = await service.getEnvelope({
    teamIds: ["paper-rex"],
    allowPreviewFallback: true
  });

  assert.ok(envelope.matches.length > 0);
  assert.ok(envelope.matches.every((match) => {
    return match.teamA.id === "paper-rex" || match.teamB.id === "paper-rex";
  }));
});

test("prepends simulated live match into the filtered feed", async () => {
  const simulatorService = new SimulatorService({
    logger: silentLogger,
    now: () => baseNow
  });

  simulatorService.createOrReplaceMatch({
    teamAID: "sentinels",
    teamBID: "paper-rex",
    eventName: "Simulated Live Test",
    mapName: "Bind",
    bestOf: 3
  });

  const service = new MatchFeedService({
    scheduleService: {
      async fetchMatches() {
        return [
          makeMatch({ id: "real-1", teamAID: "sentinels", teamBID: "fnatic" }),
          makeMatch({ id: "real-2", teamAID: "g2-esports", teamBID: "paper-rex" })
        ];
      }
    },
    simulatorService,
    logger: silentLogger,
    now: () => baseNow
  });

  const result = await service.getFeed({
    teamIds: ["sentinels", "paper-rex"],
    allowPreviewFallback: false
  });

  assert.equal(result.envelope.matches[0].id, "simulated-live-match");
  assert.equal(result.meta.upstreamSource, "simulator+riot.valorantesports.schedule");
  assert.equal(result.envelope.matches.length, 3);
});
