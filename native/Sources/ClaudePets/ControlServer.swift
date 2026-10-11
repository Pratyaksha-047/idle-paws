import Foundation

/// Unix-socket control channel used by the MCP server(s). Newline-delimited JSON:
/// request `{"id":1,"cmd":"show","args":{}}` -> reply `{"id":1,"ok":true,...}`.
/// A connection that sends `hello` holds a lease; the app quits when no lease is held.
final class ControlServer {
    typealias Reply = ([String: Any]) -> Void
    typealias Handler = (_ command: String, _ args: [String: Any], _ reply: @escaping Reply) -> Void

    var handler: Handler?
    /// Main-thread only.
    private(set) var leaseCount = 0

    func start() -> Bool {
        unlink(Paths.socket)
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        var addr = Sockets.unixAddress(Paths.socket)
        let bound = withUnsafePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bound == 0, listen(fd, 16) == 0 else {
            Log.info("control: bind failed errno=\(errno)")
            close(fd)
            return false
        }
        chmod(Paths.socket, 0o600)
        Thread.detachNewThread { [weak self] in
            while true {
                let client = accept(fd, nil, nil)
                if client < 0 { continue }
                Thread.detachNewThread { self?.serve(Connection(fd: client)) }
            }
        }
        return true
    }

    private func serve(_ connection: Connection) {
        let reader = LineReader(fd: connection.fd)
        var leased = false
        while let line = reader.next() {
            guard let message = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any],
                  let command = message["cmd"] as? String else { continue }
            let id = message["id"] ?? NSNull()
            let args = message["args"] as? [String: Any] ?? [:]
            if command == "hello" {
                if !leased {
                    leased = true
                    DispatchQueue.main.async { self.leaseCount += 1 }
                    Log.info("control: lease from \(args["client"] ?? "unknown")")
                }
                connection.send(["id": id, "ok": true])
                continue
            }
            DispatchQueue.main.async {
                guard let handler = self.handler else {
                    connection.send(["id": id, "ok": false, "error": "not ready"])
                    return
                }
                handler(command, args) { result in
                    var payload = result
                    payload["id"] = id
                    connection.send(payload)
                }
            }
        }
        if leased {
            DispatchQueue.main.async { self.leaseCount -= 1 }
        }
        connection.close()
    }
}

private final class Connection {
    let fd: Int32
    private let lock = NSLock()
    private var closed = false

    init(fd: Int32) {
        self.fd = fd
        Sockets.noSigPipe(fd)
    }

    func send(_ payload: [String: Any]) {
        guard var data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        data.append(0x0A)
        lock.lock()
        defer { lock.unlock() }
        if !closed { Sockets.writeAll(fd, data) }
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        if !closed {
            closed = true
            Darwin.close(fd)
        }
    }
}
