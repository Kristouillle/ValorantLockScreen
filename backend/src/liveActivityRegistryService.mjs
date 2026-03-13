export class LiveActivityRegistryService {
  constructor({ logger = silentLogger } = {}) {
    this.logger = logger;
    this.registrationsByToken = new Map();
  }

  register({ token, activityID, matchID, trackedTeamIDs = [] }) {
    const registration = {
      token,
      activityID,
      matchID,
      trackedTeamIDs,
      lastSeenAt: new Date().toISOString()
    };

    this.registrationsByToken.set(token, registration);
    this.logger.info("live_activity_registered", {
      activityID,
      matchID,
      trackedTeamCount: trackedTeamIDs.length,
      registrationCount: this.count()
    });

    return registration;
  }

  unregister({ token, activityID = null }) {
    if (token) {
      this.registrationsByToken.delete(token);
    } else if (activityID) {
      const existing = [...this.registrationsByToken.values()].find((entry) => entry.activityID === activityID);
      if (existing) {
        this.registrationsByToken.delete(existing.token);
      }
    }

    this.logger.info("live_activity_unregistered", {
      tokenProvided: Boolean(token),
      activityID,
      registrationCount: this.count()
    });
  }

  registrationsForMatch(matchID) {
    return [...this.registrationsByToken.values()].filter((entry) => entry.matchID === matchID);
  }

  count() {
    return this.registrationsByToken.size;
  }
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
