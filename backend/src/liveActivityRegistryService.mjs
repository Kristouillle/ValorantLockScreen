export class LiveActivityRegistryService {
  constructor({
    registrationTtlMs = 24 * 60 * 60 * 1_000,
    logger = silentLogger,
    now = () => Date.now()
  } = {}) {
    this.registrationTtlMs = registrationTtlMs;
    this.logger = logger;
    this.now = now;
    this.registrationsByToken = new Map();
  }

  register({ token, activityID, matchID, trackedTeamIDs = [] }) {
    this.#pruneExpired();

    const registration = {
      token,
      activityID,
      matchID,
      trackedTeamIDs,
      lastSeenAt: new Date(this.now()).toISOString(),
      lastSeenAtMs: this.now()
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
    this.#pruneExpired();

    if (token) {
      this.registrationsByToken.delete(token);
    } else if (activityID) {
      const existing = [...this.registrationsByToken.values()].find(
        (entry) => entry.activityID === activityID
      );
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
    this.#pruneExpired();
    return [...this.registrationsByToken.values()].filter((entry) => entry.matchID === matchID);
  }

  count() {
    this.#pruneExpired();
    return this.registrationsByToken.size;
  }

  #pruneExpired() {
    const cutoff = this.now() - this.registrationTtlMs;

    for (const [token, registration] of this.registrationsByToken.entries()) {
      if ((registration.lastSeenAtMs ?? 0) < cutoff) {
        this.registrationsByToken.delete(token);
      }
    }
  }
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
