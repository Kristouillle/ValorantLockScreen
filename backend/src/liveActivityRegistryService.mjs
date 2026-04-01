export class LiveActivityRegistryService {
  constructor({
    registrationTtlMs = 24 * 60 * 60 * 1_000,
    logger = silentLogger,
    now = () => Date.now(),
    onMutation = null
  } = {}) {
    this.registrationTtlMs = registrationTtlMs;
    this.logger = logger;
    this.now = now;
    this.onMutation = onMutation;
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
    this.#notifyMutation();

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
    this.#notifyMutation();
  }

  registrationsForMatch(matchID) {
    this.#pruneExpired();
    return [...this.registrationsByToken.values()].filter((entry) => entry.matchID === matchID);
  }

  count() {
    this.#pruneExpired();
    return this.registrationsByToken.size;
  }

  snapshot() {
    this.#pruneExpired();
    return [...this.registrationsByToken.values()].map((registration) => ({
      token: registration.token,
      activityID: registration.activityID,
      matchID: registration.matchID,
      trackedTeamIDs: [...registration.trackedTeamIDs],
      lastSeenAt: registration.lastSeenAt,
      lastSeenAtMs: registration.lastSeenAtMs
    }));
  }

  restore(registrations = []) {
    this.registrationsByToken.clear();
    const cutoff = this.now() - this.registrationTtlMs;

    for (const registration of registrations) {
      if (!isRestorableRegistration(registration)) {
        continue;
      }

      if ((registration.lastSeenAtMs ?? 0) < cutoff) {
        continue;
      }

      this.registrationsByToken.set(registration.token, {
        token: registration.token,
        activityID: registration.activityID,
        matchID: registration.matchID,
        trackedTeamIDs: [...registration.trackedTeamIDs],
        lastSeenAt: registration.lastSeenAt,
        lastSeenAtMs: registration.lastSeenAtMs
      });
    }
  }

  #pruneExpired() {
    const cutoff = this.now() - this.registrationTtlMs;
    let removedAny = false;

    for (const [token, registration] of this.registrationsByToken.entries()) {
      if ((registration.lastSeenAtMs ?? 0) < cutoff) {
        this.registrationsByToken.delete(token);
        removedAny = true;
      }
    }

    if (removedAny) {
      this.#notifyMutation();
    }
  }

  #notifyMutation() {
    this.onMutation?.();
  }
}

function isRestorableRegistration(registration) {
  return (
    typeof registration?.token === "string" &&
    typeof registration?.activityID === "string" &&
    typeof registration?.matchID === "string" &&
    Array.isArray(registration?.trackedTeamIDs) &&
    Number.isFinite(registration?.lastSeenAtMs)
  );
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
