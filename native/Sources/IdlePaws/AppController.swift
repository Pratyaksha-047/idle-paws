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
    private let axQueue = DispatchQueue(label: "idle-paws.ax")
    private let control = ControlServer()
    private let http = HTTPServer(root: Paths.web.appendingPathComponent("games", isDirectory: true))
    private let devMode = ProcessInfo.processInfo.environment["IDLE_PAWS_DEV"] == "1"

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
        http.dynamicRoutes["/games.json"] = { [weak self] in
            let (games, enabled) = DispatchQueue.main.sync { (self?.gamesWithImages() ?? [], self?.prefs.showGames ?? false) }
            return (try? JSONSerialization.data(withJSONObject: ["games": enabled ? games : [], "enabled": enabled])) ?? Data("{}".utf8)
        }
        http.postRoutes["/games"] = { [weak self] body in
            let request = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
            let result: [String: Any] = DispatchQueue.main.sync {
                guard let self else { return ["ok": false] }
                guard self.prefs.showGames else { return ["ok": false, "error": "games are turned off"] }
                switch request["action"] as? String {
                case "add":
                    return self.addGame(name: request["name"] as? String, url: request["url"] as? String ?? "")
                case "remove":
                    return self.removeGame(request["url"] as? String ?? "")
                default:
                    return ["ok": false, "error": "unknown action"]
                }
            }
            var payload = result
            payload["games"] = DispatchQueue.main.sync { self?.prefs.showGames == true ? self?.gamesWithImages() ?? [] : [] }
            return (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
        }
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
        if prefs.raw["games"] == nil {
            prefs.raw["games"] = GameList.defaults
            prefs.save()
        }
        findMissingGameImages()
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
        if !prefs.showGames, ["open_game", "addGame", "removeGame", "listGames"].contains(command) {
            return reply(["ok": false, "disabled": true])
        }
        switch command {
        case "show", "hide", "console":
            overlay.send("command", ["name": command])
            reply(["ok": true, "claudeWindow": window != nil])
        case "setShowGames":
            prefs.raw["showGames"] = args["on"] as? Bool ?? true
            prefs.save()
            overlay.send("prefs", prefs.raw)
            Log.info("games: show=\(prefs.showGames)")
            reply(["ok": true])
        case "open_game":
            reply(["ok": true, "url": menuURL, "games": prefs.games.count])
        case "addGame":
            reply(addGame(name: args["name"] as? String, url: args["url"] as? String ?? ""))
        case "removeGame":
            reply(removeGame(args["game"] as? String ?? ""))
        case "listGames":
            reply(["ok": true, "games": prefs.games])
        case "react":
            let kind = args["kind"] as? String ?? "done"
            overlay.send("react", ["kind": kind, "project": args["project"] as? String ?? ""])
            reply(["ok": true])
        case "play":
            openGames()
            reply(["ok": true])
        case "status":
            reply([
                "ok": true,
                "petVisible": !prefs.hidden,
                "claudeWindow": window != nil,
                "floorSource": floor?.source ?? "none",
                "accessibilityTrusted": AXIsProcessTrusted(),
                "gamesUrl": menuURL,
                "games": prefs.games.count,
            ])
        default:
            reply(["ok": false, "error": "unknown command \(command)"])
        }
    }

    private var menuURL: String { "http://localhost:\(http.port)/" }

    private func saveGames(_ games: [[String: String]]) {
        prefs.raw["games"] = games
        prefs.save()
        overlay.send("prefs", prefs.raw)
        Log.info("games: \(games.count) in list")
        findMissingGameImages()
    }

    private func addGame(name: String?, url: String) -> [String: Any] {
        guard let game = GameList.normalize(name: name, url: url) else { return ["ok": false, "error": "that isn't a web link"] }
        let result = GameList.add(game, to: prefs.games)
        if let error = result.error { return ["ok": false, "error": error] }
        saveGames(result.games)
        return ["ok": true, "game": game]
    }

    private func removeGame(_ query: String) -> [String: Any] {
        let result = GameList.remove(query, from: prefs.games)
        guard let removed = result.removed else { return ["ok": false, "error": "no game matches \"\(query)\""] }
        saveGames(result.games)
        return ["ok": true, "game": removed]
    }

    private func gamesWithImages() -> [[String: String]] {
        let images = prefs.gameImages
        return prefs.games.map { game in
            var entry = game
            if let url = game["url"], let image = images[url], !image.isEmpty { entry["image"] = image }
            return entry
        }
    }

    /// Looks up the preview image once per game link and caches the result (including "none").
    private func findMissingGameImages() {
        let known = prefs.gameImages
        for game in prefs.games {
            guard let link = game["url"], known[link] == nil, let page = URL(string: link) else { continue }
            GameImageFinder.find(page) { [weak self] image in
                guard let self else { return }
                var images = self.prefs.gameImages
                images[link] = image?.absoluteString ?? ""
                self.prefs.raw["gameImages"] = images
                self.prefs.save()
                Log.info("games: image for \(page.host ?? link): \(image?.absoluteString ?? "none")")
            }
        }
    }

    /// Drives Claude's browser pane to the games menu (where games can also be added); on failure the pet says so.
    private func openGames() {
        guard prefs.showGames else {
            overlay.send("notice", ["text": "Games are off. Turn on Show games in Claude Desktop → Settings → Extensions → Idle Paws."])
            return
        }
        guard let pid = tracker.pid else { return }
        let url = menuURL
        axQueue.async { [weak self] in
            let result = BrowserPaneOpener.open(url: url, tabTitleHint: "Idle Paws", pid: pid)
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
            openGames()
        case "log":
            Log.info("web: \(message["message"] ?? "")")
        default:
            break
        }
    }
}
