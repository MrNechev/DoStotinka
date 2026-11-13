import Foundation

/// The address of the user's DoStotinka server.
public enum ServerAddress {
    /// "192.168.1.5:8742/" → "http://192.168.1.5:8742". Nil when it is no usable address.
    public static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") { text.removeLast() }
        if text.isEmpty { return nil }
        let lower = text.lowercased()
        if !lower.hasPrefix("http://") && !lower.hasPrefix("https://") {
            if lower.contains("://") { return nil }  // another scheme (ftp:// …)
            text = "http://" + text
        }
        guard let url = URL(string: text),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host, !host.isEmpty,
              url.query == nil, url.fragment == nil
        else { return nil }
        return url
    }

    /// Whether the answer of `/api/health` comes from a DoStotinka server.
    public static func isHealthy(_ data: Data) -> Bool {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return false
        }
        return json["status"] as? String == "ok"
    }
}
