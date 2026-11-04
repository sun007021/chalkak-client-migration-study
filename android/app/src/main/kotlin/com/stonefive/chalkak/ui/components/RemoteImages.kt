package com.stonefive.chalkak.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.ImageLoader
import coil3.compose.AsyncImage

private enum class LoadPhase { Loading, Loaded, Failed }

/**
 * `RemoteImage` over a Coil [ImageLoader] (built in the app container with the app's OkHttp). While the picture loads the slot shows a
 * shimmering skeleton; a null [url] (the server value was not a usable https address) and a failed load both show the neutral
 * photo tile ([ImagePlaceholder]); the layout never changes.
 */
@Composable
fun CoilRemoteImage(loader: ImageLoader, url: String?, modifier: Modifier = Modifier) {
    if (url == null) {
        ImagePlaceholder(modifier)
        return
    }
    var phase by remember(url) { mutableStateOf(LoadPhase.Loading) }
    Box(modifier) {
        AsyncImage(
            model = url,
            contentDescription = null,
            imageLoader = loader,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            onSuccess = { phase = LoadPhase.Loaded },
            onError = { phase = LoadPhase.Failed },
        )
        when (phase) {
            LoadPhase.Loading -> ChalkakSkeleton(Modifier.fillMaxSize())
            LoadPhase.Failed -> ImagePlaceholder(Modifier.fillMaxSize())
            LoadPhase.Loaded -> Unit
        }
    }
}

/** Ratio used for a photo slot until the picture's own aspect ratio is known (height / width = 4 / 3, screens-b 2.2). */
private const val UnknownPhotoRatio = 3f / 4f

/**
 * Photo slot for display and feed: the caller gives a width and no height, the image's own aspect ratio decides the height
 * ([ContentScale.FillWidth]). Until it is known (and when it fails) the slot is a 3 : 4 tile with a skeleton / photo placeholder.
 */
@Composable
fun CoilPhotoImage(loader: ImageLoader, url: String?, modifier: Modifier = Modifier) {
    if (url == null) {
        ImagePlaceholder(modifier.aspectRatio(UnknownPhotoRatio))
        return
    }
    var phase by remember(url) { mutableStateOf(LoadPhase.Loading) }
    Box(if (phase == LoadPhase.Loaded) modifier else modifier.aspectRatio(UnknownPhotoRatio)) {
        AsyncImage(
            model = url,
            contentDescription = null,
            imageLoader = loader,
            modifier = Modifier.fillMaxWidth(),
            contentScale = ContentScale.FillWidth,
            onSuccess = { phase = LoadPhase.Loaded },
            onError = { phase = LoadPhase.Failed },
        )
        when (phase) {
            LoadPhase.Loading -> ChalkakSkeleton(Modifier.matchParentSize())
            LoadPhase.Failed -> ImagePlaceholder(Modifier.matchParentSize())
            LoadPhase.Loaded -> Unit
        }
    }
}
