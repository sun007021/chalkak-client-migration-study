pluginManagement {
    // Whether the Android :app module is part of the build (see hasAndroidSdk below). pluginManagement is evaluated
    // before the rest of this script, so it cannot share that value and repeats the check.
    val androidSdkPresent = file("local.properties").takeIf { it.exists() }
        ?.readLines()?.any { it.trim().startsWith("sdk.dir=") } == true || !System.getenv("ANDROID_HOME").isNullOrBlank()
    repositories {
        // AGP is published on Google's Maven only. Added only with an SDK: google() is unreachable in SDK-less CI/sandboxes
        // and the pure-Kotlin modules never need it.
        if (androidSdkPresent) {
            google {
                content {
                    includeGroupByRegex("com\\.android.*")
                    includeGroupByRegex("com\\.google.*")
                    includeGroupByRegex("androidx.*")
                }
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        // google() is added only when the Android :app module is included (hasAndroidSdk, below),
        // because google()/dl.google.com is unreachable in SDK-less CI/sandbox environments.
    }
}

rootProject.name = "chalkak-android"

include(":core:common")
include(":core:network")
include(":core:data")
include(":feature:auth")
include(":feature:onboarding")
include(":feature:home")
include(":feature:display")
include(":feature:settings")
include(":feature:notification")
include(":feature:record")
include(":feature:aireview")
include(":feature:upload")
include(":feature:navigation")

// The Android :app module is included only when an Android SDK is available (local.properties `sdk.dir` or env ANDROID_HOME), so that
// `./gradlew test` for the pure-Kotlin modules works without the SDK.
val hasAndroidSdk: Boolean = run {
    val localProps = file("local.properties")
    val fromFile = localProps.takeIf { it.exists() }?.readLines()?.any { it.trim().startsWith("sdk.dir=") } == true
    fromFile || !System.getenv("ANDROID_HOME").isNullOrBlank()
}
if (hasAndroidSdk && file("app/build.gradle.kts").exists()) {
    dependencyResolutionManagement {
        repositories {
            google {
                content {
                    includeGroupByRegex("com\\.android.*")
                    includeGroupByRegex("com\\.google.*")
                    includeGroupByRegex("androidx.*")
                }
            }
        }
    }
    // Kakao SDK (only with -PkakaoNativeAppKey): its repository is not reachable from every sandbox, so it is never added otherwise.
    if (!providers.gradleProperty("kakaoNativeAppKey").orNull.isNullOrBlank()) {
        dependencyResolutionManagement {
            repositories {
                maven {
                    url = uri("https://devrepo.kakao.com/nexus/content/groups/public/")
                    content { includeGroup("com.kakao.sdk") }
                }
            }
        }
    }
    include(":app")
}
