const levels = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const normalizeLevel = (level) => {
  const candidate = String(level ?? "info").toLowerCase();
  return levels[candidate] ? candidate : "info";
};

export const createLogger = ({ level = "info" } = {}) => {
  const threshold = levels[normalizeLevel(level)];

  const shouldLog = (messageLevel) => levels[messageLevel] >= threshold;

  const emit = (messageLevel, message, fields = {}) => {
    if (!shouldLog(messageLevel)) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: messageLevel,
      message,
      ...fields
    };

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  };

  return {
    debug(message, fields) {
      emit("debug", message, fields);
    },
    info(message, fields) {
      emit("info", message, fields);
    },
    warn(message, fields) {
      emit("warn", message, fields);
    },
    error(message, fields) {
      emit("error", message, fields);
    }
  };
};

export const summarizeMatches = (matches) =>
  matches.map((match) => ({
    id: match.id,
    eventName: match.eventName,
    teams: `${match.teamA.displayName} vs ${match.teamB.displayName}`,
    state: match.state,
    startTime:
      match.startTime instanceof Date ? match.startTime.toISOString() : String(match.startTime),
    source: match.source,
    score:
      match.state === "upcoming"
        ? null
        : `${match.score.teamAScore}-${match.score.teamBScore}`,
    mapName: match.score.mapName,
    bestOf: match.score.bestOf
  }));
