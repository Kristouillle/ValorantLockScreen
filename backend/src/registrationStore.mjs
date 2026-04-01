import fs from "node:fs/promises";
import path from "node:path";

export class RegistrationStore {
  constructor({
    filePath = null,
    logger = silentLogger,
    fsImpl = fs
  } = {}) {
    this.filePath = filePath;
    this.logger = logger;
    this.fs = fsImpl;
    this.writeChain = Promise.resolve();
  }

  isEnabled() {
    return Boolean(this.filePath);
  }

  async load() {
    if (!this.isEnabled()) {
      return emptySnapshot();
    }

    try {
      const raw = await this.fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);

      return {
        liveActivities: Array.isArray(parsed?.liveActivities) ? parsed.liveActivities : [],
        widgets: Array.isArray(parsed?.widgets) ? parsed.widgets : []
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return emptySnapshot();
      }

      this.logger.error("registration_store_load_failed", {
        filePath: this.filePath,
        error: error.message
      });
      return emptySnapshot();
    }
  }

  async save(snapshot) {
    if (!this.isEnabled()) {
      return;
    }

    const payload = JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        liveActivities: Array.isArray(snapshot?.liveActivities) ? snapshot.liveActivities : [],
        widgets: Array.isArray(snapshot?.widgets) ? snapshot.widgets : []
      },
      null,
      2
    );

    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        const directory = path.dirname(this.filePath);
        const temporaryPath = `${this.filePath}.tmp`;

        await this.fs.mkdir(directory, { recursive: true });
        await this.fs.writeFile(temporaryPath, payload, "utf8");
        await this.fs.rename(temporaryPath, this.filePath);
      })
      .catch((error) => {
        this.logger.error("registration_store_save_failed", {
          filePath: this.filePath,
          error: error.message
        });
      });

    return this.writeChain;
  }
}

function emptySnapshot() {
  return {
    liveActivities: [],
    widgets: []
  };
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
