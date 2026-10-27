package kr.chalkak.feature.display

import kr.chalkak.core.common.TopicDateRange
import java.time.LocalDate
import java.time.YearMonth

/** Wheel options of the "날짜 선택" sheet (REQ-DISP-007..009). All results are inside [TopicDateRange]. */
object DatePickerOptions {
    /** First year .. last year of the range. */
    fun years(range: TopicDateRange): List<Int> = (range.earliest.year..range.latest.year).toList()

    /** First year: from the earliest month; last year: up to the latest month; other years 1..12. */
    fun months(year: Int, range: TopicDateRange): List<Int> {
        val first = if (year == range.earliest.year) range.earliest.monthValue else 1
        val last = if (year == range.latest.year) range.latest.monthValue else 12
        return (first..last).toList()
    }

    /** First month: from the earliest day; last month: up to the latest day; others up to the month's last day. */
    fun days(year: Int, month: Int, range: TopicDateRange): List<Int> {
        val first = if (isSameMonth(year, month, range.earliest)) range.earliest.dayOfMonth else 1
        val last = if (isSameMonth(year, month, range.latest)) range.latest.dayOfMonth else YearMonth.of(year, month).lengthOfMonth()
        return (first..last).toList()
    }

    /** Day not in the month -> last day of that month; outside the range -> nearest end. */
    fun pick(year: Int, month: Int, day: Int, range: TopicDateRange): LocalDate = range.pick(year, month, day)

    private fun isSameMonth(year: Int, month: Int, date: LocalDate) = date.year == year && date.monthValue == month
}

/** Header collapse progress while scrolling (TC-DISP-058). */
object HeaderCollapse {
    /** `scrollOffsetPx / collapseRangePx` clamped to 0..1; a non-positive range means fully expanded (0). */
    fun progress(scrollOffsetPx: Float, collapseRangePx: Float): Float =
        if (collapseRangePx <= 0f) 0f else (scrollOffsetPx / collapseRangePx).coerceIn(0f, 1f)
}

/** Pure 2-D vector in px, origin = center of the photo view. */
data class Vec(val x: Float, val y: Float)

/** Pinch-zoom math of the feed photo (TC-FEED-046..048). */
object PhotoZoom {
    const val MIN_SCALE = 1f
    const val MAX_SCALE = 4f

    /** Clamped to `[MIN_SCALE, MAX_SCALE]`. */
    fun clampScale(scale: Float): Float = scale.coerceIn(MIN_SCALE, MAX_SCALE)

    /** Pan is limited so the scaled image keeps covering the view: `|offset| <= viewSize * (scale - 1) / 2` per axis. */
    fun clampOffset(offset: Vec, scale: Float, viewSize: Vec): Vec {
        val factor = (clampScale(scale) - 1f) / 2f
        val maxX = viewSize.x * factor
        val maxY = viewSize.y * factor
        return Vec(offset.x.coerceIn(-maxX, maxX), offset.y.coerceIn(-maxY, maxY))
    }

    /**
     * New pan offset after zooming from [oldScale] to [newScale] so the content point under [focal] stays under it
     * (screen = offset + content * scale), then clamped with [clampOffset] at the clamped new scale.
     */
    fun zoomAbout(focal: Vec, offset: Vec, oldScale: Float, newScale: Float, viewSize: Vec): Vec {
        val scale = clampScale(newScale)
        val contentX = (focal.x - offset.x) / oldScale
        val contentY = (focal.y - offset.y) / oldScale
        return clampOffset(Vec(focal.x - contentX * scale, focal.y - contentY * scale), scale, viewSize)
    }
}
