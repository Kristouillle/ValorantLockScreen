export class WidgetPushRegistryService {
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
    this.#notifyMutation();

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
    this.#notifyMutation();
  }

  registrations() {
    this.#pruneExpired();
    return [...this.registrationsByToken.values()];
  }

  count() {
    this.#pruneExpired();
    return this.registrationsByToken.size;
  }

  snapshot() {
    this.#pruneExpired();
    return [...this.registrationsByToken.values()].map((registration) => ({
      token: registration.token,
      widgets: registration.widgets.map((widget) => ({
        kind: widget.kind,
        family: widget.family
      })),
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
        widgets: registration.widgets.map((widget) => ({
          kind: widget.kind,
          family: widget.family
        })),
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
    Array.isArray(registration?.widgets) &&
    registration.widgets.every(
      (widget) => typeof widget?.kind === "string" && typeof widget?.family === "string"
    ) &&
    Number.isFinite(registration?.lastSeenAtMs)
  );
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
