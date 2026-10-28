import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private let unauthorized = APIError.http(status: 401, code: .unauthorized, message: "유효하지 않은 인증 정보입니다.")
private let emptyRequest = APIError.http(status: 400, code: .businessError, message: "변경할 푸시 수신 설정을 하나 이상 입력해주세요.")
private let topicOff = NotificationSettings(topic: false, moderation: true, aiReview: true)

@MainActor
private func toggleTask(_ w: SettingsWorld, _ kind: NotificationSettingKind, _ enabled: Bool) -> Task<Void, Never> {
    Task { await w.vm.toggle(kind, to: enabled) }
}

/// 다음 PATCH 진입을 기다린다. 작업이 먼저 끝나 버리면(스텁·조기 종료) false.
@MainActor
private func updateEntered(_ w: SettingsWorld, atLeast n: Int = 1, before task: Task<Void, Never>) async -> Bool {
    await EventWait.signal(w.repo.updateEntered, atLeast: n, before: task)
}

@MainActor
@Suite("SET 푸시 수신 설정 조회", .timeLimit(.minutes(1)))
struct SettingsPushLoadTests {
    @Test("REQ-SET-008 조회 중에는 스위치가 눌리지 않고 값이 없으며, 끝나면 서버 값이 세 스위치에 각각 반영된다")
    func loadingThenReady() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(NotificationSettings(topic: false, moderation: true, aiReview: false), hold: hold)])
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, before: task)
        #expect(started)
        #expect(w.vm.pushState == .loading)
        #expect(w.values() == [nil, nil, nil])
        #expect(!w.vm.isPushEnabled)
        await hold.open()
        await task.value
        #expect(w.vm.pushState == .ready)
        #expect(w.values() == [false, true, false])
        #expect(w.vm.isPushEnabled)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-SET-016 REQ-SET-010 조회 실패는 스위치를 비활성으로 두고 값을 지어내지 않으며 토스트 settings.push.load-error를 한 번 보인다", arguments: [
        APIError.serverError, APIError.network,
    ])
    func loadFailure(error: APIError) async {
        await expectLoadFailure(error)
    }

    @Test("TC-SET-015 계약 위반(invalidResponse)도 스위치를 비활성으로 두고 토스트 settings.push.load-error를 보인다")
    func contractViolation() async {
        await expectLoadFailure(APIError.invalidResponse)
    }

    private func expectLoadFailure(_ error: APIError) async {
        let w = SettingsWorld(fetch: [.fail(error)])
        await w.loaded()
        #expect(w.vm.pushState == .failed)
        #expect(w.values() == [nil, nil, nil])
        #expect(!w.vm.isPushEnabled)
        #expect(w.toast.messages == [SettingsCopy.pushLoadError])
    }

    @Test("TC-SET-016 다시 시도하면 다시 불러와 성공하면 스위치가 서버 값으로 열린다")
    func retryAfterFailure() async {
        let w = SettingsWorld(fetch: [.fail(APIError.serverError), .ok(topicOff)])
        await w.loaded()
        await w.vm.retryPushSettings()
        #expect(await w.repo.fetchCount == 2)
        #expect(w.vm.pushState == .ready)
        #expect(w.values() == [false, true, true])
        #expect(w.toast.messages == [SettingsCopy.pushLoadError], "재시도 성공에는 새 토스트가 없다")
    }

    @Test("REQ-SET-010 설정 탭이 다시 보일 때 재조회한다(실패 뒤 다시 보이면 복구)")
    func reappearRefetches() async {
        let w = SettingsWorld(fetch: [.fail(APIError.network), .ok(allOn)])
        await w.loaded()
        #expect(w.vm.pushState == .failed)
        await w.vm.screenAppeared()
        #expect(await w.repo.fetchCount == 2)
        #expect(w.vm.pushState == .ready)
        #expect(w.values() == [true, true, true])
    }

    @Test("TC-SET-033 재조회가 실패하면 이전 서버 값을 지우고 설정 변경을 받지 않는다(오래된 값 기준 PATCH 없음)")
    func staleValuesAreNotUsedAfterRefetchFailure() async {
        let w = SettingsWorld(fetch: [.ok(allOn), .fail(APIError.serverError)])
        await w.loaded()
        #expect(w.values() == [true, true, true])
        await w.vm.screenAppeared()
        #expect(w.vm.pushState == .failed)
        #expect(w.values() == [nil, nil, nil])
        await w.vm.toggle(.topic, to: false)
        #expect(await w.repo.updates.isEmpty)
    }

    @Test("REQ-SET-008 조회 중에 다시 보여도 같은 조회를 또 보내지 않는다")
    func noDuplicateFetchWhileLoading() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn, hold: hold)])
        let first = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, before: first)
        #expect(started)
        let second = Task { await w.vm.screenAppeared() }
        await hold.open()
        await first.value
        await second.value
        #expect(await w.repo.fetchCount == 1)
        #expect(w.vm.pushState == .ready)
    }

    @Test("REQ-SET-010 조회가 401이면 토스트 없이 로그인 이동을 요청하고 값은 없다")
    func loadUnauthorized() async {
        let w = SettingsWorld(fetch: [.fail(unauthorized)])
        await w.loaded()
        #expect(w.vm.needsLogin)
        #expect(w.toast.messages.isEmpty)
        #expect(w.values() == [nil, nil, nil])
        w.vm.consumeNeedsLogin()
        #expect(!w.vm.needsLogin)
    }

    @Test("D-20 조회 중 화면이 사라지면 취소는 오류 토스트가 되지 않고 값은 비어 있다")
    func cancelledLoadShowsNoToast() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn, hold: hold)])
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, before: task)
        #expect(started)
        w.vm.screenDisappeared()
        await task.value
        #expect(w.toast.messages.isEmpty)
        #expect(w.values() == [nil, nil, nil])
        #expect(w.vm.pushState == .loading)
    }

    @Test("바깥 취소로 끝난 재조회는 .loading에 남지 않고 이전 상태(.ready)와 값으로 돌아가며 토스트가 없다")
    func cancelledRefetchRestoresPreviousState() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(topicOff), .ok(allOn, hold: hold)])
        await w.loaded()
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, atLeast: 2, before: task)
        #expect(started)
        #expect(w.vm.pushState == .loading)
        task.cancel()
        await task.value
        #expect(w.vm.pushState == .ready)
        #expect(w.values() == [false, true, true])
        #expect(w.toast.messages.isEmpty)
    }

    @Test("재조회 중(.loading)에는 직전 값을 보이되 스위치는 비활성이다(명세 확인 대상)")
    func previousValuesStayVisibleWhileRefetching() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(topicOff), .ok(allOn, hold: hold)])
        await w.loaded()
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, atLeast: 2, before: task)
        #expect(started)
        #expect(w.values() == [false, true, true])
        #expect(!w.vm.isPushEnabled)
        await w.vm.toggle(.topic, to: true)
        #expect(await w.repo.updates.isEmpty)
        await hold.open()
        await task.value
        #expect(w.values() == [true, true, true])
    }
}

@MainActor
@Suite("SET 푸시 수신 설정 저장", .timeLimit(.minutes(1)))
struct SettingsPushSaveTests {
    // MARK: 낙관적 갱신·요청

    @Test("TC-SET-023 REQ-SET-011 스위치를 누르면 응답을 기다리지 않고 즉시 새 값이며, 성공해도 서버 값으로 덮어쓰지 않는다(재조회 없음)")
    func optimisticUpdate() async {
        let hold = Hold()
        let w = SettingsWorld()
        await w.repo.setUpdate([.ok((), hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        #expect(w.vm.pushValue(.topic) == false, "응답 전인데도 새 값")
        #expect(w.vm.pushValue(.moderation) == true && w.vm.pushValue(.aiReview) == true)
        await hold.open()
        await task.value
        #expect(w.vm.pushValue(.topic) == false)
        #expect(await w.repo.fetchCount == 1)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-SET-012 스위치 하나를 바꾸면 그 항목 하나만 PATCH한다(TC-SET-019 topic · TC-SET-020 moderation · TC-SET-021 aiReview)", arguments: NotificationSettingKind.allCases)
    func patchesOnlyChangedItem(kind: NotificationSettingKind) async {
        let w = SettingsWorld()
        await w.loaded()
        await w.vm.toggle(kind, to: false)
        #expect(await w.repo.updates == [.init(kind: kind, enabled: false)])
        #expect(w.vm.pushValue(kind) == false)
        for other in NotificationSettingKind.allCases where other != kind {
            #expect(w.vm.pushValue(other) == true)
        }
    }

    @Test("TC-SET-036 현재 값과 같은 값으로 누르거나 조회 전에 누르면 PATCH를 보내지 않는다(빈 PATCH 방지)")
    func noPatchWithoutChange() async {
        let before = SettingsWorld()
        await before.vm.toggle(.topic, to: false)
        #expect(await before.repo.updates.isEmpty, "조회 전")

        let w = SettingsWorld(fetch: [.ok(topicOff)])
        await w.loaded()
        #expect(w.vm.pushValue(.topic) == false, "조회는 이뤄져야 한다")
        await w.vm.toggle(.topic, to: false)
        await w.vm.toggle(.moderation, to: true)
        #expect(await w.repo.updates.isEmpty)
    }

    // MARK: 실패 되돌리기

    @Test("TC-SET-024 REQ-SET-013 저장 실패(네트워크·500·400)는 그 항목만 이전 값으로 되돌리고 토스트 settings.push.save-error를 한 번 보인다", arguments: [
        APIError.network, APIError.serverError, emptyRequest,
    ])
    func saveFailureRevertsOnlyThatItem(error: APIError) async {
        let w = SettingsWorld()
        await w.repo.setUpdate([.fail(error)], for: .topic)
        await w.loaded()
        await w.vm.toggle(.topic, to: false)
        #expect(await w.repo.updates.count == 1)
        #expect(w.vm.pushValue(.topic) == true, "이전 값으로 복원")
        #expect(w.vm.pushValue(.moderation) == true && w.vm.pushValue(.aiReview) == true)
        #expect(w.toast.messages == [SettingsCopy.pushSaveError])
        #expect(w.vm.pushState == .ready)
    }

    /// `failing` 저장을 멈춰 둔 채 `succeeding`을 바꿔 성공시키고, 그 뒤 `failing`을 실패시킨다.
    private func partialFailure(failing: NotificationSettingKind, succeeding: NotificationSettingKind) async -> SettingsWorld {
        let hold = Hold()
        let w = SettingsWorld()
        await w.repo.setUpdate([.fail(APIError.serverError, hold: hold)], for: failing)
        await w.loaded()
        let failingTask = toggleTask(w, failing, false)
        let entered = await updateEntered(w, before: failingTask)
        #expect(entered)
        await w.vm.toggle(succeeding, to: false)
        #expect(w.vm.pushValue(succeeding) == false)
        #expect(w.vm.pushValue(failing) == false)
        await hold.open()
        await failingTask.value
        #expect(w.vm.pushValue(failing) == true, "실패한 항목만 되돌아온다")
        #expect(w.vm.pushValue(succeeding) == false, "이미 성공한 변경은 유지된다")
        #expect(w.toast.messages == [SettingsCopy.pushSaveError])
        return w
    }

    @Test("TC-SET-025 주제 저장이 실패해도 이미 성공한 승인·반려 변경은 유지된다")
    func topicFailureKeepsModeration() async {
        let w = await partialFailure(failing: .topic, succeeding: .moderation)
        #expect(w.vm.pushValue(.aiReview) == true)
    }

    @Test("TC-SET-026 승인·반려 저장이 실패해도 이미 성공한 주제 변경은 유지된다")
    func moderationFailureKeepsTopic() async {
        let w = await partialFailure(failing: .moderation, succeeding: .topic)
        #expect(w.vm.pushValue(.aiReview) == true)
    }

    @Test("TC-SET-027 AI 저장이 실패해도 성공한 다른 설정은 유지되고, 저장 중인 같은 항목의 중복 저장은 막힌다")
    func aiFailureKeepsOthersAndBlocksDuplicates() async {
        let hold = Hold()
        let w = SettingsWorld()
        await w.repo.setUpdate([.fail(APIError.serverError, hold: hold)], for: .aiReview)
        await w.loaded()
        let task = toggleTask(w, .aiReview, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        await w.vm.toggle(.aiReview, to: true)
        await w.vm.toggle(.topic, to: false)
        await hold.open()
        await task.value
        #expect(await w.repo.updates == [.init(kind: .aiReview, enabled: false), .init(kind: .topic, enabled: false)])
        #expect(w.vm.pushValue(.aiReview) == true)
        #expect(w.vm.pushValue(.topic) == false)
        #expect(w.toast.messages == [SettingsCopy.pushSaveError])
    }

    // MARK: 연타·독립

    @Test("TC-SET-028 REQ-SET-014 같은 항목 저장 중 같은 스위치를 다시 누르면 요청은 한 번이고 두 번째 입력은 무시된다")
    func sameItemInputIsIgnoredWhileSaving() async {
        let hold = Hold()
        let w = SettingsWorld()
        await w.repo.setUpdate([.ok((), hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        await w.vm.toggle(.topic, to: true)
        await w.vm.toggle(.topic, to: false)
        #expect(w.vm.pushValue(.topic) == false, "두 번째 입력은 값을 바꾸지 않는다")
        await hold.open()
        await task.value
        #expect(await w.repo.updates == [.init(kind: .topic, enabled: false)])
        #expect(w.vm.pushValue(.topic) == false)
    }

    @Test("TC-SET-029 REQ-SET-014 주제 저장 중에도 다른 스위치는 비활성이 아니고 독립적으로 별도 PATCH가 나간다")
    func otherItemsSaveIndependently() async {
        let hold = Hold()
        let w = SettingsWorld()
        await w.repo.setUpdate([.ok((), hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        #expect(w.vm.isPushEnabled, "저장 중인 항목 때문에 다른 스위치가 꺼지지 않는다")
        await w.vm.toggle(.moderation, to: false)
        await w.vm.toggle(.aiReview, to: false)
        #expect(await w.repo.updates == [
            .init(kind: .topic, enabled: false), .init(kind: .moderation, enabled: false), .init(kind: .aiReview, enabled: false),
        ])
        await hold.open()
        await task.value
        #expect(w.values() == [false, false, false])
        #expect(w.toast.messages.isEmpty)
    }

    // MARK: 취소·계정 전환

    @Test("TC-SET-030 저장 중 화면을 떠나면 토글은 이전 값으로 복구되고 오류 토스트는 뜨지 않는다")
    func leavingWhileSavingRevertsSilently() async {
        let hold = Hold()
        let w = SettingsWorld()
        await w.repo.setUpdate([.ok((), hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        #expect(w.vm.pushValue(.topic) == false)
        w.vm.screenDisappeared()
        await task.value
        #expect(w.vm.pushValue(.topic) == true)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-SET-031 REQ-SET-020 저장 도중 계정이 바뀌면 이전 계정의 저장 응답(성공·실패)은 새 계정 설정에 적용되지 않는다", arguments: [true, false])
    func staleSaveResponseAfterAccountSwitch(succeeds: Bool) async {
        let hold = Hold(ignoringCancellation: true)
        let w = SettingsWorld(fetch: [.ok(allOn), .ok(topicOff)])
        await w.repo.setUpdate([succeeds ? .ok((), hold: hold) : .fail(APIError.serverError, hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        w.viewer.set(settingsUserB)
        w.vm.viewerDidChange()
        await w.vm.screenAppeared()
        #expect(w.vm.pushValue(.topic) == false, "새 계정 값(주제 꺼짐)")
        await hold.open()
        await task.value
        #expect(w.vm.pushValue(.topic) == false, "이전 계정의 응답이 새 계정 값을 바꾸지 않는다")
        #expect(w.vm.pushState == .ready)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-SET-032 계정 전환 뒤 이전 계정의 조회 응답이 늦게 도착해도 반영하지 않는다")
    func staleFetchAfterAccountSwitch() async {
        let hold = Hold(ignoringCancellation: true)
        let w = SettingsWorld(fetch: [.ok(allOn, hold: hold)])
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, before: task)
        #expect(started)
        w.viewer.set(settingsUserB)
        w.vm.viewerDidChange()
        #expect(w.vm.pushState == .loading)
        await hold.open()
        await task.value
        #expect(w.values() == [nil, nil, nil])
        #expect(w.vm.pushState == .loading)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-SET-037 REQ-SET-020 계정이 바뀌면 이전 계정의 토글·사인이 보이지 않고 새로 조회한 값이 보인다")
    func accountSwitchShowsNewAccountOnly() async {
        let w = SettingsWorld(fetch: [.ok(allOn), .ok(topicOff)])
        await w.loaded()
        #expect(w.values() == [true, true, true])
        #expect(w.vm.signature.imageURL == signatureThumbURL)
        w.viewer.set(settingsUserB)
        w.vm.viewerDidChange()
        #expect(w.vm.pushState == .loading)
        #expect(w.values() == [nil, nil, nil])
        #expect(w.vm.signature.imageURL == nil)
        await w.vm.screenAppeared()
        #expect(w.values() == [false, true, true])
        #expect(await w.repo.fetchCount == 2)
        #expect(w.vm.signature.imageURL == signatureThumbURL)
    }

    @Test("TC-SET-037 viewerDidChange를 따로 부르지 않아도 화면이 다시 보일 때 계정이 달라졌으면 이전 값을 버리고 새로 조회한다")
    func appearDetectsAccountSwitch() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn), .ok(topicOff, hold: hold)])
        await w.loaded()
        w.viewer.set(settingsUserB)
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, atLeast: 2, before: task)
        #expect(started)
        #expect(w.values() == [nil, nil, nil], "새 계정 조회 중에는 이전 계정 값이 보이지 않는다")
        await hold.open()
        await task.value
        #expect(w.values() == [false, true, true])
    }

    // MARK: 401

    @Test("REQ-SET-013 저장이 401이면 그 항목을 되돌리되 토스트 없이 로그인 이동을 요청한다")
    func saveUnauthorized() async {
        let w = SettingsWorld()
        await w.repo.setUpdate([.fail(unauthorized)], for: .moderation)
        await w.loaded()
        await w.vm.toggle(.moderation, to: false)
        #expect(await w.repo.updates.count == 1)
        #expect(w.vm.pushValue(.moderation) == true)
        #expect(w.vm.needsLogin)
        #expect(w.toast.messages.isEmpty)
    }
}

@MainActor
@Suite("SET 기기 알림 권한과 푸시 스위치", .timeLimit(.minutes(1)))
struct SettingsPushPermissionTests {
    @Test("TC-SET-038 REQ-SET-015 권한이 거부된 상태에서 서버 토글을 켜면 시스템 알림 설정이 한 번 열리고 값·서버는 바뀌지 않는다")
    func turningOnWhileDeniedOpensSystemSettings() async {
        let w = SettingsWorld(fetch: [.ok(topicOff)], permission: .denied)
        await w.loaded()
        #expect(w.vm.pushValue(.topic) == false, "조회는 이뤄져야 한다")
        await w.vm.toggle(.topic, to: true)
        #expect(await w.systemSettings.openCount == 1)
        #expect(await w.repo.updates.isEmpty)
        #expect(w.vm.pushValue(.topic) == false)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-SET-038 권한이 허용이면 시스템 설정을 열지 않고 정상 저장한다")
    func turningOnWhileAuthorizedSaves() async {
        let w = SettingsWorld(fetch: [.ok(topicOff)], permission: .authorized)
        await w.loaded()
        await w.vm.toggle(.topic, to: true)
        #expect(await w.systemSettings.openCount == 0)
        #expect(await w.repo.updates == [.init(kind: .topic, enabled: true)])
        #expect(w.vm.pushValue(.topic) == true)
    }

    @Test("REQ-SET-016 권한이 꺼져 있어도 스위치를 끄는 것은 정상 저장 흐름이다")
    func turningOffWhileDeniedSaves() async {
        let w = SettingsWorld(permission: .denied)
        await w.loaded()
        await w.vm.toggle(.moderation, to: false)
        #expect(await w.systemSettings.openCount == 0)
        #expect(await w.repo.updates == [.init(kind: .moderation, enabled: false)])
        #expect(w.vm.pushValue(.moderation) == false)
    }

    @Test("REQ-SET-018 권한이 미결정이면 시스템 권한 요청을 띄우고, 허용되면 켜는 저장을 진행한다")
    func notDeterminedGrantedSaves() async {
        let w = SettingsWorld(fetch: [.ok(topicOff)], permission: .notDetermined)
        await w.loaded()
        await w.vm.toggle(.topic, to: true)
        #expect(await w.permission.requestCount == 1)
        #expect(await w.repo.updates == [.init(kind: .topic, enabled: true)])
        #expect(w.vm.pushValue(.topic) == true)
        #expect(await w.systemSettings.openCount == 0)
    }

    @Test("REQ-SET-018 권한 요청이 거부되면 스위치를 켜지 않고 PATCH도 보내지 않는다")
    func notDeterminedDeniedDoesNotTurnOn() async {
        let w = SettingsWorld(fetch: [.ok(topicOff)], permission: .notDetermined)
        let denying = FakePushAuthorization(.notDetermined, grantsRequest: false)
        let vm = SettingsViewModel(
            access: .member, viewer: w.viewer, repository: w.repo,
            signature: SignatureCardViewModel(access: .member, repository: w.signatureRepo),
            account: AccountSessionViewModel(authRepository: w.auth),
            permission: denying, systemSettings: w.systemSettings, externalOpener: w.opener,
            toast: w.toast, screens: nil, appVersion: "1.0.0"
        )
        await vm.screenAppeared()
        #expect(vm.pushValue(.topic) == false, "조회는 이뤄져야 한다")
        await vm.toggle(.topic, to: true)
        #expect(await denying.requestCount == 1)
        #expect(await w.repo.updates.isEmpty)
        #expect(vm.pushValue(.topic) == false)
    }

    @Test("REQ-SET-015 권한은 누른 시점에 다시 확인한다(앱이 활성화 신호 없이 시스템 설정에서 꺼졌어도 막는다)")
    func permissionIsCheckedAtTapTime() async {
        let w = SettingsWorld(fetch: [.ok(topicOff)], permission: .authorized)
        await w.loaded()
        #expect(w.vm.pushValue(.topic) == false, "조회는 이뤄져야 한다")
        await w.permission.set(.denied)
        await w.vm.toggle(.topic, to: true)
        #expect(await w.systemSettings.openCount == 1)
        #expect(await w.repo.updates.isEmpty)
    }

    // MARK: 권한 확인 중 경합(권한 await 뒤에는 상태를 다시 본다)

    /// 권한 확인(`status()`)이 멈춘 채 토글 흐름이 진행 중인 상태를 만든다.
    private func toggleStuckOnPermission(fetch: [Step<NotificationSettings>] = [.ok(topicOff)]) async -> (SettingsWorld, Hold, Task<Void, Never>) {
        let w = SettingsWorld(fetch: fetch, permission: .authorized)
        await w.loaded()
        let hold = Hold(ignoringCancellation: true)
        await w.permission.holdNextStatus(hold)
        let task = toggleTask(w, .topic, true)
        let entered = await EventWait.signal(w.permission.statusEntered, atLeast: 2, before: task)
        #expect(entered, "화면 진입의 권한 확인 1회 다음에 토글의 권한 확인이 들어온다")
        return (w, hold, task)
    }

    @Test("REQ-SET-020 권한 확인 중 계정이 바뀌면 이전 계정의 토글은 PATCH도 값 변경도 하지 않는다")
    func accountSwitchDuringPermissionCheck() async {
        let (w, hold, task) = await toggleStuckOnPermission()
        w.viewer.set(settingsUserB)
        w.vm.viewerDidChange()
        await hold.open()
        await task.value
        #expect(await w.repo.updates.isEmpty)
        #expect(w.values() == [nil, nil, nil])
        #expect(w.vm.pushState == .loading)
    }

    @Test("D-20 권한 확인 중 화면이 가려지면 PATCH도 값 변경도 없다")
    func disappearDuringPermissionCheck() async {
        let (w, hold, task) = await toggleStuckOnPermission()
        w.vm.screenDisappeared()
        await hold.open()
        await task.value
        #expect(await w.repo.updates.isEmpty)
        #expect(w.vm.pushValue(.topic) == false)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-SET-010 권한 확인 중 재조회가 실패하면 오래된 값 기준으로 PATCH하지 않는다")
    func refetchFailureDuringPermissionCheck() async {
        let (w, hold, task) = await toggleStuckOnPermission(fetch: [.ok(topicOff), .fail(APIError.serverError)])
        await w.vm.screenAppeared()
        #expect(w.vm.pushState == .failed)
        await hold.open()
        await task.value
        #expect(await w.repo.updates.isEmpty)
        #expect(w.values() == [nil, nil, nil])
    }

    @Test("REQ-SET-011 저장 중 재조회가 끝나도 저장 중인 항목은 낙관적 값을 유지하고, 저장 성공 뒤에도 그대로다")
    func refetchKeepsOptimisticValueOfSavingItem() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn), .ok(allOn)])
        await w.repo.setUpdate([.ok((), hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        await w.vm.screenAppeared()
        #expect(await w.repo.fetchCount == 2)
        #expect(w.vm.pushState == .ready)
        #expect(w.vm.pushValue(.topic) == false, "서버 응답이 저장 전 값이어도 낙관적 값을 유지한다")
        await hold.open()
        await task.value
        #expect(w.vm.pushValue(.topic) == false)
    }

    @Test("저장 중 재조회가 실패하면 저장 실패의 되돌림이 값을 되살리지 않는다(.failed 유지)")
    func saveFailureDoesNotResurrectValuesAfterRefetchFailure() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn), .fail(APIError.serverError)])
        await w.repo.setUpdate([.fail(APIError.serverError, hold: hold)], for: .topic)
        await w.loaded()
        let task = toggleTask(w, .topic, false)
        let entered = await updateEntered(w, before: task)
        #expect(entered)
        await w.vm.screenAppeared()
        #expect(w.vm.pushState == .failed)
        await hold.open()
        await task.value
        #expect(w.vm.pushState == .failed)
        #expect(w.values() == [nil, nil, nil])
    }

    @Test("REQ-SET-017 앱이 포그라운드로 돌아오면 기기 권한 상태를 다시 확인하고 스위치 값은 서버 값 그대로 둔다")
    func becomingActiveRechecksPermission() async {
        let w = SettingsWorld(fetch: [.ok(topicOff)], permission: .denied)
        await w.loaded()
        #expect(w.vm.devicePermission == .denied)
        await w.permission.set(.authorized)
        await w.vm.appBecameActive()
        #expect(w.vm.devicePermission == .authorized)
        #expect(w.values() == [false, true, true])
        #expect(await w.repo.fetchCount == 1, "권한 확인으로 서버를 다시 부르지 않는다")
        #expect(await w.repo.updates.isEmpty)
    }
}
