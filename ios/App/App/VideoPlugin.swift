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
            // AVAssetReader/Writer pipeline: H.264 High, <= 1920x1080 box, ~8 Mb/s,
            // AAC 128 kbps. Bitrate cannot be controlled with export presets.
            let transcoder = VideoTranscoder(asset: asset, outputURL: videoUrl) { [weak self] progress in
                self?.notifyListeners("exportProgress", data: ["progress": progress])
            }
            try await transcoder.run()
            notifyListeners("exportProgress", data: ["progress": 1.0])

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


// MARK: - Transcoder

/// Re-encodes an asset with AVAssetReader/AVAssetWriter so the bitrate is controlled.
/// Single use. Cancelling the surrounding Task cancels reading and writing; the
/// caller deletes the partial output file on any thrown error.
final class VideoTranscoder: @unchecked Sendable {
    private struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private let asset: AVAsset
    private let outputURL: URL
    private let onProgress: @Sendable (Double) -> Void
    private let lock = NSLock()
    private var cancelled = false
    private var failure: Error?
    private var reader: AVAssetReader?
    private var lastProgressAt = Date.distantPast

    init(asset: AVAsset, outputURL: URL, onProgress: @escaping @Sendable (Double) -> Void) {
        self.asset = asset
        self.outputURL = outputURL
        self.onProgress = onProgress
    }

    private var isStopped: Bool {
        lock.lock(); defer { lock.unlock() }
        return cancelled || failure != nil
    }

    private func snapshot() -> (cancelled: Bool, failure: Error?) {
        lock.lock(); defer { lock.unlock() }
        return (cancelled, failure)
    }

    private func fail(_ error: Error) {
        lock.lock()
        if failure == nil { failure = error }
        lock.unlock()
        reader?.cancelReading()
    }

    private func cancel() {
        lock.lock(); cancelled = true; lock.unlock()
        reader?.cancelReading()
    }

    private func report(_ pts: CMTime, duration: Double) {
        let now = Date()
        lock.lock()
        let due = now.timeIntervalSince(lastProgressAt) >= 0.25
        if due { lastProgressAt = now }
        lock.unlock()
        guard due else { return }
        // Leave 1.0 for the caller, after the file is finalised.
        onProgress(min(0.99, VideoExportSettings.progress(presentationSeconds: pts.seconds, durationSeconds: duration)))
    }

    func run() async throws {
        try await withTaskCancellationHandler {
            try await transcode()
        } onCancel: {
            self.cancel()
        }
    }

    private func transcode() async throws {
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw Failure(message: "Source has no video track")
        }
        let audioTrack = try await asset.loadTracks(withMediaType: .audio).first
        let duration = try await asset.load(.duration).seconds
        let (naturalSize, transform, nominalRate) = try await videoTrack.load(
            .naturalSize, .preferredTransform, .nominalFrameRate)

        let size = VideoExportSettings.fitDimensions(
            width: Int(naturalSize.width.rounded()), height: Int(naturalSize.height.rounded()))
        let frameRate = VideoExportSettings.expectedFrameRate(nominal: nominalRate)
        let bitrate = VideoExportSettings.videoBitrate(width: size.width, height: size.height)

        let reader = try AVAssetReader(asset: asset)
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true
        self.reader = reader

        // Decode to 8-bit 4:2:0; this also makes the writer scale to the target size.
        let videoOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        ])
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw Failure(message: "Cannot read video track") }
        reader.add(videoOutput)

        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: size.width,
            AVVideoHeightKey: size.height,
            AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: VideoExportSettings.maxKeyFrameInterval(frameRate: frameRate),
                AVVideoExpectedSourceFrameRateKey: frameRate,
                AVVideoAllowFrameReorderingKey: true
            ] as [String: Any]
        ])
        videoInput.expectsMediaDataInRealTime = false
        // Frames are read untransformed, so carry the orientation as metadata.
        videoInput.transform = transform
        guard writer.canAdd(videoInput) else { throw Failure(message: "Cannot write video track") }
        writer.add(videoInput)

        var audioOutput: AVAssetReaderAudioMixOutput?
        var audioInput: AVAssetWriterInput?
        if let audioTrack {
            let sourceRate = (try? await Self.sampleRate(of: audioTrack)) ?? 48_000
            let rate = VideoExportSettings.audioSampleRate(source: sourceRate)
            // The reader converts to stereo PCM at the target rate; the writer encodes AAC.
            let out = AVAssetReaderAudioMixOutput(audioTracks: [audioTrack], audioSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: rate,
                AVNumberOfChannelsKey: VideoExportSettings.audioChannels
            ])
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: rate,
                AVNumberOfChannelsKey: VideoExportSettings.audioChannels,
                AVEncoderBitRateKey: VideoExportSettings.audioBitrate
            ])
            input.expectsMediaDataInRealTime = false
            if reader.canAdd(out), writer.canAdd(input) {
                reader.add(out)
                writer.add(input)
                audioOutput = out
                audioInput = input
            }
        }

        guard writer.startWriting() else {
            throw Failure(message: writer.error?.localizedDescription ?? "Writer failed to start")
        }
        guard reader.startReading() else {
            writer.cancelWriting()
            throw Failure(message: reader.error?.localizedDescription ?? "Reader failed to start")
        }
        writer.startSession(atSourceTime: .zero)
        if isStopped { reader.cancelReading() }

        let group = DispatchGroup()
        pump(output: videoOutput, input: videoInput, writer: writer, reader: reader, group: group,
             queue: DispatchQueue(label: "video.export.video"), duration: duration, reportsProgress: true)
        if let audioOutput, let audioInput {
            pump(output: audioOutput, input: audioInput, writer: writer, reader: reader, group: group,
                 queue: DispatchQueue(label: "video.export.audio"), duration: duration, reportsProgress: false)
        }

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            group.notify(queue: .global()) { continuation.resume() }
        }

        let (wasCancelled, recorded) = snapshot()
        if wasCancelled || recorded != nil || reader.status == .failed || writer.status == .failed {
            writer.cancelWriting()
            if wasCancelled { throw Failure(message: "Export cancelled") }
            if let recorded { throw recorded }
            let reason = reader.error ?? writer.error
            throw Failure(message: reason?.localizedDescription ?? "Transcoding failed")
        }

        await writer.finishWriting()
        guard writer.status == .completed else {
            throw Failure(message: writer.error?.localizedDescription ?? "Writer status \(writer.status.rawValue)")
        }
    }

    private func pump(
        output: AVAssetReaderOutput, input: AVAssetWriterInput, writer: AVAssetWriter,
        reader: AVAssetReader, group: DispatchGroup, queue: DispatchQueue,
        duration: Double, reportsProgress: Bool
    ) {
        group.enter()
        var finished = false
        input.requestMediaDataWhenReady(on: queue) { [self] in
            while input.isReadyForMoreMediaData && !finished {
                if isStopped {
                    input.markAsFinished(); finished = true; group.leave(); return
                }
                guard let sample = output.copyNextSampleBuffer() else {
                    if reader.status == .failed {
                        fail(reader.error ?? Failure(message: "Reader failed"))
                    }
                    input.markAsFinished(); finished = true; group.leave(); return
                }
                if reportsProgress {
                    report(CMSampleBufferGetPresentationTimeStamp(sample), duration: duration)
                }
                if !input.append(sample) {
                    fail(writer.error ?? Failure(message: "Writer rejected a sample"))
                    input.markAsFinished(); finished = true; group.leave(); return
                }
            }
        }
    }

    private static func sampleRate(of track: AVAssetTrack) async throws -> Double {
        let descriptions = try await track.load(.formatDescriptions)
        guard let description = descriptions.first,
              let basic = CMAudioFormatDescriptionGetStreamBasicDescription(description)
        else { return 48_000 }
        return basic.pointee.mSampleRate
    }
}
