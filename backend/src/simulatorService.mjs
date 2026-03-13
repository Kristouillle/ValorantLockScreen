import { teamCatalog } from "./teamCatalog.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

export class SimulatorService {
  constructor({ now = () => new Date(), logger = silentLogger } = {}) {
    this.now = now;
    this.logger = logger;
    this.simulatedMatch = null;
  }

  listTeams() {
    return teamCatalog;
  }

  getMatch() {
    return this.simulatedMatch ? clone(this.simulatedMatch) : null;
  }

  createOrReplaceMatch({ teamAID, teamBID, eventName, mapName, bestOf }) {
    const teamA = findTeam(teamAID);
    const teamB = findTeam(teamBID);

    if (teamA.id === teamB.id) {
      throw new Error("Select two different teams for the simulated match.");
    }

    const requiredBestOf = normalizeBestOf(bestOf);
    const now = this.now();

    this.simulatedMatch = {
      id: "simulated-live-match",
      eventName: trimmed(eventName) ?? "Simulated Match",
      startTime: now,
      teamA,
      teamB,
      state: "live",
      score: {
        teamAScore: 0,
        teamBScore: 0,
        mapName: trimmed(mapName) ?? "Map 1",
        mapWinsA: 0,
        mapWinsB: 0,
        bestOf: requiredBestOf
      },
      source: "simulator",
      lastUpdated: now
    };

    this.logger.info("simulator_match_created", {
      teamAID: teamA.id,
      teamBID: teamB.id,
      eventName: this.simulatedMatch.eventName,
      bestOf: requiredBestOf
    });

    return this.getMatch();
  }

  clearMatch() {
    this.simulatedMatch = null;
    this.logger.info("simulator_match_cleared");
  }

  incrementRound(side) {
    const match = this.#requireMatch();
    const key = side === "A" ? "teamAScore" : "teamBScore";
    match.score[key] += 1;
    match.lastUpdated = this.now();
    this.logger.info("simulator_round_incremented", {
      side,
      teamAScore: match.score.teamAScore,
      teamBScore: match.score.teamBScore
    });
    return this.getMatch();
  }

  incrementMap(side) {
    const match = this.#requireMatch();
    const scoreKey = side === "A" ? "mapWinsA" : "mapWinsB";
    match.score[scoreKey] = (match.score[scoreKey] ?? 0) + 1;
    match.score.teamAScore = 0;
    match.score.teamBScore = 0;
    match.score.mapName = nextMapName(match.score.mapName);
    match.lastUpdated = this.now();

    const winsA = match.score.mapWinsA ?? 0;
    const winsB = match.score.mapWinsB ?? 0;
    const bestOf = match.score.bestOf ?? 3;
    const requiredWins = Math.max(1, Math.floor(bestOf / 2) + 1);

    if (winsA >= requiredWins || winsB >= requiredWins) {
      match.state = "completed";
      match.score.mapName = "Final";
    }

    this.logger.info("simulator_map_incremented", {
      side,
      mapWinsA: match.score.mapWinsA,
      mapWinsB: match.score.mapWinsB,
      state: match.state
    });
    return this.getMatch();
  }

  renameMap(mapName) {
    const match = this.#requireMatch();
    match.score.mapName = trimmed(mapName) ?? match.score.mapName;
    match.lastUpdated = this.now();
    this.logger.info("simulator_map_renamed", {
      mapName: match.score.mapName
    });
    return this.getMatch();
  }

  setState(state) {
    const match = this.#requireMatch();
    match.state = normalizeState(state);
    match.lastUpdated = this.now();
    this.logger.info("simulator_state_changed", {
      state: match.state
    });
    return this.getMatch();
  }

  #requireMatch() {
    if (!this.simulatedMatch) {
      throw new Error("No simulated match exists yet.");
    }

    return this.simulatedMatch;
  }
}

const findTeam = (teamID) => {
  const team = teamCatalog.find((candidate) => candidate.id === teamID);
  if (!team) {
    throw new Error(`Unknown team: ${teamID}`);
  }
  return team;
};

const normalizeBestOf = (bestOf) => {
  const parsed = Number.parseInt(bestOf ?? "", 10);
  return parsed === 5 ? 5 : 3;
};

const normalizeState = (state) => {
  return ["live", "completed", "upcoming", "delayed"].includes(state) ? state : "live";
};

const trimmed = (value) => {
  const candidate = value?.trim();
  return candidate ? candidate : null;
};

const nextMapName = (currentMapName) => {
  const match = /Map\s+(\d+)/i.exec(currentMapName ?? "");
  if (!match) {
    return "Map 2";
  }

  return `Map ${Number.parseInt(match[1], 10) + 1}`;
};

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
