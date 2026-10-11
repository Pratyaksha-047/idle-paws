import ApplicationServices
import Foundation

/// Finds Claude's prompt input through the Accessibility tree.
/// Not thread-safe: call from one serial queue.
final class InputBarLocator {
    static let minInputWidth: CGFloat = 250
    private static let searchBudget = 6000

    private var pid: pid_t = 0
    private var app: AXUIElement?
    private var cached: AXUIElement?
    private var lastSearch = Date.distantPast

    /// Returns the input's frame in global CG coordinates, or nil when unavailable.
    func locate(pid: pid_t, window: CGRect) -> CGRect? {
        guard AXIsProcessTrusted() else { return nil }
        if pid != self.pid || app == nil { attach(pid) }
        guard let app else { return nil }

        if let focused = AX.element(app, kAXFocusedUIElementAttribute),
           let frame = Self.inputFrame(focused, window: window) {
            cached = focused
            return frame
        }
        if let element = cached, let frame = Self.inputFrame(element, window: window) {
            return frame
        }
        cached = nil
        guard Date().timeIntervalSince(lastSearch) > 1.5 else { return nil }
        lastSearch = Date()
        cached = search(app: app, window: window)
        return cached.flatMap { Self.inputFrame($0, window: window) }
    }

    private func attach(_ pid: pid_t) {
        self.pid = pid
        let element = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(element, 0.25)
        let result = AX.enableManualAccessibility(element, true)
        Log.info("ax: attached pid=\(pid) manualAccessibility=\(result.rawValue)")
        app = element
        cached = nil
    }

    private static func inputFrame(_ element: AXUIElement, window: CGRect) -> CGRect? {
        guard AX.role(element) == kAXTextAreaRole,
              let frame = AX.frame(element),
              frame.width >= minInputWidth,
              window.contains(CGPoint(x: frame.midX, y: frame.midY)) else { return nil }
        return frame
    }

    /// Breadth-first walk of the focused window; picks the lowest wide text area.
    private func search(app: AXUIElement, window: CGRect) -> AXUIElement? {
        let started = Date()
        var queue: [AXUIElement] = []
        if let focused = AX.element(app, kAXFocusedWindowAttribute) {
            queue.append(focused)
        } else {
            queue.append(contentsOf: (AX.attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? [])
        }
        var index = 0
        var best: (element: AXUIElement, frame: CGRect)?
        while index < queue.count && index < Self.searchBudget {
            let element = queue[index]
            index += 1
            let role = AX.role(element)
            if role == kAXStaticTextRole { continue }
            if let frame = Self.inputFrame(element, window: window), frame.minY > (best?.frame.minY ?? -.infinity) {
                best = (element, frame)
            }
            queue.append(contentsOf: AX.children(element))
        }
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        Log.info("ax: search visited=\(index) found=\(best.map { "\($0.frame)" } ?? "none") in \(ms)ms")
        return best?.element
    }
}
