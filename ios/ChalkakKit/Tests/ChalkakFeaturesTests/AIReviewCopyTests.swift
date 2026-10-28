import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("AIR 문구·상수")
struct AIReviewCopyTests {
    @Test("shared/copy/ko.json과 AI 피드백 문구가 같다")
    func matchesSharedCopy() throws {
        let pairs: [(String, String)] = [
            ("ai.pill.checking", AIReviewCopy.pillChecking), ("ai.pill.request", AIReviewCopy.pillRequest),
            ("ai.pill.requesting", AIReviewCopy.pillRequesting), ("ai.pill.processing", AIReviewCopy.pillProcessing),
            ("ai.pill.view", AIReviewCopy.pillView), ("ai.pill.retry", AIReviewCopy.pillRetry),
            ("ai.pill.failed", AIReviewCopy.pillFailed), ("ai.pill.recheck", AIReviewCopy.pillRecheck),
            ("ai.start.title", AIReviewCopy.startTitle), ("ai.start.title-retry", AIReviewCopy.startTitleRetry),
            ("ai.start.line1", AIReviewCopy.startLines[0]), ("ai.start.line2", AIReviewCopy.startLines[1]),
            ("ai.start.line3", AIReviewCopy.startLines[2]), ("ai.start.confirm", AIReviewCopy.startConfirm),
            ("ai.failed.title", AIReviewCopy.failedTitle), ("ai.failed.no-more", AIReviewCopy.failedNoMore),
            ("ai.failed.past", AIReviewCopy.failedPast), ("ai.failed.confirm", AIReviewCopy.failedConfirm),
            ("ai.result.perspective-badge", AIReviewCopy.perspectiveBadge), ("ai.result.strength", AIReviewCopy.strengthTitle),
            ("ai.result.weakness", AIReviewCopy.weaknessTitle), ("ai.result.suggestion", AIReviewCopy.suggestionTitle),
            ("ai.result.criteria-dialog-title", AIReviewCopy.criteriaDialogTitle),
            ("ai.poll.timeout", AIReviewCopy.pollTimeout), ("ai.error.network", AIReviewCopy.errorNetwork),
            ("ai.error.load", AIReviewCopy.errorLoad), ("ai.error.login", AIReviewCopy.errorLogin),
            ("ai.error.banned", AIReviewCopy.errorBanned), ("ai.error.not-found", AIReviewCopy.errorNotFound),
            ("ai.card.request", AIReviewCopy.cardRequest), ("ai.card.processing", AIReviewCopy.cardProcessing),
            ("ai.card.completed", AIReviewCopy.cardCompleted), ("ai.card.failed", AIReviewCopy.cardFailed),
            ("ai.card.detail", AIReviewCopy.cardDetail), ("ai.card.retry", AIReviewCopy.cardRetry),
        ]
        for (key, text) in pairs { #expect(try SharedCopy.require(key) == text, "\(key)") }
    }

    @Test("TC-AIR-049 점수는 소수 첫째 자리로 표시한다(7.5, 10.0, 0.0)", arguments: [(7.5, "7.5"), (10.0, "10.0"), (0.0, "0.0"), (8.0, "8.0")])
    func scoreText(score: Double, expected: String) {
        #expect(AIReviewCopy.scoreText(score) == expected)
    }

    @Test("TC-AIR-050 종합 점수 접근성 문구는 '전체 점수 10점 만점에 X점'이다")
    func scoreAccessibility() throws {
        let template = try SharedCopy.require("ai.result.score-a11y")
        #expect(AIReviewCopy.scoreAccessibility(7.5) == template.replacingOccurrences(of: "{X}", with: "7.5"))
        #expect(AIReviewCopy.scoreAccessibility(7.5) == "전체 점수 10점 만점에 7.5점")
    }

    @Test("TC-AIR-048 폴링 간격·창 상수가 shared/constants.json과 같다(홈 포함 3초)")
    func pollingConstantsMatchShared() throws {
        let constants = try SharedConstants.object()
        let interval = try #require(constants["AI_REVIEW_POLL_INTERVAL_MS"] as? Int)
        let window = try #require(constants["AI_REVIEW_POLL_WINDOW_MS"] as? Int)
        #expect(AppConstants.aiReviewPollInterval == .milliseconds(interval))
        #expect(AppConstants.aiReviewPollWindow == .milliseconds(window))
        #expect(interval == 3000 && window == 300_000)
    }
}
