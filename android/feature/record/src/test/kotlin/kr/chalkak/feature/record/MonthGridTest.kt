package kr.chalkak.feature.record

import kr.chalkak.core.common.WeekCalendar
import kr.chalkak.core.common.testing.Copy
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MonthGridTest {
    private data class Expect(val month: YearMonth, val rows: Int, val offset: Int, val days: Int)

    @Test
    fun `TC-REC-010 rows, first-day offset and last day for 4-5-6 week months and a leap February`() {
        val cases = listOf(
            Expect(YearMonth.of(2026, 2), rows = 4, offset = 0, days = 28),
            Expect(YearMonth.of(2026, 10), rows = 5, offset = 4, days = 31),
            Expect(YearMonth.of(2026, 5), rows = 6, offset = 5, days = 31),
            Expect(YearMonth.of(2026, 11), rows = 5, offset = 0, days = 30),
            Expect(YearMonth.of(2027, 1), rows = 6, offset = 5, days = 31),
            Expect(YearMonth.of(2028, 2), rows = 5, offset = 2, days = 29),
        )
        for (c in cases) {
            val grid = monthGrid(c.month)
            assertEquals(c.rows, grid.rows, "${c.month} rows")
            assertEquals(c.offset, grid.leadingBlanks, "${c.month} offset")
            assertEquals(c.month.atEndOfMonth(), grid.lastDay, "${c.month} last day")
            assertEquals(c.days, grid.cells.count { it != null }, "${c.month} day count")
        }
    }

    @Test
    fun `TC-REC-010 only the month's own days are filled, in order, and blanks are null`() {
        val grid = monthGrid(YearMonth.of(2026, 10))
        assertEquals(0, grid.cells.size % 7)
        val days = grid.cells.filterNotNull()
        assertEquals((1..31).map { LocalDate.of(2026, 10, it) }, days)
        // Blanks only before the 1st and after the 31st.
        assertTrue(grid.cells.take(4).all { it == null })
        assertTrue(grid.cells.drop(4 + 31).all { it == null })
        assertEquals(LocalDate.of(2026, 10, 1), grid.cells[4])
        assertNull(grid.cells[0])
    }

    @Test
    fun `TC-REC-009 the header is the Sunday-first string from copy and the grid is 7 columns wide`() {
        assertEquals("일월화수목금토", Copy["record.weekday"])
        assertEquals(Copy["record.weekday"], WeekCalendar.weekdayHeaders.joinToString(""))
        // A Sunday-first grid puts a Sunday in column 0: 2026-11-01 is a Sunday.
        assertEquals(LocalDate.of(2026, 11, 1), monthGrid(YearMonth.of(2026, 11)).cells[0])
    }
}
