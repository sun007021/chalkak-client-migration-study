plugins {
    alias(libs.plugins.kotlin.jvm)
}

dependencies {
    api(project(":core:data"))
    // HomeMode / HomePreloader live in feature/auth Ports.kt (reused, not moved).
    api(project(":feature:auth"))

    testImplementation(testFixtures(project(":core:common")))
    testImplementation(testFixtures(project(":core:data")))
    testImplementation(testFixtures(project(":core:network")))
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    testImplementation(libs.kotlin.test.junit5)
    testImplementation(libs.kotlinx.coroutines.test)
}

kotlin {
    // Virtual-time helpers (runCurrent, advanceTimeBy, UnconfinedTestDispatcher) are used throughout the tests.
    compilerOptions { optIn.add("kotlinx.coroutines.ExperimentalCoroutinesApi") }
}
