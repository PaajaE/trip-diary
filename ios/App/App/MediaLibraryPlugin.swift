import Foundation
import Capacitor
import Photos
import ImageIO

/// Reads the device photo library through PhotoKit.
///
/// v2 media import source (docs/plan-v2.md, Phase 0 spike A): asset metadata
/// (capture instant, location, dimensions) comes from PHAsset, so it does not
/// depend on the picker or on file copies preserving EXIF.
@objc(MediaLibraryPlugin)
public class MediaLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MediaLibraryPlugin"
    public let jsName = "MediaLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listAssets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readEmbeddedMetadata", returnType: CAPPluginReturnPromise)
    ]

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": Self.statusName(PHPhotoLibrary.authorizationStatus(for: .readWrite))])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(["status": Self.statusName(status)])
        }
    }

    /// Lists assets created within an optional [from, to) range, newest last.
    @objc func listAssets(_ call: CAPPluginCall) {
        // Without access PhotoKit silently returns an empty result, which an
        // import would mistake for "no new photos".
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            call.reject("Photo library access not granted", "NOT_AUTHORIZED")
            return
        }

        let from = call.getString("from").flatMap(Self.parseDate)
        let to = call.getString("to").flatMap(Self.parseDate)
        let limit = call.getInt("limit") ?? 0
        let mediaTypes = call.getArray("mediaTypes", String.self) ?? ["image", "video"]

        DispatchQueue.global(qos: .userInitiated).async {
            let started = Date()
            let options = PHFetchOptions()
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
            options.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared, .typeiTunesSynced]
            if limit > 0 {
                options.fetchLimit = limit
            }

            var predicates: [NSPredicate] = []
            let types = mediaTypes.compactMap(Self.assetMediaType)
            if !types.isEmpty {
                predicates.append(NSPredicate(format: "mediaType IN %@", types.map { $0.rawValue }))
            }
            if let from {
                predicates.append(NSPredicate(format: "creationDate >= %@", from as NSDate))
            }
            if let to {
                predicates.append(NSPredicate(format: "creationDate < %@", to as NSDate))
            }
            if !predicates.isEmpty {
                options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
            }

            let result = PHAsset.fetchAssets(with: options)
            var assets: [JSObject] = []
            assets.reserveCapacity(result.count)
            result.enumerateObjects { asset, _, _ in
                assets.append(Self.serialize(asset))
            }

            call.resolve([
                "assets": assets,
                "elapsedMs": Int(Date().timeIntervalSince(started) * 1000)
            ])
        }
    }

    /// Reads EXIF/TIFF/GPS dictionaries embedded in the asset's original image
    /// data. Used to cross-check PHAsset fields and to get the capture UTC offset.
    @objc func readEmbeddedMetadata(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("id is required")
            return
        }
        let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil)
        guard let asset = fetch.firstObject else {
            call.reject("Asset not found", "NOT_FOUND")
            return
        }
        guard asset.mediaType == .image else {
            call.resolve(["available": false, "reason": "not-image"])
            return
        }

        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = call.getBool("allowNetwork") ?? false
        options.deliveryMode = .highQualityFormat
        options.version = .original
        options.isSynchronous = false

        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, info in
            if let data {
                call.resolve(Self.embeddedMetadata(from: data))
                return
            }
            let inCloud = (info?[PHImageResultIsInCloudKey] as? Bool) ?? false
            call.resolve(["available": false, "reason": inCloud ? "in-cloud" : "no-data"])
        }
    }

    // MARK: - Serialization

    private static func serialize(_ asset: PHAsset) -> JSObject {
        var object = JSObject()
        object["id"] = asset.localIdentifier
        object["mediaType"] = mediaTypeName(asset.mediaType)
        object["subtypes"] = subtypeNames(asset.mediaSubtypes)
        object["width"] = asset.pixelWidth
        object["height"] = asset.pixelHeight
        object["isFavorite"] = asset.isFavorite
        object["sourceType"] = sourceTypeName(asset.sourceType)
        if let creationDate = asset.creationDate {
            object["creationDate"] = isoFormatter.string(from: creationDate)
        }
        if let modificationDate = asset.modificationDate {
            object["modificationDate"] = isoFormatter.string(from: modificationDate)
        }
        if asset.mediaType == .video {
            object["durationMs"] = Int((asset.duration * 1000).rounded())
        }
        if let location = asset.location, CLLocationCoordinate2DIsValid(location.coordinate) {
            object["latitude"] = location.coordinate.latitude
            object["longitude"] = location.coordinate.longitude
            if location.verticalAccuracy >= 0 {
                object["altitude"] = location.altitude
            }
        }
        if let burstIdentifier = asset.burstIdentifier {
            object["burstId"] = burstIdentifier
        }
        return object
    }

    private static func embeddedMetadata(from data: Data) -> JSObject {
        var object = JSObject()
        object["available"] = true
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        else {
            object["available"] = false
            object["reason"] = "unreadable"
            return object
        }

        if let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] {
            object["dateTimeOriginal"] = exif[kCGImagePropertyExifDateTimeOriginal] as? String
            object["offsetTimeOriginal"] = exif[kCGImagePropertyExifOffsetTimeOriginal] as? String
            object["subsecTimeOriginal"] = exif[kCGImagePropertyExifSubsecTimeOriginal] as? String
        }
        if let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
            object["make"] = tiff[kCGImagePropertyTIFFMake] as? String
            object["model"] = tiff[kCGImagePropertyTIFFModel] as? String
        }
        if let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any],
           let latitude = gps[kCGImagePropertyGPSLatitude] as? Double,
           let longitude = gps[kCGImagePropertyGPSLongitude] as? Double {
            let latRef = (gps[kCGImagePropertyGPSLatitudeRef] as? String) ?? "N"
            let lngRef = (gps[kCGImagePropertyGPSLongitudeRef] as? String) ?? "E"
            object["gpsLatitude"] = latRef == "S" ? -latitude : latitude
            object["gpsLongitude"] = lngRef == "W" ? -longitude : longitude
        }
        return object
    }

    // MARK: - Mapping helpers

    private static func parseDate(_ value: String) -> Date? {
        if let date = isoFormatter.date(from: value) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }

    private static func assetMediaType(_ name: String) -> PHAssetMediaType? {
        switch name {
        case "image": return .image
        case "video": return .video
        default: return nil
        }
    }

    private static func statusName(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorized: return "authorized"
        case .limited: return "limited"
        @unknown default: return "unknown"
        }
    }

    private static func mediaTypeName(_ type: PHAssetMediaType) -> String {
        switch type {
        case .image: return "image"
        case .video: return "video"
        case .audio: return "audio"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }

    private static func sourceTypeName(_ type: PHAssetSourceType) -> String {
        if type.contains(.typeCloudShared) { return "cloudShared" }
        if type.contains(.typeiTunesSynced) { return "itunesSynced" }
        return "userLibrary"
    }

    private static func subtypeNames(_ subtypes: PHAssetMediaSubtype) -> [String] {
        var names: [String] = []
        if subtypes.contains(.photoLive) { names.append("live") }
        if subtypes.contains(.photoPanorama) { names.append("panorama") }
        if subtypes.contains(.photoHDR) { names.append("hdr") }
        if subtypes.contains(.photoScreenshot) { names.append("screenshot") }
        if subtypes.contains(.photoDepthEffect) { names.append("portrait") }
        if subtypes.contains(.videoHighFrameRate) { names.append("slomo") }
        if subtypes.contains(.videoTimelapse) { names.append("timelapse") }
        if subtypes.contains(.videoCinematic) { names.append("cinematic") }
        return names
    }
}
