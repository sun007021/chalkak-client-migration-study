package kr.chalkak.feature.onboarding

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.Fixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TermsStateHolderTest {
    private class Rig(val holder: TermsStateHolder, val context: SignupContext, val analytics: RecordingAnalytics, val effects: List<TermsEffect>) {
        val state get() = holder.state.value
    }

    private fun TestScope.rig(): Rig {
        val context = SignupContext().apply { begin("id-token-1", "raw-nonce-1") }
        val analytics = RecordingAnalytics()
        val holder = TermsStateHolder(context, analytics)
        return Rig(holder, context, analytics, collectAll(holder.effects))
    }

    @Test
    fun `TC-ONB-002 fresh terms screen has every box off and next disabled`() = runTest {
        val r = rig()
        assertFalse(r.state.agreeService)
        assertFalse(r.state.agreePrivacy)
        assertFalse(r.state.agreeAll)
        assertFalse(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-003 agree all selects both required items`() = runTest {
        val r = rig()
        r.holder.onAgreeAllToggled()
        assertTrue(r.state.agreeService && r.state.agreePrivacy && r.state.agreeAll)
        assertTrue(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-004 agree all toggled again clears both required items`() = runTest {
        val r = rig()
        r.holder.onAgreeAllToggled()
        r.holder.onAgreeAllToggled()
        assertFalse(r.state.agreeService || r.state.agreePrivacy || r.state.agreeAll)
        assertFalse(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-004 agree all with only one item on turns both on`() = runTest {
        val r = rig()
        r.holder.onServiceToggled()
        r.holder.onAgreeAllToggled()
        assertTrue(r.state.agreeService && r.state.agreePrivacy)
    }

    @Test
    fun `TC-ONB-005 one item alone keeps agree all off and next disabled`() = runTest {
        val r = rig()
        r.holder.onServiceToggled()
        assertTrue(r.state.agreeService)
        assertFalse(r.state.agreeAll)
        assertFalse(r.state.nextEnabled)
        r.holder.onServiceToggled()
        r.holder.onPrivacyToggled()
        assertFalse(r.state.agreeAll)
        assertFalse(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-006 selecting both items one by one turns agree all on and enables next`() = runTest {
        val r = rig()
        r.holder.onServiceToggled()
        r.holder.onPrivacyToggled()
        assertTrue(r.state.agreeAll)
        assertTrue(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-007 clearing one item after both were on turns agree all and next off`() = runTest {
        val r = rig()
        r.holder.onServiceToggled()
        r.holder.onPrivacyToggled()
        r.holder.onPrivacyToggled()
        assertTrue(r.state.agreeService)
        assertFalse(r.state.agreePrivacy)
        assertFalse(r.state.agreeAll)
        assertFalse(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-015 next with both items on goes to the signature screen`() = runTest {
        val r = rig()
        r.holder.onAgreeAllToggled()
        r.holder.onNextClicked()
        assertEquals(listOf<TermsEffect>(TermsEffect.GoSignature), r.effects)
    }

    @Test
    fun `TC-ONB-005 next is ignored while a required item is missing`() = runTest {
        val r = rig()
        r.holder.onServiceToggled()
        r.holder.onNextClicked()
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-ONB-008 view buttons emit the shared document URL for the matching kind and keep the checkboxes`() = runTest {
        val r = rig()
        r.holder.onServiceToggled()
        r.holder.onViewClicked(TermsKind.Service)
        r.holder.onViewClicked(TermsKind.Privacy)
        assertEquals(
            listOf<TermsEffect>(
                TermsEffect.OpenDocument(TermsKind.Service, LegalDocuments.url(TermsKind.Service)),
                TermsEffect.OpenDocument(TermsKind.Privacy, LegalDocuments.url(TermsKind.Privacy)),
            ),
            r.effects,
        )
    }

    @Test
    fun `TC-ONB-014 closing the document sheet leaves the checkbox state unchanged`() = runTest {
        val r = rig()
        r.holder.onAgreeAllToggled()
        r.holder.onViewClicked(TermsKind.Privacy)
        r.holder.onDocumentShown(TermsKind.Privacy)
        assertTrue(r.state.agreeService && r.state.agreePrivacy && r.state.agreeAll)
        assertTrue(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-016 consent is memory only so a new holder starts with everything off`() = runTest {
        val first = rig()
        first.holder.onAgreeAllToggled()
        val second = rig()
        assertFalse(second.state.agreeService || second.state.agreePrivacy)
        assertFalse(second.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-017 back from terms discards the signup context and returns to login`() = runTest {
        val r = rig()
        r.holder.onAgreeAllToggled()
        r.holder.onBack()
        assertEquals(listOf<TermsEffect>(TermsEffect.BackToLogin), r.effects)
        assertFalse(r.context.isPresent)
        assertNull(r.context.idToken)
        assertNull(r.context.rawNonce)
    }

    @Test
    fun `TC-ONB-017 coming back to terms after back requires consent again`() = runTest {
        val r = rig()
        r.holder.onAgreeAllToggled()
        r.holder.onBack()
        assertFalse(r.state.nextEnabled)
    }

    @Test
    fun `TC-ONB-046 a new login attempt replaces the idToken and rawNonce pair`() {
        val context = SignupContext()
        context.begin("id-1", "nonce-1")
        assertEquals("id-1", context.idToken)
        assertEquals("nonce-1", context.rawNonce)
        context.begin("id-2", "nonce-2")
        assertEquals("id-2", context.idToken)
        assertEquals("nonce-2", context.rawNonce)
        assertTrue(context.isPresent)
    }

    @Test
    fun `TC-ONB-046 context never prints its secrets`() {
        val context = SignupContext().apply { begin("secret-id-token", "secret-raw-nonce") }
        assertFalse("secret" in context.toString())
    }

    @Test
    fun `TC-ONB-049 terms and document screens send their screen_view names`() = runTest {
        val r = rig()
        r.holder.onScreenShown()
        r.holder.onDocumentShown(TermsKind.Service)
        r.holder.onDocumentShown(TermsKind.Privacy)
        assertEquals(listOf("terms", "terms_of_service", "privacy_policy"), r.analytics.screens.toList())
    }
}

class LegalDocumentsTest {
    private val inApp = listOf(
        "https://www.notion.so/page", "https://x.notion.site/doc", "https://notion.com/p/1",
        "https://app.notion.com/p/3c66b8e8e3678064b543c26b5c0f932d?source=copy_link",
    )

    @Test
    fun `TC-ONB-009 terms URLs are the shared constants for both documents`() {
        val urls = Fixtures.constants().getValue("TERMS_URLS").jsonObject
        assertEquals(urls.getValue("service").jsonPrimitive.content, LegalDocuments.url(TermsKind.Service))
        assertEquals(urls.getValue("privacy").jsonPrimitive.content, LegalDocuments.url(TermsKind.Privacy))
    }

    @Test
    fun `TC-ONB-009 the shared terms URLs are opened in app`() {
        assertEquals(DocumentTarget.InApp, LegalDocuments.classify(LegalDocuments.url(TermsKind.Service)))
        assertEquals(DocumentTarget.InApp, LegalDocuments.classify(LegalDocuments.url(TermsKind.Privacy)))
    }

    @Test
    fun `TC-ONB-010 https notion hosts and subdomains open in app`() {
        inApp.forEach { assertEquals(DocumentTarget.InApp, LegalDocuments.classify(it), it) }
    }

    @Test
    fun `TC-ONB-011 look-alike hosts plain http and userinfo never open in app`() {
        listOf(
            "http://notion.so",
            "http://www.notion.so/page",
            "https://notion.com.evil.example",
            "https://evil.example/notion.so",
            "https://evil.example/?u=https://notion.so",
            "https://notion.so@evil.example/page",
            "https://user:pw@notion.so/page",
            "https://evilnotion.so/page",
            "https://notion.so.evil.example/page",
        ).forEach { assertTrue(LegalDocuments.classify(it) != DocumentTarget.InApp, it) }
    }

    @Test
    fun `TC-ONB-011 blank and non web schemes are rejected`() {
        listOf("", "   ", null, "javascript:alert(1)", "file:///etc/passwd", "intent://x#Intent;end", "not a url").forEach {
            assertEquals(DocumentTarget.Rejected, LegalDocuments.classify(it), "$it")
        }
    }

    @Test
    fun `TC-ONB-011 other https URLs go to the external browser`() {
        assertEquals(DocumentTarget.External, LegalDocuments.classify("https://example.com/terms"))
    }

    @Test
    fun `TC-ONB-013 external browser failure shows the cannot-open message`() {
        val browser = FakeExternalBrowser(canOpen = false)
        val result = LegalDocumentOpener(browser).open("https://example.com/terms")
        assertEquals(DocumentOpenResult.CannotOpen("onb.terms.doc.cannot-open"), result)
        assertTrue(Copy["onb.terms.doc.cannot-open"].isNotBlank())
    }

    @Test
    fun `TC-ONB-013 a throwing browser adapter also shows cannot-open`() {
        val result = LegalDocumentOpener(FakeExternalBrowser(failure = IllegalStateException("no activity"))).open("https://example.com/terms")
        assertIs<DocumentOpenResult.CannotOpen>(result)
    }

    @Test
    fun `TC-ONB-013 rejected URLs never reach the browser`() {
        val browser = FakeExternalBrowser()
        assertIs<DocumentOpenResult.CannotOpen>(LegalDocumentOpener(browser).open("javascript:alert(1)"))
        assertTrue(browser.opened.isEmpty())
    }

    @Test
    fun `TC-ONB-010 in app documents do not touch the external browser`() {
        val browser = FakeExternalBrowser()
        assertEquals(DocumentOpenResult.InApp(inApp[0]), LegalDocumentOpener(browser).open(inApp[0]))
        assertTrue(browser.opened.isEmpty())
    }

    @Test
    fun `TC-ONB-013 external URLs are opened by the browser`() {
        val browser = FakeExternalBrowser()
        assertEquals(DocumentOpenResult.OpenedExternally, LegalDocumentOpener(browser).open("https://example.com/terms"))
        assertEquals(listOf("https://example.com/terms"), browser.opened.toList())
    }
}
