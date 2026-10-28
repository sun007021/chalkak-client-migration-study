package com.stonefive.chalkak.ui.terms

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Load state of the legal document web view. */
enum class LegalDocLoad { Loading, Loaded, Failed }

/**
 * Legal document sheet/dialog (signup and settings): `legal-doc.sheet`, `.title` ([title] is already resolved copy), `.close-button`,
 * `.web-content` (wraps [web]; the real web view is a slot so JVM tests need no WebView), `.loading` (only [LegalDocLoad.Loading]),
 * `.error-state` + `.retry-button` (only [LegalDocLoad.Failed]; copy `onb.terms.doc.error` / `onb.terms.doc.retry`). STUB.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun LegalDocSheet(
    title: String,
    load: LegalDocLoad,
    onClose: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    web: @Composable () -> Unit = {},
) {
}
