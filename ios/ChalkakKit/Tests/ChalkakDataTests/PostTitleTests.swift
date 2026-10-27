import Foundation
import Testing
import ChalkakCore
import ChalkakData

@Suite("제목 길이 규칙(D-01)")
struct PostTitleTests {
    @Test("D-01 최대 길이 상수는 10이다")
    func maxIsTen() {
        #expect(AppConstants.postTitleMax == 10)
    }

    @Test("TC-FEED-019 이모지 10개(UTF-16 20)는 허용, 11개는 거부, 입력은 10개에서 멈춘다")
    func tenEmojiAllowed() {
        let ten = String(repeating: "😀", count: 10)
        let eleven = ten + "😀"
        #expect(ten.utf16.count == 20)
        #expect(PostTitle.length(of: ten) == 10)
        #expect(PostTitle.isValid(ten))
        #expect(!PostTitle.isValid(eleven))
        #expect(PostTitle.clampedInput(ten) == ten)
        #expect(PostTitle.clampedInput(eleven) == ten)
    }

    @Test("TC-FEED-020 결합 이모지 👨‍👩‍👧는 5 code point로 센다(grapheme 아님)")
    func combinedEmojiCountsCodePoints() {
        let family = "👨‍👩‍👧"
        #expect(family.unicodeScalars.count == 5)
        #expect(PostTitle.length(of: family) == 5)
        #expect(PostTitle.isValid(family + family))
        #expect(!PostTitle.isValid(family + family + "가"))
        #expect(PostTitle.clampedInput(family + family + "가") == family + family)
    }

    @Test("TC-FEED-020 11자 붙여넣기는 10 code point까지만 들어간다")
    func pasteIsClampedToTen() {
        #expect(PostTitle.clampedInput("가나다라마바사아자차카") == "가나다라마바사아자차")
        #expect(PostTitle.clampedInput("가나다") == "가나다")
        #expect(PostTitle.clampedInput("") == "")
    }

    @Test("TC-FEED-021 앞뒤 공백 포함 12자여도 strip 후 10자면 허용하고 값은 공백이 제거된다")
    func stripBeforeCounting() {
        let input = " 가나다라마바사아자차 "
        #expect(input.unicodeScalars.count == 12)
        #expect(PostTitle.length(of: input) == 10)
        #expect(PostTitle.isValid(input))
        #expect(PostTitle.normalized(input) == "가나다라마바사아자차")
        #expect(PostTitle.clampedInput(input) == input)
    }

    @Test("TC-FEED-021 NBSP·U+3000·줄바꿈도 앞뒤에서 제거한다")
    func stripsUnicodeWhitespace() {
        #expect(PostTitle.normalized("\u{00A0}\u{3000}제목\n") == "제목")
        #expect(PostTitle.length(of: "\u{3000}제목\u{00A0}") == 2)
    }

    @Test("TC-FEED-022 빈 입력·공백만이면 nil(제목 없음)이다", arguments: ["", " ", "   ", "\n\t", "\u{3000}\u{00A0}"])
    func blankIsNil(raw: String) {
        #expect(PostTitle.normalized(raw) == nil)
        #expect(PostTitle.length(of: raw) == 0)
        #expect(PostTitle.isValid(raw))
    }

    @Test("D-01 가운데 공백은 보존하고 센다")
    func innerWhitespaceKept() {
        #expect(PostTitle.normalized(" 가 나 ") == "가 나")
        #expect(PostTitle.length(of: "가 나") == 3)
    }
}
