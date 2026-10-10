import Foundation
import ImageIO

/// Pure helpers for MediaLibraryPlugin.exportPhoto / deletePhotoExports.
/// No PhotoKit or Capacitor dependency, so it can be compiled in a macOS harness.
enum PhotoExport {
    static let defaultLongEdge = 4096
    static let minLongEdge = 512
    static let maxLongEdge = 8192
    static let jpegQuality = 0.9
    static let directoryName = "photo-export"

    enum Failure: Error {
        case unreadable
        case encodeFailed
        case writeFailed(String)
    }

    struct Output {
        let width: Int
        let height: Int
        let byteSize: Int
        let hasExif: Bool
    }

    /// Requested long edge clamped to 512...8192; nil falls back to the default.
    static func clampLongEdge(_ requested: Int?) -> Int {
        guard let requested else { return defaultLongEdge }
        return min(max(requested, minLongEdge), maxLongEdge)
    }

    /// Target pixel size that fits the long edge into `limit`, never upscaling.
    static func fit(width: Int, height: Int, limit: Int) -> (width: Int, height: Int) {
        let longEdge = max(width, height)
        guard longEdge > limit, longEdge > 0 else { return (width, height) }
        let scale = Double(limit) / Double(longEdge)
        return (max(1, Int((Double(width) * scale).rounded())),
                max(1, Int((Double(height) * scale).rounded())))
    }

    /// Directory for exported files: Caches/photo-export (created on demand).
    static func exportDirectory() throws -> URL {
        let caches = try FileManager.default.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = caches.appendingPathComponent(directoryName, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    /// True when `url` (symlinks resolved) is a file strictly inside `directory`.
    static func isInside(_ url: URL, directory: URL) -> Bool {
        let base = directory.resolvingSymlinksInPath().standardizedFileURL.path
        let path = url.resolvingSymlinksInPath().standardizedFileURL.path
        return path.hasPrefix(base.hasSuffix("/") ? base : base + "/")
    }

    /// Decodes image data (HEIC, JPEG, PNG, RAW, ...) and writes an upright JPEG
    /// that keeps the source metadata (EXIF, GPS, TIFF, ...), long edge capped.
    static func reencode(data: Data, longEdgeLimit: Int, to url: URL) throws -> Output {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0
        else { throw Failure.unreadable }

        let properties = (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]) ?? [:]
        let sourceWidth = (properties[kCGImagePropertyPixelWidth] as? Int) ?? 0
        let sourceHeight = (properties[kCGImagePropertyPixelHeight] as? Int) ?? 0
        let sourceLongEdge = max(sourceWidth, sourceHeight)
        // Never upscale. Unknown source size falls back to the limit itself.
        let maxPixelSize = sourceLongEdge > 0 ? min(sourceLongEdge, longEdgeLimit) : longEdgeLimit

        // The thumbnail path applies the orientation transform and downscales
        // without decoding the full bitmap first.
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary)
        else { throw Failure.unreadable }

        var metadata = properties
        // Pixels are written upright, so the orientation tag must be 1.
        metadata[kCGImagePropertyOrientation] = 1
        if var tiff = metadata[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
            tiff[kCGImagePropertyTIFFOrientation] = 1
            metadata[kCGImagePropertyTIFFDictionary] = tiff
        }
        if var exif = metadata[kCGImagePropertyExifDictionary] as? [CFString: Any] {
            exif[kCGImagePropertyExifPixelXDimension] = image.width
            exif[kCGImagePropertyExifPixelYDimension] = image.height
            metadata[kCGImagePropertyExifDictionary] = exif
        }
        // Describe the source container/pixels, not the output.
        metadata[kCGImagePropertyPixelWidth] = image.width
        metadata[kCGImagePropertyPixelHeight] = image.height
        for key in [kCGImagePropertyHEICSDictionary, kCGImagePropertyPNGDictionary,
                    kCGImagePropertyGIFDictionary, kCGImagePropertyDepth,
                    kCGImagePropertyIsFloat, kCGImagePropertyHasAlpha] {
            metadata.removeValue(forKey: key)
        }
        metadata[kCGImageDestinationLossyCompressionQuality] = jpegQuality

        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL, "public.jpeg" as CFString, 1, nil)
        else { throw Failure.encodeFailed }
        CGImageDestinationAddImage(destination, image, metadata as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            try? FileManager.default.removeItem(at: url)
            throw Failure.encodeFailed
        }

        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        let byteSize = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard byteSize > 0 else { throw Failure.writeFailed("empty output") }
        return Output(
            width: image.width,
            height: image.height,
            byteSize: byteSize,
            hasExif: metadata[kCGImagePropertyExifDictionary] != nil)
    }
}
