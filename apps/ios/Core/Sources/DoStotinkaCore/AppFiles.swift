import Foundation

/// The web app is shown from `dostotinka://app/…`; every request goes through the app, which
/// forwards it to the server and keeps a copy of the web app's files for offline use.
public enum AppFiles {
    public static let scheme = "dostotinka"
    public static let host = "app"
    public static let startURL = URL(string: "dostotinka://app/")!

    /// The server URL for a request of the web view (same path and query).
    public static func serverURL(for url: URL, server: URL) -> URL? {
        guard url.scheme == scheme, url.host == host else { return nil }
        var components = URLComponents(url: server, resolvingAgainstBaseURL: false)
        let base = components?.path ?? ""
        components?.path = base + (url.path.isEmpty ? "/" : url.path)
        components?.percentEncodedQuery = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .percentEncodedQuery
        return components?.url
    }

    /// The `dostotinka://app/…` address of a server URL (links back into the app).
    public static func appURL(for url: URL, server: URL) -> URL? {
        guard url.scheme == server.scheme, url.host == server.host, url.port == server.port
        else { return nil }
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.path = url.path.isEmpty ? "/" : url.path
        components.percentEncodedQuery = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .percentEncodedQuery
        return components.url
    }

    public static func isAPI(_ path: String) -> Bool { path.hasPrefix("/api/") || path == "/api" }

    /// Where a file is kept: build assets by their path, every page of the app as index.html.
    /// Nil for API calls (never kept) and suspicious paths.
    public static func storageKey(for path: String) -> String? {
        if isAPI(path) || path.contains("..") { return nil }
        let name = path.split(separator: "/").last.map(String.init) ?? ""
        if path.hasPrefix("/assets/") || name.contains(".") {
            let key = String(path.drop(while: { $0 == "/" }))
            return key.isEmpty ? "index.html" : key
        }
        return "index.html"
    }

    /// Files under /assets/ have a hash in their name and never change.
    public static func isImmutable(_ path: String) -> Bool { path.hasPrefix("/assets/") }

    public static func mimeType(for key: String) -> String {
        switch (key as NSString).pathExtension.lowercased() {
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "json", "webmanifest": return "application/json"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        default: return "text/html"
        }
    }
}
