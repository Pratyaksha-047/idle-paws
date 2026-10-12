// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "IdlePaws",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "IdlePaws", path: "Sources/IdlePaws"),
    ]
)
