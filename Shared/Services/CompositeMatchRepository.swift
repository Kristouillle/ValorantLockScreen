import Foundation

struct CompositeMatchRepository: MatchRepository {
    let primary: MatchRepository
    let fallback: MatchRepository
    let useFallbackWhenEmpty: Bool

    func fetchMatches(for trackedTeams: [Team]) async throws -> [Match] {
        do {
            let matches = try await primary.fetchMatches(for: trackedTeams)
            if matches.isEmpty, useFallbackWhenEmpty, trackedTeams.isEmpty {
                return try await fallback.fetchMatches(for: trackedTeams)
            }
            return matches
        } catch {
            guard useFallbackWhenEmpty else { throw error }
            return try await fallback.fetchMatches(for: trackedTeams)
        }
    }
}
