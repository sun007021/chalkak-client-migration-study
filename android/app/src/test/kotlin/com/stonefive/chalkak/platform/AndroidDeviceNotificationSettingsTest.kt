package com.stonefive.chalkak.platform

import kotlinx.coroutines.test.runTest
import kr.chalkak.feature.notification.NotificationPermissionPort
import kr.chalkak.feature.notification.OsPermissionState
import kr.chalkak.feature.notification.PermissionPromptStore
import kr.chalkak.feature.notification.PermissionRequestResult
import kr.chalkak.feature.settings.NotificationPermission
import org.junit.Test
import kotlin.test.assertEquals

/** Settings push switch vs. the OS runtime prompt of the push module (REQ-SET-015..018, TC-SET-038). */
class AndroidDeviceNotificationSettingsTest {
    private class Port(var result: PermissionRequestResult = PermissionRequestResult.Granted) : NotificationPermissionPort {
        var requests = 0
        override suspend fun state() = OsPermissionState.NotDetermined
        override suspend fun request(): PermissionRequestResult { requests++; return result }
    }

    private class Prompts(var asked: Boolean = false) : PermissionPromptStore {
        override suspend fun wasRequested() = asked
        override suspend fun markRequested() { asked = true }
    }

    private class Env(sdk: Int, enabled: Boolean, held: Boolean, asked: Boolean = false, answer: PermissionRequestResult = PermissionRequestResult.Granted) {
        val port = Port(answer)
        val prompts = Prompts(asked)
        var opened = 0
        val device = AndroidDeviceNotificationSettings(port, prompts, sdk, { enabled }, { held }, { opened++ })
    }

    @Test
    fun `TC-SET-038 Android 13 이상에서 권한이 없으면 아직 안 물었다고 보고 처음에는 OS 팝업을 띄운다`() = runTest {
        val env = Env(sdk = 34, enabled = false, held = false)
        assertEquals(NotificationPermission.NotDetermined, env.device.permission())
        assertEquals(NotificationPermission.Granted, env.device.requestPermission())
        assertEquals(1, env.port.requests)
        assertEquals(0, env.opened)
        assertEquals(true, env.prompts.asked)
    }

    @Test
    fun `TC-SET-038 팝업에서 거부하면 거부로 답하고 시스템 설정은 열지 않는다`() = runTest {
        val env = Env(sdk = 34, enabled = false, held = false, answer = PermissionRequestResult.Denied)
        assertEquals(NotificationPermission.Denied, env.device.requestPermission())
        assertEquals(0, env.opened)
    }

    @Test
    fun `TC-SET-038 이미 물어본 적이 있으면 팝업 없이 시스템 알림 설정을 연다`() = runTest {
        val env = Env(sdk = 34, enabled = false, held = false, asked = true)
        assertEquals(NotificationPermission.Denied, env.device.requestPermission())
        assertEquals(0, env.port.requests)
        assertEquals(1, env.opened)
    }

    @Test
    fun `TC-SET-038 권한은 있지만 시스템 설정에서 알림을 끄면 거부로 본다`() {
        assertEquals(NotificationPermission.Denied, Env(34, enabled = false, held = true).device.permission())
        assertEquals(NotificationPermission.Granted, Env(34, enabled = true, held = true).device.permission())
    }

    @Test
    fun `Android 12 이하는 런타임 권한이 없어 허용 여부만 보고 팝업을 쓰지 않는다`() = runTest {
        assertEquals(NotificationPermission.Denied, Env(31, enabled = false, held = true).device.permission())
        assertEquals(NotificationPermission.Granted, Env(31, enabled = true, held = true).device.permission())
        val env = Env(31, enabled = false, held = true)
        assertEquals(NotificationPermission.Denied, env.device.requestPermission())
        assertEquals(0, env.port.requests)
    }
}
