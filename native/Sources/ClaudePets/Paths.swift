import Foundation

enum Paths {
    static let support: URL = {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("claude-pets", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    static let socket = support.appendingPathComponent("pets.sock").path
    static let prefs = support.appendingPathComponent("prefs.json")

    static let web: URL = {
        if let override = ProcessInfo.processInfo.environment["CLAUDE_PETS_WEB"] {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        return Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    }()
}
