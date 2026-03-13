import Foundation

struct TrackedSelection: Codable, Hashable, Sendable {
    let teamIDs: [String]

    static let empty = TrackedSelection(teamIDs: [])
}
