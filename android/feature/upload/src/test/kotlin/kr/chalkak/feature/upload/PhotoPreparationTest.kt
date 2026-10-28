package kr.chalkak.feature.upload

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.upload.testing.UploadFixtures
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.upload.edit.PhotoEdit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** TC-UPL-023, 025, 027, 028..031, 042: the background preparation (policy + WebP) that starts when the editor finishes. */
class PhotoPreparationTest {
    private val turned = PhotoEdit(quarterTurns = 1)

    @Test
    fun `TC-UPL-023 finishing the editor requests a policy and encodes, but does not PUT`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onAlbumPicked(PickerResult.Picked(photo()))
        rig.idle()
        assertTrue(rig.creation.uploadCalls.isEmpty(), "nothing before the editor is done")
        rig.holder.onEditorDone(PhotoEdit.IDENTITY)
        rig.idle()
        assertEquals(1, rig.creation.uploadCalls.size)
        assertTrue(rig.compressor.calls.isNotEmpty(), "encoding ran")
        assertTrue(rig.uploader.calls.isEmpty(), "S3 is not touched yet")
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(1, rig.files.live.size)
    }

    @Test
    fun `TC-UPL-023 an unedited photo is prepared too (confirmed without changes)`() = runTest {
        val rig = uploadRig()
        rig.ready(edit = PhotoEdit.IDENTITY)
        assertEquals(1, rig.creation.uploadCalls.size)
        assertEquals(PhotoEdit.IDENTITY, rig.s.edit)
    }

    @Test
    fun `TC-UPL-025 a policy that is not image-webp stops before encoding with the prepare message`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += UploadFixtures.policyResult("upload/posts-uploads__content-type-png.json")
        rig.ready()
        assertEquals(Preparation.Failed(UploadCopyKeys.ERROR_PREPARE), rig.s.preparation)
        assertEquals(UploadCopyKeys.ERROR_PREPARE, rig.s.error?.copyKey)
        assertTrue(rig.compressor.calls.isEmpty())
        assertTrue(rig.codec.decodeCalls.isEmpty())
        assertEquals(photo(), rig.s.photo)
    }

    @Test
    fun `TC-UPL-027 policy 403 shows the banned message and asks only once`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += UploadFixtures.failure("upload/posts-uploads__403-banned.json")
        rig.show()
        rig.holder.onTitleChanged("제목")
        rig.pickAndConfirm()
        assertEquals(Preparation.Failed(UploadCopyKeys.GATE_BANNED), rig.s.preparation)
        assertEquals(UploadCopyKeys.GATE_BANNED, rig.s.error?.copyKey)
        assertEquals(1, rig.creation.uploadCalls.size)
        assertEquals(photo(), rig.s.photo)
        assertEquals("제목", rig.s.title)
    }

    @Test
    fun `TC-UPL-027 policy 401 that survived the refresh goes to login and keeps the input`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        rig.ready()
        assertTrue(UploadEffect.ReauthRequired in rig.effects)
        assertEquals(photo(), rig.s.photo)
    }

    @Test
    fun `TC-UPL-027 policy 500 and connection failure end in a failed preparation with the matching text, input kept`() = runTest {
        listOf(
            UploadFixtures.failure("upload/posts-uploads__500-server-error.json") to UploadCopyKeys.ERROR_PREPARE,
            UploadFixtures.network(NetworkKind.OFFLINE) to UploadCopyKeys.ERROR_NETWORK,
            UploadFixtures.network(NetworkKind.TIMEOUT) to UploadCopyKeys.ERROR_NETWORK,
        ).forEach { (failure, key) ->
            val rig = uploadRig()
            rig.creation.uploadResults += failure
            rig.show()
            rig.holder.onTitleChanged("제목")
            rig.pickAndConfirm()
            assertEquals(Preparation.Failed(key), rig.s.preparation, "for $failure")
            assertEquals(photo(), rig.s.photo)
            assertEquals("제목", rig.s.title)
            assertEquals(true, rig.s.canSubmit)
        }
    }

    @Test
    fun `TC-UPL-028 replacing the photo cancels the old preparation, deletes its file and prepares the new photo`() = runTest {
        val rig = uploadRig()
        rig.ready("A")
        val fileA = rig.files.live.single()
        rig.pickAndConfirm("B")
        assertTrue(fileA in rig.files.deleted)
        assertEquals(2, rig.creation.uploadCalls.size)
        assertEquals(photo("B"), rig.s.photo)
        assertEquals(1, rig.files.live.size)
        assertEquals(Preparation.Ready, rig.s.preparation)
    }

    @Test
    fun `TC-UPL-028 re-confirming while the first preparation is still running cancels it`() = runTest {
        val rig = uploadRig()
        val gate = CompletableDeferred<Unit>()
        var calls = 0
        rig.compressor.onCall = { _, _ -> if (++calls == 1) gate.await() }
        rig.show()
        rig.pickAndConfirm("A")
        assertEquals(Preparation.Preparing, rig.s.preparation)
        rig.holder.onPhotoTapped()
        rig.idle()
        rig.holder.onEditorDone(turned)
        rig.idle()
        assertEquals(2, rig.creation.uploadCalls.size)
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(1, rig.files.live.size)
        gate.complete(Unit)
        rig.idle()
        assertEquals(1, rig.files.live.size)
    }

    @Test
    fun `TC-UPL-029 a failed preparation is announced at once, nothing is retried by itself, submit prepares again and goes on`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += UploadFixtures.failure("upload/posts-uploads__500-server-error.json")
        rig.ready()
        assertTrue(rig.s.preparation is Preparation.Failed)
        assertEquals(1, rig.creation.uploadCalls.size, "no hidden retry")
        rig.submit()
        assertEquals(2, rig.creation.uploadCalls.size)
        assertEquals(1, rig.uploader.calls.size)
        assertEquals(1, rig.creation.createCalls.size)
        assertEquals("upload-2", rig.creation.createCalls.single().uploadId)
        assertTrue(rig.effects.any { it is UploadEffect.ShowSuccess })
    }

    @Test
    fun `TC-UPL-030 the late end of an older preparation never overwrites the newer selection`() = runTest {
        val rig = uploadRig()
        val gate = CompletableDeferred<Unit>()
        var first = true
        rig.compressor.onCall = { _, _ -> if (first) { first = false; gate.await() } }
        rig.show()
        rig.pickAndConfirm("A")
        rig.pickAndConfirm("B")
        assertEquals(photo("B"), rig.s.photo)
        assertEquals(Preparation.Ready, rig.s.preparation)
        val liveBefore = rig.files.live
        gate.complete(Unit)
        rig.idle()
        assertEquals(photo("B"), rig.s.photo)
        assertEquals(Preparation.Ready, rig.s.preparation)
        assertEquals(liveBefore, rig.files.live, "A's result added or removed no file")
        assertEquals(1, rig.files.live.size)
    }

    @Test
    fun `TC-UPL-031 leaving the screen during preparation cancels it and leaves no temp file`() = runTest {
        val rig = uploadRig()
        val gate = CompletableDeferred<Unit>()
        rig.compressor.onCall = { _, _ -> gate.await() }
        rig.show()
        rig.pickAndConfirm()
        rig.t.runCurrent()
        rig.holder.onScreenGone()
        gate.complete(Unit)
        rig.idle()
        assertTrue(rig.files.live.isEmpty())
    }

    @Test
    fun `TC-UPL-031 leaving after the file was prepared deletes it`() = runTest {
        val rig = uploadRig()
        rig.ready()
        assertEquals(1, rig.files.live.size)
        rig.holder.onScreenGone()
        rig.idle()
        assertTrue(rig.files.live.isEmpty())
    }

    @Test
    fun `TC-UPL-031 leaving during the PUT cancels it and leaves no temp file`() = runTest {
        val rig = uploadRig()
        rig.ready()
        val gate = CompletableDeferred<Unit>()
        rig.uploader.onPut = { gate.await() }
        rig.holder.onSubmitClicked()
        rig.t.runCurrent()
        rig.holder.onScreenGone()
        gate.complete(Unit)
        rig.idle()
        assertTrue(rig.files.live.isEmpty())
        assertTrue(rig.creation.createCalls.isEmpty())
    }

    @Test
    fun `TC-UPL-042 an impossible size limit ends as a failed preparation with the prepare message and no file`() = runTest {
        val rig = uploadRig()
        rig.creation.uploadResults += ApiResult.Success(rig.creation.policy(1, maxBytes = 1_000L))
        rig.compressor.sizeFor = { _, _ -> 50_000 }
        rig.ready()
        assertEquals(Preparation.Failed(UploadCopyKeys.ERROR_PREPARE), rig.s.preparation)
        assertTrue(rig.files.live.isEmpty())
        assertEquals(16, rig.compressor.calls.size, "4 rounds x 4 qualities")
        assertNotEquals(null, rig.s.photo)
    }

    @Test
    fun `TC-UPL-042 an unreadable photo during encoding (decoder throws late) is a prepare failure too`() = runTest {
        val rig = uploadRig()
        rig.show()
        rig.holder.onAlbumPicked(PickerResult.Picked(photo("p1")))
        rig.idle()
        rig.codec.unreadable += "p1"
        rig.holder.onEditorDone(PhotoEdit.IDENTITY)
        rig.idle()
        assertEquals(Preparation.Failed(UploadCopyKeys.ERROR_PREPARE), rig.s.preparation)
    }
}
