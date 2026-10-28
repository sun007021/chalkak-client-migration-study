package kr.chalkak.core.common

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.common.testing.withDevice
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/*
 * TIME catalog coverage at the :core:common layer.
 *
 * Covered here: TC-TIME-001..005, 007(range part), 008(range part), 009, 010(range part), 011, 012, 013,
 *   014, 015, 016, 022, 023, 024, 025, 026, 027 (see UploadAndSanityTest), 029, 030 (see UploadAndSanityTest).
 * Covered later in other modules (network/screen/state holders):
 *   TC-TIME-006 (:core:network, date query),
 *   TC-TIME-007 UI + TC-TIME-008 toast + TC-TIME-010 empty state (:feature:display),
 *   TC-TIME-017/018/019/020/021 (:feature:home, :feature:upload; server phase/topicDate is trusted),
 *   TC-TIME-028 (:core:network, 401 -> refresh recovery).
 */
class KstTimeTest {

    // ---- TC-TIME-001..004: KST today ----

    @Test
    fun `TC-TIME-001 UTC 15시는 KST 다음 날이다`() {
        val cal = KstCalendar(FakeClock().apply { set("2026-10-26T15:00:00Z") })
        assertEquals(LocalDate.of(2026, 10, 27), cal.today())
    }

    @Test
    fun `TC-TIME-002 UTC 14시 59분 59초는 KST 같은 날이다`() {
        val cal = KstCalendar(FakeClock().apply { set("2026-10-26T14:59:59Z") })
        assertEquals(LocalDate.of(2026, 10, 26), cal.today())
    }

    @Test
    fun `TC-TIME-001 FIXTURE_NOW는 KST 2026-10-27이다`() {
        assertEquals(LocalDate.of(2026, 10, 27), KstCalendar(FakeClock()).today())
    }

    @Test
    fun `TC-TIME-003 기기 시간대가 달라도 같은 순간의 KST 날짜는 같다`() {
        val zones = listOf("UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Seoul")
        val instants = listOf("2026-10-26T15:00:00Z", "2026-10-26T14:59:59Z", "2026-10-27T03:00:00Z", "2026-12-31T14:59:59Z")
        for (iso in instants) {
            val expected = withDevice("Asia/Seoul") { KstCalendar(FakeClock().apply { set(iso) }).today() }
            for (zone in zones) {
                val actual = withDevice(zone) { KstCalendar(FakeClock().apply { set(iso) }).today() }
                assertEquals(expected, actual, "zone=$zone instant=$iso")
            }
        }
        assertEquals(LocalDate.of(2026, 10, 27), withDevice("Pacific/Kiritimati") { Kst.dateOf(Instant.parse("2026-10-26T15:00:00Z")) })
        assertEquals(LocalDate.of(2026, 10, 26), withDevice("Pacific/Pago_Pago") { Kst.dateOf(Instant.parse("2026-10-26T14:59:59Z")) })
    }

    @Test
    fun `TC-TIME-004 서머타임 전환일에도 KST 규칙으로 계산한다`() {
        // US spring forward (2026-03-08) / fall back (2026-11-01), EU (2026-03-29 / 2026-10-25).
        val cases = listOf(
            Triple("America/New_York", "2026-03-08T07:00:00Z", LocalDate.of(2026, 3, 8)),
            Triple("America/New_York", "2026-11-01T05:59:59Z", LocalDate.of(2026, 11, 1)),
            Triple("Europe/London", "2026-03-29T01:00:00Z", LocalDate.of(2026, 3, 29)),
            Triple("Europe/London", "2026-10-25T00:59:59Z", LocalDate.of(2026, 10, 25)),
        )
        for ((zone, iso, expected) in cases) {
            val actual = withDevice(zone) { KstCalendar(FakeClock().apply { set(iso) }).today() }
            assertEquals(expected, actual, "zone=$zone instant=$iso")
        }
    }

    @Test
    fun `TC-TIME-001 서비스 시간대는 Asia Seoul UTC+9이다`() {
        assertEquals("Asia/Seoul", Kst.zone.id)
        assertEquals(9 * 3600, Kst.zone.rules.getOffset(Instant.parse("2026-07-01T00:00:00Z")).totalSeconds)
    }

    // ---- TC-TIME-005: ASCII Gregorian date strings ----

    @Test
    fun `TC-TIME-005 아랍어 태국어 페르시아어 로캘에서도 ASCII 그레고리력 날짜 문자열이다`() {
        val date = LocalDate.of(2026, 10, 27)
        for (tag in listOf("ar-SA", "ar-EG", "th-TH", "fa-IR", "th-TH-u-nu-thai", "ar-u-nu-arab")) {
            withDevice(languageTag = tag) {
                assertEquals("2026-10-27", Kst.formatApiDate(date), "locale=$tag")
                assertEquals("chalkak-calendar-2026-10.png", DateFormats.calendarFileName(YearMonth.of(2026, 10)), "locale=$tag")
                assertEquals("10월 27일의 주제", DateFormats.topicLabel(date), "locale=$tag")
                assertEquals("10월 27일", DateFormats.monthDay(date), "locale=$tag")
                assertEquals("10월 27일 00:00", DateFormats.notificationTime(Instant.parse("2026-10-26T15:00:00Z")), "locale=$tag")
            }
        }
    }

    @Test
    fun `TC-TIME-005 API 날짜 문자열은 yyyy-MM-dd로 왕복되고 잘못된 문자열은 null이다`() {
        assertEquals(LocalDate.of(2026, 9, 17), Kst.parseApiDate("2026-09-17"))
        assertEquals("2026-01-05", Kst.formatApiDate(LocalDate.of(2026, 1, 5)))
        for (bad in listOf("", "2026-9-17", "2026/09/17", "2026-02-30", "20260917", " 2026-09-17")) {
            assertNull(Kst.parseApiDate(bad), "input='$bad'")
        }
    }

    // ---- TC-TIME-007 / 009 / 010 / 008: date range ----

    private val today = LocalDate.of(2026, 10, 27)
    private val range = TopicDateRange.forToday(today)

    @Test
    fun `TC-TIME-007 오늘 다음 날은 선택할 수 없다`() {
        assertNull(range.next(today))
        assertFalse(range.contains(today.plusDays(1)))
        assertEquals(today, range.clamp(today.plusDays(1)))
        assertEquals(LocalDate.of(2026, 10, 27), range.next(LocalDate.of(2026, 10, 26)))
    }

    @Test
    fun `TC-TIME-008 기기 시계가 1시간 빠르면 KST 자정 직전에도 미래 날짜로 못 넘어간다`() {
        // Device is 1h fast: real KST 2026-10-27 23:30 shows as 2026-10-28 00:30, so today() already says 10-28.
        // The range built from the real (server) today must never allow a request for that day.
        val serverToday = LocalDate.of(2026, 10, 27)
        val fastDeviceToday = KstCalendar(FakeClock().apply { set("2026-10-27T15:30:00Z") }).today()
        assertEquals(LocalDate.of(2026, 10, 28), fastDeviceToday)
        val serverRange = TopicDateRange.forToday(serverToday)
        assertNull(serverRange.next(serverToday))
        assertEquals(serverToday, serverRange.clamp(fastDeviceToday))
    }

    @Test
    fun `TC-TIME-009 FIRST_TOPIC_DATE 2026-09-17은 이동 가능하고 2026-09-16은 막힌다`() {
        val first = LocalDate.of(2026, 9, 17)
        assertEquals(first, range.earliest)
        assertTrue(range.contains(first))
        assertFalse(range.contains(first.minusDays(1)))
        assertEquals(first, range.previous(LocalDate.of(2026, 9, 18)))
        assertNull(range.previous(first))
        assertEquals(first, range.clamp(LocalDate.of(2026, 9, 16)))
    }

    @Test
    fun `TC-TIME-010 하한과 상한 사이 모든 날짜는 선택 가능하다`() {
        assertTrue(range.contains(LocalDate.of(2026, 10, 1)))
        assertTrue(range.contains(today))
        assertEquals(LocalDate.of(2026, 10, 26), range.previous(today))
    }

    @Test
    fun `TC-TIME-009 오늘이 FIRST_TOPIC_DATE보다 이르면 범위는 FIRST_TOPIC_DATE 하나로 수렴한다`() {
        val r = TopicDateRange.forToday(LocalDate.of(2026, 9, 10))
        assertEquals(AppConstants.FIRST_TOPIC_DATE, r.clamp(LocalDate.of(2026, 9, 10)))
    }

    @Test
    fun `TC-TIME-009 하한이 상한보다 늦은 범위는 만들 수 없다`() {
        assertFailsWith<IllegalArgumentException> { TopicDateRange(LocalDate.of(2026, 10, 2), LocalDate.of(2026, 10, 1)) }
    }

    // ---- TC-TIME-011: month-end clamping ----

    @Test
    fun `TC-TIME-011 31일을 30일 달로 옮기면 말일로 보정한다`() {
        assertEquals(LocalDate.of(2026, 9, 30), clampDayOfMonth(2026, 9, 31))
        assertEquals(LocalDate.of(2026, 11, 30), clampDayOfMonth(2026, 11, 31))
        assertEquals(LocalDate.of(2026, 10, 31), clampDayOfMonth(2026, 10, 31))
    }

    @Test
    fun `TC-TIME-011 윤년 2028-02-29는 유효하고 2027-02-29는 02-28로 보정한다`() {
        assertEquals(LocalDate.of(2028, 2, 29), clampDayOfMonth(2028, 2, 29))
        assertEquals(LocalDate.of(2027, 2, 28), clampDayOfMonth(2027, 2, 29))
        assertEquals(LocalDate.of(2028, 2, 29), clampDayOfMonth(2028, 2, 31))
        assertEquals(LocalDate.of(2100, 2, 28), clampDayOfMonth(2100, 2, 29)) // century non-leap
        assertEquals(LocalDate.of(2000, 2, 29), clampDayOfMonth(2000, 2, 29)) // 400-year leap
    }

    @Test
    fun `TC-TIME-011 피커 선택은 말일 보정 뒤 범위로 한 번 더 보정된다`() {
        val r = TopicDateRange.forToday(LocalDate.of(2026, 10, 27))
        assertEquals(LocalDate.of(2026, 10, 27), r.pick(2026, 10, 31)) // clamp to today
        assertEquals(LocalDate.of(2026, 9, 30), r.pick(2026, 9, 31))
        assertEquals(LocalDate.of(2026, 9, 17), r.pick(2026, 9, 1)) // clamp to FIRST_TOPIC_DATE
    }

    // ---- TC-TIME-012 / 013: Sunday-start weeks ----

    @Test
    fun `TC-TIME-012 2026-10-25 일요일부터 10-31 토요일까지가 한 주다`() {
        val week = WeekCalendar.weekOf(LocalDate.of(2026, 10, 27))
        assertEquals(LocalDate.of(2026, 10, 25), week.start)
        assertEquals(LocalDate.of(2026, 10, 31), week.end)
        assertEquals(7, week.days.size)
        assertEquals(listOf(YearMonth.of(2026, 10)), week.months)
    }

    @Test
    fun `TC-TIME-012 일요일 당일과 토요일 당일은 같은 주에 속한다`() {
        val sunday = LocalDate.of(2026, 10, 25)
        val saturday = LocalDate.of(2026, 10, 31)
        assertEquals(WeekCalendar.weekOf(sunday), WeekCalendar.weekOf(saturday))
        assertEquals(sunday, WeekCalendar.weekOf(sunday).start)
        assertEquals(saturday, WeekCalendar.weekOf(saturday).end)
    }

    @Test
    fun `TC-TIME-012 연말 경계 주는 두 해에 걸치고 두 달 모두 요청 대상이다`() {
        val week = WeekCalendar.weekOf(LocalDate.of(2026, 12, 30))
        assertEquals(LocalDate.of(2026, 12, 27), week.start)
        assertEquals(LocalDate.of(2027, 1, 2), week.end)
        assertEquals(listOf(YearMonth.of(2026, 12), YearMonth.of(2027, 1)), week.months)
    }

    @Test
    fun `TC-TIME-012 fixture calendar cross-year 의 모든 케이스와 일치한다`() {
        val cases = Fixtures.json("time/calendar__cross-year.json").jsonObject.getValue("cases").jsonArray
        assertTrue(cases.isNotEmpty())
        for (case in cases) {
            val obj = case.jsonObject
            val clockAt = Instant.parse(obj.getValue("clock").jsonPrimitive.content)
            val week = WeekCalendar.weekOf(KstCalendar(FakeClock(clockAt)).today())
            assertEquals(LocalDate.parse(obj.getValue("weekStart").jsonPrimitive.content), week.start)
            assertEquals(LocalDate.parse(obj.getValue("weekEnd").jsonPrimitive.content), week.end)
            assertEquals(requestedMonths(obj.getValue("requests").jsonArray), week.months)
        }
    }

    @Test
    fun `TC-TIME-013 fixture calendar cross-month 월 경계 주의 요일 배치와 요청 월이 일치한다`() {
        val obj = Fixtures.json("time/calendar__cross-month.json").jsonObject
        val today = KstCalendar(FakeClock(Instant.parse(obj.getValue("clock").jsonPrimitive.content))).today()
        val week = WeekCalendar.weekOf(today)
        assertEquals(LocalDate.parse(obj.getValue("weekStart").jsonPrimitive.content), week.start)
        assertEquals(LocalDate.parse(obj.getValue("weekEnd").jsonPrimitive.content), week.end)
        assertEquals(requestedMonths(obj.getValue("requests").jsonArray), week.months)

        val expected = obj.getValue("expectedWeek").jsonArray.map { it.jsonObject }
        assertEquals(expected.map { LocalDate.parse(it.getValue("date").jsonPrimitive.content) }, week.days)
        val dows = listOf("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")
        assertEquals(dows, expected.map { it.getValue("dow").jsonPrimitive.content })
        assertEquals(dows, week.days.map { it.dayOfWeek.name.take(3) })
    }

    @Test
    fun `TC-TIME-012 요일 머리글은 일월화수목금토 순서다`() {
        assertEquals(listOf("일", "월", "화", "수", "목", "금", "토"), WeekCalendar.weekdayHeaders)
    }

    private fun requestedMonths(requests: JsonArray): List<YearMonth> = requests.map {
        val o: JsonObject = it.jsonObject
        YearMonth.of(o.getValue("year").jsonPrimitive.int, o.getValue("month").jsonPrimitive.int)
    }

    // ---- TC-TIME-014 / 015: midnight ----

    @Test
    fun `TC-TIME-014 KST 23시 59분 59초에서 00시 00분 00초를 넘으면 날짜가 바뀐 것으로 판정한다`() {
        val clock = FakeClock().apply { set("2026-10-27T14:59:59Z") } // KST 23:59:59
        val cal = KstCalendar(clock)
        val shown = cal.today()
        assertEquals(LocalDate.of(2026, 10, 27), shown)
        assertFalse(cal.hasDateChangedSince(shown))
        clock.set("2026-10-27T15:00:00Z") // KST 00:00:00
        assertTrue(cal.hasDateChangedSince(shown))
        assertEquals(LocalDate.of(2026, 10, 28), cal.today())
    }

    @Test
    fun `TC-TIME-015 백그라운드에서 며칠이 지난 뒤 복귀해도 날짜 변경으로 판정한다`() {
        val clock = FakeClock()
        val cal = KstCalendar(clock)
        val shown = cal.today()
        clock.advance(java.time.Duration.ofHours(30))
        assertTrue(cal.hasDateChangedSince(shown))
        assertFalse(cal.hasDateChangedSince(cal.today()))
    }

    // ---- TC-TIME-016: current month (D-19) ----

    @Test
    fun `TC-TIME-016 10월 31일 23시 59분 KST까지는 10월이고 11월 1일 00시부터 11월이다`() {
        val clock = FakeClock().apply { set("2026-10-31T14:59:00Z") }
        val cal = KstCalendar(clock)
        assertEquals(YearMonth.of(2026, 10), cal.currentMonth())
        clock.set("2026-10-31T15:00:00Z")
        assertEquals(YearMonth.of(2026, 11), cal.currentMonth()) // recomputed, not cached (D-19)
    }

    @Test
    fun `TC-TIME-016 월 목록에 현재 달이 없어도 선택지에 넣는다`() {
        val raw = Fixtures.json("time/calendar__months-without-current.json").jsonObject.getValue("months").jsonArray
        val server = requestedMonths(raw)
        assertEquals(listOf(YearMonth.of(2026, 10), YearMonth.of(2026, 9)), server)

        val novemberCal = KstCalendar(FakeClock().apply { set("2026-10-31T15:00:00Z") })
        assertEquals(
            listOf(YearMonth.of(2026, 11), YearMonth.of(2026, 10), YearMonth.of(2026, 9)),
            novemberCal.selectableMonths(server),
        )
    }

    @Test
    fun `TC-TIME-016 현재 달이 이미 있으면 중복하지 않고 최신순으로 정렬한다`() {
        val cal = KstCalendar(FakeClock()) // Oct 2026
        val result = cal.selectableMonths(listOf(YearMonth.of(2026, 9), YearMonth.of(2026, 10), YearMonth.of(2026, 9)))
        assertEquals(listOf(YearMonth.of(2026, 10), YearMonth.of(2026, 9)), result)
        assertEquals(listOf(YearMonth.of(2026, 10)), cal.selectableMonths(emptyList()))
    }

    // ---- TC-TIME-022: title edit predicate (D-23) ----

    @Test
    fun `TC-TIME-022 topicDate가 KST 오늘일 때만 제목 수정이 허용된다`() {
        val cal = KstCalendar(FakeClock()) // 2026-10-27
        assertTrue(cal.isTitleEditAllowed(LocalDate.of(2026, 10, 27)))
        assertFalse(cal.isTitleEditAllowed(LocalDate.of(2026, 10, 26)))
        assertFalse(cal.isTitleEditAllowed(LocalDate.of(2026, 10, 28)))
    }

    @Test
    fun `TC-TIME-022 자정 직전에는 허용되고 자정 직후에는 같은 게시물이라도 막힌다`() {
        val clock = FakeClock().apply { set("2026-10-27T14:59:59Z") }
        val cal = KstCalendar(clock)
        val topicDate = LocalDate.of(2026, 10, 27)
        assertTrue(cal.isTitleEditAllowed(topicDate))
        clock.set("2026-10-27T15:00:00Z")
        assertFalse(cal.isTitleEditAllowed(topicDate))
    }

    // ---- TC-TIME-023 / 024: labels ----

    @Test
    fun `TC-TIME-023 월 일에 0 패딩이 없다`() {
        assertEquals("1월 5일의 주제", DateFormats.topicLabel(LocalDate.of(2027, 1, 5)))
        assertEquals("12월 31일의 주제", DateFormats.topicLabel(LocalDate.of(2026, 12, 31)))
        assertEquals("1월 5일 · 오늘의 주제", DateFormats.todayTopicLabel(LocalDate.of(2027, 1, 5)))
        assertEquals("12월 31일 · 오늘의 주제", DateFormats.todayTopicLabel(LocalDate.of(2026, 12, 31)))
        assertEquals("10월 20일의 주제", DateFormats.topicLabel(LocalDate.of(2026, 10, 20)))
    }

    @Test
    fun `TC-TIME-024 알림 시각은 KST 24시간제 M월 d일 HH mm 이고 연도가 없다`() {
        assertEquals("10월 27일 00:00", DateFormats.notificationTime(Instant.parse("2026-10-26T15:00:00Z")))
        assertEquals("10월 26일 23:59", DateFormats.notificationTime(Instant.parse("2026-10-26T14:59:59Z")))
        assertEquals("10월 27일 00:00", DateFormats.notificationTime(Instant.parse("2026-10-26T15:00:00.123Z")))
        assertEquals("10월 27일 14:05", DateFormats.notificationTime(Instant.parse("2026-10-27T05:05:00Z")))
        assertEquals("1월 5일 09:03", DateFormats.notificationTime(Instant.parse("2027-01-05T00:03:00Z")))
    }

    @Test
    fun `TC-TIME-024 기기 시간대와 로캘이 달라도 알림 시각 문자열이 같다`() {
        val instant = Instant.parse("2026-10-26T15:00:00Z")
        for (zone in listOf("UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago")) {
            for (tag in listOf("en-US", "ar-SA", "th-TH")) {
                withDevice(zone, tag) {
                    assertEquals("10월 27일 00:00", DateFormats.notificationTime(instant), "zone=$zone locale=$tag")
                }
            }
        }
    }

    @Test
    fun `TC-TIME-024 fixture notifications kst-boundary 의 createdAt이 경계에서 맞게 표시된다`() {
        val list = Fixtures.json("notification/notifications__kst-boundary.json").jsonObject.getValue("notifications").jsonArray
        val shown = list.map { DateFormats.notificationTime(requireNotNull(InstantParser.parse(it.jsonObject.getValue("createdAt").jsonPrimitive.content))) }
        assertEquals(listOf("10월 27일 00:00", "10월 26일 23:59", "10월 27일 00:00"), shown)
    }

    // ---- TC-TIME-025 / 026: Instant parsing ----

    @Test
    fun `TC-TIME-025 Z와 +00 00 그리고 소수초 0 3 6 9자리가 모두 같은 순간이다`() {
        val obj = Fixtures.json("time/instants__variants.json").jsonObject
        val expected = Instant.parse(obj.getValue("expectedInstant").jsonPrimitive.content)
        assertEquals(1793070000000L, obj.getValue("expectedEpochMillis").jsonPrimitive.content.toLong())
        assertEquals(expected.toEpochMilli(), 1793070000000L)
        val cases = obj.getValue("cases").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(5, cases.size)
        for (text in cases) {
            assertEquals(expected, InstantParser.parse(text), "input=$text")
        }
    }

    @Test
    fun `TC-TIME-025 소수초 값은 보존되고 오프셋은 UTC로 환산된다`() {
        assertEquals(Instant.parse("2026-10-27T03:00:00.123Z"), InstantParser.parse("2026-10-27T03:00:00.123Z"))
        assertEquals(Instant.parse("2026-10-27T03:00:00.123456789Z"), InstantParser.parse("2026-10-27T03:00:00.123456789+00:00"))
        assertEquals(Instant.parse("2026-10-27T03:00:00Z"), InstantParser.parse("2026-10-27T12:00:00+09:00"))
    }

    @Test
    fun `TC-TIME-026 파싱할 수 없는 시각 문자열은 크래시 없이 null이다`() {
        val cases = Fixtures.json("time/instants__invalid.json").jsonObject.getValue("cases").jsonArray.map { it.jsonPrimitive.content }
        assertTrue(cases.isNotEmpty())
        for (text in cases) {
            assertNull(InstantParser.parse(text), "input='$text'")
        }
        assertNotNull(InstantParser.parse("2026-10-27T03:00:00Z"))
    }
}
