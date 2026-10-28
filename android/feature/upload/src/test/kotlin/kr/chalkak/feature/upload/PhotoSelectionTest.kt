package kr.chalkak.feature.upload

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.upload.testing.UploadFixtures
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.PhotoSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** TC-UPL-014..021, 047 and the upload-screen side of TC-EDIT-004..006: picking, capturing, the editor round trip. */
class PhotoSelectionTest {
    private val turned = PhotoEdit(quarterTurns = 1)

    @Test
    fun `TC-UPL-014 a cancelled album pick or capture changes nothing`() = runTest {
        val rig = uploadRig()
        rig.show()
        val before = rig.s
        rig.holder.onAlbumPicked(PickerResult.Cancelled)
        rig.holder.onCameraCaptured(PickerResult.Cancelled)
        rig.idle()
        assertEquals(before, rig.s)
        assertTrue(rig.codec.log.isEmpty())
        assertTrue(rig.gallery.saved.isEmpty())
    }

    @Test
    fun `TC-UPL-014 a picked photo opens the editor straight away and asks for no policy yet`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onAlbumPicked(PickerResult.Picked(photo("p1")))
        rig.idle()
        assertEquals(EditorRequest(photo("p1"), PhotoEdit.IDENTITY, isFirstEdit = true), rig.s.editor)
        assertNull(rig.s.photo, "not selected until the editor says done")
        assertTrue(rig.creation.uploadCalls.isEmpty())
    }

    @Test
    fun `TC-UPL-015 the camera button follows the device capability`() = runTest {
        assertEquals(true, uploadRig(hasCamera = true).s.cameraAvailable)
        assertEquals(false, uploadRig(hasCamera = false).s.cameraAvailable)
    }

    @Test
    fun `TC-UPL-016 a captured photo is saved to the gallery exactly once, also after submit`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onCameraCaptured(PickerResult.Picked(photo("cam-1", PhotoSource.CAMERA)))
        rig.idle()
        assertEquals(listOf("cam-1"), rig.gallery.saved.toList())
        assertEquals(photo("cam-1", PhotoSource.CAMERA), rig.s.editor?.photo)
        rig.holder.onEditorDone(PhotoEdit.IDENTITY)
        rig.idle()
        rig.submit()
        assertEquals(listOf("cam-1"), rig.gallery.saved.toList())
    }

    @Test
    fun `TC-UPL-017 an album photo is never saved to the gallery`() = runTest {
        val rig = uploadRig()
        rig.ready()
        rig.submit()
        assertTrue(rig.gallery.saved.isEmpty())
    }

    @Test
    fun `TC-UPL-018 a failed or denied gallery save only shows the save-failed message, the pick and the upload continue`() = runTest {
        listOf<(FakeGallery) -> Unit>({ it.result = false }, { it.throwing = true }).forEach { script ->
            val rig = uploadRig()
            script(rig.gallery)
            rig.show()
            rig.holder.onCameraCaptured(PickerResult.Picked(photo("cam-1", PhotoSource.CAMERA)))
            rig.idle()
            assertEquals(UploadCopyKeys.CAMERA_SAVE_FAILED, rig.s.error?.copyKey)
            assertEquals(photo("cam-1", PhotoSource.CAMERA), rig.s.editor?.photo, "the editor still opens")
            rig.holder.onEditorDone(PhotoEdit.IDENTITY)
            rig.idle()
            assertEquals(photo("cam-1", PhotoSource.CAMERA), rig.s.photo)
            rig.submit()
            assertTrue(rig.effects.any { it is UploadEffect.ShowSuccess }, "upload succeeds anyway")
        }
    }

    @Test
    fun `TC-UPL-019 a gallery save that fails after the screen is gone goes to the app toast`() = runTest {
        val rig = uploadRig()
        rig.show()
        val gate = CompletableDeferred<Unit>()
        rig.gallery.gate = gate
        rig.gallery.result = false
        rig.holder.onCameraCaptured(PickerResult.Picked(photo("cam-1", PhotoSource.CAMERA)))
        rig.t.runCurrent()
        rig.holder.onScreenGone()
        gate.complete(Unit)
        rig.idle()
        assertEquals(listOf(UploadCopyKeys.CAMERA_SAVE_FAILED), rig.toaster.shown.toList())
    }

    @Test
    fun `TC-UPL-020 only the latest pick counts, the late result of an earlier pick is dropped`() = runTest {
        val rig = uploadRig()
        rig.show()
        val gateA = CompletableDeferred<Unit>()
        rig.codec.boundsGates["A"] = gateA
        rig.holder.onAlbumPicked(PickerResult.Picked(photo("A")))
        rig.t.runCurrent()
        rig.holder.onAlbumPicked(PickerResult.Picked(photo("B")))
        rig.idle()
        assertEquals(photo("B"), rig.s.editor?.photo)
        gateA.complete(Unit)
        rig.idle()
        assertEquals(photo("B"), rig.s.editor?.photo, "A's late probe must not replace B")
    }

    @Test
    fun `TC-UPL-021 empty, zero byte and corrupt photos never open the editor`() = runTest {
        listOf<(FakeCodec) -> Unit>(
            { it.unreadable += "bad" },
            { it.throwing += "bad" },
        ).forEach { script ->
            val rig = uploadRig()
            script(rig.codec)
            rig.show()
            rig.holder.onAlbumPicked(PickerResult.Picked(photo("bad")))
            rig.idle()
            assertNull(rig.s.editor)
            assertNull(rig.s.photo)
            assertEquals(UploadCopyKeys.ERROR_PREPARE, rig.s.error?.copyKey)
            assertTrue(rig.creation.uploadCalls.isEmpty())
            rig.holder.onAlbumPicked(PickerResult.Picked(photo("good")))
            rig.idle()
            assertEquals(photo("good"), rig.s.editor?.photo, "a good pick works afterwards")
        }
    }

    @Test
    fun `TC-UPL-047 submit is off without a photo and on with one whatever the preparation state`() = runTest {
        val rig = uploadRig()
        rig.show()
        assertEquals(false, rig.s.canSubmit)
        assertEquals(UploadCopyKeys.SUBMIT, rig.s.submitLabelKey)
        val gate = CompletableDeferred<Unit>()
        rig.creation.onUpload = { gate.await() }
        rig.pickAndConfirm()
        assertEquals(Preparation.Preparing, rig.s.preparation)
        assertEquals(true, rig.s.canSubmit, "enabled while preparing")
        gate.complete(Unit)
        rig.idle()
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(true, rig.s.canSubmit)
    }

    @Test
    fun `TC-UPL-047 after a failed preparation submit stays enabled and tries again`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += UploadFixtures.failure("upload/posts-uploads__500-server-error.json")
        rig.ready()
        assertTrue(rig.s.preparation is Preparation.Failed)
        assertEquals(true, rig.s.canSubmit)
        rig.submit()
        assertTrue(rig.effects.any { it is UploadEffect.ShowSuccess })
    }

    @Test
    fun `TC-EDIT-004 cancelling the editor of a freshly picked photo drops the pick`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onAlbumPicked(PickerResult.Picked(photo("p1")))
        rig.idle()
        rig.holder.onEditorCancelled()
        rig.idle()
        assertNull(rig.s.editor)
        assertNull(rig.s.photo)
        assertEquals(Preparation.None, rig.s.preparation)
        assertTrue(rig.creation.uploadCalls.isEmpty())
        assertTrue(rig.codec.renderedEdits.isEmpty(), "cancel renders nothing")
    }

    @Test
    fun `TC-EDIT-005 cancelling a re-edit keeps the selection, the edit and the prepared result`() = runTest {
        val rig = uploadRig()
        rig.ready(edit = turned)
        val before = rig.s
        rig.holder.onPhotoTapped()
        rig.idle()
        rig.holder.onEditorCancelled()
        rig.idle()
        assertEquals(before.copy(editor = null), rig.s.copy(editor = null))
        assertNull(rig.s.editor)
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(1, rig.creation.uploadCalls.size)
        assertEquals(1, rig.files.live.size)
    }

    @Test
    fun `TC-EDIT-006 tapping the photo reopens the editor with the current edit, the same edit does not prepare again`() = runTest {
        val rig = uploadRig()
        rig.ready(edit = turned)
        rig.holder.onPhotoTapped()
        rig.idle()
        assertEquals(EditorRequest(photo(), turned, isFirstEdit = false), rig.s.editor)
        rig.holder.onEditorDone(turned)
        rig.idle()
        assertEquals(1, rig.creation.uploadCalls.size, "same edit -> no new policy")
        assertEquals(1, rig.compressor.calls.size, "same edit -> no new encode")
        assertNull(rig.s.editor)
    }

    @Test
    fun `TC-EDIT-006 a different edit cancels the old preparation, deletes its file and prepares again`() = runTest {
        val rig = uploadRig()
        rig.ready(edit = turned)
        val first = rig.files.live.single()
        rig.holder.onPhotoTapped()
        rig.idle()
        rig.holder.onEditorDone(PhotoEdit(quarterTurns = 2))
        rig.idle()
        assertEquals(2, rig.creation.uploadCalls.size)
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(PhotoEdit(quarterTurns = 2), rig.s.edit)
        assertTrue(first in rig.files.deleted)
        assertEquals(1, rig.files.live.size)
    }

    @Test
    fun `TC-EDIT-006 tapping the photo is ignored while submitting`() = runTest {
        val rig = uploadRig()
        rig.ready()
        val gate = CompletableDeferred<Unit>()
        rig.uploader.onPut = { gate.await() }
        rig.holder.onSubmitClicked()
        rig.t.runCurrent()
        rig.holder.onPhotoTapped()
        rig.t.runCurrent()
        assertNull(rig.s.editor)
        gate.complete(Unit)
        rig.idle()
    }
}
