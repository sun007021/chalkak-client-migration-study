package com.stonefive.chalkak.ui

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.core.app.ApplicationProvider
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChalkakRootTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun `root renders under the theme with copy from ko json`() {
        val copy = Copy.load(ApplicationProvider.getApplicationContext())
        rule.setContent { ChalkakTheme { ChalkakRoot(copy) } }
        rule.onNodeWithTag("splash.logo").assertTextEquals(copy["app.name"])
    }
}
