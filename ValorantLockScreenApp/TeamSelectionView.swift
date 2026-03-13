import SwiftUI

struct TeamSelectionView: View {
    @EnvironmentObject private var settingsStore: SettingsStore

    var body: some View {
        List {
            ForEach(TeamRegion.allCases) { region in
                Section(region.rawValue) {
                    regionToggleRow(for: region)

                    ForEach(Team.catalog(for: region)) { team in
                        Button {
                            settingsStore.toggle(teamID: team.id)
                        } label: {
                            HStack(spacing: 12) {
                                TeamLogoView(team: team, size: 22)
                                    .frame(width: 28, height: 28)

                                Text(team.displayName)
                                    .foregroundStyle(.primary)

                                Spacer()

                                if settingsStore.trackedTeamIDs.contains(team.id) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                } else {
                                    Image(systemName: "circle")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationTitle("Select Teams")
    }

    private func regionToggleRow(for region: TeamRegion) -> some View {
        let regionTeams = Team.catalog(for: region)
        let regionTeamIDs = regionTeams.map(\.id)
        let isTrackingEntireRegion = settingsStore.isTrackingAll(teamIDs: regionTeamIDs)

        return Button {
            settingsStore.setTracking(teamIDs: regionTeamIDs, enabled: isTrackingEntireRegion == false)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Follow All \(region.rawValue) Teams")
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                    Text("\(regionTeams.count) teams")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isTrackingEntireRegion {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else {
                    Image(systemName: "circle")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
