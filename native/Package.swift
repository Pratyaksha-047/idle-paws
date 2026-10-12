// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Pawse",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "Pawse", path: "Sources/Pawse"),
    ]
)
