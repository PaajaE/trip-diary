import Foundation
import Capacitor
import Photos
import AVFoundation
import UIKit

/// Native video export (H.264 1080p max, .mp4) and background multipart upload.
/// JS orchestration and server calls live in the web layer; this plugin only
/// provides the native capabilities (docs/plan-v2.md, "Videa").
@objc(VideoPlugin)
public class VideoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VideoPlugin"
    public let jsName = "VideoPipeline"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteExport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadParts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeUploads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelUpload", returnType: CAPPluginReturnPromise)
    ]

    private static var exportDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("video-export", isDirectory: true)
    }

    override public func load() {
        VideoUploadManager.shared.onProgress = { [weak self] key, completed, total, bytes in
            self?.notifyListeners("uploadProgress", data: [
                "uploadKey": key,
                "completedParts": completed,
                "totalParts": total,
                "bytesSent": Int(bytes)
            ])
        }
    }

    // MARK: - Export

    @objc func exportVideo(_ call: CAPPluginCall) {
        let assetId = call.getString("assetId")
        let fileUrl = call.getString("fileUrl")
        guard (assetId?.isEmpty == false) != (fileUrl?.isEmpty == false) else {
            call.reject("Provide exactly one of assetId or fileUrl", "INVALID_ARGUMENT")
            return
        }

        Task {
            do {
                let source: AVAsset
                if let assetId, !assetId.isEmpty {
                    source = try await Self.loadPhotoAsset(localIdentifier: assetId)
                } else {
                    source = AVURLAsset(url: VideoUploadManager.fileURL(from: fileUrl ?? ""))
                }
                call.resolve(try await self.export(source))
            } catch let failure as PluginFailure {
                call.reject(failure.message, failure.code)
            } catch {
                call.reject("Export failed: \(error.localizedDescription)", "EXPORT_FAILED", error)
            }
        }
    }

    @objc func deleteExport(_ call: CAPPluginCall) {
        // Only files inside the dedicated export directory may be removed.
        let root = Self.exportDirectory.standardizedFileURL.path + "/"
        for string in call.getArray("fileUrls", String.self) ?? [] {
            let url = VideoUploadManager.fileURL(from: string).standardizedFileURL
            if url.path.hasPrefix(root) { try? FileManager.default.removeItem(at: url) }
        }
        call.resolve()
    }

    private struct PluginFailure: Error {
        let code: String
        let message: String
    }

    private static func loadPhotoAsset(localIdentifier: String) async throws -> AVAsset {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            throw PluginFailure(code: "NOT_AUTHORIZED", message: "Photo library access not granted")
        }
        guard let phAsset = PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil).firstObject
        else {
            throw PluginFailure(code: "NOT_FOUND", message: "Asset not found")
        }
        guard phAsset.mediaType == .video else {
            throw PluginFailure(code: "INVALID_ARGUMENT", message: "Asset is not a video")
        }
        // PHAsset reports the duration without downloading; fail before any iCloud transfer.
        if VideoLimits.isTooLong(durationMs: Int((phAsset.duration * 1000).rounded())) {
            throw PluginFailure(code: "VIDEO_TOO_LONG", message: "Video is longer than 60 seconds")
        }

        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.version = .current

        return try await withCheckedThrowingContinuation { continuation in
            PHImageManager.default().requestAVAsset(forVideo: phAsset, options: options) { avAsset, _, info in
                if let avAsset {
                    continuation.resume(returning: avAsset)
                    return
                }
                let message = (info?[PHImageErrorKey] as? Error)?.localizedDescription ?? "Video unavailable"
                continuation.resume(throwing: PluginFailure(code: "ASSET_UNAVAILABLE", message: message))
            }
        }
    }

    private func export(_ asset: AVAsset) async throws -> JSObject {
        let duration = try await asset.load(.duration)
        let durationMs = Int((duration.seconds * 1000).rounded())
        if VideoLimits.isTooLong(durationMs: durationMs) {
            throw PluginFailure(code: "VIDEO_TOO_LONG", message: "Video is longer than 60 seconds")
        }

        try FileManager.default.createDirectory(at: Self.exportDirectory, withIntermediateDirectories: true)
        let name = UUID().uuidString
        let videoUrl = Self.exportDirectory.appendingPathComponent("\(name).mp4")
        let posterUrl = Self.exportDirectory.appendingPathComponent("\(name).jpg")

        do {
            // AVAssetExportPreset1920x1080 always produces H.264 (HEVC needs the
            // explicit HEVC presets) and never upscales smaller sources, so HEVC 4K
            // input is transcoded down to 1080p H.264. The preferred transform is
            // carried over, preserving orientation.
            let compatible = AVAssetExportSession.exportPresets(compatibleWith: asset)
            let preset = [AVAssetExportPreset1920x1080, AVAssetExportPreset1280x720, AVAssetExportPresetMediumQuality]
                .first(where: compatible.contains)
            guard let preset, let session = AVAssetExportSession(asset: asset, presetName: preset) else {
                throw PluginFailure(code: "EXPORT_FAILED", message: "No compatible export preset")
            }
            session.outputURL = videoUrl
            session.outputFileType = .mp4
            session.shouldOptimizeForNetworkUse = true

            try await run(session)

            let byteSize = try Self.fileSize(videoUrl)
            if VideoLimits.isTooLarge(byteSize: byteSize) {
                throw PluginFailure(code: "VIDEO_TOO_LARGE", message: "Exported video exceeds 120 MiB")
            }

            let exported = AVURLAsset(url: videoUrl)
            let (width, height) = try await Self.displaySize(of: exported)
            let exportedMs = Int(((try await exported.load(.duration)).seconds * 1000).rounded())
            let poster = try await Self.writePoster(for: exported, durationMs: exportedMs, to: posterUrl)
            let posterBytes = try Self.fileSize(posterUrl)

            return [
                "fileUrl": videoUrl.absoluteString,
                "posterUrl": posterUrl.absoluteString,
                "durationMs": exportedMs,
                "width": width,
                "height": height,
                "byteSize": Int(byteSize),
                "posterWidth": poster.width,
                "posterHeight": poster.height,
                "posterByteSize": Int(posterBytes),
                "mimeType": "video/mp4"
            ]
        } catch {
            try? FileManager.default.removeItem(at: videoUrl)
            try? FileManager.default.removeItem(at: posterUrl)
            throw error
        }
    }

    private func run(_ session: AVAssetExportSession) async throws {
        let poll = Task {
            while !Task.isCancelled {
                self.notifyListeners("exportProgress", data: ["progress": Double(session.progress)])
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
        }
        defer { poll.cancel() }

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { continuation.resume() }
        }
        guard session.status == .completed else {
            let reason = session.error?.localizedDescription ?? "status \(session.status.rawValue)"
            throw PluginFailure(code: "EXPORT_FAILED", message: "Export failed: \(reason)")
        }
        notifyListeners("exportProgress", data: ["progress": 1.0])
    }

    private static func fileSize(_ url: URL) throws -> Int64 {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return (attributes[.size] as? NSNumber)?.int64Value ?? 0
    }

    /// Width/height as displayed, i.e. after applying the track's preferred transform.
    private static func displaySize(of asset: AVAsset) async throws -> (Int, Int) {
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw PluginFailure(code: "EXPORT_FAILED", message: "Exported file has no video track")
        }
        let (size, transform) = try await track.load(.naturalSize, .preferredTransform)
        let rect = CGRect(origin: .zero, size: size).applying(transform)
        return (Int(abs(rect.width).rounded()), Int(abs(rect.height).rounded()))
    }

    private static func writePoster(
        for asset: AVAsset, durationMs: Int, to url: URL
    ) async throws -> (width: Int, height: Int) {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        // Very short clips: use the middle instead of a time past the end.
        let seconds = min(0.5, Double(durationMs) / 2000)
        let time = CMTime(seconds: seconds, preferredTimescale: 600)

        let image: CGImage = try await withCheckedThrowingContinuation { continuation in
            generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: time)]) { _, image, _, result, error in
                if let image, result == .succeeded {
                    continuation.resume(returning: image)
                } else {
                    continuation.resume(throwing: PluginFailure(
                        code: "EXPORT_FAILED",
                        message: "Poster failed: \(error?.localizedDescription ?? "no image")"))
                }
            }
        }
        guard let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.8) else {
            throw PluginFailure(code: "EXPORT_FAILED", message: "Poster encoding failed")
        }
        try data.write(to: url, options: .atomic)
        return (image.width, image.height)
    }

    // MARK: - Upload

    @objc func uploadParts(_ call: CAPPluginCall) {
        guard let uploadKey = call.getString("uploadKey"), !uploadKey.isEmpty,
              let fileUrl = call.getString("fileUrl"),
              let rawParts = call.getArray("parts", JSObject.self), !rawParts.isEmpty
        else {
            call.reject("uploadKey, fileUrl and parts are required", "INVALID_ARGUMENT")
            return
        }
        var parts: [PartState] = []
        for raw in rawParts {
            guard let number = raw["partNumber"] as? Int, let url = raw["url"] as? String,
                  let offset = (raw["offset"] as? NSNumber)?.int64Value,
                  let length = (raw["length"] as? NSNumber)?.int64Value,
                  number > 0, length > 0, offset >= 0
            else {
                call.reject("Invalid part descriptor", "INVALID_ARGUMENT")
                return
            }
            parts.append(PartState(partNumber: number, url: url, offset: offset, length: length))
        }

        // Resolved once every part finished. If the app is relaunched meanwhile,
        // calling uploadParts again with the same uploadKey re-attaches.
        VideoUploadManager.shared.start(uploadKey: uploadKey, fileUrl: fileUrl, parts: parts) { outcome in
            switch outcome {
            case .completed(let etags):
                call.resolve(["parts": etags.map { ["partNumber": $0.partNumber, "etag": $0.etag] }])
            case .failed(let message):
                call.reject(message, "UPLOAD_FAILED")
            case .cancelled:
                call.reject("Upload cancelled", "UPLOAD_CANCELLED")
            }
        }
    }

    @objc func resumeUploads(_ call: CAPPluginCall) {
        VideoUploadManager.shared.resume { snapshots in
            let uploads: [JSObject] = snapshots.map { snapshot in
                [
                    "uploadKey": snapshot.uploadKey,
                    "status": snapshot.status.rawValue,
                    "totalParts": snapshot.totalParts,
                    "completedParts": snapshot.completedParts,
                    "bytesSent": Int(snapshot.bytesSent),
                    "parts": snapshot.parts.map { ["partNumber": $0.partNumber, "etag": $0.etag] }
                ]
            }
            call.resolve(["uploads": uploads])
        }
    }

    @objc func cancelUpload(_ call: CAPPluginCall) {
        guard let uploadKey = call.getString("uploadKey"), !uploadKey.isEmpty else {
            call.reject("uploadKey is required", "INVALID_ARGUMENT")
            return
        }
        VideoUploadManager.shared.cancel(uploadKey: uploadKey)
        call.resolve()
    }
}
