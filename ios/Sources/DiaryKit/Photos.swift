import Foundation
import ImageIO
import UniformTypeIdentifiers

/// A picture of us for the photo widget: one of the diary's pictures, decrypted on the phone
/// and made small enough for a widget.
public struct PhotoOfUs {
    public let jpeg: Data
    public let caption: String?
    public let at: Date?
    public let pageID: String
}

extension DiaryKit {
    /// Picks a picture from the diary (the same one for the same `turn`, a different one each turn).
    public static func photoOfUs(turn: Int) async throws -> PhotoOfUs {
        let pages = try await entries().filter { $0["type"] as? String == "photo" && $0["status"] == nil && $0["media"] is String }
        let pictures: [(page: [String: Any], path: String)] = pages.flatMap { page in
            ([page["media"] as! String] + ((page["more"] as? [String]) ?? [])).map { (page, $0) }
        }
        guard !pictures.isEmpty else { throw Problem.unreadable }
        let pick = pictures[abs(turn) % pictures.count]
        let jpeg = try small(try await media(pick.path), maxPixels: 900)
        return PhotoOfUs(jpeg: jpeg, caption: pick.page["caption"] as? String, at: date(pick.page["at"]), pageID: pick.page["id"] as? String ?? "")
    }

    /// A widget has little memory: shrink the picture (keeping it the right way up) before showing it.
    static func small(_ data: Data, maxPixels: Int) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceCreateThumbnailWithTransform: true,
                  kCGImageSourceThumbnailMaxPixelSize: maxPixels,
              ] as CFDictionary) else { throw Problem.unreadable }
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { throw Problem.unreadable }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw Problem.unreadable }
        return out as Data
    }
}
