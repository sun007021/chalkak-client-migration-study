package com.stonefive.chalkak.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Image slot shared by home, display and feed: draws the image at [url] (null = nothing usable known) into the area described by
 * the modifier. The app's real slots are `CoilRemoteImage` / `CoilPhotoImage` (`ui/components/RemoteImages.kt`); tests pass a fake.
 */
typealias RemoteImage = @Composable (url: String?, modifier: Modifier) -> Unit
