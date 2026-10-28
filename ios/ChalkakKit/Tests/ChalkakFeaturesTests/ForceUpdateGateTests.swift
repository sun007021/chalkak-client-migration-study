import Foundation
import Testing
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("BOOT 버전 파싱")
struct AppVersionTests {
    @Test("TC-BOOT-019 1.2.3은 major.minor.patch, 1.1은 patch=0")
    func parse() {
        #expect(AppVersion(parsing: "1.2.3") == AppVersion(major: 1, minor: 2, patch: 3))
        #expect(AppVersion(parsing: "1.1") == AppVersion(major: 1, minor: 1, patch: 0))
    }

    @Test("TC-BOOT-020 1 / 1.2.3.4 / 1.two.3 / 1.2.-1 / 빈 문자열은 파싱 실패", arguments: ["1", "1.2.3.4", "1.two.3", "1.2.-1", "", " ", "1..2"])
    func parseFailures(text: String) {
        #expect(AppVersion(parsing: text) == nil)
    }

    @Test("TC-BOOT-016 TC-BOOT-017 TC-BOOT-018 major 또는 minor가 높을 때만 업데이트 필요, patch·같음·낮음은 통과", arguments: [
        ("1.1.1", "2.0.0", true),
        ("1.1.1", "1.2.0", true),
        ("1.1.1", "1.1.2", false),
        ("1.1.1", "1.1.1", false),
        ("1.1.1", "1.0.9", false),
        ("2.0.0", "1.9.0", false),
        ("1.5.0", "2.0.0", true),
    ])
    func comparison(installed: String, store: String, expected: Bool) throws {
        let installedVersion = try #require(AppVersion(parsing: installed))
        let storeVersion = try #require(AppVersion(parsing: store))
        #expect(AppVersion.requiresUpdate(installed: installedVersion, store: storeVersion) == expected)
    }
}

@Suite("BOOT 강제 업데이트 게이트", .timeLimit(.minutes(1)))
struct ForceUpdateGateTests {
    private func gate(
        lookup: any StoreVersionLookup,
        enabled: Bool = true,
        installed: String = "1.1.1",
        clock: TestClock = TestClock()
    ) -> ForceUpdateGate {
        ForceUpdateGate(enabled: enabled, installedVersion: installed, lookup: lookup, clock: clock)
    }

    @Test("TC-BOOT-016 스토어 major가 높으면 업데이트 필요")
    func newerMajor() async {
        #expect(await gate(lookup: ScriptedLookup([.success("2.0.0")])).evaluate() == .updateRequired)
    }

    @Test("TC-BOOT-017 스토어 minor가 높으면 업데이트 필요")
    func newerMinor() async {
        #expect(await gate(lookup: ScriptedLookup([.success("1.2.0")])).evaluate() == .updateRequired)
    }

    @Test("TC-BOOT-018 patch만 높거나 같거나 낮으면 통과", arguments: ["1.1.2", "1.1.1", "1.0.9"])
    func patchOnlySame(store: String) async {
        #expect(await gate(lookup: ScriptedLookup([.success(store)])).evaluate() == .passed)
    }

    @Test("TC-BOOT-020 스토어 버전 문자열을 파싱할 수 없으면 통과", arguments: ["1", "1.2.3.4", "1.two.3", "1.2.-1", ""])
    func malformedStoreVersion(store: String) async {
        #expect(await gate(lookup: ScriptedLookup([.success(store)])).evaluate() == .passed)
    }

    @Test("TC-BOOT-022 조회 결과에 버전이 없으면(results 빔) 통과")
    func noVersion() async {
        #expect(await gate(lookup: ScriptedLookup([.success(nil)])).evaluate() == .passed)
    }

    @Test("TC-BOOT-023 조회가 네트워크 오류·5xx로 throw하면 통과")
    func lookupThrows() async {
        #expect(await gate(lookup: ScriptedLookup([.failure(LookupFailure())])).evaluate() == .passed)
    }

    @Test("TC-BOOT-024 3.0초 안에 응답이 없으면 3초 시점에 중단하고 통과한다")
    func timeoutPasses() async {
        let clock = TestClock()
        let lookup = ControllableLookup()
        let gate = gate(lookup: lookup, clock: clock)
        let task = Task { await gate.evaluate() }
        await lookup.entered.wait()
        await clock.waitUntilSleeperCount(atLeast: 1)
        clock.advance(by: .seconds(3))
        #expect(await task.value == .passed)
        await lookup.cancelled.wait()
        #expect(await lookup.wasCancelled)
    }

    @Test("TC-BOOT-024 취소에 협조하지 않는 조회라도 3초 시점에 통과한다(타임아웃이 조회 종료에 묶이지 않는다)")
    func timeoutDoesNotWaitForUncooperativeLookup() async {
        let clock = TestClock()
        let lookup = ControllableLookup(ignoringCancellation: true)
        let gate = gate(lookup: lookup, clock: clock)
        let task = Task { await gate.evaluate() }
        await lookup.entered.wait()
        await clock.waitUntilSleeperCount(atLeast: 1)
        clock.advance(by: .seconds(3))
        #expect(await task.value == .passed)
        await lookup.respond(with: "2.0.0")     // 뒤늦게 풀어 정리한다(이미 통과로 끝났다)
    }

    @Test("TC-BOOT-024 호출자가 취소되면 조회·타이머를 정리하고 통과로 끝난다")
    func callerCancellation() async {
        let clock = TestClock()
        let lookup = ControllableLookup()
        let gate = gate(lookup: lookup, clock: clock)
        let task = Task { await gate.evaluate() }
        await lookup.entered.wait()
        await clock.waitUntilSleeperCount(atLeast: 1)
        task.cancel()
        #expect(await task.value == .passed)
    }

    @Test("TC-BOOT-024 2.9초에 도착한 응답은 사용한다")
    func responseJustBeforeTimeout() async {
        let clock = TestClock()
        let lookup = ControllableLookup()
        let gate = gate(lookup: lookup, clock: clock)
        let task = Task { await gate.evaluate() }
        await lookup.entered.wait()
        await clock.waitUntilSleeperCount(atLeast: 1)
        clock.advance(by: .milliseconds(2900))
        await lookup.respond(with: "2.0.0")
        #expect(await task.value == .updateRequired)
    }

    @Test("TC-BOOT-025 오프라인(조회 실패)이면 통과하고, 온라인 복귀 뒤 재조회에서 강제 대상이면 업데이트 필요")
    func offlineThenOnline() async {
        let gate = gate(lookup: ScriptedLookup([.failure(LookupFailure()), .success("2.0.0")]))
        #expect(await gate.evaluate() == .passed)
        #expect(await gate.evaluate() == .updateRequired)
    }

    @Test("TC-BOOT-026 이미 업데이트 필요로 확인됐으면 이후 조회가 실패해도 유지한다")
    func stickyAfterRequired() async {
        let gate = gate(lookup: ScriptedLookup([.success("2.0.0"), .failure(LookupFailure()), .success(nil), .success("1.0.0")]))
        #expect(await gate.evaluate() == .updateRequired)
        #expect(await gate.evaluate() == .updateRequired)
        #expect(await gate.evaluate() == .updateRequired)
        #expect(await gate.evaluate() == .updateRequired)
    }

    @Test("TC-BOOT-032 조회를 끄면 스토어 조회 0건이고 통과")
    func disabled() async {
        let lookup = ScriptedLookup([.success("9.0.0")])
        let result = await gate(lookup: lookup, enabled: false).evaluate()
        #expect(result == .passed)
        #expect(await lookup.count == 0)
    }

    @Test("TC-BOOT-020 설치 버전 문자열이 이상하면 통과(막지 않는다)")
    func malformedInstalledVersion() async {
        #expect(await gate(lookup: ScriptedLookup([.success("9.0.0")]), installed: "dev").evaluate() == .passed)
    }
}
