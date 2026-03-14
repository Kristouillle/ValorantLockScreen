import SwiftUI

@main
struct ValorantLockScreenApp: App {
    @StateObject private var settingsStore = SettingsStore()
    @StateObject private var poller = MatchPollingViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settingsStore)
                .environmentObject(poller)
                .task {
                    await poller.configure(with: settingsStore)
                    await poller.refresh()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    Task {
                        poller.setForegroundRefreshingEnabled(newPhase == .active)
                        guard newPhase == .active else { return }
                        await poller.refresh()
                    }
                }
                .onChange(of: settingsStore.trackedTeamIDs) { _, _ in
                    Task {
                        await poller.refresh()
                    }
                }
                .onChange(of: settingsStore.liveActivitiesEnabled) { _, _ in
                    Task {
                        await poller.applyLiveActivityPreference()
                    }
                }
                .task {
                    poller.setForegroundRefreshingEnabled(true)
                }
        }
    }
}
