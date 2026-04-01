import Foundation

enum LiveMatchResolver {
    static func prioritizedLiveMatch(from matches: [Match], trackedTeamIDs: [String]) -> Match? {
        guard trackedTeamIDs.isEmpty == false else { return nil }
        let liveMatches = matches.filter { match in
            match.state == .live && matchInvolvesTrackedTeam(match, trackedTeamIDs: trackedTeamIDs)
        }
        guard liveMatches.isEmpty == false else { return nil }

        return liveMatches.min { lhs, rhs in
            let lhsRank = matchRank(lhs, trackedTeamIDs: trackedTeamIDs)
            let rhsRank = matchRank(rhs, trackedTeamIDs: trackedTeamIDs)
            if lhsRank == rhsRank {
                return lhs.startTime < rhs.startTime
            }
            return lhsRank < rhsRank
        }
    }

    static func nextUpcomingMatch(from matches: [Match], trackedTeamIDs: [String], now: Date = .now) -> Match? {
        guard trackedTeamIDs.isEmpty == false else { return nil }
        return matches
            .filter { match in
                match.state == .upcoming &&
                match.startTime >= now &&
                matchInvolvesTrackedTeam(match, trackedTeamIDs: trackedTeamIDs)
            }
            .sorted { lhs, rhs in
                if lhs.startTime == rhs.startTime {
                    return matchRank(lhs, trackedTeamIDs: trackedTeamIDs) < matchRank(rhs, trackedTeamIDs: trackedTeamIDs)
                }
                return lhs.startTime < rhs.startTime
            }
            .first
    }

    private static func matchInvolvesTrackedTeam(_ match: Match, trackedTeamIDs: [String]) -> Bool {
        trackedTeamIDs.contains(match.teamA.id) || trackedTeamIDs.contains(match.teamB.id)
    }

    private static func matchRank(_ match: Match, trackedTeamIDs: [String]) -> Int {
        trackedTeamIDs.enumerated().reduce(Int.max) { partialResult, item in
            let (offset, teamID) = item
            if match.teamA.id == teamID || match.teamB.id == teamID {
                return min(partialResult, offset)
            }
            return partialResult
        }
    }
}
