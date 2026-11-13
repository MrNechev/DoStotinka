import SwiftUI

@main
struct DoStotinkaApp: App {
    @StateObject private var store = AppStore.shared
    @Environment(\.scenePhase) private var scenePhase

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
