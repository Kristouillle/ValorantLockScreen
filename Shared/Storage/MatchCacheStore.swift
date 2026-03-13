import Foundation
import WidgetKit

actor MatchCacheStore {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let key = "cache.matchEnvelope"

    init(defaults: UserDefaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard) {
        self.defaults = defaults
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func load() -> MatchEnvelope {
        guard let data = defaults.data(forKey: key),
              let envelope = try? decoder.decode(MatchEnvelope.self, from: data) else {
            return .empty
        }
        return envelope
    }

    func save(_ envelope: MatchEnvelope) {
        guard let data = try? encoder.encode(envelope) else { return }
        defaults.set(data, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
    }
}
