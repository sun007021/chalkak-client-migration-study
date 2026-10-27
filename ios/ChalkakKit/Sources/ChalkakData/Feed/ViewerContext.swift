import Foundation

/// 지금 앱을 쓰는 사람. 게스트 여부와 내 userId만 안다(세션 저장소·인증 모듈은 다른 브랜치가 구현해 꽂는다).
/// 값은 호출 시점의 최신이어야 한다(로그아웃·계정 전환 뒤에는 바뀐 값을 돌려준다).
public protocol ViewerContext: Sendable {
    /// 로그인하지 않았으면 true.
    var isGuest: Bool { get }
    /// 로그인한 사용자 id(게스트는 nil). 서버 응답의 UUID와 대소문자 무관하게 비교한다.
    var userId: String? { get }
}
