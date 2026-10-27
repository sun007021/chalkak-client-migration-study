package kr.chalkak.core.common

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.FakeMonotonicClock
import java.io.File
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class UploadAndSanityTest {

    // ---- TC-TIME-027: upload URL expiry with 5s margin on a monotonic clock ----

    private val issuedAt = 1_000_000_000_000L

    @Test
    fun `TC-TIME-027 만료 5초 전 1밀리초 직전까지는 사용 가능하고 정각부터는 새로 발급한다`() {
        val mono = FakeMonotonicClock(issuedAt)
        val lease = UploadUrlLease(issuedAtNanos = issuedAt, expiresInSeconds = 300)
        assertTrue(lease.isUsable(mono)) // just issued
        mono.nanos = issuedAt + 294_999L * 1_000_000L
        assertTrue(lease.isUsable(mono), "295s - 1ms")
        mono.nanos = issuedAt + 295_000L * 1_000_000L
        assertFalse(lease.isUsable(mono), "295s exact (expires - 5s)")
        mono.nanos = issuedAt + 301_000L * 1_000_000L
        assertFalse(lease.isUsable(mono))
    }

    @Test
    fun `TC-TIME-027 기본 안전 마진은 AppConstants 5000ms이다`() {
        assertEquals(5_000L, AppConstants.UPLOAD_URL_SAFETY_MARGIN_MS)
        val mono = FakeMonotonicClock(issuedAt + 3_000L * 1_000_000L)
        // expiresIn=7s: 3s elapsed -> 4s left, below the 5s margin
        assertFalse(UploadUrlLease(issuedAt, expiresInSeconds = 7).isUsable(mono))
        assertTrue(UploadUrlLease(issuedAt, expiresInSeconds = 9).isUsable(mono))
    }

    @Test
    fun `TC-TIME-027 시스템 시각을 하루 앞뒤로 바꿔도 단조 시계만 보므로 판정이 변하지 않는다`() {
        val wall = FakeClock()
        val mono = FakeMonotonicClock(issuedAt)
        val lease = UploadUrlLease(issuedAt, expiresInSeconds = 300)
        wall.advance(Duration.ofDays(1))
        assertTrue(lease.isUsable(mono))
        wall.advance(Duration.ofDays(-2))
        assertTrue(lease.isUsable(mono))
        mono.advanceMillis(296_000)
        wall.set("2000-01-01T00:00:00Z")
        assertFalse(lease.isUsable(mono))
    }

    @Test
    fun `TC-TIME-027 사용 가능 여부는 마진 설정을 바꾸면 따라간다`() {
        val mono = FakeMonotonicClock(issuedAt + 100_000L * 1_000_000L)
        assertTrue(UploadUrlLease(issuedAt, 300, safetyMarginMs = 0).isUsable(mono))
        assertFalse(UploadUrlLease(issuedAt, 100, safetyMarginMs = 0).isUsable(mono)) // exactly expired
    }

    // ---- TC-TIME-029: static scan for direct clock calls ----

    private val forbidden = listOf(
        Regex("""System\.(currentTimeMillis|nanoTime)\s*\("""),
        Regex("""\b(Instant|LocalDate|LocalDateTime|LocalTime|ZonedDateTime|OffsetDateTime|YearMonth|Year|MonthDay)\.now\s*\("""),
        Regex("""\bjava\.time\.Clock\b"""),
        Regex("""\bClock\.system(UTC|DefaultZone)\b"""),
        Regex("""\bSystemClock\.(elapsedRealtime|uptimeMillis|currentThreadTimeMillis)\b"""),
        Regex("""\bCalendar\.getInstance\s*\("""),
        Regex("""\bDate\s*\(\s*\)"""),
        Regex("""\bTimeSource\.Monotonic\b"""),
        Regex("""\bMonotonic\.markNow\s*\("""),
    )

    /** Files that may touch the system clock: the production adapters only. */
    private val allowList = setOf("SystemClock.kt")

    private fun stripComments(src: String): String =
        src.replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "").replace(Regex("""//[^\n]*"""), "")

    private fun violations(fileName: String, source: String): List<String> {
        if (fileName in allowList) return emptyList()
        val code = stripComments(source)
        return forbidden.flatMap { re -> re.findAll(code).map { "$fileName: ${it.value}" }.toList() }
    }

    private fun mainSources(): List<File> {
        val root = File(requireNotNull(System.getProperty("android.dir")) { "android.dir system property missing" })
        return root.walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" }
            .filter { it.isFile && it.extension == "kt" && it.invariantSeparatorsPath.contains("/src/main/") }
            .toList()
    }

    @Test
    fun `TC-TIME-029 src main 어디에서도 시스템 시계를 직접 부르지 않는다`() {
        val files = mainSources()
        assertTrue(files.any { it.name == "Clock.kt" }, "scanner must see :core:common sources")
        val found = files.flatMap { violations(it.name, it.readText()) }
        assertEquals(emptyList(), found)
    }

    @Test
    fun `TC-TIME-029 허용 목록은 SystemClock kt 하나뿐이고 실제로 존재한다`() {
        assertEquals(setOf("SystemClock.kt"), allowList)
        assertTrue(mainSources().any { it.name == "SystemClock.kt" })
    }

    @Test
    fun `TC-TIME-029 검사기가 금지 호출을 실제로 잡아낸다`() {
        val bad = listOf(
            "val a = System.currentTimeMillis()",
            "val b = Instant.now()",
            "val c = LocalDate.now(zone)",
            "val d = System.nanoTime()",
            "val e = java.time.Clock.systemUTC()",
            "val f = Calendar.getInstance()",
            "val g = Date()",
            "val h = ZonedDateTime.now()",
        )
        for (line in bad) assertTrue(violations("Foo.kt", line).isNotEmpty(), line)
        assertTrue(violations("SystemClock.kt", bad.first()).isEmpty())
        assertTrue(violations("Foo.kt", "// Instant.now() in a comment\n/* System.nanoTime() */ val x = clock.now()").isEmpty())
    }

    // ---- TC-TIME-030: virtual time only ----

    @Test
    fun `TC-TIME-030 스플래시 토스트 폴링 재시도 만료 마진을 실제로 기다리지 않고 가상 시간으로 끝낸다`() {
        val startNanos = System.nanoTime()
        runTest {
            delay(AppConstants.SPLASH_PRELOAD_MAX_MS)
            assertEquals(700, currentTime)
            delay(AppConstants.TOAST_DURATION_MS)
            assertEquals(3_200, currentTime)
            repeat((AppConstants.AI_REVIEW_POLL_WINDOW_MS / AppConstants.AI_REVIEW_POLL_INTERVAL_MS).toInt()) {
                delay(AppConstants.AI_REVIEW_POLL_INTERVAL_MS)
            }
            assertEquals(3_200 + 300_000, currentTime)
            repeat(AppConstants.SIGNUP_PENDING_RETRY_MAX) { delay(AppConstants.SIGNUP_PENDING_RETRY_INTERVAL_MS) }
            delay(AppConstants.UPLOAD_URL_SAFETY_MARGIN_MS)
            assertEquals(3_200 + 300_000 + 10_000 + 5_000, currentTime)
        }
        val realMs = (System.nanoTime() - startNanos) / 1_000_000
        assertTrue(realMs < 5_000, "virtual delays must not take real time (took ${realMs}ms)")
    }

    @Test
    fun `TC-TIME-030 FakeClock은 advance로만 움직이고 실제 시간이 흘러도 변하지 않는다`() {
        val clock = FakeClock()
        val before = clock.now()
        Thread.sleep(20)
        assertEquals(before, clock.now())
        clock.advance(Duration.ofMillis(AppConstants.TOAST_DURATION_MS))
        assertEquals(before.plusMillis(2_500), clock.now())
    }
}
