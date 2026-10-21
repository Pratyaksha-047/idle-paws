import Foundation

/// Minimal static file server for the games, bound to loopback only.
final class HTTPServer {
    let root: URL
    private(set) var port: UInt16 = 0
    /// Generated responses (path -> JSON body). Called on the connection's thread.
    var dynamicRoutes: [String: () -> Data] = [:]

    private static let contentTypes = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json",
        "png": "image/png",
        "svg": "image/svg+xml",
        "ico": "image/x-icon",
    ]

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func start(preferred: UInt16 = 4747) {
        for candidate in preferred..<(preferred + 20) {
            guard let v4 = Self.listen(ipv6: false, port: candidate) else { continue }
            port = candidate
            acceptLoop(v4)
            if let v6 = Self.listen(ipv6: true, port: candidate) { acceptLoop(v6) }
            Log.info("http: serving \(root.path) on localhost:\(candidate)")
            return
        }
        Log.info("http: no free port in \(preferred)..<\(preferred + 20)")
    }

    private static func listen(ipv6: Bool, port: UInt16) -> Int32? {
        let fd = socket(ipv6 ? AF_INET6 : AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var on: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, socklen_t(MemoryLayout<Int32>.size))
        let bound: Int32
        if ipv6 {
            setsockopt(fd, IPPROTO_IPV6, IPV6_V6ONLY, &on, socklen_t(MemoryLayout<Int32>.size))
            var addr = sockaddr_in6()
            addr.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.size)
            addr.sin6_family = sa_family_t(AF_INET6)
            addr.sin6_port = port.bigEndian
            addr.sin6_addr = in6addr_loopback
            bound = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in6>.size)) }
            }
        } else {
            var addr = sockaddr_in()
            addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = port.bigEndian
            addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
            bound = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
            }
        }
        guard bound == 0, Darwin.listen(fd, 32) == 0 else {
            close(fd)
            return nil
        }
        return fd
    }

    private func acceptLoop(_ fd: Int32) {
        Thread.detachNewThread { [weak self] in
            while true {
                let client = Darwin.accept(fd, nil, nil)
                if client < 0 { continue }
                Thread.detachNewThread { self?.handle(client) }
            }
        }
    }

    private func handle(_ fd: Int32) {
        defer { close(fd) }
        Sockets.noSigPipe(fd)
        var timeout = timeval(tv_sec: 5, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        var request = Data()
        var chunk = [UInt8](repeating: 0, count: 4096)
        let terminator = Data("\r\n\r\n".utf8)
        while request.range(of: terminator) == nil {
            guard request.count < 16384 else { return respond(fd, 431, "Request Header Fields Too Large") }
            let count = read(fd, &chunk, chunk.count)
            if count <= 0 { return }
            request.append(contentsOf: chunk[0..<count])
        }

        let lines = String(decoding: request, as: UTF8.self).components(separatedBy: "\r\n")
        let parts = lines[0].split(separator: " ")
        guard parts.count >= 2 else { return respond(fd, 400, "Bad Request") }
        let method = String(parts[0])
        let host = lines.first { $0.lowercased().hasPrefix("host:") }
            .map { $0.dropFirst(5).trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        let allowedHosts = ["localhost:\(port)", "127.0.0.1:\(port)", "[::1]:\(port)"]
        guard allowedHosts.contains(host) else { return respond(fd, 403, "Forbidden") }
        guard method == "GET" || method == "HEAD" else { return respond(fd, 405, "Method Not Allowed") }

        let target = String(parts[1].split(separator: "?", maxSplits: 1).first ?? "/")
        let path = target.removingPercentEncoding ?? target
        if let route = dynamicRoutes[path] {
            return respond(fd, 200, "OK", headers: ["Content-Type": "application/json"], body: route(), headOnly: method == "HEAD")
        }
        var file = root.appendingPathComponent(String(path.drop { $0 == "/" })).standardizedFileURL
        guard file.path == root.path || file.path.hasPrefix(root.path + "/") else { return respond(fd, 404, "Not Found") }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory) else {
            return respond(fd, 404, "Not Found")
        }
        if isDirectory.boolValue {
            guard path.hasSuffix("/") else {
                return respond(fd, 301, "Moved Permanently", headers: ["Location": path + "/"])
            }
            file = file.appendingPathComponent("index.html")
        }
        guard let body = try? Data(contentsOf: file) else { return respond(fd, 404, "Not Found") }
        let type = Self.contentTypes[file.pathExtension.lowercased()] ?? "application/octet-stream"
        respond(fd, 200, "OK", headers: ["Content-Type": type], body: body, headOnly: method == "HEAD")
    }

    private func respond(_ fd: Int32, _ status: Int, _ reason: String, headers: [String: String] = [:],
                         body: Data? = nil, headOnly: Bool = false) {
        let payload = body ?? Data("\(status) \(reason)\n".utf8)
        var head = "HTTP/1.1 \(status) \(reason)\r\n"
        var all = headers
        all["Content-Length"] = "\(payload.count)"
        all["Cache-Control"] = "no-cache"
        all["Connection"] = "close"
        all["X-Content-Type-Options"] = "nosniff"
        if all["Content-Type"] == nil { all["Content-Type"] = "text/plain; charset=utf-8" }
        for (key, value) in all { head += "\(key): \(value)\r\n" }
        head += "\r\n"
        var response = Data(head.utf8)
        if !headOnly { response.append(payload) }
        Sockets.writeAll(fd, response)
    }
}
