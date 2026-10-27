import UIKit
import ChalkakFeatures

/// "업데이트" 버튼이 여는 스토어. URL이 없으면(스토어 미등록 앱) 아무것도 하지 않는다.
struct StoreOpener: StoreOpening {
    let storeURL: URL?

    func openStore() async {
        guard let storeURL else { return }
        // async 판은 non-Sendable options 딕셔너리를 MainActor로 넘겨 Swift 6에서 오류가 난다.
        await MainActor.run { UIApplication.shared.open(storeURL, options: [:], completionHandler: nil) }
    }
}
