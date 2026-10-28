plugins {
    alias(libs.plugins.kotlin.jvm)
}

dependencies {
    api(project(":core:data"))
    // HomeMode (guest vs member) lives in feature/auth Ports.kt; FeedEntry.FromRecord in feature/display.
    api(project(":feature:auth"))
    api(project(":feature:display"))

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
