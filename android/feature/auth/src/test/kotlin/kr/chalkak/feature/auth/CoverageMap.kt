package kr.chalkak.feature.auth

/*
 * BOOT/AUTH test coverage map for Android (catalog: docs/testing/catalog/boot-auth.md).
 *
 * Covered by JVM tests (names contain the TC id):
 *   BOOT 001-015, 023, 025-027, 029-032, 034, 035
 *   AUTH 002-008, 009-012, 013-029, 030-035, 036-040, 042(partly via TC-NET-027), 043-049, 051-053, 056-058
 *   Files: core/data AuthRepositoryTest, NonceTest, PersistentSessionStoreTest;
 *          feature/auth BootGateTest, LoginStateHolderTest, AccountActionsTest, PlatformPortsTest.
 *
 * Deferred:
 *   :app Compose screen tests (W/S): BOOT-001(W part) 015(W) 016(W part) 028 033(Web only) 039(A);
 *                                    AUTH-001 027(W part) 029(W part)
 *   Maestro E2E (E): BOOT-009(E part) 036 037; AUTH-050 056(E part)
 *   Agent scenarios (A): BOOT-038 039; AUTH-061 062 063 064 065
 *   iOS-only (not Android): BOOT-016 017 018 019 020 021 022 024 (iTunes lookup)
 *   Web-only: BOOT-033; AUTH-059 060 065
 *   Owned by :core:network (TC-NET-*): AUTH-054 055 (Authorization header rules), 042 (late response after account switch)
 *   Owned by later PRs: BOOT-035 real push-tap queue (NOTI), AUTH-041 per-feature cache contents (each feature's
 *     UserDataResetter participant), AUTH-010 signup flow after terms (ONB).
 */
internal object CoverageMap
