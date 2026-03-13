import Foundation

struct RiotMatchRepository: MatchRepository {
    private let baseURL: URL
    private let session: URLSession
    private let allowPreviewFallback: Bool

    init(
        baseURL: URL = AppSecrets.backendBaseURL,
        allowPreviewFallback: Bool,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.allowPreviewFallback = allowPreviewFallback
        self.session = session
    }

    func fetchMatches(for trackedTeams: [Team]) async throws -> [Match] {
        guard trackedTeams.isEmpty == false else {
            return []
        }

        guard var components = URLComponents(
            url: baseURL.appending(path: "api/v1/matches"),
            resolvingAgainstBaseURL: false
        ) else {
            throw BackendRepositoryError.invalidURL
        }

        components.queryItems = [
            URLQueryItem(name: "teamIds", value: trackedTeams.map(\.id).joined(separator: ",")),
            URLQueryItem(name: "allowPreviewFallback", value: allowPreviewFallback ? "true" : "false")
        ]

        guard let url = components.url else {
            throw BackendRepositoryError.invalidURL
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw BackendRepositoryError.invalidResponse
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let envelope = try decoder.decode(MatchEnvelope.self, from: data)
        return envelope.matches
    }
}

enum BackendRepositoryError: LocalizedError {
    case invalidURL
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The backend URL is invalid."
        case .invalidResponse:
            return "The backend returned an unexpected response."
        }
    }
}
