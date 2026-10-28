import Foundation
import ChalkakCore
import ChalkakData

/// AI 피드백 문구. 값은 `shared/copy/ko.json`(ai.*)과 같아야 한다(`AIReviewCopyTests`가 대조).
public enum AIReviewCopy {
    // 알약
    public static let pillChecking = "AI 상태 확인중"
    public static let pillRequest = "AI 피드백 받기"
    public static let pillRequesting = "AI 요청중"
    public static let pillProcessing = "AI 분석중"
    public static let pillView = "AI 피드백 보기"
    public static let pillRetry = "AI 피드백 재요청"
    public static let pillFailed = "AI 피드백 실패"
    public static let pillRecheck = "AI 상태 다시 확인"
    // 시작·재요청 시트
    public static let startTitle = "AI 피드백을 시작할까요?"
    public static let startTitleRetry = "AI 피드백을 재요청할까요?"
    public static let startLines = [
        "결과가 나오기까지 몇 분 정도 소요될 수 있어요",
        "앱을 나가도 분석은 계속되니 걱정마세요",
        "분석이 끝나면 알림으로 알려드릴게요",
    ]
    public static let startConfirm = "분석 시작하기"
    // 실패 시트
    public static let failedTitle = "AI 피드백을 생성하지 못했어요"
    public static let failedNoMore = "이 사진은 더 이상 AI 피드백을 요청할 수 없어요."
    public static let failedPast = "AI 피드백은 오늘 올린 사진만 재요청할 수 있어요."
    public static let failedConfirm = "확인"
    // 결과 시트
    public static let perspectiveBadge = "작가님의 해석이 돋보이는 작품이에요"
    public static let strengthTitle = "좋았던 점"
    public static let weaknessTitle = "아쉬운 점"
    public static let suggestionTitle = "다음엔 이렇게"
    public static let criteriaDialogTitle = "찰칵AI는 어떤 기준으로 점수를 내나요?"
    // 폴링·오류
    public static let pollTimeout = "처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요."
    public static let errorNetwork = "네트워크 연결을 확인해 주세요."
    public static let errorLoad = "AI 피드백 정보를 불러오지 못했어요."
    public static let errorLogin = "다시 로그인해 주세요."
    public static let errorBanned = "이용이 제한되어 AI 피드백을 요청할 수 없어요."
    public static let errorNotFound = "AI 피드백을 확인할 수 없는 게시물이에요."
    // 홈 카드
    public static let cardRequest = "이 사진, AI에게 피드백 받아보기"
    public static let cardProcessing = "AI 피드백이 진행중이에요"
    public static let cardCompleted = "AI 피드백이 완료되었어요"
    public static let cardFailed = "AI 피드백을 생성하지 못했어요"
    public static let cardDetail = "자세히 보기"
    public static let cardRetry = "재요청"

    /// 점수 표시: 소수 첫째 자리 고정("7.5", "10.0", "0.0"). 서버 값을 다시 계산하지 않는다(REQ-AIR-040, 확인 필요 [추정]).
    public static func scoreText(_ score: Double) -> String {
        String(format: "%.1f", score)
    }

    /// 종합 점수 접근성 문구 "전체 점수 10점 만점에 {X}점"(X는 `scoreText`).
    public static func scoreAccessibility(_ score: Double) -> String {
        "전체 점수 10점 만점에 \(scoreText(score))점"
    }
}
