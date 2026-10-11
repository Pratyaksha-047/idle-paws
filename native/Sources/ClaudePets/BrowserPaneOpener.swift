import ApplicationServices
import Carbon.HIToolbox
import Foundation

/// Opens a URL in Claude Desktop's built-in browser pane by driving its controls through
/// Accessibility: toggle the pane, reuse or open a tab, type the URL into "Page URL", Return.
/// Blocking; call from a background serial queue.
enum BrowserPaneOpener {
    enum Failure: Error, CustomStringConvertible {
        case notTrusted, noWindow, noToggle, paneDidNotOpen, noNewTabButton, noURLField

        var description: String {
            switch self {
            case .notTrusted: return "Accessibility permission missing"
            case .noWindow: return "Claude window not found"
            case .noToggle: return "Browser toolbar button not found"
            case .paneDidNotOpen: return "browser pane did not open"
            case .noNewTabButton: return "New tab button not found"
            case .noURLField: return "Page URL field not found"
            }
        }
    }

    static func open(url: String, tabTitleHint: String, pid: pid_t) -> Result<Void, Failure> {
        guard AXIsProcessTrusted() else { return .failure(.notTrusted) }
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.5)
        guard let window = AX.element(app, kAXFocusedWindowAttribute) ?? AX.element(app, kAXMainWindowAttribute) else {
            return .failure(.noWindow)
        }

        var pane = browserPane(in: window)
        if pane == nil {
            guard let toggle = find(in: window, role: kAXCheckBoxRole, description: "Browser") else { return .failure(.noToggle) }
            AXUIElementPerformAction(toggle, kAXPressAction as CFString)
            pane = poll { browserPane(in: window) }
        }
        guard let pane else { return .failure(.paneDidNotOpen) }

        if let tab = find(in: pane, role: kAXRadioButtonRole, where: { AX.string($0, kAXTitleAttribute)?.contains(tabTitleHint) == true }) {
            AXUIElementPerformAction(tab, kAXPressAction as CFString)
            return .success(())
        }

        guard var field = urlField(in: pane) else { return .failure(.noURLField) }
        if !(AX.string(field, kAXValueAttribute) ?? "").isEmpty {
            guard let newTab = find(in: pane, role: kAXButtonRole, description: "New tab") else { return .failure(.noNewTabButton) }
            AXUIElementPerformAction(newTab, kAXPressAction as CFString)
            guard let fresh = poll(timeout: 1.0, { urlField(in: pane).flatMap { (AX.string($0, kAXValueAttribute) ?? "").isEmpty ? $0 : nil } }) else {
                return .failure(.noURLField)
            }
            field = fresh
        }

        AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        Thread.sleep(forTimeInterval: 0.05)
        Keyboard.press(CGKeyCode(kVK_ANSI_A), flags: .maskCommand, pid: pid)
        Keyboard.type(url, pid: pid)
        Keyboard.press(CGKeyCode(kVK_Return), pid: pid)
        return .success(())
    }

    private static func browserPane(in window: AXUIElement) -> AXUIElement? {
        find(in: window, role: kAXGroupRole, where: {
            AX.string($0, kAXDescriptionAttribute) == "Browser" && AX.string($0, kAXSubroleAttribute) == "AXLandmarkRegion"
        })
    }

    private static func urlField(in pane: AXUIElement) -> AXUIElement? {
        find(in: pane, role: kAXTextFieldRole, description: "Page URL")
    }

    private static func find(in root: AXUIElement, role: String, description: String) -> AXUIElement? {
        find(in: root, role: role, where: { AX.string($0, kAXDescriptionAttribute) == description })
    }

    /// Breadth-first search, skipping text leaves.
    private static func find(in root: AXUIElement, role: String, where match: (AXUIElement) -> Bool) -> AXUIElement? {
        var queue = [root]
        var index = 0
        while index < queue.count && index < 8000 {
            let element = queue[index]
            index += 1
            let elementRole = AX.role(element)
            if elementRole == role && match(element) { return element }
            if elementRole == kAXStaticTextRole { continue }
            queue.append(contentsOf: AX.children(element))
        }
        return nil
    }

    private static func poll<T>(timeout: TimeInterval = 1.5, _ body: () -> T?) -> T? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if let value = body() { return value }
            Thread.sleep(forTimeInterval: 0.1)
        } while Date() < deadline
        return nil
    }
}

/// Synthetic key events delivered only to one process.
enum Keyboard {
    private static let source = CGEventSource(stateID: .hidSystemState)

    static func press(_ key: CGKeyCode, flags: CGEventFlags = [], pid: pid_t) {
        for down in [true, false] {
            let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down)
            event?.flags = flags
            event?.postToPid(pid)
        }
    }

    static func type(_ text: String, pid: pid_t) {
        for scalar in text.utf16 {
            var unit = scalar
            for down in [true, false] {
                let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down)
                event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &unit)
                event?.postToPid(pid)
            }
        }
    }
}
