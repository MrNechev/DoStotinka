import XCTest

@testable import DoStotinkaCore

final class ServerAddressTests: XCTestCase {
    func testNormalizes() {
        XCTAssertEqual(ServerAddress.normalize(" 192.168.1.5:8742/ ")?.absoluteString, "http://192.168.1.5:8742")
        XCTAssertEqual(ServerAddress.normalize("https://money.example.com")?.absoluteString, "https://money.example.com")
        XCTAssertEqual(ServerAddress.normalize("HTTP://Box:8742//")?.absoluteString, "HTTP://Box:8742")
        XCTAssertNil(ServerAddress.normalize(""))
        XCTAssertNil(ServerAddress.normalize("ftp://x"))
        XCTAssertNil(ServerAddress.normalize("http://x/?a=1"))
    }

    func testHealth() {
        XCTAssertTrue(ServerAddress.isHealthy(Data(#"{"status":"ok","version":"0.9.0"}"#.utf8)))
        XCTAssertFalse(ServerAddress.isHealthy(Data("<html>".utf8)))
    }
}

final class AppFilesTests: XCTestCase {
    let server = URL(string: "http://192.168.1.5:8742")!

    func testMapsToTheServer() {
        let url = URL(string: "dostotinka://app/api/records?limit=5&q=a%20b")!
        XCTAssertEqual(
            AppFiles.serverURL(for: url, server: server)?.absoluteString,
            "http://192.168.1.5:8742/api/records?limit=5&q=a%20b")
        XCTAssertEqual(
            AppFiles.serverURL(for: AppFiles.startURL, server: server)?.absoluteString,
            "http://192.168.1.5:8742/")
        XCTAssertNil(AppFiles.serverURL(for: URL(string: "https://evil.example/x")!, server: server))
        // Servers below a path (reverse proxy).
        XCTAssertEqual(
            AppFiles.serverURL(for: url, server: URL(string: "https://x.org/money")!)?.absoluteString,
            "https://x.org/money/api/records?limit=5&q=a%20b")
    }

    func testMapsBack() {
        XCTAssertEqual(
            AppFiles.appURL(for: URL(string: "http://192.168.1.5:8742/inbox?x=1")!, server: server)?.absoluteString,
            "dostotinka://app/inbox?x=1")
        XCTAssertNil(AppFiles.appURL(for: URL(string: "https://bank.example/consent")!, server: server))
    }

    func testStorageKeys() {
        XCTAssertEqual(AppFiles.storageKey(for: "/"), "index.html")
        XCTAssertEqual(AppFiles.storageKey(for: "/records"), "index.html")
        XCTAssertEqual(AppFiles.storageKey(for: "/accounts/123"), "index.html")
        XCTAssertEqual(AppFiles.storageKey(for: "/assets/App-x1.js"), "assets/App-x1.js")
        XCTAssertEqual(AppFiles.storageKey(for: "/favicon.svg"), "favicon.svg")
        XCTAssertNil(AppFiles.storageKey(for: "/api/me"))
        XCTAssertNil(AppFiles.storageKey(for: "/assets/../secret"))
        XCTAssertTrue(AppFiles.isImmutable("/assets/a.js"))
        XCTAssertEqual(AppFiles.mimeType(for: "assets/a.js"), "text/javascript")
        XCTAssertEqual(AppFiles.mimeType(for: "index.html"), "text/html")
    }
}

final class PaymentTests: XCTestCase {
    func testIngestBody() throws {
        let payment = Payment(
            id: "1", amount: Decimal(string: "12.5")!, currency: "eur", merchant: " Lidl ",
            card: "Revolut", time: Date(timeIntervalSince1970: 0))
        let json = try JSONSerialization.jsonObject(with: payment.ingestBody()) as! [String: String]
        XCTAssertEqual(json["app"], "Apple Wallet · Revolut")
        XCTAssertEqual(json["amount"], "12.5")
        XCTAssertEqual(json["currency"], "EUR")
        XCTAssertEqual(json["merchant"], "Lidl")
        XCTAssertEqual(json["type"], "expense")
        XCTAssertEqual(json["time"], "1970-01-01T00:00:00Z")
        let income = Payment(amount: -3, currency: nil, merchant: nil, card: nil, income: true)
        let j2 = try JSONSerialization.jsonObject(with: income.ingestBody()) as! [String: String]
        XCTAssertEqual(j2["app"], "Apple Wallet")
        XCTAssertEqual(j2["amount"], "3")
        XCTAssertEqual(j2["type"], "income")
        XCTAssertNil(j2["merchant"])
    }

    func testPendingQueue() throws {
        var queue = PendingPayments()
        let a = Payment(id: "a", amount: 1, currency: nil, merchant: nil, card: nil)
        queue.add(a)
        queue.add(a)
        XCTAssertEqual(queue.items.count, 1)
        for i in 0..<(PendingPayments.limit + 5) {
            queue.add(Payment(id: "\(i)", amount: 1, currency: nil, merchant: nil, card: nil))
        }
        XCTAssertEqual(queue.items.count, PendingPayments.limit)
        queue.remove(id: "504")
        XCTAssertFalse(queue.items.contains { $0.id == "504" })
        let data = try JSONEncoder().encode(queue)
        XCTAssertEqual(try JSONDecoder().decode(PendingPayments.self, from: data), queue)
    }
}
