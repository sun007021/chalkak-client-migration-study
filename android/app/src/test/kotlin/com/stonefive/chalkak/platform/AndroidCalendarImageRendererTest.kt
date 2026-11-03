package com.stonefive.chalkak.platform

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.stonefive.chalkak.testing.loadCopy
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.RecordPostStatus
import kr.chalkak.feature.record.RecordCell
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AndroidCalendarImageRendererTest {
    private val month = YearMonth.of(2026, 10)

    /** 2026-10: Thursday the 1st -> 4 blanks, 31 days, 5 weeks of 7 cells. */
    private fun cells(withPosts: Set<Int>): List<RecordCell> {
        val blanks = List(4) { RecordCell(null, null) }
        val days = (1..31).map { d ->
            val date = LocalDate.of(2026, 10, d)
            RecordCell(date, if (d in withPosts) RecordPost(date, "post-$d", "https://img.test/$d.webp", RecordPostStatus.APPROVED) else null)
        }
        return (blanks + days).let { it + List(35 - it.size) { RecordCell(null, null) } }
    }

    private fun decode(png: ByteArray): Bitmap = assertNotNull(BitmapFactory.decodeByteArray(png, 0, png.size))

    @Test
    fun `TC-REC-038 달력 PNG는 시그니처와 7열 x 주 수 크기를 가진다`() = runTest {
        val renderer = AndroidCalendarImageRenderer(loadCopy()) { Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) } }
        val png = renderer.render(month, cells(setOf(1, 15)))
        assertContentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A), png.copyOfRange(0, 8))
        val bitmap = decode(png)
        assertEquals(7 * 160, bitmap.width)
        assertEquals(140 + 70 + 5 * 160, bitmap.height)
    }

    @Test
    fun `TC-REC-038 썸네일 로드 실패나 시간 초과는 그 칸만 비우고 PNG는 만들어진다`() = runTest {
        val never = CompletableDeferred<Bitmap?>()
        val renderer = AndroidCalendarImageRenderer(loadCopy()) { url ->
            when {
                url.endsWith("/1.webp") -> error("boom")
                url.endsWith("/2.webp") -> never.await()
                else -> Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
            }
        }
        val deferred = async { renderer.render(month, cells(setOf(1, 2, 3))) }
        advanceTimeBy(9_000)
        val bitmap = decode(deferred.await())
        assertEquals(7 * 160, bitmap.width)
    }
}
