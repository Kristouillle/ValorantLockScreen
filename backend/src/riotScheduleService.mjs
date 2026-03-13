import { resolveTeam, normalizeKey } from "./teamCatalog.mjs";

const EVENTS_MARKER = "\"esports\":{\"__typename\":\"EsportsData\",\"events\":[";

export class RiotScheduleService {
  constructor({
    scheduleUrl,
    fetchImpl = fetch,
    logger = silentLogger,
    now = () => new Date()
  }) {
    this.scheduleUrl = scheduleUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.now = now;
  }

  async fetchMatches() {
    this.logger.info("riot_schedule_fetch_started", {
      scheduleUrl: this.scheduleUrl
    });

    const response = await this.fetchImpl(this.scheduleUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      throw new Error(`Riot schedule responded with ${response.status}`);
    }

    const html = await response.text();
    const events = JSON.parse(extractEventsJSON(html));
    const lastUpdated = this.now();

    const matches = events
      .map((event) => makeMatch(event, lastUpdated))
      .filter(Boolean)
      .sort((left, right) => {
        const timeDelta = new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
        return timeDelta === 0 ? left.id.localeCompare(right.id) : timeDelta;
      });

    this.logger.info("riot_schedule_fetch_succeeded", {
      eventCount: events.length,
      matchCount: matches.length,
      generatedAt: lastUpdated.toISOString()
    });

    return matches;
  }
}

const extractEventsJSON = (html) => {
  const markerIndex = html.indexOf(EVENTS_MARKER);
  if (markerIndex === -1) {
    throw new Error("Riot esports schedule format changed");
  }

  const arrayStart = markerIndex + EVENTS_MARKER.length - 1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = arrayStart; index < html.length; index += 1) {
    const character = html[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (character === "\\") {
        escaping = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(arrayStart, index + 1);
      }
    }
  }

  throw new Error("Riot esports events JSON was not closed");
};

const makeMatch = (event, lastUpdated) => {
  if (event.type !== "match" || !Array.isArray(event.matchTeams) || event.matchTeams.length < 2) {
    return null;
  }

  const startTime = new Date(event.startTime);
  if (Number.isNaN(startTime.getTime())) {
    return null;
  }

  const teamAData = event.matchTeams[0];
  const teamBData = event.matchTeams[1];
  const teamA = resolveTeam({ id: teamAData.id, name: teamAData.name });
  const teamB = resolveTeam({ id: teamBData.id, name: teamBData.name });
  const state = matchStateFor(event);
  const bestOf = event.match?.strategy?.count ?? null;
  const winsA = teamAData.result?.gameWins ?? 0;
  const winsB = teamBData.result?.gameWins ?? 0;
  const showSeriesScore = state === "live" || state === "completed";

  return {
    id: event.id,
    eventName: trimmed(event.tournament?.name) || event.league?.name || "VALORANT Esports",
    startTime,
    teamA,
    teamB,
    state,
    score: {
      teamAScore: showSeriesScore ? winsA : 0,
      teamBScore: showSeriesScore ? winsB : 0,
      mapName: currentMapLabel(event.match, state),
      mapWinsA: showSeriesScore && bestOf ? winsA : null,
      mapWinsB: showSeriesScore && bestOf ? winsB : null,
      bestOf
    },
    source: "riot.valorantesports.schedule",
    lastUpdated
  };
};

const matchStateFor = (event) => {
  const rawMatchState = normalizeKey(event.match?.state ?? "");
  const rawEventState = normalizeKey(event.state ?? "");
  const gameStates = (event.match?.games ?? []).map((game) => normalizeKey(game.state));

  if (rawMatchState === "inprogress" || gameStates.includes("inprogress")) {
    return "live";
  }
  if (rawMatchState === "completed" || rawEventState === "completed") {
    return "completed";
  }
  if (
    rawMatchState === "rescheduled" ||
    rawMatchState === "postponed" ||
    rawEventState === "rescheduled"
  ) {
    return "delayed";
  }
  if (rawMatchState === "unstarted" || rawEventState === "unstarted") {
    return "upcoming";
  }

  return "unknown";
};

const currentMapLabel = (match, state) => {
  if (state !== "live" || !Array.isArray(match?.games)) {
    return null;
  }

  const inProgress = match.games.find((game) => normalizeKey(game.state) === "inprogress");
  if (inProgress) {
    return `Map ${inProgress.number}`;
  }

  const startedGames = match.games.filter((game) => normalizeKey(game.state) !== "unstarted");
  const mostRecentStarted = startedGames[startedGames.length - 1];
  return mostRecentStarted ? `Map ${mostRecentStarted.number}` : null;
};

const trimmed = (value) => {
  const candidate = value?.trim();
  return candidate ? candidate : null;
};

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
