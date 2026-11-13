import DoStotinkaCore
import SwiftUI
import WebKit

/// The user's server full-screen: the web app with the `DoStotinkaApp` bridge.
struct WebView: UIViewRepresentable {
    @EnvironmentObject private var store: AppStore
    let server: URL

    func makeCoordinator() -> Coordinator { Coordinator(store: store, server: server) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppSchemeHandler(server: server), forURLScheme: AppFiles.scheme)
        config.applicationNameForUserAgent = "DoStotinkaApp/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") iOS"
        let content = config.userContentController
        content.add(context.coordinator, name: "app")
        content.addUserScript(
            WKUserScript(source: Bridge.script(info: store.info()), injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        context.coordinator.webView = webView
        webView.load(URLRequest(url: AppFiles.startURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let c = context.coordinator
        if c.reloadToken != store.reloadToken {
            c.reloadToken = store.reloadToken
            webView.load(URLRequest(url: AppFiles.startURL))
        }
        if c.infoVersion != store.infoVersion {
            c.infoVersion = store.infoVersion
            c.pushInfo()
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler,
        WKDownloadDelegate
    {
        let store: AppStore
        let server: URL
        weak var webView: WKWebView?
        var reloadToken: UUID
        var infoVersion: Int
        private var downloads: [ObjectIdentifier: URL] = [:]

        init(store: AppStore, server: URL) {
            self.store = store
            self.server = server
            reloadToken = store.reloadToken
            infoVersion = store.infoVersion
        }

        func pushInfo() {
            webView?.evaluateJavaScript(Bridge.update(info: store.info()))
        }

        // MARK: Bridge

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == AppFiles.scheme,
                  let body = message.body as? [String: Any], let action = body["action"] as? String
            else { return }
            switch action {
            case "connect":
                guard let token = body["token"] as? String, token.hasPrefix("dsn_") else { return }
                AppSettings.token = token
                AppSettings.sourceId = body["sourceId"] as? String
                AppSettings.sourceName = body["name"] as? String
                AppSettings.lastError = nil
                store.infoChanged()
                Task { await PaymentSender.shared.sendPending() }
            case "disconnect":
                AppSettings.disconnect()
                store.infoChanged()
            case "changeServer":
                store.changeServer()
            case "openSettings":
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            case "openShortcuts":
                if let url = URL(string: "shortcuts://") { UIApplication.shared.open(url) }
            default:
                break
            }
        }

        // MARK: Navigation

        func webView(
            _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url else { return decisionHandler(.cancel) }
            if url.scheme == AppFiles.scheme || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
                return decisionHandler(.allow)
            }
            // A link to the server itself stays in the app.
            if let inApp = AppFiles.appURL(for: url, server: server) {
                decisionHandler(.cancel)
                webView.load(URLRequest(url: inApp))
                return
            }
            // Everything else (bank pages, help links …) opens in Safari.
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
            if disposition.lowercased().hasPrefix("attachment") || !response.canShowMIMEType {
                decisionHandler(.download)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            store.showOffline(error.localizedDescription)
        }

        // window.open: bank consent pages and other sites open in Safari.
        func webView(
            _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction, windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url {
                if let inApp = AppFiles.appURL(for: url, server: server) ?? (url.scheme == AppFiles.scheme ? url : nil),
                   let target = AppFiles.serverURL(for: inApp, server: server)
                {
                    UIApplication.shared.open(target)
                } else {
                    UIApplication.shared.open(url)
                }
            }
            return nil
        }

        // MARK: Downloads (CSV exports, backups): saved, then the share sheet opens.

        func download(
            _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(suggestedFilename)
            try? FileManager.default.removeItem(at: file)
            downloads[ObjectIdentifier(download)] = file
            completionHandler(file)
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)),
                  let root = webView?.window?.rootViewController
            else { return }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = webView
            root.present(sheet, animated: true)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloads.removeValue(forKey: ObjectIdentifier(download))
        }
    }
}

/// The JavaScript side of `window.DoStotinkaApp` (same methods as the Android app).
enum Bridge {
    static func json(_ info: [String: Any]) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: info)) ?? Data("{}".utf8)
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    static func script(info: [String: Any]) -> String {
        """
        (function () {
          var info = \(json(info));
          var post = function (message) { window.webkit.messageHandlers.app.postMessage(message); };
          window.DoStotinkaApp = {
            getInfo: function () { return JSON.stringify(info); },
            connect: function (token, sourceId, name) {
              post({ action: 'connect', token: token, sourceId: sourceId, name: name });
              info.connected = true; info.sourceId = sourceId; info.sourceName = name;
              return true;
            },
            disconnect: function () { post({ action: 'disconnect' }); info.connected = false; },
            setWatched: function () {},
            openNotificationAccess: function () { post({ action: 'openShortcuts' }); },
            openAppInfo: function () { post({ action: 'openSettings' }); },
            openShortcuts: function () { post({ action: 'openShortcuts' }); },
            changeServer: function () { post({ action: 'changeServer' }); }
          };
          window.__dostotinkaSetInfo = function (next) { info = next; };
        })();
        """
    }

    static func update(info: [String: Any]) -> String {
        "window.__dostotinkaSetInfo && window.__dostotinkaSetInfo(\(json(info)));"
    }
}
