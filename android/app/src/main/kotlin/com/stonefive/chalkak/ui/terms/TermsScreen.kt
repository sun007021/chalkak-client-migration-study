package com.stonefive.chalkak.ui.terms

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.TermsStateHolder
import kr.chalkak.feature.onboarding.TermsUiState

/**
 * Stateless terms screen: `terms.root`, `.title`, `.agree-all-checkbox`, `.service-checkbox`, `.privacy-checkbox` (each exposes checked
 * as a toggleable state and carries its label text in its merged semantics), `.service-view-button`, `.privacy-view-button`,
 * `.next-button` (enabled = [TermsUiState.nextEnabled]), `.back-button`. STUB (A2 TDD step 1).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun TermsScreen(
    state: TermsUiState,
    onAgreeAllClick: () -> Unit,
    onServiceClick: () -> Unit,
    onPrivacyClick: () -> Unit,
    onServiceViewClick: () -> Unit,
    onPrivacyViewClick: () -> Unit,
    onNextClick: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
}

/**
 * Wraps [TermsStateHolder]: renders [TermsScreen]; `OpenDocument` effects go through [opener]; an in-app result shows [LegalDocSheet]
 * (with [legalWeb] in its web slot; it reports load results through the two callbacks) over the screen without touching the checkboxes;
 * closing the sheet returns to the terms screen. `GoSignature` / `BackToLogin` effects call the callbacks. STUB.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun TermsRoute(
    holder: TermsStateHolder,
    opener: LegalDocumentOpener,
    onGoSignature: () -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
    legalWeb: @Composable (url: String, onLoaded: () -> Unit, onFailed: () -> Unit) -> Unit = { _, _, _ -> },
) {
}
