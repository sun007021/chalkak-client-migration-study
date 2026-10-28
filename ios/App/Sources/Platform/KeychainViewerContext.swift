import ChalkakData

/// 지금 앱을 쓰는 사람. Keychain에 세션이 있으면 로그인한 사용자, 없으면 게스트로 본다(호출 시점의 최신 값).
struct KeychainViewerContext: ViewerContext {
    let store: KeychainSessionStore

    var userId: String? { store.storedUserId() }
    var isGuest: Bool { userId == nil }
}
