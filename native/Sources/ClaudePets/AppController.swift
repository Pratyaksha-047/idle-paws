import AppKit

private struct Floor: Equatable {
    var y: Double
    var x0: Double
    var x1: Double
    var source: String
}

final class AppController: NSObject, NSApplicationDelegate {
    private let tracker = WindowTracker()
    private let locator = InputBarLocator()
    private let axQueue = DispatchQueue(label: "claude-pets.ax")
    private let control = ControlServer()
    private let http = HTTPServer(root: Paths.web.appendingPathComponent("games", isDirectory: true))
    private let devMode = ProcessInfo.processInfo.environment["CLAUDE_PETS_DEV"] == "1"

    private var overlay: Overlay!
    private var prefs = Prefs.load()
    private var window: ClaudeWindow?
    private var floor: Floor?
    private var axInFlight = false
    private var promptSeenAt = Date.distantPast
    private static let promptGraceSeconds: TimeInterval = 0.3
    private var lastEnv = ""
    private var lastLeaseAt = Date()

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let fd = Sockets.connectUnix(Paths.socket) {
            close(fd)
            Log.info("another instance owns the control socket; exiting")
            exit(0)
        }
        guard control.start() else { exit(1) }
        control.handler = { [weak self] command, args, reply in self?.handle(command, args, reply) }
        http.start()

        overlay = Overlay(webRoot: Paths.web)
        overlay.onMessage = { [weak self] message in self?.handleWeb(message) }
        tracker.onChange = { [weak self] window, active in self?.windowChanged(window, active: active) }
        tracker.start()

        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.refreshFloor() }
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.checkLifecycle() }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main
        ) { note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            if app?.bundleIdentifier == WindowTracker.bundleID {
                Log.info("Claude Desktop quit; exiting")
                NSApp.terminate(nil)
            }
        }
        NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] _ in
            self?.overlay.send("outsideClick", [:])
        }

        if !AXIsProcessTrusted() && !prefs.axPrompted {
            prefs.raw["axPrompted"] = true
            prefs.save()
            _ = AX.isTrusted(prompt: true)
        }
        Log.info("started web=\(Paths.web.path) port=\(http.port) dev=\(devMode) axTrusted=\(AXIsProcessTrusted())")
    }

    func applicationWillTerminate(_ notification: Notification) {
        unlink(Paths.socket)
    }

    // MARK: Lifecycle

    private func checkLifecycle() {
        if devMode { return }
        if NSRunningApplication.runningApplications(withBundleIdentifier: WindowTracker.bundleID).isEmpty {
            Log.info("Claude Desktop not running; exiting")
            NSApp.terminate(nil)
            return
        }
        if control.leaseCount > 0 {
            lastLeaseAt = Date()
        } else if Date().timeIntervalSince(lastLeaseAt) > 20 {
            Log.info("no MCP server attached for 20s; exiting")
            NSApp.terminate(nil)
        }
    }

    // MARK: Window + floor

    private func windowChanged(_ window: ClaudeWindow?, active: Bool) {
        self.window = window
        guard let window else {
            overlay.hide()
            return
        }
        overlay.show(over: window, active: active)
        pushEnv()
    }

    private func refreshFloor() {
        guard let window, let pid = tracker.pid, !axInFlight else { return }
        axInFlight = true
        axQueue.async { [weak self] in
            guard let self else { return }
            let input = self.locator.locate(pid: pid, window: window.frame)
            DispatchQueue.main.async {
                self.axInFlight = false
                self.applyFloor(input: input, window: window)
            }
        }
    }

    /// With Accessibility working, a missing prompt means something covers it (a dialog,
    /// a settings page): the pet hides. The fixed-offset floor is only for when AX is unavailable.
    private func applyFloor(input result: InputBarLocator.Result?, window: ClaudeWindow) {
        let frame = window.frame
        let next: Floor?
        if let result {
            promptSeenAt = Date()
            let input = result.frame
            let pad = result.isCard ? 0 : prefs.floorPad
            next = Floor(y: (input.minY - frame.minY - pad).rounded(),
                         x0: (input.minX - frame.minX).rounded(),
                         x1: (input.maxX - frame.minX).rounded(),
                         source: "ax")
        } else if AXIsProcessTrusted() {
            if Date().timeIntervalSince(promptSeenAt) < Self.promptGraceSeconds { return }
            next = nil
        } else {
            next = Floor(y: (frame.height - prefs.floorOffset).rounded(), x0: 24, x1: (frame.width - 24).rounded(),
                         source: "offset")
        }
        if next != floor {
            if (next == nil) != (floor == nil) {
                let ms = Int(Date().timeIntervalSince(promptSeenAt) * 1000)
                Log.info("floor: \(next == nil ? "hidden \(ms)ms after prompt last seen" : "shown")")
            }
            floor = next
            pushEnv()
        }
    }

    private func pushEnv() {
        guard let window else { return }
        var env: [String: Any] = [
            "width": window.frame.width,
            "height": window.frame.height,
            "gameBase": "http://localhost:\(http.port)/",
        ]
        if let floor {
            env["floor"] = ["y": floor.y, "x0": floor.x0, "x1": floor.x1, "source": floor.source]
        }
        let key = "\(env)"
        guard key != lastEnv else { return }
        lastEnv = key
        overlay.send("env", env)
    }

    // MARK: Commands

    private func handle(_ command: String, _ args: [String: Any], _ reply: @escaping ControlServer.Reply) {
        switch command {
        case "show", "hide", "console":
            overlay.send("command", ["name": command])
            reply(["ok": true, "claudeWindow": window != nil])
        case "open_game":
            reply(["ok": true, "url": gameURL(args["game"] as? String)])
        case "play":
            openGame(args["game"] as? String)
            reply(["ok": true])
        case "status":
            reply([
                "ok": true,
                "petVisible": !prefs.hidden,
                "claudeWindow": window != nil,
                "floorSource": floor?.source ?? "none",
                "accessibilityTrusted": AXIsProcessTrusted(),
                "gamesUrl": "http://localhost:\(http.port)/",
            ])
        default:
            reply(["ok": false, "error": "unknown command \(command)"])
        }
    }

    /// Games menu when `game` is nil, else that game's page.
    private func gameURL(_ game: String?) -> String {
        guard let game, !game.isEmpty else { return "http://localhost:\(http.port)/" }
        return "http://localhost:\(http.port)/\(game)/"
    }

    /// Drives Claude's browser pane to the games; on failure the cat says so.
    private func openGame(_ game: String?) {
        guard let pid = tracker.pid else { return }
        let url = gameURL(game)
        axQueue.async { [weak self] in
            let result = BrowserPaneOpener.open(url: url, tabTitleHint: "Claude Pets", pid: pid)
            DispatchQueue.main.async {
                guard case .failure(let failure) = result else { return }
                Log.info("browser pane: \(failure)")
                self?.overlay.send("notice", ["text": "Couldn't open the browser pane (\(failure)). Ask Claude “open game”."])
            }
        }
    }

    private func handleWeb(_ message: [String: Any]) {
        switch message["type"] as? String {
        case "ready":
            overlay.markReady()
            overlay.send("prefs", prefs.raw)
            lastEnv = ""
            pushEnv()
        case "prefs":
            guard let values = message["prefs"] as? [String: Any] else { return }
            prefs.raw.merge(values) { _, new in new }
            prefs.save()
        case "openGame":
            openGame(message["game"] as? String)
        case "log":
            Log.info("web: \(message["message"] ?? "")")
        default:
            break
        }
    }
}
