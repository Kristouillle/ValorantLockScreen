import ActivityKit
import Foundation

@MainActor
final class MatchPollingViewModel: ObservableObject {
    @Published private(set) var matches: [Match] = []
    @Published private(set) var liveMatch: Match?
    @Published private(set) var nextMatch: Match?
    @Published private(set) var isRefreshing = false
    @Published private(set) var errorMessage: String?

    private var settingsStore: SettingsStore?
    private let cacheStore = MatchCacheStore()
    private let coordinator = LiveActivityCoordinator()
    private var autoRefreshTask: Task<Void, Never>?
    private let foregroundRefreshInterval: Duration = .seconds(30)

    func configure(with settingsStore: SettingsStore) async {
        self.settingsStore = settingsStore
        let cached = await cacheStore.load()
        apply(envelope: cached, trackedTeamIDs: settingsStore.trackedTeamIDs)
        await applyLiveActivityPreference()
    }

    func setForegroundRefreshingEnabled(_ isEnabled: Bool) {
        autoRefreshTask?.cancel()
        autoRefreshTask = nil

        guard isEnabled else { return }

        autoRefreshTask = Task { [weak self] in
            guard let self else { return }

            while Task.isCancelled == false {
                try? await Task.sleep(for: foregroundRefreshInterval)
                if Task.isCancelled { return }
                await self.refresh()
            }
        }
    }

    func refresh() async {
        guard let settingsStore else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        guard settingsStore.trackedTeams.isEmpty == false else {
            let envelope = MatchEnvelope(generatedAt: .now, matches: [])
            await cacheStore.save(envelope)
            apply(envelope: envelope, trackedTeamIDs: settingsStore.trackedTeamIDs)
            errorMessage = nil
            await applyLiveActivityPreference()
            return
        }

        let repository = RiotMatchRepository(allowPreviewFallback: settingsStore.previewFallbackEnabled)

        do {
            let matches = try await repository.fetchMatches(for: settingsStore.trackedTeams)
            let envelope = MatchEnvelope(generatedAt: .now, matches: matches)
            await cacheStore.save(envelope)
            apply(envelope: envelope, trackedTeamIDs: settingsStore.trackedTeamIDs)
            errorMessage = nil
            await applyLiveActivityPreference()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func applyLiveActivityPreference() async {
        guard let settingsStore else { return }
        let match = settingsStore.liveActivitiesEnabled ? liveMatch : nil
        await coordinator.update(using: match, trackedTeamIDs: settingsStore.trackedTeamIDs)
    }

    private func apply(envelope: MatchEnvelope, trackedTeamIDs: [String]) {
        matches = envelope.matches
        liveMatch = LiveMatchResolver.prioritizedLiveMatch(from: envelope.matches, trackedTeamIDs: trackedTeamIDs)
        nextMatch = LiveMatchResolver.nextUpcomingMatch(from: envelope.matches, trackedTeamIDs: trackedTeamIDs)
    }

    deinit {
        autoRefreshTask?.cancel()
    }
}
