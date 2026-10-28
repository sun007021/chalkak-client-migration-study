package kr.chalkak.feature.upload

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.home.ModerationStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** TC-UPL-080..082 (title input) and TC-UPL-084, 085 (success text). */
class TitleAndSuccessTest {
    private val family = "👨‍👩‍👧" // man-woman-girl: 5 code points, one grapheme

    @Test
    fun `TC-UPL-080 ten Hangul letters are accepted and an eleventh is not typed`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onTitleChanged("가나다라마바사아자차")
        assertEquals("가나다라마바사아자차", rig.s.title)
        rig.holder.onTitleChanged(rig.s.title + "카")
        assertEquals("가나다라마바사아자차", rig.s.title)
    }

    @Test
    fun `TC-UPL-080 ten emoji are accepted although they are twenty UTF-16 units, the eleventh is not typed`() = runTest {
        val rig = uploadRig()
        rig.show()
        val ten = "😀".repeat(10)
        rig.holder.onTitleChanged(ten)
        assertEquals(ten, rig.s.title)
        rig.holder.onTitleChanged(ten + "😀")
        assertEquals(ten, rig.s.title)
    }

    @Test
    fun `TC-UPL-081 combined emoji count by code point and a long paste keeps the first ten code points`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onTitleChanged(family + family)
        assertEquals(family + family, rig.s.title, "2 x 5 = 10 code points")
        rig.holder.onTitleChanged(family + family + "가")
        assertEquals(family + family, rig.s.title, "the 11th code point is blocked")
        rig.holder.onTitleChanged("")
        rig.holder.onTitleChanged("가나다라마바사아자차카타")
        assertEquals("가나다라마바사아자차", rig.s.title)
    }

    @Test
    fun `TC-UPL-082 surrounding spaces do not count and the request carries the stripped title`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onTitleChanged(" 가나다라마바사아자차 ")
        rig.pickAndConfirm()
        rig.submit()
        assertEquals("가나다라마바사아자차", rig.creation.createCalls.single().title)
    }

    @Test
    fun `TC-UPL-082 a blank title is sent as no title`() = runTest {
        listOf("", "   ", "　  ").forEach { blank ->
            val rig = uploadRig()
            rig.show()
            rig.holder.onTitleChanged(blank)
            rig.pickAndConfirm()
            rig.submit()
            assertNull(rig.creation.createCalls.single().title, "for '$blank'")
        }
    }

    @Test
    fun `TC-UPL-082 the title cannot be edited while submitting`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        val gate = CompletableDeferred<Unit>()
        rig.uploader.onPut = { gate.await() }
        rig.holder.onSubmitClicked()
        rig.t.runCurrent()
        rig.holder.onTitleChanged("바꾼 제목")
        assertEquals("제목", rig.s.title)
        gate.complete(Unit)
        rig.idle()
        assertEquals("제목", rig.creation.createCalls.single().title)
    }

    @Test
    fun `TC-UPL-084 object particle follows the final consonant of the last Hangul syllable`() {
        listOf("하늘", "꽃", "우산").forEach { assertEquals("을", KoreanParticle.objectParticle(it), it) }
        listOf("바다", "나무").forEach { assertEquals("를", KoreanParticle.objectParticle(it), it) }
    }

    @Test
    fun `TC-UPL-084 trailing spaces are ignored, empty and non-Hangul words take the no-final particle`() {
        assertEquals("을", KoreanParticle.objectParticle("겨울 "))
        assertEquals("을", KoreanParticle.objectParticle("겨울　"))
        assertEquals("를", KoreanParticle.objectParticle(""))
        assertEquals("를", KoreanParticle.objectParticle("   "))
        assertEquals("를", KoreanParticle.objectParticle("Sky"))
        assertEquals("를", KoreanParticle.objectParticle("😀"))
    }

    @Test
    fun `TC-UPL-084 the success sentence quotes the topic and uses the right particle`() {
        assertEquals("‘하늘’을 기록했어요.", UploadSuccessText.title("하늘"))
        assertEquals("‘바다’를 기록했어요.", UploadSuccessText.title("바다"))
        assertEquals("‘가을 하늘’을 기록했어요.", UploadSuccessText.title("가을 하늘"))
        // The copy table still carries the template this sentence is built from.
        assertEquals("‘{주제}’{을/를} 기록했어요.", Copy["upload.success.title"])
    }

    @Test
    fun `TC-UPL-085 PENDING and VALIDATING pick their own status sentence`() {
        assertEquals(UploadCopyKeys.SUCCESS_PENDING, UploadSuccessText.statusCopyKey(ModerationStatus.PENDING))
        assertEquals(UploadCopyKeys.SUCCESS_VALIDATING, UploadSuccessText.statusCopyKey(ModerationStatus.VALIDATING))
        assertEquals(UploadCopyKeys.SUCCESS_VALIDATING, UploadSuccessText.statusCopyKey(ModerationStatus.APPROVED), "anything but PENDING")
        assertEquals("확인했어요.", Copy["upload.success.confirm"])
    }
}
