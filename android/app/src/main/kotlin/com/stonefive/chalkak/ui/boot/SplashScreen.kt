package com.stonefive.chalkak.ui.boot

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import com.stonefive.chalkak.ui.theme.Continuous

/** Splash: logo only, `splash.logo` (testids.md). Exists only while boot is routing; no input. */
@Composable
fun SplashScreen(modifier: Modifier = Modifier) {
    val copy = LocalCopy.current
    Box(modifier = modifier.fillMaxSize().background(ChalkakTheme.colors.background), contentAlignment = Alignment.Center) {
        Text(
            text = copy["app.name"],
            color = ChalkakTheme.colors.textPrimary,
            style = TextStyle(fontFamily = Continuous, fontSize = 44.sp, lineHeight = 52.sp),
            modifier = Modifier.testTag("splash.logo"),
        )
    }
}
