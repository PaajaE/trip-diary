import Foundation
import Capacitor
import ImageIO
import Photos
import CoreLocation

@objc(PhotoMetadataPlugin)
public class PhotoMetadataPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoMetadataPlugin"
    public let jsName = "PhotoMetadata"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "readGpsFromUri", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMediaPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "materializePhotoFromUri", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestMediaPermissions(_ call: CAPPluginCall) {
        call.resolve([
            "accessMediaLocation": "granted"
        ])
    }

    @objc func materializePhotoFromUri(_ call: CAPPluginCall) {
        call.reject("materializePhotoFromUri is only implemented on Android")
    }

    @objc func readGpsFromUri(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri"), !uri.isEmpty else {
            call.reject("uri is required")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let coordinates = try self.readCoordinates(from: uri)
                var result = JSObject()
                if let latitude = coordinates?.latitude {
                    result["latitude"] = latitude
                }
                if let longitude = coordinates?.longitude {
                    result["longitude"] = longitude
                }
                call.resolve(result)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func readCoordinates(from uri: String) throws -> CLLocationCoordinate2D? {
        if uri.hasPrefix("ph://") {
            return readCoordinatesFromPhotoAsset(uri: uri)
        }

        if let url = URL(string: uri), url.isFileURL {
            return readCoordinatesFromFile(url: url)
        }

        if uri.hasPrefix("file://"), let url = URL(string: uri) {
            return readCoordinatesFromFile(url: url)
        }

        if let url = URL(string: uri), url.scheme == "capacitor" {
            return readCoordinatesFromFile(url: url)
        }

        return nil
    }

    private func readCoordinatesFromPhotoAsset(uri: String) -> CLLocationCoordinate2D? {
        let identifier = String(uri.dropFirst("ph://".count))
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
        guard let asset = assets.firstObject else {
            return nil
        }

        let location = asset.location
        guard let coordinate = location?.coordinate, CLLocationCoordinate2DIsValid(coordinate) else {
            return nil
        }

        return coordinate
    }

    private func readCoordinatesFromFile(url: URL) -> CLLocationCoordinate2D? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any] else {
            return nil
        }

        guard let latitude = readCoordinate(from: gps, coordinateKey: kCGImagePropertyGPSLatitude, refKey: kCGImagePropertyGPSLatitudeRef),
              let longitude = readCoordinate(from: gps, coordinateKey: kCGImagePropertyGPSLongitude, refKey: kCGImagePropertyGPSLongitudeRef) else {
            return nil
        }

        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    private func readCoordinate(
        from gps: [CFString: Any],
        coordinateKey: CFString,
        refKey: CFString
    ) -> Double? {
        let rawValue = gps[coordinateKey]
        let numericValue: Double?

        if let value = rawValue as? Double {
            numericValue = value
        } else if let value = rawValue as? NSNumber {
            numericValue = value.doubleValue
        } else {
            numericValue = nil
        }

        guard let value = numericValue else {
            return nil
        }

        let ref = gps[refKey] as? String
        if ref == "S" || ref == "W" {
            return -abs(value)
        }

        return value
    }
}
