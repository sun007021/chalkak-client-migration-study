import UIKit
import ChalkakFeatures

/// 외부 브라우저(시스템)로 URL을 연다. 약관 문서·ISSUE 웹뷰의 외부 링크가 쓴다.
struct SystemExternalURLOpener: ExternalURLOpening {
    func open(_ url: URL) async -> Bool {
        await outcome(for: url) == .opened
    }

    /// 열 수 있는 앱이 없으면 `.noBrowser`, 열기를 요청했다가 거절되면 `.failed`.
    func outcome(for url: URL) async -> ExternalOpenOutcome {
        await withCheckedContinuation { continuation in
            Task { @MainActor in
                let application = UIApplication.shared
                guard application.canOpenURL(url) else {
                    continuation.resume(returning: .noBrowser)
                    return
                }
                application.open(url, options: [:]) { success in
                    continuation.resume(returning: success ? .opened : .failed)
                }
            }
        }
    }
}
