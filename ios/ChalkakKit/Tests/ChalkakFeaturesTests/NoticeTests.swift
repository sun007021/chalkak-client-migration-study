import Testing
@testable import ChalkakFeatures

@Suite("공용 알림 Notice")
struct NoticeTests {
    @Test("같은 문구를 연달아 만들어도 id가 달라 새 알림으로 보인다")
    func idsAreDistinct() {
        var sequence = NoticeSequence()
        let first = sequence.make("같은 문구")
        let second = sequence.make("같은 문구")
        #expect(first.message == second.message)
        #expect(first.id != second.id)
    }

    @Test("id는 1부터 순서대로 늘어난다")
    func idsIncrease() {
        var sequence = NoticeSequence()
        #expect(sequence.make("a").id == 1)
        #expect(sequence.make("b").id == 2)
    }
}
