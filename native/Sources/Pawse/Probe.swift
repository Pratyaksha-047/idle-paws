import AppKit
import ApplicationServices

/// One-shot diagnostics used during the M0 spike. Output goes to ~/Library/Logs/pawse.log.
enum Probe {
    static func claudeApp() -> AXUIElement? {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: WindowTracker.bundleID).first else {
            Log.info("probe: Claude Desktop not running")
            return nil
        }
        return AXUIElementCreateApplication(app.processIdentifier)
    }

    /// `--ax on|off`: toggles Chromium's accessibility tree for the CPU benchmark.
    static func setAccessibility(_ on: Bool) {
        guard AX.isTrusted(prompt: true), let app = claudeApp() else {
            Log.info("probe: not trusted or no Claude")
            return
        }
        let result = AX.enableManualAccessibility(app, on)
        Log.info("probe: AXManualAccessibility=\(on) -> \(result.rawValue)")
    }

    /// `--probe-ax`: dumps every text input in Claude's windows with its ancestors.
    static func dumpInputs() {
        let trusted = AX.isTrusted(prompt: true)
        Log.info("probe: trusted=\(trusted)")
        guard trusted, let app = claudeApp() else { return }
        AXUIElementSetMessagingTimeout(app, 1.0)
        Log.info("probe: AXManualAccessibility -> \(AX.enableManualAccessibility(app, true).rawValue)")
        Thread.sleep(forTimeInterval: 1.5)

        let started = Date()
        var queue = (AX.attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
        Log.info("probe: windows=\(queue.count)")
        var roles: [String: Int] = [:]
        var index = 0
        while index < queue.count && index < 50000 {
            let element = queue[index]
            index += 1
            let role = AX.role(element) ?? "?"
            roles[role, default: 0] += 1
            if role == kAXTextAreaRole || role == kAXTextFieldRole || role == "AXComboBox" {
                describe(element, label: "INPUT")
                var parent = AX.element(element, kAXParentAttribute)
                for depth in 1...5 {
                    guard let current = parent else { break }
                    describe(current, label: "  ^\(depth)")
                    parent = AX.element(current, kAXParentAttribute)
                }
            }
            queue.append(contentsOf: AX.children(element))
        }
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        Log.info("probe: visited=\(index) in \(ms)ms roles=\(roles.sorted { $0.value > $1.value }.prefix(15))")
        if let focused = AX.element(app, kAXFocusedUIElementAttribute) {
            describe(focused, label: "FOCUSED")
        }
    }

    /// `--probe-buttons`: dumps buttons and text fields with their labels and actions.
    static func dumpButtons() {
        guard AX.isTrusted(prompt: true), let app = claudeApp() else { return }
        AXUIElementSetMessagingTimeout(app, 1.0)
        AX.enableManualAccessibility(app, true)
        var queue = (AX.attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
        var index = 0
        while index < queue.count && index < 50000 {
            let element = queue[index]
            index += 1
            let role = AX.role(element) ?? "?"
            if role == kAXButtonRole || role == kAXTextFieldRole || role == kAXRadioButtonRole || role == kAXCheckBoxRole || role == "AXTab" {
                var actions: CFArray?
                AXUIElementCopyActionNames(element, &actions)
                let names = (actions as? [String])?.joined(separator: ",") ?? "-"
                Log.info("probe: \(role) title=\(AX.string(element, kAXTitleAttribute) ?? "-") desc=\(AX.string(element, kAXDescriptionAttribute) ?? "-") help=\(AX.string(element, kAXHelpAttribute) ?? "-") value=\(AX.string(element, kAXValueAttribute) ?? "-") frame=\(AX.frame(element).map { "\($0)" } ?? "-") actions=\(names)")
            }
            queue.append(contentsOf: AX.children(element))
        }
    }

    private static func describe(_ element: AXUIElement, label: String) {
        let fields = [
            "role=\(AX.role(element) ?? "-")",
            "subrole=\(AX.string(element, kAXSubroleAttribute) ?? "-")",
            "frame=\(AX.frame(element).map { "\($0)" } ?? "-")",
            "desc=\(AX.string(element, kAXDescriptionAttribute) ?? "-")",
            "placeholder=\(AX.string(element, kAXPlaceholderValueAttribute) ?? "-")",
            "domId=\(AX.string(element, "AXDOMIdentifier") ?? "-")",
            "classes=\((AX.attribute(element, "AXDOMClassList") as? [String])?.joined(separator: ".") ?? "-")",
        ]
        Log.info("probe: \(label) \(fields.joined(separator: " "))")
    }
}
