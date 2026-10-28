import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private let feedbackViewed = AnalyticsEvent.screenView(.feedback, screenClass: nil)

@MainActor
private struct FeedbackWorld {
    let repo: FakeFeedbackRepository
    let toast = RecordingToast()
    let analytics = RecordingAnalytics()
    let viewer = MutableViewer(userId: settingsUserA)
    let vm: FeedbackViewModel

    init(_ steps: [Step<FeedbackReceipt>] = [.ok(FakeFeedbackRepository.receipt)]) {
        repo = FakeFeedbackRepository(steps)
        vm = FeedbackViewModel(repository: repo, viewer: viewer, toast: toast, screens: ScreenTracker(tracker: analytics))
    }

    /// `text`를 넣고 보낸다.
    func send(_ text: String) async {
        vm.text = text
        await vm.send()
    }
}

private let unauthorized = APIError.http(status: 401, code: .unauthorized, message: "유효하지 않은 인증 정보입니다.")
private let reauthRequired = APIError.http(status: 401, code: .reauthenticationRequired, message: "다시 로그인해 주세요.")
private let emojiFamily = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"

@MainActor
@Suite("FDBK 입력 검증·글자 수", .timeLimit(.minutes(1)))
struct FeedbackInputTests {
    @Test("TC-FDBK-003 REQ-FDBK-003 초기 상태는 보내기 비활성이고 카운터는 0/1000이다")
    func initialState() {
        let w = FeedbackWorld()
        #expect(!w.vm.canSend)
        #expect(w.vm.trimmedCount == 0)
        #expect(w.vm.counterText == "0/1000")
        #expect(w.vm.sendButtonTitle == FeedbackCopy.send)
        #expect(!w.vm.isSending && !w.vm.isFinished && !w.vm.needsLogin && w.vm.errorNotice == nil)
    }

    @Test("TC-FDBK-004 공백만(스페이스·탭·개행·전각 공백 조합) 입력하면 전송 불가이고 서버 호출이 0건이다", arguments: [
        " ", "\t", "\n", "\u{3000}", " \t\n\u{3000} \n", "",
    ])
    func whitespaceOnlyCannotBeSent(text: String) async {
        let w = FeedbackWorld()
        w.vm.text = "a"
        #expect(w.vm.canSend, "대조: 글자가 있으면 보낼 수 있다")
        await w.send(text)
        #expect(!w.vm.canSend)
        #expect(w.vm.trimmedCount == 0)
        #expect(await w.repo.contents.isEmpty)
        #expect(!w.vm.isFinished)
    }

    @Test("TC-FDBK-005 트림 후 1 code point이면 전송 가능이다")
    func oneCodePointCanBeSent() async {
        let w = FeedbackWorld()
        w.vm.text = "  가  "
        #expect(w.vm.trimmedCount == 1)
        #expect(w.vm.canSend)
        #expect(w.vm.counterText == "1/1000")
        await w.vm.send()
        #expect(await w.repo.contents == ["가"])
    }

    @Test("TC-FDBK-006 트림 후 정확히 1000 code point이면 허용되고 요청이 나간다")
    func exactlyMaxIsAllowed() async {
        let w = FeedbackWorld()
        let body = String(repeating: "가", count: 1000)
        await w.send(body)
        #expect(await w.repo.contents == [body])
        #expect(w.vm.isFinished)
        #expect(w.vm.errorNotice == nil)
    }

    @Test("TC-FDBK-007 REQ-FDBK-005 트림 후 1001 code point이면 요청 0건이고 fdbk.error.invalid를 보인다(입력은 유지)")
    func overMaxIsRejected() async {
        let w = FeedbackWorld()
        let body = String(repeating: "가", count: 1001)
        w.vm.text = body
        #expect(w.vm.trimmedCount == 1001)
        #expect(w.vm.counterText == "1001/1000")
        #expect(w.vm.canSend, "1000자를 넘어도 입력은 막지 않고 보내기 시점에 검증한다")
        await w.vm.send()
        #expect(await w.repo.contents.isEmpty)
        #expect(w.vm.errorNotice?.message == FeedbackCopy.errorInvalid)
        #expect(w.vm.text == body)
        #expect(!w.vm.isSending && !w.vm.isFinished)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-FDBK-008 앞뒤 공백 포함 총 1002자, 트림 후 1000자이면 허용되고 서버로 가는 content는 트림 값이다")
    func paddedBodyIsTrimmedBeforeSending() async {
        let w = FeedbackWorld()
        let body = String(repeating: "나", count: 1000)
        let padded = " " + body + "\n"
        #expect(padded.unicodeScalars.count == 1002)
        await w.send(padded)
        #expect(await w.repo.contents == [body])
        #expect(w.vm.isFinished)
    }

    @Test("TC-FDBK-009 이모지 1000개(UTF-16 2000)는 허용, 1001개는 거부(code point 기준)")
    func emojiCountsByCodePoint() async {
        let ok = FeedbackWorld()
        let thousand = String(repeating: "\u{1F600}", count: 1000)
        ok.vm.text = thousand
        #expect(ok.vm.trimmedCount == 1000)
        #expect(thousand.utf16.count == 2000)
        await ok.vm.send()
        #expect(await ok.repo.contents == [thousand])

        let over = FeedbackWorld()
        over.vm.text = String(repeating: "\u{1F600}", count: 1001)
        #expect(over.vm.trimmedCount == 1001)
        await over.vm.send()
        #expect(await over.repo.contents.isEmpty)
        #expect(over.vm.errorNotice?.message == FeedbackCopy.errorInvalid)
    }

    @Test("TC-FDBK-010 결합 이모지(code point 5개)는 grapheme가 아니라 code point로 센다: 200개는 허용, 201개는 거부")
    func joinedEmojiCountsByCodePoint() async {
        #expect(emojiFamily.unicodeScalars.count == 5)
        let ok = FeedbackWorld()
        ok.vm.text = String(repeating: emojiFamily, count: 200)
        #expect(ok.vm.trimmedCount == 1000)
        await ok.vm.send()
        #expect(await ok.repo.contents.count == 1)

        let over = FeedbackWorld()
        over.vm.text = String(repeating: emojiFamily, count: 201)
        #expect(over.vm.trimmedCount == 1005)
        await over.vm.send()
        #expect(await over.repo.contents.isEmpty)
        #expect(over.vm.errorNotice?.message == FeedbackCopy.errorInvalid)
    }

    @Test("TC-FDBK-011 분해형(NFD) 한글과 조합형 한글은 정규화하지 않고 code point 그대로 센다")
    func hangulIsNotNormalized() {
        let composed = "\u{D55C}\u{AE00}"
        let decomposed = "\u{1112}\u{1161}\u{11AB}\u{1100}\u{1173}\u{11AF}"
        let w = FeedbackWorld()
        w.vm.text = composed
        #expect(w.vm.trimmedCount == 2)
        w.vm.text = decomposed
        #expect(w.vm.trimmedCount == 6)
        #expect(w.vm.counterText == "6/1000")
    }

    @Test("TC-FDBK-012 중간의 개행·연속 공백은 보존하고 앞뒤만 제거해서 보낸다")
    func innerWhitespaceIsPreserved() async {
        let w = FeedbackWorld()
        await w.send("  첫 줄\n\n둘째  줄\t끝  ")
        #expect(await w.repo.contents == ["첫 줄\n\n둘째  줄\t끝"])
    }

    @Test("TC-FDBK-014 REQ-FDBK-003 10만 자를 붙여넣어도 카운터는 정확하고 전송은 거부된다")
    func hugePaste() async {
        let w = FeedbackWorld()
        w.vm.text = String(repeating: "가", count: 100_000)
        #expect(w.vm.trimmedCount == 100_000)
        #expect(w.vm.counterText == "100000/1000")
        await w.vm.send()
        #expect(await w.repo.contents.isEmpty)
        #expect(w.vm.errorNotice?.message == FeedbackCopy.errorInvalid)
    }

    @Test("REQ-FDBK-003 카운터는 입력이 바뀔 때마다 트림 후 code point 수와 같다")
    func counterFollowsInput() {
        let w = FeedbackWorld()
        for (text, count) in [("a", 1), ("  ab  ", 2), ("가나다\n라", 5), ("\u{3000}x\u{3000}", 1)] {
            w.vm.text = text
            #expect(w.vm.trimmedCount == count, "\(text.debugDescription)")
            #expect(w.vm.counterText == "\(count)/1000")
        }
    }
}

@MainActor
@Suite("FDBK 전송·결과", .timeLimit(.minutes(1)))
struct FeedbackSendTests {
    @Test("TC-FDBK-001 REQ-FDBK-014 화면이 보이면 screen_view(feedback)가 1회 나간다")
    func screenViewOnce() {
        let w = FeedbackWorld()
        w.vm.screenAppeared()
        w.vm.screenAppeared()
        #expect(w.analytics.events == [feedbackViewed])
    }

    @Test("TC-FDBK-017 전송 성공이면 토스트 fdbk.success, 화면 닫기, 입력 비우기이다")
    func successClosesAndClears() async {
        let w = FeedbackWorld()
        await w.send("고마워요")
        #expect(await w.repo.contents == ["고마워요"])
        #expect(w.toast.messages == [FeedbackCopy.success])
        #expect(w.vm.isFinished)
        #expect(w.vm.text.isEmpty)
        #expect(w.vm.errorNotice == nil)
        #expect(!w.vm.isSending)
    }

    @Test("TC-FDBK-020 성공 뒤 화면을 다시 열어도 이전 내용이 남아 있지 않다")
    func nothingRemainsAfterSuccess() async {
        let w = FeedbackWorld()
        await w.send("고마워요")
        #expect(w.vm.text.isEmpty)
        #expect(w.vm.trimmedCount == 0)
        #expect(w.vm.counterText == "0/1000")
        #expect(!w.vm.canSend)
    }

    @Test("TC-FDBK-018 REQ-FDBK-006 전송 중에는 버튼이 \"보내는 중...\"이고 비활성이다")
    func sendingState() async {
        let hold = Hold()
        let w = FeedbackWorld([.ok(FakeFeedbackRepository.receipt, hold: hold)])
        w.vm.text = "내용"
        let task = Task { await w.vm.send() }
        let started = await EventWait.signal(w.repo.entered, before: task)
        #expect(started)
        #expect(w.vm.isSending)
        #expect(w.vm.sendButtonTitle == FeedbackCopy.sending)
        #expect(!w.vm.canSend)
        await hold.open()
        await task.value
        #expect(!w.vm.isSending)
        #expect(w.vm.sendButtonTitle == FeedbackCopy.send)
    }

    @Test("TC-FDBK-019 보내기를 3회 연타해도 POST는 1회뿐이다")
    func tapsAreCollapsed() async {
        let hold = Hold()
        let w = FeedbackWorld([.ok(FakeFeedbackRepository.receipt, hold: hold)])
        w.vm.text = "연타"
        let first = Task { await w.vm.send() }
        let started = await EventWait.signal(w.repo.entered, before: first)
        #expect(started)
        let second = Task { await w.vm.send() }
        let third = Task { await w.vm.send() }
        await second.value
        await third.value
        await hold.open()
        await first.value
        #expect(await w.repo.contents == ["연타"])
        #expect(w.toast.messages == [FeedbackCopy.success], "성공 토스트도 한 번")
    }

    // MARK: 실패

    @Test("TC-FDBK-021 400은 서버 message가 아니라 고정 문구 fdbk.error.invalid를 보이고 입력은 유지된다(D-02)")
    func badRequestShowsFixedCopy() async {
        let serverMessage = "피드백 내용이 필요합니다."
        let w = FeedbackWorld([.fail(APIError.http(status: 400, code: .businessError, message: serverMessage))])
        await w.send("내용")
        #expect(await w.repo.contents == ["내용"])
        #expect(w.vm.errorNotice?.message == FeedbackCopy.errorInvalid)
        #expect(w.vm.errorNotice?.message != serverMessage)
        #expect(w.vm.text == "내용")
        #expect(!w.vm.isFinished && !w.vm.isSending)
        #expect(w.vm.canSend)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-FDBK-023 REQ-FDBK-011 갱신 후에도 401이면 문구 없이 로그인 이동을 요청하고 입력은 유지된다", arguments: [unauthorized, reauthRequired])
    func unauthorizedRequestsLogin(error: APIError) async {
        let w = FeedbackWorld([.fail(error)])
        await w.send("내용")
        #expect(await w.repo.contents == ["내용"])
        #expect(w.vm.needsLogin)
        #expect(w.vm.errorNotice == nil)
        #expect(w.toast.messages.isEmpty)
        #expect(w.vm.text == "내용")
        #expect(!w.vm.isFinished)
        w.vm.consumeNeedsLogin()
        #expect(!w.vm.needsLogin)
    }

    @Test("TC-FDBK-024 500·502·해석 불가는 fdbk.error.generic이고 입력은 유지되며 요청은 1회뿐이다", arguments: [
        APIError.serverError,
        APIError.http(status: 502, code: nil, message: nil),
        APIError.invalidResponse,
    ])
    func serverFailuresAreGeneric(error: APIError) async {
        await expectGeneric(error)
    }

    @Test("TC-FDBK-027 503·429는 재시도 없이 일반 오류 문구(fdbk.error.generic)이고 입력은 유지된다", arguments: [
        APIError.http(status: 503, code: nil, message: nil),
        APIError.http(status: 429, code: nil, message: nil),
    ])
    func throttlingFailuresAreGeneric(error: APIError) async {
        await expectGeneric(error)
    }

    private func expectGeneric(_ error: APIError) async {
        let w = FeedbackWorld([.fail(error)])
        await w.send("내용")
        #expect(await w.repo.contents == ["내용"])
        #expect(w.vm.errorNotice?.message == FeedbackCopy.errorGeneric)
        #expect(w.vm.text == "내용")
        #expect(!w.vm.isFinished && !w.vm.isSending && w.vm.canSend)
        #expect(!w.vm.needsLogin)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-FDBK-025 연결 실패·타임아웃은 \"네트워크 연결을 확인해 주세요.\"이고 자동 재시도 없이 사용자가 다시 보낼 수 있다")
    func networkFailureThenManualResend() async {
        let w = FeedbackWorld([.fail(APIError.network), .ok(FakeFeedbackRepository.receipt)])
        await w.send("내용")
        #expect(await w.repo.contents == ["내용"], "자동 재시도 없음")
        #expect(w.vm.errorNotice?.message == FeedbackCopy.errorNetwork)
        #expect(w.vm.text == "내용")
        #expect(w.vm.canSend)
        await w.vm.send()
        #expect(await w.repo.contents == ["내용", "내용"])
        #expect(w.vm.isFinished)
        #expect(w.vm.errorNotice == nil, "다시 보내면 이전 오류 문구가 사라진다")
        #expect(w.toast.messages == [FeedbackCopy.success])
    }

    @Test("TC-FDBK-026 REQ-FDBK-013 타임아웃 뒤 같은 내용을 수동으로 다시 보내도 중복 제거 없이 한 번 더 보낸다")
    func manualResendIsNotDeduplicated() async {
        let w = FeedbackWorld([.fail(APIError.network), .ok(FakeFeedbackRepository.receipt)])
        await w.send("같은 내용")
        await w.vm.send()
        #expect(await w.repo.contents == ["같은 내용", "같은 내용"])
    }

    @Test("D-20 같은 실패가 연달아 나와도 오류 알림 id가 달라 다시 표시된다")
    func repeatedFailureGetsNewNoticeId() async throws {
        let w = FeedbackWorld([.fail(APIError.serverError)])
        await w.send("내용")
        let first = try #require(w.vm.errorNotice)
        await w.vm.send()
        let second = try #require(w.vm.errorNotice)
        #expect(first.message == second.message)
        #expect(first.id != second.id)
    }

    // MARK: 취소·계정 전환

    @Test("TC-FDBK-029 전송 중 화면을 떠나면 취소 오류가 보이지 않고 입력은 유지된다")
    func leavingWhileSendingShowsNothing() async {
        let hold = Hold()
        let w = FeedbackWorld([.ok(FakeFeedbackRepository.receipt, hold: hold)])
        w.vm.text = "내용"
        let task = Task { await w.vm.send() }
        let started = await EventWait.signal(w.repo.entered, before: task)
        #expect(started)
        w.vm.screenDisappeared()
        await task.value
        #expect(w.vm.errorNotice == nil)
        #expect(w.toast.messages.isEmpty)
        #expect(!w.vm.isSending && !w.vm.isFinished)
        #expect(w.vm.text == "내용")
    }

    @Test("TC-FDBK-030 전송 중 로그아웃·계정 전환이 있었으면 응답(성공·실패)이 도착해도 토스트도 화면 전환도 일으키지 않는다", arguments: [
        (true, nil as String?), (false, nil as String?), (true, settingsUserB), (false, settingsUserB),
    ])
    func accountSwitchDiscardsResult(succeeds: Bool, newUser: String?) async {
        let hold = Hold(ignoringCancellation: true)
        let step: Step<FeedbackReceipt> = succeeds ? .ok(FakeFeedbackRepository.receipt, hold: hold) : .fail(APIError.serverError, hold: hold)
        let w = FeedbackWorld([step])
        w.vm.text = "내용"
        let task = Task { await w.vm.send() }
        let started = await EventWait.signal(w.repo.entered, before: task)
        #expect(started)
        w.viewer.set(newUser)
        await hold.open()
        await task.value
        #expect(w.toast.messages.isEmpty)
        #expect(!w.vm.isFinished)
        #expect(w.vm.errorNotice == nil)
        #expect(!w.vm.needsLogin)
        #expect(!w.vm.isSending)
    }

    // MARK: 분석

    @Test("TC-FDBK-034 D-22 피드백 전송은 screen_view 외에 이벤트를 만들지 않고 내용이 분석 파라미터에 남지 않는다")
    func contentIsNeverTracked() async {
        let secret = "비밀스러운-피드백-내용"
        let w = FeedbackWorld()
        w.vm.screenAppeared()
        await w.send(secret)
        #expect(w.analytics.events == [feedbackViewed])
        let allValues = w.analytics.events.flatMap { $0.parameters.values }
        #expect(!allValues.contains { $0.contains(secret) })
    }
}
