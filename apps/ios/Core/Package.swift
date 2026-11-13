// swift-tools-version:5.9
import PackageDescription

// The logic of the iPhone app that does not need UIKit or WebKit – tested on Linux too
// (`swift test` in this folder).
let package = Package(
    name: "DoStotinkaCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "DoStotinkaCore", targets: ["DoStotinkaCore"])],
    targets: [
        .target(name: "DoStotinkaCore"),
        .testTarget(name: "DoStotinkaCoreTests", dependencies: ["DoStotinkaCore"]),
    ]
)
