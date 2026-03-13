export class WidgetPushRegistryService {
  constructor({ logger = silentLogger } = {}) {
    this.logger = logger;
    this.registrationsByToken = new Map();
  }

  register({ token, widgets = [] }) {
    const registration = {
      token,
      widgets,
      lastSeenAt: new Date().toISOString()
    };

    this.registrationsByToken.set(token, registration);
    this.logger.info("widget_push_registered", {
      widgetCount: widgets.length,
      registrationCount: this.count()
    });

    return registration;
  }

  unregister({ token }) {
    if (!token) {
      return;
    }

    this.registrationsByToken.delete(token);
    this.logger.info("widget_push_unregistered", {
      registrationCount: this.count()
    });
  }

  registrations() {
    return [...this.registrationsByToken.values()];
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
