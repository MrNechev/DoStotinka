import DoStotinkaCore
import Foundation
import Security

/// Everything the app remembers (the phone token in the keychain, the rest in UserDefaults).
/// Used by the app and by the Shortcuts action.
enum AppSettings {
    private static let defaults = UserDefaults.standard

    static var server: URL? {
        get { defaults.string(forKey: "server").flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: "server") }
    }

    /// Phone token (`dsn_…`) for sending payments to the inbox.
    static var token: String? {
        get { Keychain.read("phoneToken") }
        set {
            if let newValue { Keychain.write("phoneToken", newValue) } else { Keychain.delete("phoneToken") }
        }
    }

    static var sourceId: String? {
        get { defaults.string(forKey: "sourceId") }
        set { defaults.set(newValue, forKey: "sourceId") }
    }

    static var sourceName: String? {
        get { defaults.string(forKey: "sourceName") }
        set { defaults.set(newValue, forKey: "sourceName") }
    }

    static var lastSentAt: Date? {
        get { defaults.object(forKey: "lastSentAt") as? Date }
        set { defaults.set(newValue, forKey: "lastSentAt") }
    }

    static var sentCount: Int {
        get { defaults.integer(forKey: "sentCount") }
        set { defaults.set(newValue, forKey: "sentCount") }
    }

    static var lastError: String? {
        get { defaults.string(forKey: "lastError") }
        set { defaults.set(newValue, forKey: "lastError") }
    }

    static var pending: PendingPayments {
        get {
            guard let data = defaults.data(forKey: "pendingPayments"),
                  let queue = try? JSONDecoder().decode(PendingPayments.self, from: data)
            else { return PendingPayments() }
            return queue
        }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "pendingPayments") }
    }

    static func disconnect() {
        token = nil
        sourceId = nil
        sourceName = nil
        lastError = nil
    }
}

private enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.dostotinka.ios",
            kSecAttrAccount as String: key,
        ]
    }

    static func read(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ key: String, _ value: String) {
        delete(key)
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        // Readable by the Shortcuts action while the phone is locked after the first unlock.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
