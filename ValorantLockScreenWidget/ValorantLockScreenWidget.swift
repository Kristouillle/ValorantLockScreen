import ActivityKit
import Foundation
import SwiftUI
import UIKit
import WidgetKit

@main
struct ValorantLockScreenWidgetBundle: WidgetBundle {
    var body: some Widget {
        ValorantScoreWidget()
        ValorantScoreLiveActivity()
    }
}

struct ValorantScoreWidget: Widget {
    var body: some WidgetConfiguration {
        makeScoreWidgetConfiguration()
            .pushHandler(ScoreWidgetPushHandler.self)
    }
}

@MainActor
private func makeScoreWidgetConfiguration() -> some WidgetConfiguration {
    StaticConfiguration(kind: "ValorantScoreWidget", provider: ScoreWidgetProvider()) { entry in
        ScoreWidgetEntryView(entry: entry)
            .containerBackground(for: .widget) {
                Color(uiColor: .systemBackground)
            }
    }
    .configurationDisplayName("Valorant Score")
    .description("Shows the current or next tracked Valorant match.")
    .supportedFamilies([.accessoryRectangular, .systemSmall, .systemMedium])
}

struct ScoreWidgetEntry: TimelineEntry {
    let date: Date
    let liveMatch: Match?
    let nextMatch: Match?
}

struct ScoreWidgetProvider: TimelineProvider {
    private let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
    private let session: URLSession = .shared
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
    private let cacheKey = "cache.matchEnvelope"

    func placeholder(in context: Context) -> ScoreWidgetEntry {
        ScoreWidgetEntry(date: .now, liveMatch: PreviewMatchRepository.sampleLiveMatch, nextMatch: PreviewMatchRepository.sampleUpcomingMatch)
    }

    func getSnapshot(in context: Context, completion: @escaping (ScoreWidgetEntry) -> Void) {
        let trackedTeamIDs = defaults.stringArray(forKey: SettingsStore.Keys.trackedTeamIDs) ?? []
        let cachedEnvelope = loadCachedEnvelope()
        registerCurrentWidgetPushInfoIfAvailable(familyDescription: String(describing: context.family))

        guard context.isPreview == false else {
            completion(makeEntry(envelope: cachedEnvelope, trackedTeamIDs: trackedTeamIDs))
            return
        }

        fetchEnvelope(trackedTeamIDs: trackedTeamIDs) { fetchedEnvelope in
            let envelope = fetchedEnvelope ?? cachedEnvelope
            completion(makeEntry(envelope: envelope, trackedTeamIDs: trackedTeamIDs))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScoreWidgetEntry>) -> Void) {
        let trackedTeamIDs = defaults.stringArray(forKey: SettingsStore.Keys.trackedTeamIDs) ?? []
        let cachedEnvelope = loadCachedEnvelope()
        registerCurrentWidgetPushInfoIfAvailable(familyDescription: String(describing: context.family))

        fetchEnvelope(trackedTeamIDs: trackedTeamIDs) { fetchedEnvelope in
            let envelope = fetchedEnvelope ?? cachedEnvelope
            if let fetchedEnvelope {
                saveEnvelope(fetchedEnvelope)
            }

            let entry = makeEntry(envelope: envelope, trackedTeamIDs: trackedTeamIDs)
            let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60)))
            completion(timeline)
        }
    }

    private func makeEntry(envelope: MatchEnvelope, trackedTeamIDs: [String]) -> ScoreWidgetEntry {
        ScoreWidgetEntry(
            date: envelope.generatedAt,
            liveMatch: LiveMatchResolver.prioritizedLiveMatch(from: envelope.matches, trackedTeamIDs: trackedTeamIDs),
            nextMatch: LiveMatchResolver.nextUpcomingMatch(from: envelope.matches, trackedTeamIDs: trackedTeamIDs)
        )
    }

    private func loadCachedEnvelope() -> MatchEnvelope {
        guard let data = defaults.data(forKey: cacheKey),
              let decoded = try? decoder.decode(MatchEnvelope.self, from: data) else {
            return .empty
        }

        return decoded
    }

    private func saveEnvelope(_ envelope: MatchEnvelope) {
        guard let data = try? encoder.encode(envelope) else { return }
        defaults.set(data, forKey: cacheKey)
    }

    private func fetchEnvelope(
        trackedTeamIDs: [String],
        completion: @escaping (MatchEnvelope?) -> Void
    ) {
        guard trackedTeamIDs.isEmpty == false else {
            completion(MatchEnvelope(generatedAt: .now, matches: []))
            return
        }

        guard var components = URLComponents(
            url: AppSecrets.backendBaseURL.appending(path: "api/v1/matches"),
            resolvingAgainstBaseURL: false
        ) else {
            completion(nil)
            return
        }

        components.queryItems = [
            URLQueryItem(name: "teamIds", value: trackedTeamIDs.joined(separator: ","))
        ]

        guard let url = components.url else {
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        session.dataTask(with: request) { data, response, _ in
            guard let data,
                  let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                completion(nil)
                return
            }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let envelope = try? decoder.decode(MatchEnvelope.self, from: data)
            completion(envelope)
        }
        .resume()
    }

    private func registerCurrentWidgetPushInfoIfAvailable(familyDescription: String) {
        guard #available(iOS 26.0, *) else { return }

        Task.detached(priority: .background) {
            guard let pushInfo = await WidgetCenter.shared.currentPushInfo else {
                AppSecrets.appendPushDebugEvent("widget currentPushInfo=nil family=\(familyDescription)")
                return
            }

            AppSecrets.appendPushDebugEvent(
                "widget currentPushInfo tokenBytes=\(pushInfo.token.count) family=\(familyDescription)"
            )

            await ScoreWidgetPushRegistrationService().register(
                token: pushInfo.token,
                widgets: [
                    WidgetPushRegistrationPayload.RegisteredWidget(
                        kind: "ValorantScoreWidget",
                        family: familyDescription
                    )
                ]
            )
        }
    }
}

struct ScoreWidgetEntryView: View {
    let entry: ScoreWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            accessoryView
        case .systemMedium:
            mediumView
        default:
            smallView
        }
    }

    private var accessoryView: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let liveMatch = entry.liveMatch {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .center, spacing: 10) {
                        TeamLogoView(team: liveMatch.teamA, size: 20)
                            .frame(width: 24, alignment: .leading)

                        Text("\(liveMatch.score.teamAScore)-\(liveMatch.score.teamBScore)")
                            .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                            .frame(maxWidth: .infinity, alignment: .center)

                        TeamLogoView(team: liveMatch.teamB, size: 20)
                            .frame(width: 24, alignment: .trailing)
                    }

                    HStack(alignment: .center, spacing: 8) {
                        if let winsA = liveMatch.score.mapWinsA,
                           let bestOf = liveMatch.score.bestOf {
                            TeamSeriesProgressView(wins: winsA, bestOf: bestOf)
                        } else {
                            Spacer()
                        }

                        Text(liveMatch.score.mapName ?? liveMatch.eventName)
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .center)

                        if let winsB = liveMatch.score.mapWinsB,
                           let bestOf = liveMatch.score.bestOf {
                            TeamSeriesProgressView(wins: winsB, bestOf: bestOf)
                        } else {
                            Spacer()
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if let nextMatch = entry.nextMatch {
                Text("Next match")
                    .font(.caption2)
                Text("\(nextMatch.teamA.displayName) vs \(nextMatch.teamB.displayName)")
                    .font(.caption)
                    .lineLimit(2)
            } else {
                Text("No tracked match")
                    .font(.caption)
            }
        }
    }

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.liveMatch == nil ? "Next" : "Live")
                .font(.headline)

            if let match = entry.liveMatch ?? entry.nextMatch {
                HStack {
                    TeamLogoView(team: match.teamA, size: 24)
                    Spacer()
                    Text(match.state == .live ? "\(match.score.teamAScore)-\(match.score.teamBScore)" : "vs")
                        .font(.system(.headline, design: .rounded).monospacedDigit())
                    Spacer()
                    TeamLogoView(team: match.teamB, size: 24)
                }
                Text(match.eventName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if match.state == .live {
                    if let mapName = match.score.mapName {
                        Text(mapName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                    }
                    if let winsA = match.score.mapWinsA,
                       let winsB = match.score.mapWinsB,
                       let bestOf = match.score.bestOf {
                        SeriesProgressView(winsA: winsA, winsB: winsB, bestOf: bestOf)
                    }
                } else {
                    Text(match.startTime, style: .time)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Spacer()
                Text("Choose teams in the app.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private var mediumView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let liveMatch = entry.liveMatch {
                Text("Live")
                    .font(.headline)

                HStack(alignment: .center, spacing: 16) {
                    VStack(spacing: 8) {
                        TeamLogoView(team: liveMatch.teamA, size: 30)
                        Text(liveMatch.teamA.displayName)
                            .font(.caption)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(spacing: 8) {
                        Text("\(liveMatch.score.teamAScore)-\(liveMatch.score.teamBScore)")
                            .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
                        Text(liveMatch.score.mapName ?? liveMatch.eventName)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                        if let winsA = liveMatch.score.mapWinsA,
                           let winsB = liveMatch.score.mapWinsB,
                           let bestOf = liveMatch.score.bestOf {
                            SeriesProgressView(winsA: winsA, winsB: winsB, bestOf: bestOf)
                        }
                    }
                    .frame(maxWidth: .infinity)

                    VStack(spacing: 8) {
                        TeamLogoView(team: liveMatch.teamB, size: 30)
                        Text(liveMatch.teamB.displayName)
                            .font(.caption)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else if let nextMatch = entry.nextMatch {
                Text("Next match")
                    .font(.headline)
                HStack(spacing: 12) {
                    VStack(spacing: 8) {
                        TeamLogoView(team: nextMatch.teamA, size: 28)
                        Text(nextMatch.teamA.displayName)
                            .font(.caption)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(spacing: 8) {
                        Text("vs")
                            .font(.title3.weight(.bold))
                        Text(nextMatch.startTime, format: .dateTime.hour().minute())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let bestOf = nextMatch.score.bestOf {
                            Text("BO\(bestOf)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)

                    VStack(spacing: 8) {
                        TeamLogoView(team: nextMatch.teamB, size: 28)
                        Text(nextMatch.teamB.displayName)
                            .font(.caption)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
                Text(nextMatch.eventName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text("No tracked match")
                    .font(.headline)
                Text("Choose teams in the app.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

private struct TeamSeriesProgressView: View {
    let wins: Int
    let bestOf: Int

    private var requiredWins: Int {
        max(1, (bestOf / 2) + 1)
    }

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<requiredWins, id: \.self) { index in
                WidgetDiamond(filled: index < wins)
            }
        }
        .frame(minWidth: 28, alignment: .center)
    }
}

private struct WidgetDiamond: View {
    let filled: Bool

    var body: some View {
        Rectangle()
            .rotation(Angle(degrees: 45))
            .fill(filled ? Color.primary : Color.clear)
            .overlay {
                Rectangle()
                    .rotation(Angle(degrees: 45))
                    .stroke(Color.primary, lineWidth: 1)
            }
            .frame(width: 8, height: 8)
            .padding(2)
    }
}

struct ValorantScoreLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ScoreActivityAttributes.self) { context in
            LiveActivityExpandedView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.88))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { _ in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    LiveActivityIslandPlaceholderView()
                }
            } compactLeading: {
                LiveActivityIslandPlaceholderView(compact: true)
            } compactTrailing: {
                EmptyView()
            } minimal: {
                LiveActivityIslandPlaceholderView(compact: true)
            }
        }
    }
}

private struct LiveActivityIslandPlaceholderView: View {
    var compact = false

    var body: some View {
        Color.clear
            .frame(width: compact ? 8 : 16, height: compact ? 8 : 16)
    }
}

private struct LiveActivityExpandedView: View {
    let state: ScoreActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(state.eventName)
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Text(state.teamAName)
                    .lineLimit(1)
                Spacer()
                Text("\(state.teamAScore)")
                    .font(.title2.monospacedDigit().bold())
            }

            HStack {
                Text(state.teamBName)
                    .lineLimit(1)
                Spacer()
                Text("\(state.teamBScore)")
                    .font(.title2.monospacedDigit().bold())
            }

            HStack(spacing: 8) {
                Text(state.detailLine)
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

private extension PreviewMatchRepository {
    static var sampleLiveMatch: Match {
        let teams = Team.catalog
        return Match(
            id: "sample-live",
            eventName: "VCT Masters Toronto",
            startTime: .now,
            teamA: teams[0],
            teamB: teams[1],
            state: .live,
            score: ScoreLine(teamAScore: 8, teamBScore: 7, mapName: "Bind", mapWinsA: 1, mapWinsB: 1, bestOf: 3),
            source: "preview",
            lastUpdated: .now
        )
    }

    static var sampleUpcomingMatch: Match {
        let teams = Team.catalog
        return Match(
            id: "sample-upcoming",
            eventName: "VCT EMEA",
            startTime: .now.addingTimeInterval(3_600),
            teamA: teams[2],
            teamB: teams[3],
            state: .upcoming,
            score: .zero,
            source: "preview",
            lastUpdated: .now
        )
    }
}

struct ScoreWidgetPushHandler: WidgetPushHandler {
    init() {}

    func pushTokenDidChange(_ pushInfo: WidgetPushInfo, widgets: [WidgetInfo]) {
        AppSecrets.appendPushDebugEvent(
            "widget pushTokenDidChange tokenBytes=\(pushInfo.token.count) widgets=\(widgets.count)"
        )
        Task.detached(priority: .background) {
            await ScoreWidgetPushRegistrationService().register(token: pushInfo.token, widgets: widgets)
        }
    }
}

private actor ScoreWidgetPushRegistrationService {
    private let session: URLSession = .shared

    func register(token: Data, widgets: [WidgetInfo]) async {
        let registeredWidgets = widgets.map {
            WidgetPushRegistrationPayload.RegisteredWidget(
                kind: $0.kind,
                family: String(describing: $0.family)
            )
        }

        await register(token: token, widgets: registeredWidgets)
    }

    func register(token: Data, widgets: [WidgetPushRegistrationPayload.RegisteredWidget]) async {
        let payload = WidgetPushRegistrationPayload(
            token: token.map { String(format: "%02x", $0) }.joined(),
            widgets: widgets
        )

        guard let body = try? JSONEncoder().encode(payload) else { return }

        var request = URLRequest(url: AppSecrets.backendBaseURL.appending(path: "api/v1/widget-push/register"))
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        AppSecrets.appendPushDebugEvent(
            "widget register sending tokenChars=\(payload.token.count) widgets=\(payload.widgets.count)"
        )

        do {
            let (_, response) = try await session.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            AppSecrets.appendPushDebugEvent("widget register response=\(statusCode)")
        } catch {
            AppSecrets.appendPushDebugEvent("widget register error=\(error.localizedDescription)")
        }
    }
}

private struct WidgetPushRegistrationPayload: Encodable {
    struct RegisteredWidget: Encodable {
        let kind: String
        let family: String
    }

    let token: String
    let widgets: [RegisteredWidget]
}
