package com.stonefive.chalkak.platform

import kr.chalkak.feature.upload.edit.PhotoFilter
import org.junit.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertSame

class FilterColorMatricesTest {
    @Test
    fun `TC-EDIT-039 원본 필터는 행렬을 적용하지 않는다`() {
        assertNull(FilterColorMatrices.of(PhotoFilter.ORIGINAL))
    }

    @Test
    fun `TC-EDIT-039 다섯 필터의 4x5 행렬 20개 값이 공통 행렬과 같다`() {
        PhotoFilter.entries.filter { it != PhotoFilter.ORIGINAL }.forEach { filter ->
            val expected = assertNotNull(filter.matrix, "$filter has a shared matrix")
            val actual = assertNotNull(FilterColorMatrices.of(filter), "$filter has an adapter matrix")
            assertEquals(20, actual.size)
            assertContentEquals(expected.map { it.toFloat() }.toFloatArray(), actual, "$filter")
        }
    }

    @Test
    fun `TC-EDIT-039 흑백과 선명하게의 대표 값을 명세 표와 대조한다`() {
        val mono = assertNotNull(FilterColorMatrices.of(PhotoFilter.MONO))
        assertEquals(0.299f, mono[0])
        assertEquals(0.587f, mono[1])
        assertEquals(0.114f, mono[2])
        assertEquals(1f, mono[18])
        val vivid = assertNotNull(FilterColorMatrices.of(PhotoFilter.VIVID))
        assertEquals(1.2754f, vivid[0])
        assertEquals(-0.0746f, vivid[5])
        assertEquals(1.3248f, vivid[12])
    }

    @Test
    fun `TC-EDIT-039 행렬은 한 번만 만들어 캐시하므로 같은 필터는 같은 배열을 돌려준다`() {
        PhotoFilter.entries.filter { it != PhotoFilter.ORIGINAL }.forEach { filter ->
            val first = assertNotNull(FilterColorMatrices.of(filter), "$filter")
            assertSame(first, FilterColorMatrices.of(filter), "$filter")
        }
    }
}
