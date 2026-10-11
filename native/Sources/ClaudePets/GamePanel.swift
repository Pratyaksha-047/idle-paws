import AppKit
import WebKit

/// Key-capable panel that never activates our app: typing goes to the game while
/// Claude stays the active app, and clicking back into Claude returns focus to it.
final class GameWindow: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// Floating game window docked to the right edge of Claude's window.
final class GamePanel: NSObject, WKScriptMessageHandler {
    private static let size = CGSize(width: 420, height: 600)
    private static let topInset: CGFloat = 52
    private static let rightInset: CGFloat = 12

    private let window: GameWindow
    private let webView: WKWebView
    private(set) var isOpen = false
    private var orderedActive: Bool?

    override init() {
        let config = WKWebViewConfiguration()
        window = GameWindow(contentRect: NSRect(origin: .zero, size: Self.size),
                            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(WeakMessageHandler(target: self), name: "bridge")

        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.hidesOnDeactivate = false
        window.isReleasedWhenClosed = false
        window.becomesKeyOnlyIfNeeded = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

        webView.wantsLayer = true
        webView.layer?.cornerRadius = 12
        webView.layer?.masksToBounds = true
        webView.layer?.borderWidth = 1
        webView.layer?.borderColor = NSColor(white: 0.3, alpha: 1).cgColor
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        window.contentView = webView
    }

    func open(url: URL, over claude: ClaudeWindow?) {
        webView.load(URLRequest(url: url))
        isOpen = true
        orderedActive = nil
        if let claude { place(over: claude, active: true) }
        window.makeKeyAndOrderFront(nil)
    }

    func close() {
        guard isOpen else { return }
        isOpen = false
        window.orderOut(nil)
        webView.loadHTMLString("", baseURL: nil)
    }

    /// Keeps the panel docked as Claude's window moves; mirrors the overlay's z-order rules.
    func place(over claude: ClaudeWindow?, active: Bool) {
        guard isOpen else { return }
        guard let claude else {
            window.orderOut(nil)
            orderedActive = nil
            return
        }
        let host = Overlay.cocoaRect(fromCG: claude.frame)
        let height = min(Self.size.height, host.height - Self.topInset - 24)
        let frame = NSRect(x: host.maxX - Self.size.width - Self.rightInset,
                           y: host.maxY - Self.topInset - height,
                           width: Self.size.width, height: height)
        if window.frame != frame { window.setFrame(frame, display: true) }
        if orderedActive != active || !window.isVisible {
            if active {
                window.level = .floating
                window.orderFrontRegardless()
            } else {
                window.level = .normal
                window.order(.above, relativeTo: claude.number)
            }
            orderedActive = active
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "closeGame" else { return }
        close()
    }
}
