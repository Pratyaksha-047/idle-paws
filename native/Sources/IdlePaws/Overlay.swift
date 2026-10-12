import AppKit
import WebKit

final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class OverlayWebView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// WKScriptMessageHandler retains its target; this breaks the cycle.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(target: WKScriptMessageHandler? = nil) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// Transparent panel pinned over Claude's window. Clicks pass through to Claude
/// except over the hot rects the web layer reports (pet, console, paw).
final class Overlay: NSObject, WKScriptMessageHandler {
    var onMessage: (([String: Any]) -> Void)?

    private let panel: OverlayPanel
    private let webView: OverlayWebView
    private var hotRects: [CGRect] = []
    private var capturing = false
    private var streamMouse = false
    private var ready = false
    private var pending: [String] = []
    private var shown = false
    private var orderedActive: Bool?
    private var orderedAbove = 0
    private var mouseTimer: Timer?
    private var lastMouse = CGPoint(x: -1, y: -1)
    private var lastMouseSent = Date.distantPast

    init(webRoot: URL) {
        let handler = WeakMessageHandler()
        let config = WKWebViewConfiguration()
        config.userContentController.add(handler, name: "bridge")
        panel = OverlayPanel(contentRect: NSRect(x: 0, y: 0, width: 10, height: 10),
                             styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        webView = OverlayWebView(frame: .zero, configuration: config)
        super.init()
        handler.target = self

        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        panel.contentView = webView
        webView.loadFileURL(webRoot.appendingPathComponent("overlay/index.html"), allowingReadAccessTo: webRoot)
    }

    // MARK: Placement

    func show(over window: ClaudeWindow, active: Bool) {
        let frame = Self.cocoaRect(fromCG: window.frame)
        if panel.frame != frame { panel.setFrame(frame, display: true) }
        if !shown || orderedActive != active || orderedAbove != window.number {
            if active {
                panel.level = .floating
                panel.orderFrontRegardless()
            } else {
                panel.level = .normal
                panel.order(.above, relativeTo: window.number)
            }
            orderedActive = active
            orderedAbove = window.number
        }
        if !shown {
            shown = true
            startMouseTimer()
        }
    }

    func hide() {
        guard shown else { return }
        panel.orderOut(nil)
        shown = false
        orderedActive = nil
        mouseTimer?.invalidate()
        mouseTimer = nil
    }

    var size: CGSize { panel.frame.size }

    static func cocoaRect(fromCG rect: CGRect) -> NSRect {
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        return NSRect(x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height)
    }

    // MARK: Click-through

    private func startMouseTimer() {
        mouseTimer?.invalidate()
        mouseTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.pollMouse()
        }
    }

    private func pollMouse() {
        let location = NSEvent.mouseLocation
        let frame = panel.frame
        let local = CGPoint(x: location.x - frame.minX, y: frame.maxY - location.y)
        let interactive = capturing || hotRects.contains { $0.contains(local) }
        if panel.ignoresMouseEvents == interactive { panel.ignoresMouseEvents = !interactive }

        if streamMouse, local != lastMouse, Date().timeIntervalSince(lastMouseSent) > 0.05 {
            lastMouse = local
            lastMouseSent = Date()
            send("mouse", ["x": local.x, "y": local.y, "inside": frame.contains(location)])
        }
    }

    // MARK: Bridge

    func send(_ event: String, _ data: Any) {
        guard let json = try? JSONSerialization.data(withJSONObject: ["event": event, "data": data]),
              let text = String(data: json, encoding: .utf8) else { return }
        let script = "window.PetBus && window.PetBus.receive(\(text))"
        if ready {
            webView.evaluateJavaScript(script)
        } else {
            pending.append(script)
        }
    }

    func markReady() {
        ready = true
        pending.forEach { webView.evaluateJavaScript($0) }
        pending.removeAll()
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "hot":
            let rects = body["rects"] as? [[Double]] ?? []
            hotRects = rects.filter { $0.count == 4 }.map { CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) }
            capturing = body["capture"] as? Bool ?? false
        case "mouseMode":
            streamMouse = body["on"] as? Bool ?? false
        default:
            onMessage?(body)
        }
    }
}
