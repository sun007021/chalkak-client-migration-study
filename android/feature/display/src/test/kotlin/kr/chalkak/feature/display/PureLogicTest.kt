package kr.chalkak.feature.display

import kr.chalkak.core.common.TopicDateRange
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Pure math of the exhibition screens: date picker options, header collapse and photo zoom. */
class PureLogicTest {
    private fun range(today: String) = TopicDateRange.forToday(LocalDate.parse(today))

    private fun close(expected: Float, actual: Float, message: String? = null) = assertEquals(expected, actual, 0.001f, message)

    // ---- date picker ----------------------------------------------------------------------------------------

    @Test
    fun `TC-DISP-036 the first year starts in September, the last year ends in today's month`() {
        val r = range("2027-03-15")
        assertEquals(listOf(2026, 2027), DatePickerOptions.years(r))
        assertEquals((9..12).toList(), DatePickerOptions.months(2026, r))
        assertEquals((1..3).toList(), DatePickerOptions.months(2027, r))
        val same = range("2026-10-27")
        assertEquals(listOf(2026), DatePickerOptions.years(same))
        assertEquals(listOf(9, 10), DatePickerOptions.months(2026, same))
    }

    @Test
    fun `TC-DISP-036 the first month starts on the 17th, the last month ends today, months between run to their last day`() {
        val r = range("2027-03-15")
        assertEquals((17..30).toList(), DatePickerOptions.days(2026, 9, r))
        assertEquals((1..31).toList(), DatePickerOptions.days(2026, 10, r))
        assertEquals((1..30).toList(), DatePickerOptions.days(2026, 11, r))
        assertEquals((1..31).toList(), DatePickerOptions.days(2027, 1, r))
        assertEquals((1..28).toList(), DatePickerOptions.days(2027, 2, r))
        assertEquals((1..15).toList(), DatePickerOptions.days(2027, 3, r))
        val same = range("2026-10-27")
        assertEquals((17..30).toList(), DatePickerOptions.days(2026, 9, same))
        assertEquals((1..27).toList(), DatePickerOptions.days(2026, 10, same))
    }

    @Test
    fun `TC-DISP-037 a day that does not exist in the month becomes its last day, leap years are respected`() {
        val r = range("2028-03-05")
        assertEquals(LocalDate.of(2026, 11, 30), DatePickerOptions.pick(2026, 11, 31, r))
        assertEquals(LocalDate.of(2027, 2, 28), DatePickerOptions.pick(2027, 2, 29, r))
        assertEquals(LocalDate.of(2028, 2, 29), DatePickerOptions.pick(2028, 2, 29, r))
        assertEquals(LocalDate.of(2027, 2, 28), DatePickerOptions.pick(2027, 2, 31, r))
    }

    @Test
    fun `TC-DISP-034 and TC-DISP-037 a picked day outside the range goes to the nearest end`() {
        val r = range("2028-03-05")
        assertEquals(LocalDate.of(2026, 9, 17), DatePickerOptions.pick(2026, 9, 1, r))
        assertEquals(LocalDate.of(2028, 3, 5), DatePickerOptions.pick(2028, 3, 31, r))
    }

    // ---- header collapse ----------------------------------------------------------------------------------------

    @Test
    fun `TC-DISP-058 the collapse progress is clamped to 0 and 1 and unfolds when scrolling up`() {
        close(0f, HeaderCollapse.progress(0f, 200f))
        close(0.5f, HeaderCollapse.progress(100f, 200f))
        close(1f, HeaderCollapse.progress(200f, 200f))
        close(1f, HeaderCollapse.progress(900f, 200f))
        close(0f, HeaderCollapse.progress(-40f, 200f))
        close(0f, HeaderCollapse.progress(100f, 0f)) // no collapse range: stays expanded
        assertTrue(HeaderCollapse.progress(60f, 200f) < HeaderCollapse.progress(120f, 200f))
        assertTrue(HeaderCollapse.progress(120f, 200f) > HeaderCollapse.progress(40f, 200f)) // scrolling back up
    }

    // ---- photo zoom -----------------------------------------------------------------------------------------------

    @Test
    fun `TC-FEED-046 the zoom factor stays between 1x and 4x`() {
        close(1f, PhotoZoom.clampScale(0.4f))
        close(1f, PhotoZoom.clampScale(1f))
        close(2.5f, PhotoZoom.clampScale(2.5f))
        close(4f, PhotoZoom.clampScale(4f))
        close(4f, PhotoZoom.clampScale(9f))
        close(1f, PhotoZoom.MIN_SCALE)
        close(4f, PhotoZoom.MAX_SCALE)
    }

    @Test
    fun `TC-FEED-047 the two-finger pan cannot leave the enlarged image`() {
        val view = Vec(1000f, 800f)
        assertEquals(Vec(500f, -400f), PhotoZoom.clampOffset(Vec(900f, -900f), 2f, view))
        assertEquals(Vec(-1500f, 1200f), PhotoZoom.clampOffset(Vec(-5000f, 5000f), 4f, view))
        assertEquals(Vec(120f, -30f), PhotoZoom.clampOffset(Vec(120f, -30f), 2f, view))
        assertEquals(Vec(0f, 0f), PhotoZoom.clampOffset(Vec(300f, 300f), 1f, view)) // not zoomed: no pan
    }

    @Test
    fun `TC-FEED-048 the point under the fingers does not move while zooming`() {
        val view = Vec(1000f, 800f)
        val focal = Vec(100f, -50f)
        val offset = PhotoZoom.zoomAbout(focal, Vec(0f, 0f), oldScale = 1f, newScale = 3f, viewSize = view)
        // the content point under the fingers before: (focal - 0) / 1; after: offset + point * 3 == focal
        val point = Vec(focal.x, focal.y)
        close(focal.x, offset.x + point.x * 3f)
        close(focal.y, offset.y + point.y * 3f)

        // zooming further from an already panned state keeps the same invariant
        val second = PhotoZoom.zoomAbout(Vec(-40f, 60f), offset, oldScale = 3f, newScale = 3.5f, viewSize = view)
        val p2 = Vec((-40f - offset.x) / 3f, (60f - offset.y) / 3f)
        close(-40f, second.x + p2.x * 3.5f)
        close(60f, second.y + p2.y * 3.5f)
    }

    @Test
    fun `TC-FEED-048 zooming past 4x uses 4x and the result still stays inside the image`() {
        val view = Vec(1000f, 800f)
        val offset = PhotoZoom.zoomAbout(Vec(480f, 380f), Vec(0f, 0f), oldScale = 1f, newScale = 9f, viewSize = view)
        val max = PhotoZoom.clampOffset(Vec(-99999f, -99999f), 4f, view)
        assertTrue(offset.x >= max.x && offset.y >= max.y)
        assertTrue(offset.x <= -max.x && offset.y <= -max.y)
    }
}
