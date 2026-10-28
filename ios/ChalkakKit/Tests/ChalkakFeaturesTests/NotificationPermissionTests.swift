import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
@Suite("PUSH 알림 권한 요청", .timeLimit(.minutes(1)))
struct NotificationPermissionTests {
    private func coordinator(
        _ platform: FakePermissionPlatform, flag: FakeRequestedFlag = FakeRequestedFlag(), toast: RecordingToast = RecordingToast()
    ) -> NotificationPermissionCoordinator {
        NotificationPermissionCoordinator(platform: platform, flags: flag, toast: toast)
    }

    @Test("TC-PUSH-001 인증 사용자의 최초 메인 진입, 권한 미결정이면 앱 안내 없이 OS 권한 요청만 1회 호출하고 표시를 저장한다")
    func firstEntryRequestsOnce() async {
        let platform = FakePermissionPlatform(status: .notDetermined)
        let flag = FakeRequestedFlag()
        await coordinator(platform, flag: flag).mainEntered(access: .member)
        #expect(await platform.requestCount == 1)
        #expect(flag.hasRequested)
    }

    @Test("TC-PUSH-002 권한이 이미 허용·거부면 대화상자 없이 \"요청함\" 표시만 저장한다 (스펙 REQ-PUSH-004가 카탈로그의 앱 안내 대화상자보다 우선)", arguments: [
        NotificationAuthorization.authorized, .denied,
    ])
    func alreadyDecidedOnlyMarksFlag(status: NotificationAuthorization) async {
        let platform = FakePermissionPlatform(status: status)
        let flag = FakeRequestedFlag()
        await coordinator(platform, flag: flag).mainEntered(access: .member)
        #expect(await platform.requestCount == 0)
        #expect(flag.hasRequested)
    }

    @Test("TC-PUSH-003 TC-PUSH-011 한 번 요청한 뒤에는 재진입·앱 재시작·다른 계정 로그인에도 다시 요청하지 않는다(기기 단위)")
    func requestsOnlyOnce() async {
        let platform = FakePermissionPlatform(status: .notDetermined)
        let flag = FakeRequestedFlag()
        let first = coordinator(platform, flag: flag)
        await first.mainEntered(access: .member)
        await first.mainEntered(access: .member)
        await coordinator(platform, flag: flag).mainEntered(access: .member) // 앱 재시작 흉내: 같은 플래그 저장소

        #expect(await platform.requestCount == 1)
    }

    @Test("TC-PUSH-004 게스트는 권한 요청도 표시 저장도 없다")
    func guestDoesNothing() async {
        let platform = FakePermissionPlatform(status: .notDetermined)
        let flag = FakeRequestedFlag()
        await coordinator(platform, flag: flag).mainEntered(access: .guest)
        #expect(await platform.requestCount == 0)
        #expect(!flag.hasRequested)
        await coordinator(platform, flag: flag).mainEntered(access: .member) // 대조: 회원은 요청한다
        #expect(await platform.requestCount == 1)
    }

    @Test("TC-PUSH-010 가입 직후 첫 메인 진입도 로그인 후 첫 진입과 같게 1회 요청 대상이다")
    func afterSignUpSameAsLogin() async {
        let platform = FakePermissionPlatform(status: .notDetermined)
        await coordinator(platform).mainEntered(access: .member)
        #expect(await platform.requestCount == 1)
    }

    @Test("TC-PUSH-007 권한 요청 호출이 오류면 토스트 \"알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요.\"를 보이고 표시는 저장한다")
    func requestErrorShowsToast() async {
        let platform = FakePermissionPlatform(status: .notDetermined, fails: true)
        let flag = FakeRequestedFlag()
        let toast = RecordingToast()
        await coordinator(platform, flag: flag, toast: toast).mainEntered(access: .member)
        #expect(toast.messages == ["알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요."])
        #expect(flag.hasRequested)
    }

    @Test("TC-PUSH-003 요청 대화상자가 떠 있는 동안 다시 진입해도 요청은 1회뿐이다(요청 시점에 표시 저장)")
    func reentryWhileRequestInFlight() async {
        let hold = Hold()
        let platform = FakePermissionPlatform(status: .notDetermined, hold: hold)
        let sut = coordinator(platform)
        let first = Task { await sut.mainEntered(access: .member) }
        guard await EventWait.signal(platform.requested, before: first) else {
            Issue.record("권한 요청이 나가야 한다")
            return
        }
        await sut.mainEntered(access: .member)
        await hold.open()
        await first.value
        #expect(await platform.requestCount == 1)
    }
}

@Suite("PUSH 포그라운드 표시·문구", .timeLimit(.minutes(1)))
struct ForegroundPushPolicyTests {
    @Test("TC-PUSH-068 권한이 허용되면 서버가 준 제목·본문으로 표시한다")
    func showsServerText() {
        #expect(ForegroundPushPolicy.presentation(title: "사진이 승인되었어요", body: "전시에 올라갔어요.", authorization: .authorized)
            == .show(title: "사진이 승인되었어요", body: "전시에 올라갔어요."))
    }

    @Test("TC-PUSH-068 본문이 비어 있으면 \"새 알림이 있어요. 알림함에서 확인해 주세요.\"를 쓴다", arguments: [nil, "", "   "] as [String?])
    func defaultBody(body: String?) {
        #expect(ForegroundPushPolicy.presentation(title: "제목", body: body, authorization: .authorized)
            == .show(title: "제목", body: "새 알림이 있어요. 알림함에서 확인해 주세요."))
    }

    @Test("TC-PUSH-068 권한이 없으면(미결정·거부) 아무것도 표시하지 않는다", arguments: [NotificationAuthorization.notDetermined, .denied])
    func suppressedWithoutPermission(status: NotificationAuthorization) {
        #expect(ForegroundPushPolicy.presentation(title: "제목", body: "본문", authorization: status) == .suppress)
    }

    @Test("TC-PUSH-069 iOS willPresent: 허용된 상태의 포그라운드 푸시는 배너로 표시한다")
    func iosForegroundShows() {
        let result = ForegroundPushPolicy.presentation(title: "제목", body: "본문", authorization: .authorized)
        #expect(result != .suppress)
    }
}

@Suite("NOTI·PUSH 문구 대조", .timeLimit(.minutes(1)))
struct NotificationCopyTests {
    @Test("NotificationCopy는 shared/copy/ko.json의 noti.*·push.*와 같다", arguments: [
        ("noti.inbox.title", NotificationCopy.inboxTitle), ("noti.inbox.loading", NotificationCopy.loading),
        ("noti.inbox.empty.title", NotificationCopy.emptyTitle), ("noti.inbox.empty.body", NotificationCopy.emptyBody),
        ("noti.inbox.error", NotificationCopy.inboxError), ("noti.inbox.retry", NotificationCopy.retry),
        ("noti.inbox.refresh-error", NotificationCopy.refreshError), ("noti.inbox.more-error", NotificationCopy.moreError),
        ("noti.network", NotificationCopy.network), ("noti.read.error.network", NotificationCopy.readErrorNetwork),
        ("noti.gone", NotificationCopy.gone), ("noti.detail.title", NotificationCopy.detailTitle),
        ("noti.detail.reason", NotificationCopy.detailReason), ("noti.detail.to-inbox", NotificationCopy.detailToInbox),
        ("noti.detail.error", NotificationCopy.detailError), ("noti.perm.error", NotificationCopy.permissionError),
        ("push.default.body", NotificationCopy.pushDefaultBody),
    ])
    func matchesSharedCopy(key: String, value: String) throws {
        #expect(try SharedCopy.require(key) == value)
    }
}
