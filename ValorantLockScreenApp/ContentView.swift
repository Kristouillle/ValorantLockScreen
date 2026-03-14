import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settingsStore: SettingsStore
    @EnvironmentObject private var poller: MatchPollingViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Display") {
                    Toggle("Use Live Activity on Lock Screen", isOn: $settingsStore.liveActivitiesEnabled)

                    Text("Turn this off if you only want the widget and do not want a separate Live Activity card.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Tracked teams") {
                    NavigationLink("Select teams") {
                        TeamSelectionView()
                    }

                    if settingsStore.trackedTeams.isEmpty {
                        Text("No teams selected")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(settingsStore.trackedTeams) { team in
                            HStack(spacing: 12) {
                                TeamLogoView(team: team, size: 20)
                                    .frame(width: 24, height: 24)
                                Text(team.displayName)
                            }
                        }
                    }
                }

                Section("Current lock screen payload") {
                    CurrentMatchCard(match: poller.liveMatch)
                    CurrentMatchCard(match: poller.nextMatch, title: "Next up")

                    if let errorMessage = poller.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section("Tracked schedule") {
                    NavigationLink {
                        TrackedScheduleView(matches: poller.matches)
                    } label: {
                        HStack {
                            Text("View full tracked schedule")
                            Spacer()
                            if poller.matches.isEmpty == false {
                                Text("\(poller.matches.count)")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    if settingsStore.trackedTeams.isEmpty {
                        Text("Select teams to load their schedule.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else if poller.matches.isEmpty {
                        Text("The backend currently has no published matches for the selected teams.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Valorant Lock Screen")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await poller.refresh() }
                    } label: {
                        if poller.isRefreshing {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(poller.isRefreshing)
                }
            }
        }
    }
}

private struct CurrentMatchCard: View {
    let match: Match?
    var title: String = "Live match"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)

            if let match {
                Text(match.eventName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack {
                    TeamBadge(team: match.teamA)
                    Spacer()
                    Text(match.state == .upcoming ? "vs" : "\(match.score.teamAScore) - \(match.score.teamBScore)")
                        .font(match.state == .upcoming ? .headline : .title3.monospacedDigit())
                    Spacer()
                    TeamBadge(team: match.teamB)
                }
                if match.state == .upcoming {
                    HStack {
                        if let bestOf = match.score.bestOf {
                            Text("BO\(bestOf)")
                        }
                        Spacer()
                        Text(match.startTime, format: .dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } else {
                    if let mapName = match.score.mapName {
                        Text(mapName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let winsA = match.score.mapWinsA,
                       let winsB = match.score.mapWinsB,
                       let bestOf = match.score.bestOf {
                        SeriesProgressView(winsA: winsA, winsB: winsB, bestOf: bestOf)
                            .frame(maxWidth: 120)
                    }
                }
            } else {
                Text("No match available")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct TrackedScheduleView: View {
    let matches: [Match]

    private var dayGroups: [ScheduleDayGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: matches) { match in
            calendar.startOfDay(for: match.startTime)
        }

        return grouped.keys.sorted().map { day in
            let dayMatches = grouped[day, default: []].sorted { lhs, rhs in
                if lhs.startTime == rhs.startTime {
                    return lhs.id < rhs.id
                }
                return lhs.startTime < rhs.startTime
            }
            return ScheduleDayGroup(day: day, matches: dayMatches)
        }
    }

    var body: some View {
        List {
            if matches.isEmpty {
                Text("No schedule is currently available for the selected teams.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(dayGroups) { group in
                    Section(group.day.formatted(.dateTime.weekday(.wide).month(.wide).day())) {
                        ForEach(group.matches) { match in
                            MatchScheduleRow(match: match)
                        }
                    }
                }
            }
        }
        .navigationTitle("Tracked Schedule")
    }
}

private struct ScheduleDayGroup: Identifiable {
    let day: Date
    let matches: [Match]

    var id: Date { day }
}

private struct MatchScheduleRow: View {
    let match: Match

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                TeamLogoView(team: match.teamA, size: 18)
                TeamLogoView(team: match.teamB, size: 18)
            }
            .frame(width: 48, alignment: .leading)

            VStack(alignment: .leading, spacing: 4) {
                Text("\(match.teamA.displayName) vs \(match.teamB.displayName)")
                    .foregroundStyle(.primary)
                Text("\(match.eventName) • \(match.startTime.formatted(.dateTime.hour().minute()))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if match.state == .upcoming {
                    Text(match.score.bestOf.map { "BO\($0)" } ?? "Scheduled")
                        .font(.caption)
                    Text(match.state.displayTitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(match.score.teamAScore)-\(match.score.teamBScore)")
                        .font(.headline.monospacedDigit())
                    if let mapName = match.score.mapName {
                        Text(mapName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(match.state.displayTitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private extension MatchState {
    var displayTitle: String {
        switch self {
        case .upcoming:
            return "Upcoming"
        case .live:
            return "Live"
        case .completed:
            return "Final"
        case .delayed:
            return "Delayed"
        case .unknown:
            return "Unknown"
        }
    }
}

struct TeamBadge: View {
    let team: Team

    var body: some View {
        VStack(spacing: 6) {
            TeamLogoView(team: team, size: 28)
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.secondary.opacity(0.12))
                )
            Text(team.displayName)
                .font(.caption2)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: 88)
    }
}
