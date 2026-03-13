import ActivityKit
import Foundation

struct ScoreActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        let matchID: String
        let eventName: String
        let teamAName: String
        let teamBName: String
        let teamAScore: Int
        let teamBScore: Int
        let detailLine: String
    }

    let trackedTeamIDs: [String]
}
