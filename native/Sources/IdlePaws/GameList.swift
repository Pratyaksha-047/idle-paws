import Foundation

/// The user's games: one ordered list of {name, url}, editable from the games menu and from
/// Claude (MCP tools). Starts with a few picks the user can remove.
enum GameList {
    typealias Game = [String: String]

    /// Starter games: each checked to load in Claude's side pane, fit ~400px, and need no login.
    static let defaults: [Game] = [
        ["name": "Chess puzzles", "url": "https://lichess.org/training"],
        ["name": "Murdoku", "url": "https://murdoku.com/"],
        ["name": "Contexto", "url": "https://contexto.me/"],
        ["name": "Draw & guess", "url": "https://skribbl.io/"],
        ["name": "Neal.fun", "url": "https://neal.fun/"],
    ]

    static let maxGames = 60
    private static let maxNameLength = 60

    /// Validates and tidies one entry; nil for anything that isn't an http(s) link.
    static func normalize(name: String?, url raw: String) -> Game? {
        let link = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let withScheme = link.range(of: "^[a-zA-Z][a-zA-Z0-9+.-]*://", options: .regularExpression) == nil ? "https://\(link)" : link
        guard var parts = URLComponents(string: withScheme), ["http", "https"].contains(parts.scheme?.lowercased() ?? ""),
              let host = parts.host, !host.isEmpty, !link.contains(" ") else { return nil }
        // Same form as the settings parser (WHATWG URL): bare origins get a trailing slash.
        if parts.path.isEmpty { parts.path = "/" }
        guard let url = parts.url else { return nil }
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        return ["name": String((trimmed.isEmpty ? fallback : trimmed).prefix(maxNameLength)), "url": url.absoluteString]
    }

    static func add(_ game: Game, to games: [Game]) -> (games: [Game], error: String?) {
        if games.contains(where: { $0["url"] == game["url"] }) { return (games, "already in your games") }
        if games.count >= maxGames { return (games, "you can have up to \(maxGames) games") }
        return (games + [game], nil)
    }

    /// Removes by exact link or case-insensitive name.
    static func remove(_ query: String, from games: [Game]) -> (games: [Game], removed: Game?) {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = normalize(name: nil, url: needle)?["url"]
        guard let index = games.firstIndex(where: {
            $0["url"] == needle || $0["url"] == normalized || $0["name"]?.caseInsensitiveCompare(needle) == .orderedSame
        }) else { return (games, nil) }
        var remaining = games
        let removed = remaining.remove(at: index)
        return (remaining, removed)
    }
}
