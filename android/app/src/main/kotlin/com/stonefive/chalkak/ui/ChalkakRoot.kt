package com.stonefive.chalkak.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.copy.ProvideCopy

/**
 * The single root of the app. `testTagsAsResourceId` is set here only, so every descendant `testTag` is visible to
 * Maestro as a resource-id (testids.md section 1). Screens arrive in later PRs; this is a placeholder.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun ChalkakRoot(copy: Copy, modifier: Modifier = Modifier) {
    ProvideCopy(copy) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .semantics { testTagsAsResourceId = true },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = copy["app.name"],
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("splash.logo"),
            )
        }
    }
}
