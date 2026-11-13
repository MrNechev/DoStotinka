import DoStotinkaCore
import Foundation
import UIKit

/// State of the app screens.
@MainActor
final class AppStore: ObservableObject {
    static let shared = AppStore()

    enum Screen: Equatable {
        case setup
        case web
        case offline(String)
    }

    @Published var server: URL? = AppSettings.server
    @Published var screen: Screen = AppSettings.server == nil ? .setup : .web
    /// Changes when the web view should load the start page again.
    @Published var reloadToken = UUID()
    /// Changes when the information shown to the web app changed (bridge).
    @Published var infoVersion = 0

    func connect(to url: URL) {
        AppSettings.server = url
        server = url
        screen = .web
        reloadToken = UUID()
    }

    /// Forgets the server, its web app copy and the phone token.
    func changeServer() {
        AppSettings.server = nil
        AppSettings.disconnect()
        OfflineFiles.shared.clear()
        server = nil
        screen = .setup
    }

    func showOffline(_ reason: String) { screen = .offline(reason) }

    func retry() {
        screen = .web
        reloadToken = UUID()
    }

    func infoChanged() { infoVersion += 1 }

    /// What the web app reads with `DoStotinkaApp.getInfo()` (same shape as on Android).
    func info() -> [String: Any] {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        return [
            "platform": "ios",
            "appVersion": version,
            "device": UIDevice.current.name,
            "server": AppSettings.server?.absoluteString as Any,
            "connected": AppSettings.token != nil,
            "sourceId": AppSettings.sourceId as Any,
            "sourceName": AppSettings.sourceName as Any,
            "notificationAccess": true,
            "watched": [String](),
            "recent": [[String: Any]](),
            "lastSentAt": Int((AppSettings.lastSentAt?.timeIntervalSince1970 ?? 0) * 1000),
            "sentCount": AppSettings.sentCount,
            "lastError": AppSettings.lastError as Any,
            "pending": AppSettings.pending.items.count,
        ]
    }
}
