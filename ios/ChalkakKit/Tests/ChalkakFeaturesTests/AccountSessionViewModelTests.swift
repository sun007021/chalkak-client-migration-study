import Foundation
import Testing
import ChalkakNetwork
import ChalkakData
@testable import ChalkakFeatures

@MainActor
@Suite("AUTH 로그아웃·탈퇴 유스케이스", .timeLimit(.minutes(1)))
struct AccountSessionViewModelTests {
    private func make(_ repository: FakeAuthRepository = FakeAuthRepository()) -> (AccountSessionViewModel, FakeAuthRepository) {
        (AccountSessionViewModel(authRepository: repository), repository)
    }

    // MARK: 확인 대화상자

    @Test("TC-AUTH-032 로그아웃 버튼은 확인 대화상자를 먼저 열고, 서버·저장소 호출은 없다")
    func logoutConfirmationFirst() async {
        let (vm, repo) = make()
        vm.logoutTapped()
        #expect(vm.state == .confirming(.logout, ConfirmationPrompt(message: "정말 로그아웃 하시겠습니까?", confirmTitle: "로그아웃", cancelTitle: "취소")))
        #expect(await repo.logoutLocalCount == 0)
    }

    @Test("TC-AUTH-037 탈퇴 버튼은 확인 대화상자를 먼저 연다")
    func withdrawConfirmationFirst() async {
        let (vm, repo) = make()
        vm.withdrawTapped()
        #expect(vm.state == .confirming(.withdraw, ConfirmationPrompt(message: "정말 회원탈퇴 하시겠습니까?", confirmTitle: "회원탈퇴", cancelTitle: "취소")))
        #expect(await repo.withdrawCount == 0)
    }

    @Test("TC-AUTH-032 TC-AUTH-037 취소하면 아무 변화가 없다")
    func cancelDoesNothing() async {
        let (vm, repo) = make()
        vm.logoutTapped()
        vm.cancelConfirmation()
        vm.withdrawTapped()
        vm.cancelConfirmation()
        #expect(vm.state == .idle)
        #expect(vm.toast == nil)
        #expect(await repo.logoutLocalCount == 0)
        #expect(await repo.withdrawCount == 0)
    }

    @Test("확인 대화상자를 거치지 않은 confirm 호출은 무시한다")
    func confirmWithoutPromptIgnored() async {
        let (vm, repo) = make()
        await vm.confirmLogout()
        await vm.confirmWithdraw()
        #expect(await repo.logoutLocalCount == 0)
        #expect(await repo.withdrawCount == 0)
        #expect(vm.state == .idle)
    }

    // MARK: 로그아웃

    @Test("TC-AUTH-035 로그아웃 확정은 로컬 정리를 1회 하고 완료하며, 서버 호출은 별도 작업으로 1회 간다")
    func logoutConfirmed() async {
        let (vm, repo) = make()
        vm.logoutTapped()
        await vm.confirmLogout()
        #expect(await repo.logoutLocalCount == 1)
        #expect(vm.state == .finished(.logout))
        #expect(vm.toast == nil)
        await repo.sendLogoutFinished.wait()
        #expect(await repo.sendLogoutCount == 1)
    }

    @Test("TC-AUTH-035 서버 로그아웃 응답을 기다리지 않고 바로 완료된다(서버가 멈춰도 로그인 화면으로 간다)")
    func finishesWithoutWaitingForServer() async {
        let hold = Hold()
        let (vm, repo) = make(FakeAuthRepository(sendLogoutHold: hold))
        vm.logoutTapped()
        await vm.confirmLogout()
        #expect(vm.state == .finished(.logout))
        await repo.sendLogoutEntered.wait()
        #expect(await repo.sendLogoutCount == 1)
        await hold.open()
        await repo.sendLogoutFinished.wait()
    }

    @Test("TC-AUTH-036 화면을 떠나도 서버 로그아웃 호출은 취소되지 않고 끝까지 간다")
    func serverLogoutSurvivesDisappear() async {
        let hold = Hold()
        let (vm, repo) = make(FakeAuthRepository(sendLogoutHold: hold))
        vm.logoutTapped()
        await vm.confirmLogout()
        await repo.sendLogoutEntered.wait()
        vm.onDisappear()
        await hold.open()
        await repo.sendLogoutFinished.wait()
        #expect(await repo.sendLogoutWasCancelled == false)
    }

    @Test("TC-AUTH-040 로그아웃 확정을 연타해도 1회이고 처리 중에는 busy")
    func logoutDoubleConfirm() async {
        let hold = Hold()
        let (vm, repo) = make(FakeAuthRepository(logoutLocalHold: hold))
        vm.logoutTapped()
        let first = Task { await vm.confirmLogout() }
        await repo.logoutLocalEntered.wait()
        #expect(vm.isBusy)
        #expect(vm.state == .processing(.logout))
        await vm.confirmLogout()
        await hold.open()
        await first.value
        await repo.sendLogoutFinished.wait()
        #expect(await repo.logoutLocalCount == 1)
        #expect(await repo.sendLogoutCount == 1)
        #expect(!vm.isBusy)
    }

    // MARK: 결과 소비

    @Test("로그아웃 완료 뒤 consumeResult로 idle로 돌아간다(설정 화면 재진입 때 버튼이 다시 동작)")
    func consumeFinished() async {
        let (vm, _) = make()
        vm.logoutTapped()
        await vm.confirmLogout()
        vm.consumeResult()
        #expect(vm.state == .idle)
        vm.logoutTapped()
        #expect(vm.state != .idle)
    }

    @Test("needsLogin도 consumeResult로 idle")
    func consumeNeedsLogin() async {
        let (vm, _) = make(FakeAuthRepository(withdrawResults: [.failure(APIError.http(status: 401, code: .unauthorized, message: nil))]))
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        #expect(vm.state == .needsLogin)
        vm.consumeResult()
        #expect(vm.state == .idle)
    }

    @Test("consumeResult는 확인·처리 중 상태를 건드리지 않는다")
    func consumeIgnoresOtherStates() async {
        let (vm, _) = make()
        vm.logoutTapped()
        vm.consumeResult()
        #expect(vm.state != .idle)
    }

    // MARK: 탈퇴

    @Test("TC-AUTH-043 탈퇴 확정이 성공하면 withdraw 1회, 완료, 토스트 없음")
    func withdrawSuccess() async {
        let (vm, repo) = make()
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        #expect(await repo.withdrawCount == 1)
        #expect(vm.state == .finished(.withdraw))
        #expect(vm.toast == nil)
    }

    @Test("TC-AUTH-044 네트워크·5xx 실패면 화면에 머물고 토스트 auth.withdraw.error", arguments: [
        APIError.network, APIError.http(status: 500, code: .internalError, message: "x"), APIError.http(status: 502, code: nil, message: nil),
    ])
    func withdrawFailureShowsToast(error: APIError) async {
        let (vm, _) = make(FakeAuthRepository(withdrawResults: [.failure(error)]))
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        #expect(vm.state == .idle)
        #expect(vm.toast?.message == "요청을 처리하지 못했어요. 다시 시도해 주세요.")
    }

    @Test("TC-AUTH-044 같은 실패가 연달아도 토스트 id가 달라 다시 표시된다")
    func repeatedFailureNewToastId() async throws {
        let (vm, _) = make(FakeAuthRepository(withdrawResults: [.failure(APIError.network), .failure(APIError.network)]))
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        let first = try #require(vm.toast)
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        let second = try #require(vm.toast)
        #expect(first.message == second.message)
        #expect(first.id != second.id)
    }

    @Test("TC-AUTH-045 갱신 후에도 401 UNAUTHORIZED면 문구 없이 needsLogin(세션은 저장소가 유지)")
    func withdrawPersistentUnauthorized() async {
        let (vm, _) = make(FakeAuthRepository(withdrawResults: [.failure(APIError.http(status: 401, code: .unauthorized, message: nil))]))
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        #expect(vm.state == .needsLogin)
        #expect(vm.toast == nil)
    }

    @Test("TC-AUTH-051 REAUTHENTICATION_REQUIRED·세션 전환·취소는 토스트 없이 idle(라우팅은 AuthEvents 몫)", arguments: [
        APIError.http(status: 401, code: .reauthenticationRequired, message: nil) as any Error,
        AuthError.sessionChanged as any Error,
        CancellationError() as any Error,
    ])
    func silentFailures(error: any Error) async {
        let (vm, _) = make(FakeAuthRepository(withdrawResults: [.failure(error)]))
        vm.withdrawTapped()
        await vm.confirmWithdraw()
        #expect(vm.state == .idle)
        #expect(vm.toast == nil)
    }

    @Test("TC-AUTH-048 탈퇴 확정을 연타해도 DELETE는 1회")
    func withdrawDoubleConfirm() async {
        let hold = Hold()
        let (vm, repo) = make(FakeAuthRepository(withdrawHold: hold))
        vm.withdrawTapped()
        let first = Task { await vm.confirmWithdraw() }
        await repo.withdrawEntered.wait()
        #expect(vm.isBusy)
        await vm.confirmWithdraw()
        await hold.open()
        await first.value
        #expect(await repo.withdrawCount == 1)
    }

    @Test("TC-AUTH-049 요청 중 화면을 떠나면 취소 오류가 토스트로 보이지 않는다")
    func disappearDuringWithdraw() async {
        let hold = Hold()
        let (vm, repo) = make(FakeAuthRepository(withdrawHold: hold))
        vm.withdrawTapped()
        let task = Task { await vm.confirmWithdraw() }
        await repo.withdrawEntered.wait()
        vm.onDisappear()
        await task.value
        #expect(vm.toast == nil)
        #expect(vm.state == .idle)
    }
}
