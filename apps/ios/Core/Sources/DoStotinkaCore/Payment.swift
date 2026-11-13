import Foundation

/// A card payment from the Shortcuts action (e.g. the Wallet "Transaction" automation).
public struct Payment: Codable, Equatable, Sendable {
    public var id: String
    public var amount: Decimal
    public var currency: String?
    public var merchant: String?
    public var card: String?
    public var income: Bool
    public var time: Date

    public init(
        id: String = UUID().uuidString, amount: Decimal, currency: String?, merchant: String?,
        card: String?, income: Bool = false, time: Date = Date()
    ) {
        self.id = id
        self.amount = amount
        self.currency = currency
        self.merchant = merchant
        self.card = card
        self.income = income
        self.time = time
    }

    /// Name of the source in DoStotinka – every card can be mapped to its own account.
    public var appName: String {
        let card = (card ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return card.isEmpty ? "Apple Wallet" : "Apple Wallet · \(card)"
    }

    /// Body for `POST /api/ingest/notification`.
    public func ingestBody() throws -> Data {
        let formatter = ISO8601DateFormatter()
        var body: [String: Any] = [
            "app": appName,
            "amount": NSDecimalNumber(decimal: abs(amount)).stringValue,
            "type": income ? "income" : "expense",
            "time": formatter.string(from: time),
        ]
        if let merchant = merchant?.trimmingCharacters(in: .whitespacesAndNewlines), !merchant.isEmpty {
            body["merchant"] = merchant
            body["title"] = merchant
        }
        if let currency = currency?.uppercased(), currency.count == 3 { body["currency"] = currency }
        return try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    }
}

/// Payments that could not be sent yet (server not reachable) – sent with the next one.
public struct PendingPayments: Codable, Equatable, Sendable {
    public static let limit = 500
    public private(set) var items: [Payment] = []

    public init(items: [Payment] = []) { self.items = items }

    public mutating func add(_ payment: Payment) {
        items.removeAll { $0.id == payment.id }
        items.append(payment)
        if items.count > Self.limit { items.removeFirst(items.count - Self.limit) }
    }

    public mutating func remove(id: String) { items.removeAll { $0.id == id } }

    public var isEmpty: Bool { items.isEmpty }
}
