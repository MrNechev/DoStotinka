import DoStotinkaCore
import Foundation
import WebKit

/// Serves `dostotinka://app/…`: every request is forwarded to the server (with the login cookie
/// kept by URLSession). The web app's files are also saved; when the server cannot be reached
/// they are served from the copy, so records can be added offline.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let server: URL
    private let session: URLSession
    private var stopped = Set<ObjectIdentifier>()

    init(server: URL) {
        self.server = server
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpCookieStorage = .shared
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config)
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let target = AppFiles.serverURL(for: url, server: server)
        else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        let path = url.path.isEmpty ? "/" : url.path
        let method = task.request.httpMethod ?? "GET"
        let key = method == "GET" ? AppFiles.storageKey(for: path) : nil
        let id = ObjectIdentifier(task)

        // Build files never change: answer from the copy right away.
        if let key, AppFiles.isImmutable(path), let data = OfflineFiles.shared.read(key) {
            respond(task, url: url, status: 200, headers: ["Content-Type": AppFiles.mimeType(for: key)], data: data)
            return
        }

        var request = URLRequest(url: target)
        request.httpMethod = method
        request.httpBody = task.request.httpBody ?? Self.readStream(task.request.httpBodyStream)
        request.timeoutInterval = key != nil ? 6 : 30
        for (name, value) in task.request.allHTTPHeaderFields ?? [:] where name.lowercased() != "cookie" {
            request.setValue(value, forHTTPHeaderField: name)
        }

        session.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self, !self.stopped.contains(id) else { return }
                if let http = response as? HTTPURLResponse, let data {
                    if let key, http.statusCode == 200 { OfflineFiles.shared.write(key, data) }
                    var headers: [String: String] = [:]
                    for (name, value) in http.allHeaderFields {
                        guard let name = name as? String, let value = value as? String else { continue }
                        let lower = name.lowercased()
                        // Cookies stay in URLSession; the page must not get the server's CSP for
                        // another origin.
                        if lower == "set-cookie" || lower == "content-security-policy" { continue }
                        headers[name] = value
                    }
                    self.respond(task, url: url, status: http.statusCode, headers: headers, data: data)
                } else if let key, let copy = OfflineFiles.shared.read(key) {
                    self.respond(task, url: url, status: 200, headers: ["Content-Type": AppFiles.mimeType(for: key)], data: copy)
                } else {
                    task.didFailWithError(error ?? URLError(.cannotConnectToHost))
                }
            }
        }.resume()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, headers: [String: String], data: Data) {
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private static func readStream(_ stream: InputStream?) -> Data? {
        guard let stream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let size = 64 * 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: size)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}
