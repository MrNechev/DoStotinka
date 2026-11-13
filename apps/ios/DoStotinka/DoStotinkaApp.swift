import SwiftUI

@main
struct DoStotinkaApp: App {
    @StateObject private var store = AppStore.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        #if DEBUG
        // UI tests start from a fresh app.
        if ProcessInfo.processInfo.arguments.contains("-uitest-reset") {
            AppSettings.server = nil
            AppSettings.disconnect()
            OfflineFiles.shared.clear()
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
        .onChange(of: scenePhase) { phase in
            // Payments from Shortcuts that could not be sent yet.
            if phase == .active { Task { await PaymentSender.shared.sendPending() } }
        }
    }
}
