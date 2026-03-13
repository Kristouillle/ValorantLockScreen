import Foundation

enum AppSecrets {
    static let backendBaseURLDefaultsKey = "settings.backendBaseURL"

    // Default local backend for simulator development. For a physical device,
    // point this to your Mac's LAN IP or a deployed HTTPS endpoint.
    static var backendBaseURL: URL {
        let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        let stored = defaults.string(forKey: backendBaseURLDefaultsKey)
        let env = ProcessInfo.processInfo.environment["VALORANT_BACKEND_BASE_URL"]
        return resolvedBackendBaseURL(from: stored)
            ?? resolvedBackendBaseURL(from: env)
            ?? URL(string: defaultBackendBaseURLString)!
    }

    static let defaultBackendBaseURLString = "http://192.168.1.7:8787/"

    static func normalizedBackendBaseURLString(_ rawValue: String?) -> String? {
        resolvedBackendBaseURL(from: rawValue)?.absoluteString
    }

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
