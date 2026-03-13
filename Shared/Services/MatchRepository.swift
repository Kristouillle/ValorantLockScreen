import Foundation

protocol MatchRepository: Sendable {
    func fetchMatches(for trackedTeams: [Team]) async throws -> [Match]
}
