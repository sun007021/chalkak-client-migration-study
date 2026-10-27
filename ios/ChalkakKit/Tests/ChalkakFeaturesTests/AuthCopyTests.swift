import Testing
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("AUTH·BOOT 문구는 shared/copy/ko.json과 같다")
struct AuthCopyTests {
    private static let pairs: [(key: String, value: String)] = [
        ("boot.update.title", AuthCopy.updateTitle),
        ("boot.update.body", AuthCopy.updateBody),
        ("boot.update.button", AuthCopy.updateButton),
        ("auth.login.tagline", AuthCopy.loginTagline),
        ("auth.login.kakao", AuthCopy.loginKakao),
        ("auth.login.guest", AuthCopy.loginGuest),
        ("auth.login.error.title", AuthCopy.loginErrorTitle),
        ("auth.login.error.network", AuthCopy.loginErrorNetwork),
        ("auth.login.error.kakao-account", AuthCopy.loginErrorKakaoAccount),
        ("auth.login.error.config", AuthCopy.loginErrorConfig),
        ("auth.login.error.kakao-failed", AuthCopy.loginErrorKakaoFailed),
        ("auth.login.error.invalid-response", AuthCopy.loginErrorInvalidResponse),
        ("auth.login.error.generic", AuthCopy.loginErrorGeneric),
        ("auth.login.error.guest", AuthCopy.loginErrorGuest),
        ("auth.logout.confirm.message", AuthCopy.logoutConfirmMessage),
        ("auth.logout.confirm.ok", AuthCopy.logoutConfirmOK),
        ("auth.withdraw.confirm.message", AuthCopy.withdrawConfirmMessage),
        ("auth.withdraw.confirm.ok", AuthCopy.withdrawConfirmOK),
        ("auth.confirm.cancel", AuthCopy.confirmCancel),
        ("auth.withdraw.error", AuthCopy.withdrawError),
    ]

    @Test("AuthCopy 문구는 ko.json의 같은 키 값과 일치한다", arguments: pairs.map(\.key))
    func matchesSharedCopy(key: String) throws {
        let expected = try SharedCopy.require(key)
        let actual = try #require(Self.pairs.first { $0.key == key }?.value)
        #expect(actual == expected)
    }

    @Test("ko.json에 있는 boot.*·auth.login/logout/withdraw/confirm 키는 모두 AuthCopy에 있다(정지 문구 auth.banned.*는 각 기능 몫)")
    func everySharedKeyIsCovered() {
        let covered = Set(Self.pairs.map(\.key))
        let shared = SharedCopy.allKeys.filter { ($0.hasPrefix("boot.") || $0.hasPrefix("auth.")) && !$0.hasPrefix("auth.banned.") }
        #expect(Set(shared).subtracting(covered).isEmpty)
    }
}
