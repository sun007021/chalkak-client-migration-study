package com.stonefive.chalkak.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Image slot: draws the image at [url] (null = nothing known yet) into the area described by the modifier. The app's real
 * slot is Coil; tests pass a fake. The slot owns loading and failure: when the image cannot be loaded it draws nothing
 * (and, because [Modifier] carries the caller's `testTag`, the tagged node is then absent).
 *
 * A3 defines the same alias in `ui/home/HomeScreen.kt`; dedupe when both are merged.
 */
typealias RemoteImage = @Composable (url: String?, modifier: Modifier) -> Unit
