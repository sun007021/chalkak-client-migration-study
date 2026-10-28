package com.stonefive.chalkak.ui.terms

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.BlockingLayer
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.IconAction
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/** Load state of the legal document web view. */
enum class LegalDocLoad { Loading, Loaded, Failed }

/**
 * Legal document sheet/dialog (signup and settings): `legal-doc.sheet`, `.title` ([title] is already resolved copy), `.close-button`,
 * `.web-content` (wraps [web]; the real web view is a slot so JVM tests need no WebView), `.loading` (only [LegalDocLoad.Loading]),
 * `.error-state` + `.retry-button` (only [LegalDocLoad.Failed]; copy `onb.terms.doc.error` / `onb.terms.doc.retry`).
 *
 * [web] is composed while loading and once loaded, and left out of the tree while failed, so a retry always composes it afresh
 * (the caller keys it by attempt). It covers the whole screen and takes back presses (= close).
 */
@Composable
fun LegalDocSheet(
    title: String,
    load: LegalDocLoad,
    onClose: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    web: @Composable () -> Unit = {},
) {
    val copy = LocalCopy.current
    BackHandler(onBack = onClose)
    BlockingLayer(modifier = modifier.testTag("legal-doc.sheet"), scrim = ChalkakTheme.colors.background) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    color = ChalkakTheme.colors.textPrimary,
                    modifier = Modifier.weight(1f).testTag("legal-doc.title"),
                )
                IconAction(R.drawable.ic_close, onClose, Modifier.testTag("legal-doc.close-button"))
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth().navigationBarsPadding()) {
                if (load != LegalDocLoad.Failed) {
                    Box(modifier = Modifier.fillMaxSize().testTag("legal-doc.web-content")) { web() }
                }
                when (load) {
                    LegalDocLoad.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Loading(Modifier.testTag("legal-doc.loading"))
                    }
                    LegalDocLoad.Failed -> Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
                    ) {
                        Text(
                            text = copy["onb.terms.doc.error"],
                            style = MaterialTheme.typography.bodyMedium,
                            color = ChalkakTheme.colors.textNeutral,
                            modifier = Modifier.testTag("legal-doc.error-state"),
                        )
                        ChalkakOutlinedButton(
                            text = copy["onb.terms.doc.retry"],
                            onClick = onRetry,
                            modifier = Modifier.padding(top = 20.dp).testTag("legal-doc.retry-button"),
                        )
                    }
                    LegalDocLoad.Loaded -> Unit
                }
            }
        }
    }
}
