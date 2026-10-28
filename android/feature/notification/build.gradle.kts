plugins {
    alias(libs.plugins.kotlin.jvm)
}

dependencies {
    api(project(":core:data"))
    // Reused ports: PushRegistrar / HomeMode (auth), DeviceRegistrar (onboarding). Not redefined here.
    api(project(":feature:auth"))
    api(project(":feature:onboarding"))

    testImplementation(testFixtures(project(":core:common")))
    testImplementation(testFixtures(project(":core:data")))
    testImplementation(testFixtures(project(":core:network")))
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    testImplementation(libs.kotlin.test.junit5)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}

kotlin {
    // Virtual-time helpers are used throughout the tests.
    compilerOptions { optIn.add("kotlinx.coroutines.ExperimentalCoroutinesApi") }
}
