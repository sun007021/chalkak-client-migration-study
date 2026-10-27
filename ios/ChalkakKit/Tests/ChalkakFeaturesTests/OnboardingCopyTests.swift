import Testing
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("ONB·SIGN 문구는 shared/copy/ko.json과 같다")
struct OnboardingCopyTests {
    private static let pairs: [(key: String, value: String)] = [
        ("onb.terms.title", OnboardingCopy.termsTitle),
        ("onb.terms.agree-all", OnboardingCopy.termsAgreeAll),
        ("onb.terms.service", OnboardingCopy.termsService),
        ("onb.terms.privacy", OnboardingCopy.termsPrivacy),
        ("onb.terms.view", OnboardingCopy.termsView),
        ("onb.terms.next", OnboardingCopy.termsNext),
        ("onb.terms.doc.title.service", OnboardingCopy.termsDocTitleService),
        ("onb.terms.doc.title.privacy", OnboardingCopy.termsDocTitlePrivacy),
        ("onb.terms.doc.error", OnboardingCopy.termsDocError),
        ("onb.terms.doc.retry", OnboardingCopy.termsDocRetry),
        ("onb.terms.doc.cannot-open", OnboardingCopy.termsDocCannotOpen),
        ("onb.sign.title", OnboardingCopy.signTitle),
        ("onb.sign.guide", OnboardingCopy.signGuide),
        ("onb.sign.pad-hint", OnboardingCopy.signPadHint),
        ("onb.sign.undo", OnboardingCopy.signUndo),
        ("onb.sign.clear", OnboardingCopy.signClear),
        ("onb.sign.confirm", OnboardingCopy.signConfirm),
        ("onb.sign.preview.title", OnboardingCopy.signPreviewTitle),
        ("onb.sign.preview.redraw", OnboardingCopy.signPreviewRedraw),
        ("onb.sign.preview.start", OnboardingCopy.signPreviewStart),
        ("onb.signup.error.timeout", OnboardingCopy.signupErrorTimeout),
        ("onb.signup.error.reupload", OnboardingCopy.signupErrorReupload),
        ("onb.signup.error.generic", OnboardingCopy.signupErrorGeneric),
        ("sign.card.title", SignatureCopy.cardTitle),
        ("sign.card.change", SignatureCopy.cardChange),
        ("sign.change.confirm", SignatureCopy.changeConfirm),
        ("sign.change.notice", SignatureCopy.changeNotice),
        ("sign.change.done", SignatureCopy.changeDone),
        ("sign.change.error.generic", SignatureCopy.changeErrorGeneric),
        ("sign.change.error.not-found", SignatureCopy.changeErrorNotFound),
        ("sign.load.error", SignatureCopy.loadError),
        ("sign.error.too-large", SignatureCopy.errorTooLarge),
        ("sign.error.network", SignatureCopy.errorNetwork),
        ("sign.error.invalid", SignatureCopy.errorInvalid),
        ("sign.error.expired", SignatureCopy.errorExpired),
        ("auth.banned.signature", SignatureCopy.bannedSignature),
    ]

    @Test("TC-ONB-001 TC-SIGN-017 문구 상수는 ko.json의 같은 키 값과 일치한다", arguments: pairs.map(\.key))
    func matchesSharedCopy(key: String) throws {
        let expected = try SharedCopy.require(key)
        let actual = try #require(Self.pairs.first { $0.key == key }?.value)
        #expect(actual == expected)
    }

    @Test("ko.json의 onb.*·sign.* 키와 auth.banned.signature는 모두 상수가 있다")
    func everySharedKeyIsCovered() {
        let covered = Set(Self.pairs.map(\.key))
        let shared = SharedCopy.allKeys.filter { $0.hasPrefix("onb.") || $0.hasPrefix("sign.") || $0 == "auth.banned.signature" }
        #expect(Set(shared).subtracting(covered).isEmpty)
    }
}
