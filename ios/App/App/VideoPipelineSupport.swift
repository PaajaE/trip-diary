import Foundation

/// Pure, plugin-independent helpers for the video pipeline (export limits,
/// part slicing, persisted upload state, ETag parsing). Kept free of Capacitor
/// and URLSession so they can be unit-tested in isolation.
enum VideoLimits {
    static let maxDurationMs = 60_000
    static let durationToleranceMs = 500
    static let maxByteSize: Int64 = 120 * 1024 * 1024
    static let maxPartAttempts = 3

    static func isTooLong(durationMs: Int) -> Bool {
        durationMs > maxDurationMs + durationToleranceMs
    }

    static func isTooLarge(byteSize: Int64) -> Bool {
        byteSize > maxByteSize
    }
}

enum VideoPipelineError: Error {
    case slice(String)
}

enum PartSlicer {
    /// Copies `length` bytes starting at `offset` from `source` into `destination`.
    /// Streams in small chunks so an 8 MiB part never needs to be fully in memory.
    static func writeSlice(
        from source: URL, offset: Int64, length: Int64, to destination: URL
    ) throws {
        guard offset >= 0, length > 0 else {
            throw VideoPipelineError.slice("Invalid range")
        }
        let reader = try FileHandle(forReadingFrom: source)
        defer { try? reader.close() }
        let size = try reader.seekToEnd()
        guard UInt64(offset) + UInt64(length) <= size else {
            throw VideoPipelineError.slice("Range exceeds file size")
        }
        try reader.seek(toOffset: UInt64(offset))

        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let writer = try FileHandle(forWritingTo: destination)
        defer { try? writer.close() }

        var remaining = length
        let chunk = 1024 * 1024
        while remaining > 0 {
            let want = Int(min(Int64(chunk), remaining))
            guard let data = try reader.read(upToCount: want), !data.isEmpty else {
                throw VideoPipelineError.slice("Unexpected end of file")
            }
            try writer.write(contentsOf: data)
            remaining -= Int64(data.count)
        }
    }
}

enum ETag {
    /// S3/R2 return the ETag quoted (`"abc"`), possibly weak (`W/"abc"`). The
    /// server completes the upload with the bare value, so quotes are stripped.
    static func normalize(_ raw: String?) -> String? {
        guard var value = raw?.trimmingCharacters(in: .whitespaces), !value.isEmpty else {
            return nil
        }
        if value.hasPrefix("W/") { value.removeFirst(2) }
        value = value.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        return value.isEmpty ? nil : value
    }

    /// Header names are case-insensitive but `allHeaderFields` is not.
    static func from(headers: [AnyHashable: Any]) -> String? {
        for (key, value) in headers {
            if let name = key as? String, name.lowercased() == "etag" {
                return normalize(value as? String)
            }
        }
        return nil
    }
}

enum PartStatus: String, Codable {
    case pending
    case inFlight
    case done
}

struct PartState: Codable, Equatable {
    var partNumber: Int
    var url: String
    var offset: Int64
    var length: Int64
    var status: PartStatus = .pending
    var attempts: Int = 0
    var etag: String?
}

enum UploadStatus: String, Codable {
    case running
    case completed
    case failed
}

struct UploadState: Codable, Equatable {
    var uploadKey: String
    var fileUrl: String
    var parts: [PartState]
    var status: UploadStatus = .running
    var failureMessage: String?

    var completedParts: Int { parts.filter { $0.status == .done }.count }

    var completedBytes: Int64 {
        parts.filter { $0.status == .done }.reduce(0) { $0 + $1.length }
    }

    static func encode(_ states: [UploadState]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(states)
    }

    static func decode(_ data: Data) throws -> [UploadState] {
        try JSONDecoder().decode([UploadState].self, from: data)
    }

    /// Stable file-system safe token for temp file names.
    static func safeToken(_ key: String) -> String {
        let allowed = CharacterSet.alphanumerics
        return String(key.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
    }
}

enum Backoff {
    /// 1 s, 2 s, 4 s for attempts 1, 2, 3.
    static func delay(afterAttempt attempt: Int) -> TimeInterval {
        pow(2.0, Double(max(0, attempt - 1)))
    }
}
