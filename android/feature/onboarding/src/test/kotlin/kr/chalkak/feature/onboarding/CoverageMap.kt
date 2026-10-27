package kr.chalkak.feature.onboarding

/*
 * ONB/SIGN test coverage map for Android (catalog: docs/testing/catalog/onboarding-signature.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   ONB  002-011, 013-017, 019-044 (020-023 and the HTTP halves of 019/030-042 in core/data), 046, 049
 *        008 and 015 cover the logic half only (effects); the E halves are deferred below.
 *   SIGN 001-016 (002/009-013/016 pixel tests in SignaturePngEncoderTest), 018-040, 042, 043
 *        (019-022, 026, 028-035, 039, 040 HTTP halves in core/data SignatureRepositoryTest)
 *   Files: core/data SignupRepositoryTest, SignatureRepositoryTest;
 *          feature/onboarding TermsStateHolderTest (+LegalDocumentsTest), SignaturePadStateHolderTest,
 *          SignaturePngEncoderTest, SignupStateHolderTest, SignatureSettingsTest.
 *
 * Deferred:
 *   :app Compose screen tests (W): ONB-001 012 048 (+ W parts of 002 005 014); SIGN-017 041 (+ W parts of 001 025 040)
 *   Maestro E2E (E): ONB-008 (E half) 015 (E half) 018 024 (E half: back stack) 045; SIGN-008 (E half)
 *   Agent scenarios (A): ONB-050 051 052; SIGN-044 045
 *   Owned by PUSH (not this module): ONB-047 (first-home notification permission prompt)
 *   Not fixed yet: SIGN-012 golden-pixel comparison (needs shared/ sample strokes + expected PNG, spec open question 1);
 *     the encoder test checks thickness, round caps, bounds and centering instead.
 */
internal object CoverageMap
