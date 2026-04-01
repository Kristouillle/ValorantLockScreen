import Foundation

enum AppSecrets {
    static let backendBaseURLDefaultsKey = "settings.backendBaseURL"
    static let pushDebugEventsDefaultsKey = "debug.push.events"

    // Default local backend for simulator development. For a physical device,
    // point this to your Mac's LAN IP or a deployed HTTPS endpoint.
    static var backendBaseURL: URL {
        let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        let stored = defaults.string(forKey: backendBaseURLDefaultsKey)
        let env = ProcessInfo.processInfo.environment["VALORANT_BACKEND_BASE_URL"]
#if DEBUG
        return resolvedBackendBaseURL(from: env)
            ?? URL(string: defaultBackendBaseURLString)!
#else
        return resolvedBackendBaseURL(from: env)
            ?? resolvedBackendBaseURL(from: stored)
            ?? URL(string: defaultBackendBaseURLString)!
#endif
    }

    static let defaultBackendBaseURLString = {
#if DEBUG
        "http://127.0.0.1:8787/"
#else
        "https://valorant.bestafter.ca/"
#endif
    }()

    static func normalizedBackendBaseURLString(_ rawValue: String?) -> String? {
        resolvedBackendBaseURL(from: rawValue)?.absoluteString
    }

    static func syncBackendBaseURLToSharedDefaults() {
        let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        let env = ProcessInfo.processInfo.environment["VALORANT_BACKEND_BASE_URL"]
        let resolved: String

        if let envURL = resolvedBackendBaseURL(from: env) {
            resolved = envURL.absoluteString
        } else {
#if DEBUG
            resolved = URL(string: defaultBackendBaseURLString)!.absoluteString
#else
            resolved = backendBaseURL.absoluteString
#endif
        }

        if defaults.string(forKey: backendBaseURLDefaultsKey) != resolved {
            defaults.set(resolved, forKey: backendBaseURLDefaultsKey)
        }
    }

    static func appendPushDebugEvent(_ message: String) {
#if DEBUG
        let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        var events = defaults.stringArray(forKey: pushDebugEventsDefaultsKey) ?? []
        events.append("\(formatter.string(from: Date())) \(message)")

        let overflow = events.count - 40
        if overflow > 0 {
            events.removeFirst(overflow)
        }

        defaults.set(events, forKey: pushDebugEventsDefaultsKey)
#endif
    }

#if DEBUG
    static func forceDebugLocalBackendBaseURL() {
        let resolved = URL(string: defaultBackendBaseURLString)!.absoluteString
        let sharedDefaults = UserDefaults(suiteName: AppGroup.identifier)
        sharedDefaults?.set(resolved, forKey: backendBaseURLDefaultsKey)
        UserDefaults.standard.set(resolved, forKey: backendBaseURLDefaultsKey)
    }

    static var debugSummary: String {
        let sharedDefaults = UserDefaults(suiteName: AppGroup.identifier)
        let storedShared = sharedDefaults?.string(forKey: backendBaseURLDefaultsKey) ?? "nil"
        let storedStandard = UserDefaults.standard.string(forKey: backendBaseURLDefaultsKey) ?? "nil"
        let env = ProcessInfo.processInfo.environment["VALORANT_BACKEND_BASE_URL"] ?? "nil"

        return [
            "resolved: \(backendBaseURL.absoluteString)",
            "env: \(env)",
            "shared: \(storedShared)",
            "standard: \(storedStandard)"
        ].joined(separator: "\n")
    }

    static var pushDebugSummary: String {
        let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        let events = defaults.stringArray(forKey: pushDebugEventsDefaultsKey) ?? []
        return events.isEmpty ? "No push events recorded yet." : events.joined(separator: "\n")
    }

    static func clearPushDebugEvents() {
        let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        defaults.removeObject(forKey: pushDebugEventsDefaultsKey)
    }
#endif

    private static func resolvedBackendBaseURL(from rawValue: String?) -> URL? {
        guard let rawValue else { return nil }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return nil }

        let withScheme = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard var components = URLComponents(string: withScheme) else { return nil }
        guard let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              components.host?.isEmpty == false else {
            return nil
        }

        if components.path.isEmpty {
            components.path = "/"
        }

        return components.url
    }
}
