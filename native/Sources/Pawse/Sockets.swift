import Foundation

enum Sockets {
    static func unixAddress(_ path: String) -> sockaddr_un {
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let capacity = MemoryLayout.size(ofValue: addr.sun_path) - 1
        let bytes = Array(path.utf8.prefix(capacity))
        withUnsafeMutableBytes(of: &addr.sun_path) { buffer in
            for (index, byte) in bytes.enumerated() { buffer[index] = byte }
        }
        return addr
    }

    static func connectUnix(_ path: String) -> Int32? {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var addr = unixAddress(path)
        let result = withUnsafePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result == 0 else {
            close(fd)
            return nil
        }
        return fd
    }

    static func noSigPipe(_ fd: Int32) {
        var on: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
    }

    @discardableResult
    static func writeAll(_ fd: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return true }
            var offset = 0
            while offset < raw.count {
                let written = write(fd, base + offset, raw.count - offset)
                if written <= 0 { return false }
                offset += written
            }
            return true
        }
    }
}

/// Reads newline-delimited messages from a blocking file descriptor.
final class LineReader {
    private let fd: Int32
    private var buffer = Data()

    init(fd: Int32) {
        self.fd = fd
    }

    func next(maxBytes: Int = 1 << 20) -> String? {
        var chunk = [UInt8](repeating: 0, count: 4096)
        while true {
            if let newline = buffer.firstIndex(of: 0x0A) {
                let line = buffer[buffer.startIndex..<newline]
                buffer.removeSubrange(buffer.startIndex...newline)
                return String(decoding: line, as: UTF8.self)
            }
            if buffer.count > maxBytes { return nil }
            let count = read(fd, &chunk, chunk.count)
            if count <= 0 { return nil }
            buffer.append(contentsOf: chunk[0..<count])
        }
    }
}
