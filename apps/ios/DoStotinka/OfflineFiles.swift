import DoStotinkaCore
import Foundation

/// The copy of the web app's files (never data) in Application Support.
final class OfflineFiles: @unchecked Sendable {
    static let shared = OfflineFiles()
    private let directory: URL
    private let queue = DispatchQueue(label: "app.dostotinka.offline-files")

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directory = base.appendingPathComponent("web", isDirectory: true)
    }

    func read(_ key: String) -> Data? {
        queue.sync { try? Data(contentsOf: directory.appendingPathComponent(key)) }
    }

    func write(_ key: String, _ data: Data) {
        queue.async { [directory] in
            let file = directory.appendingPathComponent(key)
            try? FileManager.default.createDirectory(
                at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: file, options: .atomic)
        }
    }

    func clear() {
        queue.async { [directory] in try? FileManager.default.removeItem(at: directory) }
    }
}
