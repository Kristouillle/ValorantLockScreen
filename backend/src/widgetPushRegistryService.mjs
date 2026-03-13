export class WidgetPushRegistryService {
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

  register({ token, widgets = [] }) {
    this.#pruneExpired();

    const registration = {
      token,
      widgets,
      lastSeenAt: new Date(this.now()).toISOString(),
      lastSeenAtMs: this.now()
    };

    this.registrationsByToken.set(token, registration);
    this.logger.info("widget_push_registered", {
      widgetCount: widgets.length,
      registrationCount: this.count()
    });

    return registration;
  }

  unregister({ token }) {
    this.#pruneExpired();

    if (!token) {
      return;
    }

    this.registrationsByToken.delete(token);
    this.logger.info("widget_push_unregistered", {
      registrationCount: this.count()
    });
  }

  registrations() {
    this.#pruneExpired();
    return [...this.registrationsByToken.values()];
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
