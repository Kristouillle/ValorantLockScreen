import { teamCatalog } from "./teamCatalog.mjs";

const teamById = (id) => {
  const team = teamCatalog.find((candidate) => candidate.id === id);
  if (!team) {
    throw new Error(`Missing team in preview catalog: ${id}`);
  }
  return team;
};

const makeMatch = ({ id, eventName, offsetMs, teamAID, teamBID, state, score, now }) => ({
  id,
  eventName,
  startTime: new Date(now.getTime() + offsetMs),
  teamA: teamById(teamAID),
  teamB: teamById(teamBID),
  state,
  score,
  source: "preview",
  lastUpdated: now
});

export const createPreviewMatches = (now = new Date()) => [
  makeMatch({
    id: "preview-sen-fnc-live",
    eventName: "VCT Masters Toronto",
    offsetMs: -2_400_000,
    teamAID: "sentinels",
    teamBID: "fnatic",
    state: "live",
    score: {
      teamAScore: 11,
      teamBScore: 9,
      mapName: "Ascent",
      mapWinsA: 1,
      mapWinsB: 0,
      bestOf: 3
    },
    now
  }),
  makeMatch({
    id: "preview-prx-g2-live",
    eventName: "VCT Pacific",
    offsetMs: -1_800_000,
    teamAID: "paper-rex",
    teamBID: "g2-esports",
    state: "live",
    score: {
      teamAScore: 7,
      teamBScore: 6,
      mapName: "Icebox",
      mapWinsA: 0,
      mapWinsB: 1,
      bestOf: 3
    },
    now
  }),
  makeMatch({
    id: "preview-prx-th-upcoming",
    eventName: "VCT Champions",
    offsetMs: 5_400_000,
    teamAID: "paper-rex",
    teamBID: "team-heretics",
    state: "upcoming",
    score: {
      teamAScore: 0,
      teamBScore: 0,
      mapName: null,
      mapWinsA: null,
      mapWinsB: null,
      bestOf: 3
    },
    now
  }),
  makeMatch({
    id: "preview-sen-geng-upcoming",
    eventName: "VCT Americas",
    offsetMs: 8_100_000,
    teamAID: "sentinels",
    teamBID: "gen-g",
    state: "upcoming",
    score: {
      teamAScore: 0,
      teamBScore: 0,
      mapName: null,
      mapWinsA: null,
      mapWinsB: null,
      bestOf: 3
    },
    now
  }),
  makeMatch({
    id: "preview-fnc-g2-completed",
    eventName: "VCT EMEA",
    offsetMs: -20_000_000,
    teamAID: "fnatic",
    teamBID: "g2-esports",
    state: "completed",
    score: {
      teamAScore: 2,
      teamBScore: 1,
      mapName: "Lotus",
      mapWinsA: 2,
      mapWinsB: 1,
      bestOf: 3
    },
    now
  })
];

export const createPreviewEnvelope = (now = new Date()) => ({
  generatedAt: now,
  matches: createPreviewMatches(now)
});
