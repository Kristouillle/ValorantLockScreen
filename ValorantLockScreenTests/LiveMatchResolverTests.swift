import XCTest

final class LiveMatchResolverTests: XCTestCase {
    func testPrioritizedLiveMatchUsesTrackedOrderFirst() {
        let teams = Team.catalog
        let now = Date()
        let matchOne = Match(
            id: "one",
            eventName: "Alpha",
            startTime: now,
            teamA: teams[0],
            teamB: teams[2],
            state: .live,
            score: .zero,
            source: "test",
            lastUpdated: now
        )
        let matchTwo = Match(
            id: "two",
            eventName: "Beta",
            startTime: now.addingTimeInterval(-60),
            teamA: teams[3],
            teamB: teams[1],
            state: .live,
            score: .zero,
            source: "test",
            lastUpdated: now
        )

        let resolved = LiveMatchResolver.prioritizedLiveMatch(from: [matchOne, matchTwo], trackedTeamIDs: [teams[1].id, teams[0].id])

        XCTAssertEqual(resolved?.id, "two")
    }

    func testNextUpcomingMatchChoosesEarliestStart() {
        let teams = Team.catalog
        let now = Date()
        let later = Match(
            id: "later",
            eventName: "Later",
            startTime: now.addingTimeInterval(600),
            teamA: teams[0],
            teamB: teams[1],
            state: .upcoming,
            score: .zero,
            source: "test",
            lastUpdated: now
        )
        let sooner = Match(
            id: "sooner",
            eventName: "Sooner",
            startTime: now.addingTimeInterval(60),
            teamA: teams[2],
            teamB: teams[3],
            state: .upcoming,
            score: .zero,
            source: "test",
            lastUpdated: now
        )

        let resolved = LiveMatchResolver.nextUpcomingMatch(from: [later, sooner], trackedTeamIDs: [teams[0].id], now: now)

        XCTAssertEqual(resolved?.id, "sooner")
    }
}
