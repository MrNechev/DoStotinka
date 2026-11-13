import XCTest

/// Runs against UITests/fixture_server.py on port 8899 (started by the CI workflow):
/// `testOnline` with the server running, then `testOffline` after it was stopped.
final class DoStotinkaUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func text(_ app: XCUIApplication, _ value: String) -> XCUIElement {
        app.webViews.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", value)).firstMatch
    }

    func testOnline() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-reset"]
        app.launch()

        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 15), "setup screen")
        field.tap()
        field.typeText("127.0.0.1:8899")
        app.buttons["Connect"].tap()

        // The page comes through the app's scheme handler and sees the bridge.
        XCTAssertTrue(text(app, "platform:ios").waitForExistence(timeout: 30), "bridge")
        XCTAssertTrue(text(app, "server:http://127.0.0.1:8899").exists)
        XCTAssertTrue(text(app, "api:ok").waitForExistence(timeout: 15), "API through the app")
    }

    func testOffline() {
        // Server stopped: the app opens from its copy of the web app; the API is unreachable.
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(text(app, "platform:ios").waitForExistence(timeout: 30), "offline copy")
        XCTAssertTrue(text(app, "api:offline").waitForExistence(timeout: 30), "API offline")
    }
}
