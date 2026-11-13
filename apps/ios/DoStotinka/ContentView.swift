import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        switch store.screen {
        case .setup:
            SetupView()
        case .web:
            if let server = store.server {
                WebView(server: server)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .background(Color(.systemBackground))
            } else {
                SetupView()
            }
        case .offline(let reason):
            OfflineView(reason: reason)
        }
    }
}

struct OfflineView: View {
    @EnvironmentObject private var store: AppStore
    let reason: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text("Your server cannot be reached")
                .font(.title3.weight(.semibold))
            Text([store.server?.absoluteString, reason].compactMap { $0 }.joined(separator: "\n"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again") { store.retry() }
                .buttonStyle(.borderedProminent)
                .tint(Color("AccentColor"))
            Button("Change server") { store.changeServer() }
                .tint(Color("AccentColor"))
        }
        .padding(32)
    }
}
