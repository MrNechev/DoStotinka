import DoStotinkaCore
import Foundation

/// Sends payments from the Shortcuts action to the inbox (`POST /api/ingest/notification` with
/// the phone token). Payments that cannot be sent wait and go with the next one.
actor PaymentSender {
    static let shared = PaymentSender()

    enum Outcome {
        case sent
        case queued(String)
        case notConnected
    }

    func send(_ payment: Payment) async -> Outcome {
        guard AppSettings.server != nil, AppSettings.token != nil else { return .notConnected }
        var queue = AppSettings.pending
        queue.add(payment)
        AppSettings.pending = queue
        let error = await flush()
        return AppSettings.pending.items.contains(where: { $0.id == payment.id }) ? .queued(error ?? "") : .sent
    }

    func sendPending() async {
        _ = await flush()
    }

    /// Sends what is waiting; returns the last error.
    private func flush() async -> String? {
        guard let server = AppSettings.server, let token = AppSettings.token else { return nil }
        var lastError: String?
        for payment in AppSettings.pending.items {
            do {
                var request = URLRequest(url: server.appendingPathComponent("api/ingest/notification"))
                request.httpMethod = "POST"
                request.timeoutInterval = 15
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try payment.ingestBody()
                let (_, response) = try await URLSession.shared.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if (200..<300).contains(status) {
                    var queue = AppSettings.pending
                    queue.remove(id: payment.id)
                    AppSettings.pending = queue
                    AppSettings.lastSentAt = Date()
                    AppSettings.sentCount += 1
                    AppSettings.lastError = nil
                } else if status == 401 || status == 403 || status == 400 {
                    // Removed in DoStotinka or switched off – keeping it would never help.
                    var queue = AppSettings.pending
                    queue.remove(id: payment.id)
                    AppSettings.pending = queue
                    lastError = "HTTP \(status)"
                    AppSettings.lastError = lastError
                } else {
                    lastError = "HTTP \(status)"
                    AppSettings.lastError = lastError
                    break
                }
            } catch {
                lastError = error.localizedDescription
                AppSettings.lastError = lastError
                break
            }
        }
        await MainActor.run { AppStore.shared.infoChanged() }
        return lastError
    }
}
