package kr.chalkak.core.common

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/*
 * D-01 title length: trimmed Unicode code points, max 10.
 * Covers TC-UPL-080..082 and TC-FEED-020..022 (the pure length/limit/normalize rules).
 * Request-body shape (null key present) and the "무제" display are verified later in :core:data / :feature:*.
 */
class PostTitleTest {
    private val family = "👨‍👩‍👧" // 👨‍👩‍👧 = 5 code points, 8 UTF-16 units, 1 grapheme
    private val smile = "😀" // 😀 = 1 code point, 2 UTF-16 units

    @Test
    fun `TC-UPL-080 한글 10자는 허용되고 11번째 입력은 들어가지 않는다`() {
        val ten = "가나다라마바사아자차"
        assertEquals(10, PostTitle.length(ten))
        assertTrue(PostTitle.isValid(ten))
        assertEquals(ten, PostTitle.limitInput(ten))
        assertEquals(ten, PostTitle.limitInput(ten + "카"))
        assertFalse(PostTitle.isValid(ten + "카"))
    }

    @Test
    fun `TC-UPL-080 이모지 10개는 허용되고 UTF-16 길이가 아니라 code point로 센다`() {
        val ten = smile.repeat(10)
        assertEquals(20, ten.length)
        assertEquals(10, PostTitle.length(ten))
        assertTrue(PostTitle.isValid(ten))
        assertEquals(ten, PostTitle.limitInput(ten + smile))
        assertEquals(11, PostTitle.length(ten + smile))
    }

    @Test
    fun `TC-UPL-081 결합 이모지 2개와 한 글자는 11 code point라 차단된다`() {
        assertEquals(5, PostTitle.length(family))
        assertEquals(10, PostTitle.length(family + family))
        assertTrue(PostTitle.isValid(family + family))
        assertFalse(PostTitle.isValid(family + family + "가"))
        assertEquals(family + family, PostTitle.limitInput(family + family + "가"))
    }

    @Test
    fun `TC-UPL-081 11자 붙여넣기는 앞 10 code point까지만 들어간다`() {
        assertEquals("가나다라마바사아자차", PostTitle.limitInput("가나다라마바사아자차카"))
        assertEquals(smile.repeat(10), PostTitle.limitInput(smile.repeat(15)))
    }

    @Test
    fun `TC-UPL-081 code point 경계에서 자르므로 서로게이트 쌍이 깨지지 않는다`() {
        val pasted = "가나다라마바사아자" + smile + smile // 9 + 2 = 11
        val limited = PostTitle.limitInput(pasted)
        assertEquals("가나다라마바사아자" + smile, limited)
        assertEquals(10, limited.codePointCount(0, limited.length))
    }

    @Test
    fun `TC-UPL-081 결합 이모지 중간에서 잘릴 수 있어도 10 code point를 넘지 않는다`() {
        val limited = PostTitle.limitInput("가나다라마바사" + family) // 7 + 5 = 12
        assertEquals(10, PostTitle.length(limited))
    }

    @Test
    fun `TC-UPL-082 앞뒤 공백 포함 12자이지만 strip 후 10자면 허용되고 전송값은 공백이 제거된다`() {
        val raw = " 가나다라마바사아자차 "
        assertEquals(12, raw.length)
        assertEquals(10, PostTitle.length(raw))
        assertTrue(PostTitle.isValid(raw))
        assertEquals(raw, PostTitle.limitInput(raw))
        assertEquals("가나다라마바사아자차", PostTitle.toRequestValue(raw))
    }

    @Test
    fun `TC-FEED-021 탭 개행 전각 공백도 앞뒤에서 제거된다`() {
        assertEquals("가나다", PostTitle.toRequestValue("\t\n　가나다　\n"))
        assertEquals(3, PostTitle.length("　가나다 "))
    }

    @Test
    fun `TC-UPL-082 내부 공백은 유지되고 길이에 포함된다`() {
        assertEquals("가 나", PostTitle.toRequestValue(" 가 나 "))
        assertEquals(3, PostTitle.length("가 나"))
    }

    @Test
    fun `TC-FEED-022 빈 입력이나 공백만 있으면 null이다`() {
        assertNull(PostTitle.toRequestValue(""))
        assertNull(PostTitle.toRequestValue("   "))
        assertNull(PostTitle.toRequestValue("\t\n 　"))
        assertEquals(0, PostTitle.length("   "))
        assertTrue(PostTitle.isValid(""))
    }

    @Test
    fun `TC-FEED-022 제목이 없거나 공백이면 무제로 표시한다`() {
        assertEquals("무제", PostTitle.displayText(null))
        assertEquals("무제", PostTitle.displayText(""))
        assertEquals("무제", PostTitle.displayText("  "))
        assertEquals("하늘", PostTitle.displayText("하늘"))
    }

    @Test
    fun `TC-FEED-020 결합 이모지는 grapheme가 아니라 code point로 센다`() {
        assertEquals(5, PostTitle.length(family))
        assertEquals(1, PostTitle.length(smile))
        assertEquals(10, PostTitle.length("é".repeat(5))) // NFD é = 2 code points each
    }

    @Test
    fun `TC-FEED-020 입력 제한 값은 항상 10 code point 이하이다`() {
        val inputs = listOf("", "a", family.repeat(3), smile.repeat(50), " ".repeat(30) + "가", "가".repeat(100))
        for (input in inputs) {
            assertTrue(PostTitle.length(PostTitle.limitInput(input)) <= AppConstants.POST_TITLE_MAX, "input length=${input.length}")
        }
    }
}
