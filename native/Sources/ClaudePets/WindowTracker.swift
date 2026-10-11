import AppKit

struct ClaudeWindow: Equatable {
    let number: Int
    /// Global CoreGraphics coordinates (top-left origin of the primary display).
    let frame: CGRect
}

/// Polls the window server for Claude Desktop's frontmost main window.
/// Polls fast while things change and backs off when the window is still.
final class WindowTracker {
    static let bundleID = "com.anthropic.claudefordesktop"

    var onChange: ((ClaudeWindow?, Bool) -> Void)?
    private(set) var pid: pid_t?

    private var last: ClaudeWindow?
    private var lastActive = false
    private var stableTicks = 0
    private var timer: Timer?
    private var fast = true

    func start() {
        schedule(fast: true)
        tick()
    }

    private func schedule(fast: Bool) {
        self.fast = fast
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: fast ? 1.0 / 30.0 : 0.2, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    private func tick() {
        let (window, active) = sample()
        if window != last || active != lastActive {
            last = window
            lastActive = active
            stableTicks = 0
            if !fast { schedule(fast: true) }
            onChange?(window, active)
        } else {
            stableTicks += 1
            if fast && stableTicks > 30 { schedule(fast: false) }
        }
    }

    private func sample() -> (ClaudeWindow?, Bool) {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleID).first else {
            pid = nil
            return (nil, false)
        }
        let claudePid = app.processIdentifier
        pid = claudePid
        if app.isHidden { return (nil, false) }

        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return (nil, false)
        }
        var found: ClaudeWindow?
        for info in list {
            guard (info[kCGWindowOwnerPID as String] as? Int32) == claudePid,
                  (info[kCGWindowLayer as String] as? Int) == 0,
                  let bounds = info[kCGWindowBounds as String] as? NSDictionary,
                  let rect = CGRect(dictionaryRepresentation: bounds),
                  let number = info[kCGWindowNumber as String] as? Int else { continue }
            if rect.width < 400 || rect.height < 300 { continue }
            if let alpha = info[kCGWindowAlpha as String] as? Double, alpha < 0.1 { continue }
            found = ClaudeWindow(number: number, frame: rect)
            break
        }
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let active = front == claudePid || front == getpid()
        return (found, active)
    }
}
