import Testing
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("SET·FDBK 문구가 shared/copy/ko.json과 같다", .timeLimit(.minutes(1)))
struct SettingsCopyTests {
    @Test("settings.* 문구")
    func settingsCopy() throws {
        #expect(SettingsCopy.sectionApp == (try SharedCopy.require("settings.section.app")))
        #expect(SettingsCopy.sectionPush == (try SharedCopy.require("settings.section.push")))
        #expect(SettingsCopy.sectionAccount == (try SharedCopy.require("settings.section.account")))
        #expect(SettingsCopy.sectionFeedback == (try SharedCopy.require("settings.section.feedback")))
        #expect(SettingsCopy.sectionInfo == (try SharedCopy.require("settings.section.info")))
        #expect(SettingsCopy.rowFeedback == (try SharedCopy.require("settings.row.feedback")))
        #expect(SettingsCopy.rowPrivacy == (try SharedCopy.require("settings.row.privacy")))
        #expect(SettingsCopy.rowTerms == (try SharedCopy.require("settings.row.terms")))
        #expect(SettingsCopy.rowVersion == (try SharedCopy.require("settings.row.version")))
        #expect(SettingsCopy.rowLogout == (try SharedCopy.require("settings.row.logout")))
        #expect(SettingsCopy.rowWithdraw == (try SharedCopy.require("settings.row.withdraw")))
        #expect(SettingsCopy.guestLogin == (try SharedCopy.require("settings.guest.login")))
        #expect(SettingsCopy.pushTopic == (try SharedCopy.require("settings.push.topic")))
        #expect(SettingsCopy.pushModeration == (try SharedCopy.require("settings.push.moderation")))
        #expect(SettingsCopy.pushAIReview == (try SharedCopy.require("settings.push.ai-review")))
        #expect(SettingsCopy.pushLoadError == (try SharedCopy.require("settings.push.load-error")))
        #expect(SettingsCopy.pushSaveError == (try SharedCopy.require("settings.push.save-error")))
    }

    @Test("TC-SET-018 스위치 라벨은 서버 필드와 짝이 맞는다")
    func pushLabels() {
        #expect(SettingsCopy.pushLabel(for: .topic) == "오늘 주제 알림")
        #expect(SettingsCopy.pushLabel(for: .moderation) == "게시물 승인·반려 알림")
        #expect(SettingsCopy.pushLabel(for: .aiReview) == "AI 피드백 완료 알림")
    }

    @Test("fdbk.* 문구와 연결 실패 공통 문구")
    func feedbackCopy() throws {
        #expect(FeedbackCopy.title == (try SharedCopy.require("fdbk.title")))
        #expect(FeedbackCopy.introTitle == (try SharedCopy.require("fdbk.intro.title")))
        #expect(FeedbackCopy.introBody == (try SharedCopy.require("fdbk.intro.body")))
        #expect(FeedbackCopy.fieldLabel == (try SharedCopy.require("fdbk.field.label")))
        #expect(FeedbackCopy.fieldPlaceholder == (try SharedCopy.require("fdbk.field.placeholder")))
        #expect(FeedbackCopy.send == (try SharedCopy.require("fdbk.send")))
        #expect(FeedbackCopy.sending == (try SharedCopy.require("fdbk.sending")))
        #expect(FeedbackCopy.success == (try SharedCopy.require("fdbk.success")))
        #expect(FeedbackCopy.errorInvalid == (try SharedCopy.require("fdbk.error.invalid")))
        #expect(FeedbackCopy.errorGeneric == (try SharedCopy.require("fdbk.error.generic")))
        #expect(FeedbackCopy.errorNetwork == (try SharedCopy.require("common.error.network")))
    }
}
