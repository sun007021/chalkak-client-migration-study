import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
@Suite("NAV 토스트(ToastCenter)", .timeLimit(.minutes(1)))
struct ToastCenterTests {
    /// 토스트를 띄우고 만료 타이머가 sleep에 들어갈 때까지 기다린다(타이머가 걸리지 않으면 nil → 실패).
    private func showAndArm(_ toast: ToastCenter, _ message: String, clock: TestClock) async -> Task<Void, Never>? {
        toast.show(message)
        guard let timer = toast.expiryTask else {
            Issue.record("토스트를 띄우면 만료 타이머가 걸려야 한다")
            return nil
        }
        let armed = await EventWait.sleeper(on: clock, before: timer)
        #expect(armed, "만료 타이머가 clock.sleep(2.5초)에 들어가야 한다")
        return armed ? timer : nil
    }

    @Test("TC-NAV-025 가상 시계 2.49초까지 보이고 2.5초에 사라진다")
    func visibleForTwoAndHalfSeconds() async {
        let clock = TestClock()
        let toast = ToastCenter(clock: clock)

        guard let timer = await showAndArm(toast, "안녕하세요", clock: clock) else { return }
        #expect(toast.current?.message == "안녕하세요")
        #expect(clock.recordedSleeps == [AppConstants.toastDuration])
        #expect(AppConstants.toastDuration == .milliseconds(2500))

        clock.advance(by: .milliseconds(2490))
        #expect(toast.current?.message == "안녕하세요")
        clock.advance(by: .milliseconds(10))
        await timer.value
        #expect(toast.current == nil)
    }

    @Test("TC-NAV-026 같은 문구를 연달아 요청해도 새 알림(id)으로 다시 보이고 지속 시간이 새로 시작된다")
    func sameMessageShowsAgainWithFreshTimer() async {
        let clock = TestClock()
        let toast = ToastCenter(clock: clock)
        guard let first = await showAndArm(toast, "같은 문구", clock: clock) else { return }
        let firstID = toast.current?.id
        clock.advance(by: .milliseconds(1000))

        guard let second = await showAndArm(toast, "같은 문구", clock: clock) else { return }
        #expect(first.isCancelled, "새 요청은 이전 만료 타이머를 취소한다")
        #expect(toast.current?.message == "같은 문구")
        #expect(toast.current?.id != firstID)

        clock.advance(by: .milliseconds(1500))   // 첫 토스트의 원래 만료 시각(2.5초)
        #expect(toast.current?.message == "같은 문구")
        clock.advance(by: .milliseconds(990))    // 두 번째 요청 후 2.49초
        #expect(toast.current?.message == "같은 문구")
        clock.advance(by: .milliseconds(10))     // 두 번째 요청 후 2.5초
        await second.value
        #expect(toast.current == nil)
    }

    @Test("TC-NAV-027 떠 있는 토스트에 다른 문구를 요청하면 교체되고 이전 문구의 타이머가 새 문구를 일찍 지우지 않는다")
    func replacementSurvivesStaleTimer() async {
        let clock = TestClock()
        let toast = ToastCenter(clock: clock)
        guard await showAndArm(toast, "첫 문구", clock: clock) != nil else { return }
        clock.advance(by: .milliseconds(1000))

        guard let second = await showAndArm(toast, "새 문구", clock: clock) else { return }
        #expect(toast.current?.message == "새 문구")

        clock.advance(by: .milliseconds(1500))   // 첫 문구였다면 사라졌을 시각
        #expect(toast.current?.message == "새 문구")
        clock.advance(by: .milliseconds(1000))   // 새 문구 요청 후 2.5초
        await second.value
        #expect(toast.current == nil)
    }

    @Test("TC-NAV-028 화면이 가려지면 떠 있던 토스트를 지우고 만료 타이머도 취소한다(D-20)")
    func hidingScreenClearsCurrent() async {
        let clock = TestClock()
        let toast = ToastCenter(clock: clock)
        guard let timer = await showAndArm(toast, "떠 있는 문구", clock: clock) else { return }

        toast.setScreenVisible(false)

        #expect(toast.current == nil)
        #expect(toast.expiryTask == nil)
        #expect(timer.isCancelled)
        await timer.value
        toast.setScreenVisible(true)
        #expect(toast.current == nil)
    }

    @Test("TC-NAV-028 화면이 보이지 않을 때의 요청은 표시하지도 쌓지도 않는다")
    func hiddenScreenDropsRequests() async {
        let clock = TestClock()
        let toast = ToastCenter(clock: clock)
        toast.setScreenVisible(false)

        toast.show("보이지 않는 동안")
        #expect(toast.current == nil)
        #expect(toast.expiryTask == nil)
        #expect(clock.sleeperCount == 0)

        toast.setScreenVisible(true)
        #expect(toast.current == nil, "화면이 다시 보여도 이전 요청이 쌓여 나타나지 않는다")

        guard await showAndArm(toast, "보이는 동안", clock: clock) != nil else { return }
        #expect(toast.current?.message == "보이는 동안")
    }
}
