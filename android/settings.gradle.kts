pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        // google() is added only when the Android :app module is included (see below),
        // because google()/dl.google.com is unreachable in SDK-less CI/sandbox environments.
    }
}

rootProject.name = "chalkak-android"

include(":core:common")
include(":core:network")
include(":core:data")
include(":feature:auth")

// The Android :app module is NOT part of the scaffold PR. It is included only when an
// Android SDK is available (local.properties `sdk.dir` or env ANDROID_HOME), so that
// `./gradlew test` for the pure-Kotlin modules works without the SDK.
val hasAndroidSdk: Boolean = run {
    val localProps = file("local.properties")
    val fromFile = localProps.takeIf { it.exists() }?.readLines()?.any { it.trim().startsWith("sdk.dir=") } == true
    fromFile || !System.getenv("ANDROID_HOME").isNullOrBlank()
}
if (hasAndroidSdk && file("app/build.gradle.kts").exists()) {
    // dependencyResolutionManagement { repositories { google() } } is wired in when :app lands.
    include(":app")
}
