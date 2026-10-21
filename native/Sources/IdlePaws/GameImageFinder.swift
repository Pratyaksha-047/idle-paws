import Foundation

/// Finds a game's preview picture: the page's og:image (or twitter:image) meta tag.
enum GameImageFinder {
    private static let keys = ["og:image", "og:image:secure_url", "og:image:url", "twitter:image", "twitter:image:src"]
    private static let maxBytes = 800_000

    /// Calls back on the main queue with the image URL, or nil when the page has none.
    static func find(_ page: URL, completion: @escaping (URL?) -> Void) {
        var request = URLRequest(url: page, timeoutInterval: 8)
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
                         forHTTPHeaderField: "User-Agent")
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let base = response?.url ?? page
            let image = data.flatMap { imageURL(in: String(decoding: $0.prefix(maxBytes), as: UTF8.self), base: base) }
            DispatchQueue.main.async { completion(image) }
        }.resume()
    }

    static func imageURL(in html: String, base: URL) -> URL? {
        var found: [String: String] = [:]
        for tag in matches(#"<meta\b[^>]*>"#, in: html) {
            var attributes: [String: String] = [:]
            for attribute in captureGroups(#"([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')"#, in: tag) {
                attributes[attribute[0].lowercased()] = attribute[1].isEmpty ? attribute[2] : attribute[1]
            }
            guard let key = (attributes["property"] ?? attributes["name"])?.lowercased(), keys.contains(key),
                  let content = attributes["content"], !content.isEmpty, found[key] == nil else { continue }
            found[key] = content
        }
        for key in keys {
            guard let raw = found[key] else { continue }
            let decoded = raw.replacingOccurrences(of: "&amp;", with: "&").trimmingCharacters(in: .whitespaces)
            if let url = URL(string: decoded, relativeTo: base)?.absoluteURL, ["https", "http"].contains(url.scheme ?? "") {
                return url
            }
        }
        return nil
    }

    private static func matches(_ pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { Range($0.range, in: text).map { String(text[$0]) } }
    }

    private static func captureGroups(_ pattern: String, in text: String) -> [[String]] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).map { match in
            (1..<match.numberOfRanges).map { index in
                Range(match.range(at: index), in: text).map { String(text[$0]) } ?? ""
            }
        }
    }
}
