import Foundation

struct Match: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let eventName: String
    let startTime: Date
    let teamA: Team
    let teamB: Team
    let state: MatchState
    let score: ScoreLine
    let source: String
    let lastUpdated: Date

    var involvesTrackedTeamIDs: Set<String> {
        [teamA.id, teamB.id]
    }
}
