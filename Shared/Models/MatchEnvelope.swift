import Foundation

struct MatchEnvelope: Codable, Hashable, Sendable {
    let generatedAt: Date
    let matches: [Match]

    static let empty = MatchEnvelope(generatedAt: .now, matches: [])
}
