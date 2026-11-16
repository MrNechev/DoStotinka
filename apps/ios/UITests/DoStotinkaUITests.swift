import XCTest

/// Runs against UITests/fixture_server.py on port 8899 (started by the CI workflow):
/// `testOnline` with the server running, then `testOffline` after it was stopped.
final class DoStotinkaUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
        // A system alert (e.g. local network access) must not block the test.
        addUIInterruptionMonitor(withDescription: "System alert") { alert in
            for label in ["Allow", "OK", "Continue"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
    }

    /** What is on screen, on one line (shown in the CI annotation when a check fails). */
    private func screen(_ app: XCUIApplication) -> String {
        app.debugDescription.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.contains("label") || $0.contains("value") }.prefix(25).joined(separator: " | ")
    }

    private func text(_ app: XCUIApplication, _ value: String) -> XCUIElement {
        app.webViews.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", value)).firstMatch
    }

    func testOnline() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-reset"]
        app.launch()

        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 60), "setup screen: \(screen(app))")
        field.tap()
        field.typeText("127.0.0.1:8899")
        app.buttons["Connect"].tap()
        app.tap()  // lets the interruption monitor handle an alert

        // The page comes through the app's scheme handler and sees the bridge.
        XCTAssertTrue(text(app, "platform:ios").waitForExistence(timeout: 90), "bridge: \(screen(app))")
        XCTAssertTrue(text(app, "server:http://127.0.0.1:8899").exists, screen(app))
        XCTAssertTrue(text(app, "api:ok").waitForExistence(timeout: 30), "API: \(screen(app))")
    }

    func testOffline() {
        // Server stopped: the app opens from its copy of the web app; the API is unreachable.
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(text(app, "platform:ios").waitForExistence(timeout: 90), "offline copy: \(screen(app))")
        XCTAssertTrue(text(app, "api:offline").waitForExistence(timeout: 60), "API offline: \(screen(app))")
    }
}
