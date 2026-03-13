import Foundation

struct PreviewMatchRepository: MatchRepository {
    func fetchMatches(for trackedTeams: [Team]) async throws -> [Match] {
        []
    }
}
