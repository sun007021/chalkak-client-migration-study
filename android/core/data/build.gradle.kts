plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    `java-test-fixtures`
}

dependencies {
    api(project(":core:network"))
    testFixturesApi(project(":core:data"))
    testFixturesApi(testFixtures(project(":core:common")))

    testImplementation(testFixtures(project(":core:common")))
    testImplementation(testFixtures(project(":core:network")))
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    testImplementation(libs.kotlin.test.junit5)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
