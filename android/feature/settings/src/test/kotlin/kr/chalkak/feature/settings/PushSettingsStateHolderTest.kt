package kr.chalkak.feature.settings

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.settings.NotificationSettings
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.core.data.settings.testing.FakeNotificationSettingsRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PushSettingsStateHolderTest {
    private class Rig(
        val holder: PushSettingsStateHolder,
        val repo: FakeNotificationSettingsRepository,
        val device: FakeDeviceNotificationSettings,
        val effects: List<PushSettingsEffect>,
    ) {
        val state get() = holder.state.value
        fun value(s: PushSetting) = state.values[s]
    }

    private fun TestScope.rig(permission: NotificationPermission = NotificationPermission.Granted): Rig {
        val repo = FakeNotificationSettingsRepository()
        val device = FakeDeviceNotificationSettings(permission)
        val holder = PushSettingsStateHolder(holderScope(), repo, device)
        return Rig(holder, repo, device, collectAll(holder.effects))
    }

    /** Rig whose first GET already succeeded with [initial]. */
    private fun TestScope.loaded(
        initial: NotificationSettings = FakeNotificationSettingsRepository.ALL_ON,
        permission: NotificationPermission = NotificationPermission.Granted,
    ): Rig {
        val r = rig(permission)
        r.repo.loadResults += ApiResult.Success(initial)
        r.holder.onTabShown()
        advanceUntilIdle()
        return r
    }

    private fun TestScope.toggle(r: Rig, setting: PushSetting, enabled: Boolean) {
        r.holder.onToggled(setting, enabled)
        runCurrent()
    }

    // ---- load -------------------------------------------------------------------------------

    @Test
    fun `TC-SET-016 a failed load disables the switches, toasts load-error, and showing the tab again reloads`() = runTest {
        val r = rig()
        r.repo.loadResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        r.holder.onTabShown()
        advanceUntilIdle()
        assertFalse(r.state.switchesEnabled)
        assertTrue(r.state.values.isEmpty(), "no on/off value may be invented")
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.Toast("settings.push.load-error")), r.effects)
        assertEquals("알림 설정을 불러오지 못했어요. 다시 시도해 주세요.", Copy["settings.push.load-error"])

        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(2, r.repo.loadCalls.size)
        assertTrue(r.state.switchesEnabled)
    }

    @Test
    fun `TC-SET-015 an invalid GET body is handled like a failed load`() = runTest {
        val r = rig()
        r.repo.loadResults += invalidResponse()
        r.holder.onTabShown()
        advanceUntilIdle()
        assertFalse(r.state.switchesEnabled)
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.Toast("settings.push.load-error")), r.effects)
    }

    @Test
    fun `TC-SET-017 while loading the switches are disabled, and they enable when the load finishes`() = runTest {
        val r = rig()
        val g = gate()
        r.repo.loadGate = g
        r.holder.onTabShown()
        runCurrent()
        assertTrue(r.state.loading)
        assertFalse(r.state.switchesEnabled)
        g.complete(Unit)
        advanceUntilIdle()
        assertFalse(r.state.loading)
        assertTrue(r.state.switchesEnabled)
    }

    @Test
    fun `TC-SET-018 each switch mirrors its own server value, also when only the AI one is off`() = runTest {
        val r = loaded(NotificationSettings(topic = true, moderation = true, aiReview = false))
        assertEquals(true, r.value(PushSetting.Topic))
        assertEquals(true, r.value(PushSetting.Moderation))
        assertEquals(false, r.value(PushSetting.AiReview))
        assertEquals("오늘 주제 알림", Copy["settings.push.topic"])
        assertEquals("게시물 승인·반려 알림", Copy["settings.push.moderation"])
        assertEquals("AI 피드백 완료 알림", Copy["settings.push.ai-review"])
    }

    @Test
    fun `TC-SET-033 after a failed reload the old server values are not used as the base for a change`() = runTest {
        val r = loaded()
        r.repo.loadResults += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        r.holder.onTabShown()
        advanceUntilIdle()
        assertFalse(r.state.switchesEnabled)
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        assertTrue(r.repo.updateCalls.isEmpty())
    }

    // ---- save: request shape ----------------------------------------------------------------

    @Test
    fun `TC-SET-019 flipping the topic switch sends only that setting`() = runTest {
        val r = loaded()
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        assertEquals(listOf(PushSetting.Topic to false), r.repo.updateCalls.toList())
        assertEquals(false, r.value(PushSetting.Topic))
    }

    @Test
    fun `TC-SET-020 flipping the moderation switch sends only that setting`() = runTest {
        val r = loaded()
        toggle(r, PushSetting.Moderation, false)
        advanceUntilIdle()
        assertEquals(listOf(PushSetting.Moderation to false), r.repo.updateCalls.toList())
    }

    @Test
    fun `TC-SET-021 flipping the AI switch sends only that setting`() = runTest {
        val r = loaded(NotificationSettings(true, true, false))
        toggle(r, PushSetting.AiReview, true)
        advanceUntilIdle()
        assertEquals(listOf(PushSetting.AiReview to true), r.repo.updateCalls.toList())
    }

    @Test
    fun `TC-SET-036 no PATCH is built before the settings were loaded`() = runTest {
        val r = rig()
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        assertTrue(r.repo.updateCalls.isEmpty())
        assertTrue(r.state.values.isEmpty())
    }

    // ---- save: optimistic / rollback --------------------------------------------------------

    @Test
    fun `TC-SET-023 the switch shows its new value at once, before the PATCH answers`() = runTest {
        val r = loaded()
        val g = gate()
        r.repo.updateGates[PushSetting.Topic] = g
        toggle(r, PushSetting.Topic, false)
        assertEquals(false, r.value(PushSetting.Topic))
        assertEquals(setOf(PushSetting.Topic), r.state.saving)
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(false, r.value(PushSetting.Topic))
        assertTrue(r.state.saving.isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-SET-024 a failed save puts that switch back and toasts save-error (500 and network)`() = runTest {
        val r = loaded()
        r.repo.scriptUpdate(PushSetting.Topic, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        r.repo.scriptUpdate(PushSetting.Moderation, networkFailure(NetworkKind.TIMEOUT))
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        assertEquals(true, r.value(PushSetting.Topic))
        toggle(r, PushSetting.Moderation, false)
        advanceUntilIdle()
        assertEquals(true, r.value(PushSetting.Moderation))
        assertEquals(
            listOf<PushSettingsEffect>(PushSettingsEffect.Toast("settings.push.save-error"), PushSettingsEffect.Toast("settings.push.save-error")),
            r.effects,
        )
        assertEquals("알림 설정을 저장하지 못했어요. 다시 시도해 주세요.", Copy["settings.push.save-error"])
    }

    @Test
    fun `TC-SET-025 when the topic save fails an earlier successful moderation change stays`() = runTest {
        val r = loaded()
        toggle(r, PushSetting.Moderation, false)
        advanceUntilIdle()
        r.repo.scriptUpdate(PushSetting.Topic, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        assertEquals(true, r.value(PushSetting.Topic))
        assertEquals(false, r.value(PushSetting.Moderation))
    }

    @Test
    fun `TC-SET-026 when the moderation save fails an earlier successful topic change stays`() = runTest {
        val r = loaded()
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        r.repo.scriptUpdate(PushSetting.Moderation, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        toggle(r, PushSetting.Moderation, false)
        advanceUntilIdle()
        assertEquals(true, r.value(PushSetting.Moderation))
        assertEquals(false, r.value(PushSetting.Topic))
    }

    @Test
    fun `TC-SET-027 when the AI save fails the other settings stay, and a second tap during that save is not a second request`() = runTest {
        val r = loaded()
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        val g = gate()
        r.repo.updateGates[PushSetting.AiReview] = g
        r.repo.scriptUpdate(PushSetting.AiReview, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        toggle(r, PushSetting.AiReview, false)
        toggle(r, PushSetting.AiReview, true)
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, r.repo.updateCalls.count { it.first == PushSetting.AiReview })
        assertEquals(true, r.value(PushSetting.AiReview))
        assertEquals(false, r.value(PushSetting.Topic))
    }

    @Test
    fun `TC-SET-028 a second tap on the same switch during its save is ignored`() = runTest {
        val r = loaded()
        val g = gate()
        r.repo.updateGates[PushSetting.Topic] = g
        toggle(r, PushSetting.Topic, false)
        toggle(r, PushSetting.Topic, true)
        toggle(r, PushSetting.Topic, false)
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf(PushSetting.Topic to false), r.repo.updateCalls.toList())
        assertEquals(false, r.value(PushSetting.Topic))
    }

    @Test
    fun `TC-SET-029 while topic is saving the moderation and AI switches still send their own PATCH`() = runTest {
        val r = loaded()
        val g = gate()
        r.repo.updateGates[PushSetting.Topic] = g
        toggle(r, PushSetting.Topic, false)
        toggle(r, PushSetting.Moderation, false)
        toggle(r, PushSetting.AiReview, false)
        assertEquals(
            setOf(PushSetting.Topic to false, PushSetting.Moderation to false, PushSetting.AiReview to false),
            r.repo.updateCalls.toSet(),
        )
        g.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.state.saving.isEmpty())
    }

    @Test
    fun `TC-SET-030 leaving the screen mid-save restores the previous value without a toast`() = runTest {
        val r = loaded()
        val g = gate()
        r.repo.updateGates[PushSetting.Topic] = g
        toggle(r, PushSetting.Topic, false)
        assertEquals(false, r.value(PushSetting.Topic))
        r.holder.onScreenGone()
        advanceUntilIdle()
        assertEquals(true, r.value(PushSetting.Topic))
        assertTrue(r.state.saving.isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-SET-035 the holder reports a repository failure once and does not retry on top of the client retries`() = runTest {
        val r = loaded()
        r.repo.scriptUpdate(PushSetting.AiReview, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        toggle(r, PushSetting.AiReview, false)
        advanceUntilIdle()
        assertEquals(1, r.repo.updateCalls.size)
        assertEquals(true, r.value(PushSetting.AiReview))
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.Toast("settings.push.save-error")), r.effects)
    }

    // ---- account switch ---------------------------------------------------------------------

    @Test
    fun `TC-SET-031 a save answer for the previous account is not applied after the account changed`() = runTest {
        val r = loaded()
        val g = gate()
        r.repo.updateGates[PushSetting.Topic] = g
        r.repo.scriptUpdate(PushSetting.Topic, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        toggle(r, PushSetting.Topic, false)
        r.holder.onAccountChanged()
        runCurrent()
        assertTrue(r.state.values.isEmpty())
        g.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.state.values.isEmpty(), "the old account's rollback must not repopulate the new account's state")
        assertTrue(r.state.saving.isEmpty())
        assertTrue(r.effects.isEmpty(), "no toast for the previous account")
    }

    @Test
    fun `TC-SET-032 a load answer for the previous account that arrives after the reset is dropped`() = runTest {
        val r = rig()
        val g = gate()
        r.repo.loadGate = g
        r.repo.loadResults += ApiResult.Success(NotificationSettings(topic = false, moderation = false, aiReview = false))
        r.holder.onTabShown()
        runCurrent()
        r.holder.onAccountChanged()
        runCurrent()
        r.repo.loadGate = null
        r.repo.loadResults += ApiResult.Success(FakeNotificationSettingsRepository.ALL_ON)
        r.holder.onTabShown()
        advanceUntilIdle()
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(true, r.value(PushSetting.Topic))
        assertEquals(true, r.value(PushSetting.Moderation))
        assertEquals(true, r.value(PushSetting.AiReview))
    }

    // ---- 401 --------------------------------------------------------------------------------

    @Test
    fun `TC-SET-034 a GET that ends in 401 goes to login without a toast`() = runTest {
        val r = rig()
        r.repo.loadResults += httpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        r.holder.onTabShown()
        advanceUntilIdle()
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.GoLogin), r.effects)
        assertFalse(r.state.switchesEnabled)
    }

    @Test
    fun `TC-SET-034 a PATCH that ends in 401 goes to login without a save-error toast`() = runTest {
        val r = loaded()
        r.repo.scriptUpdate(PushSetting.Topic, httpFailure(401, ErrorCode.UNAUTHORIZED))
        toggle(r, PushSetting.Topic, false)
        advanceUntilIdle()
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.GoLogin), r.effects)
    }

    // ---- device permission ------------------------------------------------------------------

    @Test
    fun `TC-SET-038 turning a switch on while device notifications are denied opens the system settings once and changes nothing`() = runTest {
        val r = loaded(NotificationSettings(topic = false, moderation = true, aiReview = true), NotificationPermission.Denied)
        toggle(r, PushSetting.Topic, true)
        advanceUntilIdle()
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.OpenSystemNotificationSettings), r.effects)
        assertTrue(r.repo.updateCalls.isEmpty(), "REQ-SET-015 provisional: no PATCH")
        assertEquals(false, r.value(PushSetting.Topic))
    }

    @Test
    fun `TC-SET-038 with the device permission granted the switch is saved and the system settings are not opened`() = runTest {
        val r = loaded(NotificationSettings(topic = false, moderation = true, aiReview = true), NotificationPermission.Granted)
        toggle(r, PushSetting.Topic, true)
        advanceUntilIdle()
        assertEquals(listOf(PushSetting.Topic to true), r.repo.updateCalls.toList())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-SET-038 turning a switch off while device notifications are denied still saves normally (REQ-SET-016)`() = runTest {
        val r = loaded(permission = NotificationPermission.Denied)
        toggle(r, PushSetting.Moderation, false)
        advanceUntilIdle()
        assertEquals(listOf(PushSetting.Moderation to false), r.repo.updateCalls.toList())
        assertEquals(false, r.value(PushSetting.Moderation))
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-SET-038 coming back to the foreground re-checks the permission and leaves the switch values alone (REQ-SET-017)`() = runTest {
        val r = loaded(NotificationSettings(topic = false, moderation = true, aiReview = true), NotificationPermission.Denied)
        val checksBefore = r.device.permissionChecks
        r.device.permission = NotificationPermission.Granted
        r.holder.onAppForegrounded()
        advanceUntilIdle()
        assertTrue(r.device.permissionChecks > checksBefore)
        assertEquals(false, r.value(PushSetting.Topic))
        assertEquals(1, r.repo.loadCalls.size, "foreground does not refetch")
        assertTrue(r.repo.updateCalls.isEmpty())
    }

    private fun TestScope.undetermined() =
        loaded(NotificationSettings(topic = false, moderation = true, aiReview = true), NotificationPermission.NotDetermined)

    @Test
    fun `REQ-SET-018 turning a switch on while the permission is not determined asks the system and saves when allowed`() = runTest {
        val r = undetermined()
        r.device.requestAnswer = NotificationPermission.Granted
        toggle(r, PushSetting.Topic, true)
        advanceUntilIdle()
        assertEquals(1, r.device.requests)
        assertEquals(listOf(PushSetting.Topic to true), r.repo.updateCalls.toList())
        assertEquals(true, r.value(PushSetting.Topic))
        assertTrue(r.state.saving.isEmpty())
        assertEquals(NotificationPermission.Granted, r.state.devicePermission)
        assertTrue(r.effects.isEmpty())
        assertEquals(0, r.device.settingsOpened)
    }

    @Test
    fun `REQ-SET-018 a refused system prompt leaves the switch off and sends nothing`() = runTest {
        val r = undetermined()
        r.device.requestAnswer = NotificationPermission.Denied
        toggle(r, PushSetting.Topic, true)
        advanceUntilIdle()
        assertEquals(1, r.device.requests)
        assertTrue(r.repo.updateCalls.isEmpty())
        assertEquals(false, r.value(PushSetting.Topic))
        assertTrue(r.state.saving.isEmpty())
        assertEquals(NotificationPermission.Denied, r.state.devicePermission)
        assertTrue(r.effects.isEmpty(), "no toast and no jump to the system settings after an explicit refusal")
    }

    @Test
    fun `REQ-SET-018 while the prompt is up the switch keeps its value and a second tap is ignored`() = runTest {
        val r = undetermined()
        val g = gate()
        r.device.requestGate = g
        toggle(r, PushSetting.Topic, true)
        assertEquals(false, r.value(PushSetting.Topic))
        assertTrue(PushSetting.Topic in r.state.saving)
        toggle(r, PushSetting.Topic, true)
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, r.device.requests)
        assertEquals(listOf(PushSetting.Topic to true), r.repo.updateCalls.toList())
    }

    @Test
    fun `REQ-SET-018 an allowed prompt followed by a failing save puts the switch back and toasts save-error`() = runTest {
        val r = undetermined()
        r.repo.scriptUpdate(PushSetting.Topic, httpFailure(500, ErrorCode.INTERNAL_ERROR))
        toggle(r, PushSetting.Topic, true)
        advanceUntilIdle()
        assertEquals(false, r.value(PushSetting.Topic))
        assertEquals(listOf<PushSettingsEffect>(PushSettingsEffect.Toast("settings.push.save-error")), r.effects)
    }

    @Test
    fun `REQ-SET-018 leaving the screen while the prompt is up drops its answer, no save and no effect`() = runTest {
        val r = undetermined()
        val g = gate()
        r.device.requestGate = g
        toggle(r, PushSetting.Topic, true)
        r.holder.onScreenGone()
        g.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.repo.updateCalls.isEmpty())
        assertEquals(false, r.value(PushSetting.Topic))
        assertTrue(r.state.saving.isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `REQ-SET-018 a failing permission prompt counts as not granted`() = runTest {
        val r = undetermined()
        r.device.requestFailure = IllegalStateException("boom")
        toggle(r, PushSetting.Topic, true)
        advanceUntilIdle()
        assertTrue(r.repo.updateCalls.isEmpty())
        assertEquals(false, r.value(PushSetting.Topic))
        assertTrue(r.state.saving.isEmpty())
    }

    @Test
    fun `REQ-SET-018 turning a switch off while the permission is not determined saves without asking`() = runTest {
        val r = loaded(permission = NotificationPermission.NotDetermined)
        toggle(r, PushSetting.Moderation, false)
        advanceUntilIdle()
        assertEquals(0, r.device.requests)
        assertEquals(listOf(PushSetting.Moderation to false), r.repo.updateCalls.toList())
    }
}
