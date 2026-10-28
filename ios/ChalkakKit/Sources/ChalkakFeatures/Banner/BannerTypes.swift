import Foundation
import ChalkakData

/// 홈 ISSUE 섹션 상태.
public enum IssueSectionState: Sendable, Equatable {
    /// 최초 조회 중
    case loading
    /// 성공했지만 배너가 0개 → 섹션 전체 숨김(REQ-BANR-005)
    case hidden
    case items([Banner])
    /// 최초 조회 실패: "ISSUE를 불러오지 못했어요. 다시 시도"(REQ-BANR-006). 다른 섹션에 영향 없음.
    case failed(String)
}
