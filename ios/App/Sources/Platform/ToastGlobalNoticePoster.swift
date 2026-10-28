import Foundation
import ChalkakFeatures

/// 업로드 화면을 나간 뒤에 알려야 하는 문구(늦게 끝난 촬영본 저장 실패)를 앱 토스트로 넘긴다(D-20).
@MainActor
final class ToastGlobalNoticePoster: GlobalNoticePosting {
    private let toast: any ToastPresenting

    init(toast: any ToastPresenting) {
        self.toast = toast
    }

    func postNotice(_ message: String) {
        toast.show(message)
    }
}
