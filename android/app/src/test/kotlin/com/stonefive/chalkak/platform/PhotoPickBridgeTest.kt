package com.stonefive.chalkak.platform

import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class PhotoPickBridgeTest {
    private class AlbumLauncher : ActivityResultLauncher<PickVisualMediaRequest>() {
        override fun launch(input: PickVisualMediaRequest, options: ActivityOptionsCompat?) = Unit
        override fun unregister() = Unit
        override val contract: ActivityResultContract<PickVisualMediaRequest, *> = ActivityResultContracts.PickVisualMedia()
    }

    private class CameraLauncher : ActivityResultLauncher<Uri>() {
        override fun launch(input: Uri, options: ActivityOptionsCompat?) = Unit
        override fun unregister() = Unit
        override val contract: ActivityResultContract<Uri, *> = ActivityResultContracts.TakePicture()
    }

    @Test
    fun `TC-UPL-014 파괴된 Activity는 두 런처를 놓아 브리지가 Activity를 붙잡지 않는다`() {
        val bridge = PhotoPickBridge()
        val album = AlbumLauncher()
        val camera = CameraLauncher()
        bridge.albumLauncher = album
        bridge.cameraLauncher = camera
        bridge.detach(album)
        bridge.detach(camera)
        assertNull(bridge.albumLauncher)
        assertNull(bridge.cameraLauncher)
    }

    @Test
    fun `TC-UPL-014 옛 Activity의 늦은 detach는 새 Activity의 런처를 지우지 않는다`() {
        val bridge = PhotoPickBridge()
        val old = AlbumLauncher()
        val new = AlbumLauncher()
        bridge.albumLauncher = old
        bridge.albumLauncher = new
        bridge.detach(old)
        assertSame(new, bridge.albumLauncher)
    }

    @Test
    fun `TC-UPL-014 결과는 기다리던 요청 하나에만 전달되고 새 요청은 답 없던 옛 요청을 취소로 끝낸다`() {
        val bridge = PhotoPickBridge()
        val first = bridge.beginAlbum()
        val second = bridge.beginAlbum()
        assertTrue(first.isCompleted)
        assertNull(first.getCompleted())
        assertFalse(second.isCompleted)
        val uri = Uri.parse("content://media/picker/0/1")
        bridge.onAlbumResult(uri)
        assertSame(uri, second.getCompleted())
        val camera = bridge.beginCamera()
        bridge.onCameraResult(true)
        assertTrue(camera.getCompleted())
        bridge.onCameraResult(false) // nothing waiting: ignored
    }
}
