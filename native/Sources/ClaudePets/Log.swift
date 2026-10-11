import Foundation

enum Log {
    private static let queue = DispatchQueue(label: "claude-pets.log")
    private static let formatter = ISO8601DateFormatter()
    private static let handle: FileHandle? = {
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/claude-pets.log")
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        let handle = try? FileHandle(forWritingTo: url)
        handle?.seekToEndOfFile()
        return handle
    }()

    static func info(_ message: String) {
        let line = "\(formatter.string(from: Date())) [\(getpid())] \(message)\n"
        queue.async {
            guard let data = line.data(using: .utf8) else { return }
            handle?.write(data)
            FileHandle.standardError.write(data)
        }
    }

    static func flush() {
        queue.sync {}
    }
}
