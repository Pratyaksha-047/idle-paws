import ApplicationServices
import Foundation

/// Finds Claude's prompt input through the Accessibility tree.
/// The prompt is a ProseMirror text area labelled "Prompt"; its visible card is the
/// nearest ancestor with the `rounded-composer` class. Not thread-safe: use one serial queue.
final class InputBarLocator {
    struct Result {
        /// Global CG coordinates.
        let frame: CGRect
        /// True when `frame` is the composer card; false when it is the bare text area.
        let isCard: Bool
    }

    private static let minInputWidth: CGFloat = 200
    private static let searchBudget = 6000
    private static let cardClass = "rounded-composer"

    private var pid: pid_t = 0
    private var app: AXUIElement?
    private var input: AXUIElement?
    private var card: AXUIElement?
    private var lastSearch = Date.distantPast

    func locate(pid: pid_t, window: CGRect) -> Result? {
        guard AXIsProcessTrusted() else { return nil }
        if pid != self.pid || app == nil { attach(pid) }
        guard let app else { return nil }

        if let focused = AX.element(app, kAXFocusedUIElementAttribute),
           input.map({ !CFEqual($0, focused) }) ?? true,
           Self.isPrompt(focused, window: window), !Self.isInSideChat(focused) {
            adopt(focused)
        }
        if let result = current(window: window) { return result }

        input = nil
        card = nil
        guard Date().timeIntervalSince(lastSearch) > 0.3 else { return nil }
        lastSearch = Date()
        if let found = search(app: app, window: window) { adopt(found) }
        return current(window: window)
    }

    private func attach(_ pid: pid_t) {
        self.pid = pid
        let element = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(element, 0.25)
        let result = AX.enableManualAccessibility(element, true)
        Log.info("ax: attached pid=\(pid) manualAccessibility=\(result.rawValue)")
        app = element
        input = nil
        card = nil
    }

    private func adopt(_ element: AXUIElement) {
        input = element
        card = Self.composerCard(of: element)
    }

    private func current(window: CGRect) -> Result? {
        guard let input, Self.isPrompt(input, window: window) else { return nil }
        if let card, let frame = AX.frame(card), frame.width >= Self.minInputWidth {
            return Result(frame: frame, isCard: true)
        }
        return AX.frame(input).map { Result(frame: $0, isCard: false) }
    }

    private static func isPrompt(_ element: AXUIElement, window: CGRect) -> Bool {
        guard AX.role(element) == kAXTextAreaRole,
              let frame = AX.frame(element),
              frame.width >= minInputWidth,
              window.contains(CGPoint(x: frame.midX, y: frame.midY)) else { return false }
        return AX.string(element, kAXDescriptionAttribute) == "Prompt" || AX.classes(element).contains("ProseMirror")
    }

    /// The btw "Side chat" panel has its own prompt; the pet stays on the session's main one.
    private static func isInSideChat(_ element: AXUIElement) -> Bool {
        var current = AX.element(element, kAXParentAttribute)
        for _ in 0..<14 {
            guard let node = current else { return false }
            let label = AX.string(node, kAXDescriptionAttribute) ?? AX.string(node, kAXTitleAttribute) ?? ""
            if label.hasPrefix("Side chat") { return true }
            current = AX.element(node, kAXParentAttribute)
        }
        return false
    }

    private static func composerCard(of element: AXUIElement) -> AXUIElement? {
        var current = AX.element(element, kAXParentAttribute)
        for _ in 0..<8 {
            guard let node = current else { return nil }
            if AX.classes(node).contains(where: { $0.hasPrefix(cardClass) }) { return node }
            current = AX.element(node, kAXParentAttribute)
        }
        return nil
    }

    /// Breadth-first walk of the focused window; picks the lowest prompt (the active pane's).
    private func search(app: AXUIElement, window: CGRect) -> AXUIElement? {
        let started = Date()
        var queue: [AXUIElement] = []
        if let focused = AX.element(app, kAXFocusedWindowAttribute) {
            queue.append(focused)
        } else {
            queue.append(contentsOf: (AX.attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? [])
        }
        var index = 0
        var best: (element: AXUIElement, y: CGFloat)?
        while index < queue.count && index < Self.searchBudget {
            let element = queue[index]
            index += 1
            let role = AX.role(element)
            if role == kAXStaticTextRole { continue }
            if role == kAXTextAreaRole, Self.isPrompt(element, window: window), let frame = AX.frame(element),
               frame.minY > (best?.y ?? -.infinity), !Self.isInSideChat(element) {
                best = (element, frame.minY)
            }
            queue.append(contentsOf: AX.children(element))
        }
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        if best != nil { Log.info("ax: search visited=\(index) found in \(ms)ms") }
        return best?.element
    }
}
