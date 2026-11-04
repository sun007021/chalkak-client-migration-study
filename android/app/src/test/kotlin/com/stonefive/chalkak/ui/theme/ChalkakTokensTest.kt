package com.stonefive.chalkak.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test
import java.io.File
import kotlin.test.assertEquals

/** The theme must hold exactly the values of `shared/design/tokens.json` (docs/design/README.md section 2). */
class ChalkakTokensTest {
    private val tokens: JsonObject = Json.parseToJsonElement(
        File(System.getProperty("shared.dir"), "design/tokens.json").readText(),
    ).jsonObject

    private fun parseColor(text: String): Color {
        if (text.startsWith("#")) return Color(0xFF000000L or text.removePrefix("#").toLong(16))
        val parts = text.removePrefix("rgba(").removeSuffix(")").split(",").map { it.trim() }
        return Color(parts[0].toInt(), parts[1].toInt(), parts[2].toInt(), (parts[3].toFloat() * 255).let { Math.round(it) })
    }

    @Test
    fun `colors equal tokens json`() {
        val colors = ChalkakColors()
        val expected = mapOf(
            "background" to colors.background, "surface" to colors.surface, "surfaceElevated" to colors.surfaceElevated,
            "inputBackground" to colors.inputBackground, "bottomBar" to colors.bottomBar, "textPrimary" to colors.textPrimary,
            "textSecondary" to colors.textSecondary, "textMuted" to colors.textMuted, "textInactive" to colors.textInactive,
            "textNeutral" to colors.textNeutral, "textOnImage" to colors.textOnImage, "border" to colors.border,
            "divider" to colors.divider, "inputCursor" to colors.inputCursor, "accent" to colors.accent,
            "actionPrimary" to colors.actionPrimary, "onActionPrimary" to colors.onActionPrimary,
            "actionSecondary" to colors.actionSecondary, "onActionSecondary" to colors.onActionSecondary,
            "photoActionText" to colors.photoActionText, "iconPrimary" to colors.iconPrimary, "iconSecondary" to colors.iconSecondary,
            "scrim" to colors.scrim, "error" to colors.error, "destructive" to colors.destructive,
            "calendarCell" to colors.calendarCell, "calendarCellBorder" to colors.calendarCellBorder,
            "calendarSelection" to colors.calendarSelection, "skeletonBase" to colors.skeletonBase,
            "skeletonHighlight" to colors.skeletonHighlight, "logoBackground" to colors.logoBackground,
            "editorBackground" to colors.photoEditBackground, "editorContent" to colors.photoEditContent,
            "editorContentMuted" to colors.photoEditContentMuted, "editorScrim" to colors.photoEditScrim,
        )
        val json = tokens["color"]!!.jsonObject
        assertEquals(json.keys, expected.keys, "every color token is in the theme and the theme has no extra token")
        expected.forEach { (name, actual) ->
            assertEquals(parseColor(json[name]!!.jsonPrimitive.content).toArgb(), actual.toArgb(), "color.$name")
        }
    }

    @Test
    fun `spacing and radius equal tokens json`() {
        val spacing = ChalkakSpacing()
        val expectedSpacing = mapOf(
            "none" to spacing.none, "xs" to spacing.xs, "sm" to spacing.sm, "md" to spacing.md, "lg" to spacing.lg,
            "xl" to spacing.xl, "xxl" to spacing.xxl, "screenHorizontal" to spacing.screenHorizontal,
        )
        val spacingJson = tokens["spacing"]!!.jsonObject
        assertEquals(spacingJson.keys, expectedSpacing.keys)
        expectedSpacing.forEach { (name, dp) -> assertEquals(spacingJson[name]!!.jsonPrimitive.int.toFloat(), dp.value, "spacing.$name") }

        val expectedRadius = mapOf(
            "small" to ChalkakRadius.small, "button" to ChalkakRadius.button, "input" to ChalkakRadius.input,
            "photoCard" to ChalkakRadius.photoCard, "large" to ChalkakRadius.large, "xlarge" to ChalkakRadius.xlarge,
            "sheet" to ChalkakRadius.sheet,
        )
        val radiusJson = tokens["radius"]!!.jsonObject
        assertEquals(radiusJson.keys - "pill", expectedRadius.keys)
        expectedRadius.forEach { (name, dp) -> assertEquals(radiusJson[name]!!.jsonPrimitive.int.toFloat(), dp.value, "radius.$name") }
    }

    @Test
    fun `text styles equal tokens json`() {
        val type = ChalkakTypography()
        val styles = mapOf(
            "display" to type.display, "title1" to type.title1, "title2" to type.title2, "title3" to type.title3,
            "headline" to type.headline, "body" to type.body, "callout" to type.callout, "subheadline" to type.subheadline,
            "footnote" to type.footnote, "caption" to type.caption, "brand" to type.brand, "handwriting" to type.handwriting,
            "photoCardTitle" to type.photoCardTitle,
        )
        val json = tokens["font"]!!.jsonObject["styles"]!!.jsonObject
        assertEquals(json.keys, styles.keys)
        styles.forEach { (name, style) ->
            val expected = json[name]!!.jsonObject
            assertEquals(expected["size"]!!.jsonPrimitive.int.toFloat(), style.fontSize.value, "$name size")
            assertEquals(expected["lineHeight"]!!.jsonPrimitive.int.toFloat(), style.lineHeight.value, "$name lineHeight")
            assertEquals(FontWeight(expected["weight"]!!.jsonPrimitive.int), style.fontWeight, "$name weight")
        }
        assertEquals(-0.42f, type.brand.letterSpacing.value)
    }
}
