plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    `java-test-fixtures`
}

dependencies {
    testFixturesApi(project(":core:network"))
    testFixturesApi(testFixtures(project(":core:common")))
    testFixturesApi(libs.okhttp.mockwebserver)
    testFixturesApi(libs.kotlinx.coroutines.test)
    testFixturesImplementation(libs.kotlin.test.junit5)
    api(project(":core:common"))
    api(libs.okhttp)
    api(libs.kotlinx.serialization.json)
    api(libs.kotlinx.coroutines.core)

    testImplementation(testFixtures(project(":core:common")))
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    testImplementation(libs.kotlin.test.junit5)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
