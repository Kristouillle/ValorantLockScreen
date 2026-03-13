import http2 from "node:http2";
import { createSign } from "node:crypto";

export class APNSLiveActivityService {
  constructor({
    environment = "sandbox",
    teamID = null,
    keyID = null,
    bundleID = null,
    privateKey = null,
    topic = null,
    logger = silentLogger,
    now = () => new Date()
  } = {}) {
    this.environment = environment;
    this.teamID = teamID;
    this.keyID = keyID;
    this.bundleID = bundleID;
    this.privateKey = privateKey;
    this.topic = topic ?? (bundleID ? `${bundleID}.push-type.liveactivity` : null);
    this.widgetTopic = bundleID ? `${bundleID}.push-type.widgets` : null;
    this.logger = logger;
    this.now = now;
    this.lastPushTimestamp = 0;
  }

  isConfigured() {
    return Boolean(this.teamID && this.keyID && this.privateKey && this.topic);
  }

  isWidgetConfigured() {
    return Boolean(this.teamID && this.keyID && this.privateKey && this.widgetTopic);
  }

  async sendMatchUpdate({ token, match, event = "update" }) {
    if (!this.isConfigured()) {
      this.logger.warn("apns_live_activity_not_configured", {
        matchID: match.id,
        event
      });
      return { delivered: false, skipped: true, reason: "not-configured" };
    }

    const timestamp = this.#nextTimestamp();
    const payload = {
      aps: {
        timestamp,
        event,
        "content-state": contentStateFromMatch(match),
        "stale-date": timestamp + 15 * 60
      }
    };

    if (event === "end") {
      payload.aps["dismissal-date"] = timestamp + 60;
    }

    return this.#send({
      token,
      payload,
      pushType: "liveactivity",
      topic: this.topic
    });
  }

  async sendWidgetReload({ token }) {
    if (!this.isWidgetConfigured()) {
      this.logger.warn("apns_widget_not_configured", {});
      return { delivered: false, skipped: true, reason: "not-configured" };
    }

    return this.#send({
      token,
      payload: {
        aps: {
          "content-changed": true
        }
      },
      pushType: "widgets",
      topic: this.widgetTopic
    });
  }

  async #send({ token, payload, pushType, topic }) {
    const jwt = this.#makeJWT();
    const authority =
      this.environment === "production"
        ? "https://api.push.apple.com"
        : "https://api.sandbox.push.apple.com";

    return new Promise((resolve, reject) => {
      const client = http2.connect(authority);
      client.on("error", reject);

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        "apns-push-type": pushType,
        "apns-topic": topic,
        "apns-priority": "10"
      });

      let body = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          const status = Number(headers[":status"] ?? 0);
          client.close();

          if (status >= 200 && status < 300) {
            this.logger.info("apns_live_activity_sent", {
              status,
              topic,
              pushType,
              timestamp: payload.aps?.timestamp,
              event: payload.aps?.event
            });
            resolve({ delivered: true, status });
            return;
          }

          this.logger.error("apns_live_activity_failed", {
            status,
            body,
            topic,
            pushType,
            timestamp: payload.aps?.timestamp,
            event: payload.aps?.event
          });
          resolve({ delivered: false, status, body });
        });
      });

      request.on("error", (error) => {
        client.close();
        reject(error);
      });

      request.end(JSON.stringify(payload));
    });
  }

  #makeJWT() {
    const header = base64urlJSON({
      alg: "ES256",
      kid: this.keyID
    });
    const claims = base64urlJSON({
      iss: this.teamID,
      iat: Math.floor(this.now().getTime() / 1000)
    });
    const signingInput = `${header}.${claims}`;

    const signer = createSign("SHA256");
    signer.update(signingInput);
    signer.end();

    const signature = signer.sign({
      key: this.privateKey,
      dsaEncoding: "ieee-p1363"
    });

    return `${signingInput}.${base64url(signature)}`;
  }

  #nextTimestamp() {
    const currentTimestamp = Math.floor(this.now().getTime() / 1000);
    this.lastPushTimestamp = Math.max(currentTimestamp, this.lastPushTimestamp + 1);
    return this.lastPushTimestamp;
  }
}

function contentStateFromMatch(match) {
  const detailParts = [];

  if (match.score.mapName) {
    detailParts.push(match.score.mapName);
  }

  if (Number.isInteger(match.score.mapWinsA) && Number.isInteger(match.score.mapWinsB)) {
    detailParts.push(`Maps ${match.score.mapWinsA}-${match.score.mapWinsB}`);
  }

  if (Number.isInteger(match.score.bestOf)) {
    detailParts.push(`BO${match.score.bestOf}`);
  }

  return {
    matchID: match.id,
    eventName: match.eventName,
    teamAName: match.teamA.displayName,
    teamBName: match.teamB.displayName,
    teamAScore: match.score.teamAScore,
    teamBScore: match.score.teamBScore,
    detailLine: detailParts.length > 0 ? detailParts.join(" • ") : match.eventName
  };
}

function base64urlJSON(value) {
  return base64url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
