import Foundation

/// Preferences are owned by the web layer; the native side only reads a few keys.
struct Prefs {
    var raw: [String: Any]

    static func load() -> Prefs {
        guard let data = try? Data(contentsOf: Paths.prefs),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return Prefs(raw: [:])
        }
        return Prefs(raw: object)
    }

    func save() {
        guard let data = try? JSONSerialization.data(withJSONObject: raw, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? data.write(to: Paths.prefs, options: .atomic)
    }

    var hidden: Bool { raw["hidden"] as? Bool ?? false }
    /// Fallback floor: distance from the window's bottom edge when the input can't be located.
    var floorOffset: Double { raw["floorOffset"] as? Double ?? 150 }
    /// Gap between the text area's top and the input card's top border.
    var floorPad: Double { raw["floorPad"] as? Double ?? 14 }
    var axPrompted: Bool { raw["axPrompted"] as? Bool ?? false }
    /// The user's game links ({name, url}) from the extension settings.
    var games: [[String: String]] { raw["games"] as? [[String: String]] ?? [] }
}
