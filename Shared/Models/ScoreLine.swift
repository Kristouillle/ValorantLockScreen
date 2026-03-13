import Foundation

struct ScoreLine: Codable, Hashable, Sendable {
    let teamAScore: Int
    let teamBScore: Int
    let mapName: String?
    let mapWinsA: Int?
    let mapWinsB: Int?
    let bestOf: Int?

    static let zero = ScoreLine(teamAScore: 0, teamBScore: 0, mapName: nil, mapWinsA: nil, mapWinsB: nil, bestOf: nil)
}
