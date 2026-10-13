import Foundation

struct UploadSnapshot {
    let uploadKey: String
    let status: UploadStatus
    let totalParts: Int
    let completedParts: Int
    let bytesSent: Int64
    let parts: [(partNumber: Int, etag: String)]
}

enum UploadOutcome {
    case completed([(partNumber: Int, etag: String)])
    case failed(String)
    case cancelled
}

/// Uploads byte ranges of one file to presigned URLs using a background
/// URLSession, so transfers continue when the app is suspended and survive
/// relaunch. Background sessions only accept file-based uploads, so each part
/// is sliced into its own temp file just before its task starts (at most
/// `maxConcurrentParts` slices exist at once).
///
/// State is persisted as JSON in Application Support. Calling `start` again
/// with an existing uploadKey re-attaches to the persisted upload instead of
/// restarting it, which is how a relaunched app collects the final ETags.
final class VideoUploadManager: NSObject, URLSessionDelegate, URLSessionTaskDelegate {
    static let shared = VideoUploadManager()
    static let sessionIdentifier = (Bundle.main.bundleIdentifier ?? "app.tripdiary") + ".video-upload"

    private static let maxConcurrentParts = 3
    private static let separator: Character = "|"

    /// Invoked on an arbitrary queue: (uploadKey, completedParts, totalParts, bytesSent).
    var onProgress: ((String, Int, Int, Int64) -> Void)?
    /// Stored by AppDelegate.handleEventsForBackgroundURLSession.
    var backgroundCompletionHandler: (() -> Void)?

    private let queue = DispatchQueue(label: "app.tripdiary.video-upload.state")
    private var states: [String: UploadState] = [:]
    private var waiters: [String: [(UploadOutcome) -> Void]] = [:]
    private var inFlightBytes: [String: [Int: Int64]] = [:]
    private var lastProgressAt: [String: Date] = [:]
    private var session: URLSession!

    private let directory: URL
    private let partsDirectory: URL
    private let stateFile: URL

    override private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directory = base.appendingPathComponent("video-upload", isDirectory: true)
        partsDirectory = directory.appendingPathComponent("parts", isDirectory: true)
        stateFile = directory.appendingPathComponent("state.json")
        super.init()

        try? FileManager.default.createDirectory(at: partsDirectory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var dir = directory
        try? dir.setResourceValues(values)

        if let data = try? Data(contentsOf: stateFile),
           let loaded = try? UploadState.decode(data) {
            states = Dictionary(loaded.map { ($0.uploadKey, $0) }, uniquingKeysWith: { _, last in last })
        }

        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.waitsForConnectivity = true
        config.isDiscretionary = false
        config.allowsCellularAccess = true
        config.sessionSendsLaunchEvents = true
        config.httpMaximumConnectionsPerHost = Self.maxConcurrentParts
        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
    }

    // MARK: - Public API

    func start(
        uploadKey: String,
        fileUrl: String,
        parts: [PartState],
        completion: @escaping (UploadOutcome) -> Void
    ) {
        queue.async {
            if let existing = self.states[uploadKey] {
                switch existing.status {
                case .completed:
                    completion(.completed(Self.etags(of: existing)))
                    self.discard(uploadKey)
                    return
                case .failed:
                    completion(.failed(existing.failureMessage ?? "Upload failed"))
                    self.discard(uploadKey)
                    return
                case .running:
                    self.waiters[uploadKey, default: []].append(completion)
                    self.reconcileThenPump(uploadKey)
                    return
                }
            }
            let state = UploadState(uploadKey: uploadKey, fileUrl: fileUrl, parts: parts)
            self.states[uploadKey] = state
            self.waiters[uploadKey, default: []].append(completion)
            self.persist()
            self.pump(uploadKey)
        }
    }

    func resume(completion: @escaping ([UploadSnapshot]) -> Void) {
        queue.async {
            self.session.getAllTasks { tasks in
                self.queue.async {
                    for key in self.states.keys {
                        self.reconcile(key, activeTasks: tasks)
                        self.pump(key)
                    }
                    completion(self.states.values.map(self.snapshot).sorted { $0.uploadKey < $1.uploadKey })
                }
            }
        }
    }

    func cancel(uploadKey: String) {
        queue.async {
            self.session.getAllTasks { tasks in
                for task in tasks where Self.parse(task.taskDescription)?.key == uploadKey {
                    task.cancel()
                }
            }
            let callbacks = self.waiters[uploadKey] ?? []
            self.discard(uploadKey)
            callbacks.forEach { $0(.cancelled) }
        }
    }

    // MARK: - Scheduling (always on `queue`)

    private func reconcileThenPump(_ key: String) {
        session.getAllTasks { tasks in
            self.queue.async {
                self.reconcile(key, activeTasks: tasks)
                self.pump(key)
            }
        }
    }

    /// Parts marked in flight whose URLSession task no longer exists (for
    /// example the user force-quit the app) go back to pending.
    private func reconcile(_ key: String, activeTasks: [URLSessionTask]) {
        guard var state = states[key], state.status == .running else { return }
        let active = Set(activeTasks.compactMap { Self.parse($0.taskDescription) }
            .filter { $0.key == key }.map { $0.partNumber })
        var changed = false
        for index in state.parts.indices
        where state.parts[index].status == .inFlight && !active.contains(state.parts[index].partNumber) {
            state.parts[index].status = .pending
            changed = true
        }
        if changed {
            states[key] = state
            persist()
        }
    }

    private func pump(_ key: String) {
        guard var state = states[key], state.status == .running else { return }

        if state.parts.allSatisfy({ $0.status == .done }) {
            finish(key, outcome: .completed(Self.etags(of: state)))
            return
        }

        var inFlight = state.parts.filter { $0.status == .inFlight }.count
        for index in state.parts.indices where inFlight < Self.maxConcurrentParts {
            guard state.parts[index].status == .pending else { continue }
            let part = state.parts[index]
            guard let url = URL(string: part.url) else {
                fail(key, message: "Invalid part URL for part \(part.partNumber)")
                return
            }
            let source = Self.fileURL(from: state.fileUrl)
            let temp = tempFile(key: key, partNumber: part.partNumber)
            do {
                try? FileManager.default.removeItem(at: temp)
                try PartSlicer.writeSlice(from: source, offset: part.offset, length: part.length, to: temp)
            } catch {
                fail(key, message: "Could not slice part \(part.partNumber): \(error.localizedDescription)")
                return
            }
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            let task = session.uploadTask(with: request, fromFile: temp)
            task.taskDescription = Self.describe(key: key, partNumber: part.partNumber)
            state.parts[index].status = .inFlight
            inFlight += 1
            task.resume()
        }
        states[key] = state
        persist()
    }

    private func finish(_ key: String, outcome: UploadOutcome) {
        guard var state = states[key] else { return }
        switch outcome {
        case .completed:
            state.status = .completed
        case .failed(let message):
            state.status = .failed
            state.failureMessage = message
        case .cancelled:
            break
        }
        states[key] = state
        persist()
        removeTempFiles(key: key)
        inFlightBytes[key] = nil

        guard let callbacks = waiters[key], !callbacks.isEmpty else {
            // No listener (app was relaunched): keep the final state until the
            // JS side re-attaches via start/resume or cancels.
            return
        }
        waiters[key] = nil
        discard(key)
        callbacks.forEach { $0(outcome) }
    }

    private func fail(_ key: String, message: String) {
        session.getAllTasks { tasks in
            for task in tasks where Self.parse(task.taskDescription)?.key == key { task.cancel() }
        }
        finish(key, outcome: .failed(message))
    }

    private func discard(_ key: String) {
        states[key] = nil
        waiters[key] = nil
        inFlightBytes[key] = nil
        lastProgressAt[key] = nil
        removeTempFiles(key: key)
        persist()
    }

    // MARK: - URLSession delegates

    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64
    ) {
        queue.async {
            guard let id = Self.parse(task.taskDescription), self.states[id.key] != nil else { return }
            self.inFlightBytes[id.key, default: [:]][id.partNumber] = totalBytesSent
            let now = Date()
            if let last = self.lastProgressAt[id.key], now.timeIntervalSince(last) < 0.25 { return }
            self.lastProgressAt[id.key] = now
            self.emitProgress(id.key)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        queue.async {
            guard let id = Self.parse(task.taskDescription),
                  var state = self.states[id.key],
                  let index = state.parts.firstIndex(where: { $0.partNumber == id.partNumber })
            else { return }
            if state.parts[index].status == .done { return }
            self.inFlightBytes[id.key]?[id.partNumber] = nil

            let http = task.response as? HTTPURLResponse
            let etag = http.flatMap { ETag.from(headers: $0.allHeaderFields) }
            if error == nil, let http, (200..<300).contains(http.statusCode), let etag {
                state.parts[index].status = .done
                state.parts[index].etag = etag
                self.states[id.key] = state
                try? FileManager.default.removeItem(at: self.tempFile(key: id.key, partNumber: id.partNumber))
                self.persist()
                self.emitProgress(id.key)
                self.pump(id.key)
                return
            }

            // Cancelled by cancelUpload/fail: state is already gone or final.
            if (error as NSError?)?.code == NSURLErrorCancelled, state.status != .running { return }

            state.parts[index].attempts += 1
            let failures = state.parts[index].attempts
            if failures > VideoLimits.maxPartAttempts {
                let reason = error?.localizedDescription
                    ?? "HTTP \(http?.statusCode ?? 0)\(etag == nil ? " (no ETag)" : "")"
                self.states[id.key] = state
                self.fail(id.key, message: "Part \(id.partNumber) failed after \(failures) attempts: \(reason)")
                return
            }
            state.parts[index].status = .pending
            self.states[id.key] = state
            self.persist()
            let delay = Backoff.delay(afterAttempt: failures)
            self.queue.asyncAfter(deadline: .now() + delay) { self.pump(id.key) }
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            let handler = self.backgroundCompletionHandler
            self.backgroundCompletionHandler = nil
            handler?()
        }
    }

    // MARK: - Helpers

    private func emitProgress(_ key: String) {
        guard let state = states[key] else { return }
        let inFlight = inFlightBytes[key]?.values.reduce(0, +) ?? 0
        onProgress?(key, state.completedParts, state.parts.count, state.completedBytes + inFlight)
    }

    private func snapshot(_ state: UploadState) -> UploadSnapshot {
        let inFlight = inFlightBytes[state.uploadKey]?.values.reduce(0, +) ?? 0
        return UploadSnapshot(
            uploadKey: state.uploadKey, status: state.status,
            totalParts: state.parts.count, completedParts: state.completedParts,
            bytesSent: state.completedBytes + inFlight,
            parts: Self.etags(of: state))
    }

    private func persist() {
        do {
            let data = try UploadState.encode(Array(states.values))
            try data.write(to: stateFile, options: .atomic)
        } catch {
            NSLog("VideoUploadManager: could not persist state: \(error)")
        }
    }

    private func tempFile(key: String, partNumber: Int) -> URL {
        partsDirectory.appendingPathComponent("\(UploadState.safeToken(key))-\(partNumber).part")
    }

    private func removeTempFiles(key: String) {
        let prefix = UploadState.safeToken(key) + "-"
        let files = (try? FileManager.default.contentsOfDirectory(atPath: partsDirectory.path)) ?? []
        for name in files where name.hasPrefix(prefix) && name.hasSuffix(".part") {
            try? FileManager.default.removeItem(at: partsDirectory.appendingPathComponent(name))
        }
    }

    private static func etags(of state: UploadState) -> [(partNumber: Int, etag: String)] {
        state.parts.compactMap { part in
            part.etag.map { (partNumber: part.partNumber, etag: $0) }
        }.sorted { $0.partNumber < $1.partNumber }
    }

    static func describe(key: String, partNumber: Int) -> String {
        "\(key)\(separator)\(partNumber)"
    }

    static func parse(_ description: String?) -> (key: String, partNumber: Int)? {
        guard let description, let split = description.lastIndex(of: separator),
              let number = Int(description[description.index(after: split)...])
        else { return nil }
        return (String(description[..<split]), number)
    }

    static func fileURL(from string: String) -> URL {
        if let url = URL(string: string), url.isFileURL { return url }
        return URL(fileURLWithPath: string)
    }
}
