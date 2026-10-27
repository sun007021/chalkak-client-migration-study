import UIKit
import ChalkakFeatures

/// "업데이트" 버튼이 여는 스토어. URL이 없으면(스토어 미등록 앱) 아무것도 하지 않는다.
struct StoreOpener: StoreOpening {
    let storeURL: URL?

    func openStore() async {
        guard let storeURL else { return }
        await UIApplication.shared.open(storeURL)
    }
}
