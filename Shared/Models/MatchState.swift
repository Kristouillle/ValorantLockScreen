import Foundation

enum MatchState: String, Codable, Hashable, Sendable {
    case upcoming
    case live
    case completed
    case delayed
    case unknown
}
