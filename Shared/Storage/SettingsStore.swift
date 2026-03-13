import Foundation

@MainActor
final class SettingsStore: ObservableObject {
    struct Keys {
        static let backendBaseURL = AppSecrets.backendBaseURLDefaultsKey
        static let trackedTeamIDs = "settings.trackedTeamIDs"
        static let previewFallbackEnabled = "settings.previewFallbackEnabled"
        static let liveActivitiesEnabled = "settings.liveActivitiesEnabled"
    }

    @Published var backendBaseURLString: String {
        didSet { defaults.set(backendBaseURLString, forKey: Keys.backendBaseURL) }
    }

    @Published var trackedTeamIDs: [String] {
        didSet { defaults.set(trackedTeamIDs, forKey: Keys.trackedTeamIDs) }
    }

    @Published var previewFallbackEnabled: Bool {
        didSet { defaults.set(previewFallbackEnabled, forKey: Keys.previewFallbackEnabled) }
    }

    @Published var liveActivitiesEnabled: Bool {
        didSet { defaults.set(liveActivitiesEnabled, forKey: Keys.liveActivitiesEnabled) }
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard) {
        self.defaults = defaults
        let storedBackendURL = defaults.string(forKey: Keys.backendBaseURL)
        let normalizedBackendURL =
            AppSecrets.normalizedBackendBaseURLString(storedBackendURL) ?? AppSecrets.defaultBackendBaseURLString
        self.backendBaseURLString = normalizedBackendURL
        if storedBackendURL != normalizedBackendURL {
            defaults.set(normalizedBackendURL, forKey: Keys.backendBaseURL)
        }
        self.trackedTeamIDs = defaults.stringArray(forKey: Keys.trackedTeamIDs) ?? []
        if defaults.object(forKey: Keys.previewFallbackEnabled) == nil {
            defaults.set(false, forKey: Keys.previewFallbackEnabled)
        }
        self.previewFallbackEnabled = defaults.bool(forKey: Keys.previewFallbackEnabled)
        if defaults.object(forKey: Keys.liveActivitiesEnabled) == nil {
            defaults.set(true, forKey: Keys.liveActivitiesEnabled)
        }
        self.liveActivitiesEnabled = defaults.bool(forKey: Keys.liveActivitiesEnabled)
    }

    var trackedTeams: [Team] {
        Team.catalog.filter { trackedTeamIDs.contains($0.id) }
            .sorted { lhs, rhs in
                trackedTeamIDs.firstIndex(of: lhs.id, default: .max) < trackedTeamIDs.firstIndex(of: rhs.id, default: .max)
            }
    }

    func toggle(teamID: String) {
        if let index = trackedTeamIDs.firstIndex(of: teamID) {
            trackedTeamIDs.remove(at: index)
        } else {
            trackedTeamIDs.append(teamID)
        }
    }

    func isTrackingAll(teamIDs: [String]) -> Bool {
        Set(teamIDs).isSubset(of: Set(trackedTeamIDs))
    }

    func setTracking(teamIDs: [String], enabled: Bool) {
        if enabled {
            let missing = teamIDs.filter { trackedTeamIDs.contains($0) == false }
            trackedTeamIDs.append(contentsOf: missing)
        } else {
            let removalSet = Set(teamIDs)
            trackedTeamIDs.removeAll { removalSet.contains($0) }
        }
    }

    func resetBackendBaseURL() {
        backendBaseURLString = AppSecrets.defaultBackendBaseURLString
    }
}

private extension Array where Element == String {
    func firstIndex(of value: String, default fallback: Int) -> Int {
        firstIndex(of: value) ?? fallback
    }
}
