package kr.chalkak.core.data.notification

import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** JWT `session_id` detection for push registration (no signature check). Tokens come from `push/jwt__*` fixtures. */
class AccessTokenClaimsTest {
    private fun token(path: String): String = Fixtures.json(path).jsonObject.getValue("token").jsonPrimitive.content

    private fun expected(path: String): Boolean =
        Fixtures.json(path).jsonObject.getValue("expect").jsonObject.getValue("hasSessionId").jsonPrimitive.booleanOrNull!!

    @Test
    fun `TC-PUSH-022 a token with a session_id claim is detected so registration needs no refresh`() {
        val path = "push/jwt__with-session-id.json"
        assertTrue(expected(path))
        assertTrue(AccessTokenClaims.hasSessionId(token(path)))
    }

    @Test
    fun `TC-PUSH-023 a token without a session_id claim is detected so a refresh happens first`() {
        val path = "push/jwt__without-session-id.json"
        assertFalse(expected(path))
        assertFalse(AccessTokenClaims.hasSessionId(token(path)))
    }

    @Test
    fun `TC-PUSH-026 every malformed token counts as no session_id and never throws`() {
        val cases = Fixtures.json("push/jwt__malformed.json").jsonObject.getValue("cases").jsonArray
        assertEquals(7, cases.size)
        for (case in cases) {
            val name = case.jsonObject.getValue("name").jsonPrimitive.content
            val token = case.jsonObject.getValue("token").jsonPrimitive.content
            assertFalse(AccessTokenClaims.hasSessionId(token), name)
        }
    }

    @Test
    fun `TC-PUSH-026 the signature part is never verified`() {
        val parts = token("push/jwt__with-session-id.json").split('.')
        assertTrue(AccessTokenClaims.hasSessionId("${parts[0]}.${parts[1]}.not-the-fixture-signature"))
    }
}
