import ActivityKit
import Foundation

actor LiveActivityCoordinator {
    private var tokenTasks: [String: Task<Void, Never>] = [:]
    private var pushTokensByActivityID: [String: String] = [:]
    private let registrationService = LiveActivityPushRegistrationService()

    func update(using match: Match?, trackedTeamIDs: [String]) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let activities = Activity<ScoreActivityAttributes>.activities

        guard let match else {
            for activity in activities {
                await unregister(activityID: activity.id)
                await Self.endActivity(activityID: activity.id)
            }
            return
        }

        let attributes = ScoreActivityAttributes(trackedTeamIDs: trackedTeamIDs)
        let contentState = ScoreActivityAttributes.ContentState(
            matchID: match.id,
            eventName: match.eventName,
            teamAName: match.teamA.displayName,
            teamBName: match.teamB.displayName,
            teamAScore: match.score.teamAScore,
            teamBScore: match.score.teamBScore,
            detailLine: Self.detailLine(for: match)
        )

        if let activity = activities.first(where: { $0.content.state.matchID == match.id }) {
            ensurePushTokenObservation(for: activity.id, match: match, trackedTeamIDs: trackedTeamIDs)
            if pushTokensByActivityID[activity.id] == nil {
                await Self.updateActivity(
                    activityID: activity.id,
                    contentState: contentState
                )
            }

            for staleActivity in activities where staleActivity.id != activity.id {
                await unregister(activityID: staleActivity.id)
                await Self.endActivity(activityID: staleActivity.id)
            }
            return
        }

        for activity in activities {
            await unregister(activityID: activity.id)
            await Self.endActivity(activityID: activity.id)
        }

        if let activity = try? Activity.request(
            attributes: attributes,
            content: ActivityContent(state: contentState, staleDate: Date().addingTimeInterval(15 * 60)),
            pushType: .token
        ) {
            ensurePushTokenObservation(for: activity.id, match: match, trackedTeamIDs: trackedTeamIDs)
        } else {
            _ = try? Activity.request(
                attributes: attributes,
                content: ActivityContent(state: contentState, staleDate: Date().addingTimeInterval(15 * 60)),
                pushType: nil
            )
        }
    }

    private func ensurePushTokenObservation(
        for activityID: String,
        match: Match,
        trackedTeamIDs: [String]
    ) {
        guard tokenTasks[activityID] == nil else { return }

        tokenTasks[activityID] = Task { [registrationService] in
            await Self.observePushTokenUpdates(
                activityID: activityID,
                match: match,
                trackedTeamIDs: trackedTeamIDs,
                coordinator: self,
                registrationService: registrationService
            )
        }
    }

    private func storePushToken(
        _ token: String,
        activityID: String,
        match: Match,
        trackedTeamIDs: [String],
        registrationService: LiveActivityPushRegistrationService
    ) async {
        pushTokensByActivityID[activityID] = token
        await registrationService.register(
            token: token,
            activityID: activityID,
            matchID: match.id,
            trackedTeamIDs: trackedTeamIDs
        )
    }

    private func unregister(activityID: String) async {
        tokenTasks[activityID]?.cancel()
        tokenTasks[activityID] = nil

        guard let token = pushTokensByActivityID.removeValue(forKey: activityID) else { return }
        await registrationService.unregister(token: token, activityID: activityID)
    }

    private static func updateActivity(
        activityID: String,
        contentState: ScoreActivityAttributes.ContentState
    ) async {
        guard let activity = Activity<ScoreActivityAttributes>.activities.first(where: { $0.id == activityID }) else {
            return
        }

        await activity.update(
            ActivityContent(state: contentState, staleDate: Date().addingTimeInterval(15 * 60))
        )
    }

    private static func endActivity(activityID: String) async {
        guard let activity = Activity<ScoreActivityAttributes>.activities.first(where: { $0.id == activityID }) else {
            return
        }

        await activity.end(nil, dismissalPolicy: .immediate)
    }

    private static func observePushTokenUpdates(
        activityID: String,
        match: Match,
        trackedTeamIDs: [String],
        coordinator: LiveActivityCoordinator,
        registrationService: LiveActivityPushRegistrationService
    ) async {
        guard let activity = Activity<ScoreActivityAttributes>.activities.first(where: { $0.id == activityID }) else {
            return
        }

        for await tokenData in activity.pushTokenUpdates {
            if Task.isCancelled { return }

            let token = tokenData.map { String(format: "%02x", $0) }.joined()
            await coordinator.storePushToken(
                token,
                activityID: activityID,
                match: match,
                trackedTeamIDs: trackedTeamIDs,
                registrationService: registrationService
            )
        }
    }

    private static func detailLine(for match: Match) -> String {
        var parts: [String] = []

        if let mapName = match.score.mapName, mapName.isEmpty == false {
            parts.append(mapName)
        }

        if let winsA = match.score.mapWinsA,
           let winsB = match.score.mapWinsB {
            parts.append("Maps \(winsA)-\(winsB)")
        }

        if let bestOf = match.score.bestOf {
            parts.append("BO\(bestOf)")
        }

        if parts.isEmpty {
            return match.eventName
        }

        return parts.joined(separator: " • ")
    }
}

private actor LiveActivityPushRegistrationService {
    private let session: URLSession = .shared

    func register(token: String, activityID: String, matchID: String, trackedTeamIDs: [String]) async {
        await send(
            path: "api/v1/live-activities/register",
            payload: RegistrationPayload(
                token: token,
                activityID: activityID,
                matchID: matchID,
                trackedTeamIDs: trackedTeamIDs
            )
        )
    }

    func unregister(token: String, activityID: String) async {
        await send(
            path: "api/v1/live-activities/unregister",
            payload: UnregistrationPayload(
                token: token,
                activityID: activityID
            )
        )
    }

    private func send<T: Encodable>(path: String, payload: T) async {
        let encoder = JSONEncoder()

        guard let body = try? encoder.encode(payload) else { return }

        var request = URLRequest(url: AppSecrets.backendBaseURL.appending(path: path))
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        _ = try? await session.data(for: request)
    }
}

private struct RegistrationPayload: Encodable {
    let token: String
    let activityID: String
    let matchID: String
    let trackedTeamIDs: [String]
}

private struct UnregistrationPayload: Encodable {
    let token: String
    let activityID: String
}
