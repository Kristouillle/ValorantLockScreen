import { createPreviewEnvelope } from "./previewFixtures.mjs";

export class MatchFeedService {
  constructor({
    scheduleService,
    simulatorService = null,
    cacheTtlMs = 30_000,
    logger = silentLogger,
    now = () => new Date()
  }) {
    this.scheduleService = scheduleService;
    this.simulatorService = simulatorService;
    this.cacheTtlMs = cacheTtlMs;
    this.logger = logger;
    this.now = now;
    this.cachedEnvelope = null;
    this.cachedAtMs = 0;
  }

  async getFeed({ teamIds = [], allowPreviewFallback = false }) {
    const loadResult = await this.refreshFeed({ allowPreviewFallback, force: false });
    const requestedTeamIDs = new Set(teamIds.filter(Boolean));
    const baseMatches = this.#applySimulator(loadResult.envelope.matches);
    const matches =
      requestedTeamIDs.size === 0
        ? baseMatches
        : baseMatches.filter((match) => {
            return requestedTeamIDs.has(match.teamA.id) || requestedTeamIDs.has(match.teamB.id);
          });

    const envelope = {
      generatedAt: this.now(),
      matches
    };

    return {
      envelope,
      meta: {
        upstreamSource: this.simulatorService?.getMatch() ? "simulator+riot.valorantesports.schedule" : loadResult.upstreamSource,
        cacheStatus: loadResult.cacheStatus,
        requestedTeamIDs: [...requestedTeamIDs],
        returnedMatchCount: matches.length,
        totalMatchCount: baseMatches.length,
        generatedAt: envelope.generatedAt
      }
    };
  }

  async getEnvelope({ teamIds = [], allowPreviewFallback = false }) {
    const result = await this.getFeed({ teamIds, allowPreviewFallback });
    return result.envelope;
  }

  async refreshFeed({ allowPreviewFallback = false, force = false }) {
    return this.#loadEnvelope({ allowPreviewFallback, force });
  }

  async #loadEnvelope({ allowPreviewFallback, force }) {
    if (!force && this.#isCacheFresh()) {
      this.logger.info("match_feed_cache_hit", {
        cacheAgeMs: this.now().getTime() - this.cachedAtMs,
        cachedMatchCount: this.cachedEnvelope.matches.length
      });
      return {
        envelope: this.cachedEnvelope,
        upstreamSource: "riot.valorantesports.schedule",
        cacheStatus: "hit",
        changedMatches: []
      };
    }

    try {
      const previousMatches = this.cachedEnvelope?.matches ?? [];
      const matches = await this.scheduleService.fetchMatches();
      const envelope = {
        generatedAt: this.now(),
        matches
      };

      this.cachedEnvelope = envelope;
      this.cachedAtMs = this.now().getTime();
      this.logger.info("match_feed_cache_refreshed", {
        cachedMatchCount: matches.length,
        generatedAt: envelope.generatedAt.toISOString()
      });
      return {
        envelope,
        upstreamSource: "riot.valorantesports.schedule",
        cacheStatus: "refreshed",
        changedMatches: diffChangedMatches(previousMatches, matches)
      };
    } catch (error) {
      if (this.cachedEnvelope) {
        this.logger.warn("match_feed_refresh_failed_using_cached_data", {
          error: error.message,
          cachedMatchCount: this.cachedEnvelope.matches.length
        });
        return {
          envelope: this.cachedEnvelope,
          upstreamSource: "riot.valorantesports.schedule",
          cacheStatus: "stale-on-error",
          changedMatches: []
        };
      }

      if (allowPreviewFallback) {
        const envelope = createPreviewEnvelope(this.now());
        this.logger.warn("match_feed_refresh_failed_using_preview_fallback", {
          error: error.message,
          previewMatchCount: envelope.matches.length
        });
        return {
          envelope,
          upstreamSource: "preview",
          cacheStatus: "preview-fallback",
          changedMatches: envelope.matches
        };
      }

      this.logger.error("match_feed_refresh_failed", {
        error: error.message
      });
      throw new Error(`Failed to refresh Riot schedule: ${error.message}`);
    }
  }

  #isCacheFresh() {
    if (!this.cachedEnvelope) {
      return false;
    }

    return this.now().getTime() - this.cachedAtMs < this.cacheTtlMs;
  }

  #applySimulator(matches) {
    const simulatedMatch = this.simulatorService?.getMatch();
    if (!simulatedMatch) {
      return matches;
    }

    const filtered = matches.filter((match) => match.id !== simulatedMatch.id);
    return [simulatedMatch, ...filtered];
  }
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function diffChangedMatches(previousMatches, nextMatches) {
  const previousSignatures = new Map(previousMatches.map((match) => [match.id, matchSignature(match)]));

  return nextMatches.filter((match) => {
    return previousSignatures.get(match.id) !== matchSignature(match);
  });
}

function matchSignature(match) {
  return JSON.stringify({
    state: match.state,
    eventName: match.eventName,
    startTime: match.startTime,
    teamAScore: match.score.teamAScore,
    teamBScore: match.score.teamBScore,
    mapName: match.score.mapName,
    mapWinsA: match.score.mapWinsA,
    mapWinsB: match.score.mapWinsB,
    bestOf: match.score.bestOf,
    source: match.source
  });
}
