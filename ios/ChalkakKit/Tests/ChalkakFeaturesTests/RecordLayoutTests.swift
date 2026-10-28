import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("REC 달력 격자·문구", .timeLimit(.minutes(1)))
struct RecordLayoutTests {
    struct Case: Sendable, CustomTestStringConvertible {
        let year: Int
        let month: Int
        let rows: Int
        let offset: Int
        let days: Int
        var testDescription: String { "\(year)-\(month)" }
    }

    @Test("TC-REC-010 월별 격자: 행 수, 첫 날 오프셋(일요일=0), 날수(윤년 포함)", arguments: [
        Case(year: 2026, month: 2, rows: 4, offset: 0, days: 28),
        Case(year: 2026, month: 10, rows: 5, offset: 4, days: 31),
        Case(year: 2026, month: 5, rows: 6, offset: 5, days: 31),
        Case(year: 2026, month: 11, rows: 5, offset: 0, days: 30),
        Case(year: 2027, month: 1, rows: 6, offset: 5, days: 31),
        Case(year: 2028, month: 2, rows: 5, offset: 2, days: 29),
    ])
    func gridShape(c: Case) {
        let layout = RecordMonthLayout(month: YearMonth(year: c.year, month: c.month))
        #expect(layout.rowCount == c.rows)
        #expect(layout.leadingBlankCount == c.offset)
        #expect(layout.dayCount == c.days)
        #expect(layout.cells.count == c.rows * 7)
    }

    @Test("TC-REC-010 앞칸은 비우고(이전 달 날짜를 채우지 않는다) 1일부터 마지막 날까지 이어지며 마지막 날 뒤의 남는 칸도 비운다")
    func cellsAreContiguousAndBlankPadded() throws {
        let layout = RecordMonthLayout(month: YearMonth(year: 2026, month: 10))
        try #require(layout.cells.count == 35)
        #expect(layout.cells[0..<4].allSatisfy { $0 == nil })
        let days = layout.cells.compactMap { $0 }
        #expect(days.count == 31)
        #expect(days.first == kst(2026, 10, 1))
        #expect(days.last == kst(2026, 10, 31))
        #expect(layout.cells[4] == kst(2026, 10, 1), "2026-10-01은 목요일이라 다섯 번째 칸이다")
        #expect(layout.cells[34] == kst(2026, 10, 31))

        let may = RecordMonthLayout(month: YearMonth(year: 2026, month: 5))
        try #require(may.cells.count == 42)
        #expect(may.cells[36...].allSatisfy { $0 == nil }, "5월 31일 뒤 남는 칸은 비어 있다")
        #expect(may.cells.compactMap { $0 }.last == kst(2026, 5, 31))
    }

    @Test("TC-REC-010 윤년 2028-02는 29일까지 있고 평년 2027-02는 28일까지다")
    func leapYear() {
        #expect(RecordMonthLayout(month: YearMonth(year: 2028, month: 2)).cells.compactMap { $0 }.last == kst(2028, 2, 29))
        #expect(RecordMonthLayout(month: YearMonth(year: 2027, month: 2)).cells.compactMap { $0 }.last == kst(2027, 2, 28))
    }

    @Test("REQ-REC-009 요일 머리글은 일월화수목금토 순서로 한 글자씩이다")
    func weekdayHeaders() throws {
        #expect(RecordCopy.weekdayLabels == ["일", "월", "화", "수", "목", "금", "토"])
        #expect(RecordCopy.weekdayLabels.joined() == (try SharedCopy.require("record.weekday")))
    }

    @Test("TC-REC-038 저장 파일 이름은 chalkak-calendar-{yyyy-MM}.png이고 월·연도를 0으로 채운다", arguments: [
        (2026, 10, "chalkak-calendar-2026-10.png"),
        (2026, 1, "chalkak-calendar-2026-01.png"),
        (2027, 12, "chalkak-calendar-2027-12.png"),
        (999, 3, "chalkak-calendar-0999-03.png"),
    ])
    func fileName(year: Int, month: Int, expected: String) {
        #expect(RecordCopy.calendarFileName(for: YearMonth(year: year, month: month)) == expected)
    }

    @Test("REC 고정 문구가 shared/copy/ko.json과 같다", arguments: [
        ("record.picker.title", RecordCopy.pickerTitle),
        ("record.pending.badge", RecordCopy.pendingBadge),
        ("record.pending.tooltip", RecordCopy.pendingTooltip),
        ("record.pending.hint-open", RecordCopy.pendingHintOpen),
        ("record.pending.hint-close", RecordCopy.pendingHintClose),
        ("record.action.feed", RecordCopy.actionFeed),
        ("record.action.display", RecordCopy.actionDisplay),
        ("record.save", RecordCopy.save),
        ("record.save.ok", RecordCopy.saveOK),
        ("record.save.fail", RecordCopy.saveFail),
        ("record.save.denied", RecordCopy.saveDenied),
        ("record.guest", RecordCopy.guest),
        ("record.err.401", RecordCopy.errorUnauthorized),
        ("record.err.400", RecordCopy.errorInvalidMonth),
        ("record.err.other", RecordCopy.errorOther),
        ("record.guest.login", RecordCopy.loginButton),
        ("common.retry", RecordCopy.retryButton),
    ])
    func copyMatchesSharedTable(key: String, actual: String) throws {
        #expect(!actual.isEmpty)
        #expect(try SharedCopy.require(key) == actual)
    }

    @Test("REQ-REC-024 오류 화면 제목·버튼: 401 로그인 하기, 400 버튼 없음, 그 밖은 다시 시도")
    func errorScreenCopy() {
        #expect(RecordLoadFailure.loginRequired.title == "로그인이 필요해요")
        #expect(RecordLoadFailure.loginRequired.buttonTitle == "로그인 하기")
        #expect(RecordLoadFailure.invalidMonth.title == "조회할 수 없는 연월이에요")
        #expect(RecordLoadFailure.invalidMonth.buttonTitle == nil)
        #expect(RecordLoadFailure.other.title == "기록을 불러오지 못했어요")
        #expect(RecordLoadFailure.other.buttonTitle == "다시 시도")
    }
}
