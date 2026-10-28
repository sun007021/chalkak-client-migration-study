// AGP must sit on the same (root) classpath as the Kotlin Gradle plugin, otherwise the Kotlin plugin and AGP end up in
// different classloaders and `:app` fails with NoClassDefFoundError: com/android/build/gradle/api/BaseVariant.
// `alias(libs.plugins.android.application) apply false` would do that, but it also forces AGP to resolve in SDK-less
// environments (google() is unreachable there), so AGP is put on the classpath here only when :app is included.
buildscript {
    val androidSdkPresent = file("local.properties").takeIf { it.exists() }
        ?.readLines()?.any { it.trim().startsWith("sdk.dir=") } == true || !System.getenv("ANDROID_HOME").isNullOrBlank()
    if (androidSdkPresent) {
        // buildscript {} cannot use the version catalog accessors, so read the single version line from it.
        val agpVersion = file("gradle/libs.versions.toml").readLines()
            .first { it.trim().startsWith("agp") }.substringAfter("\"").substringBefore("\"")
        repositories {
            google {
                content {
                    includeGroupByRegex("com\\.android.*")
                    includeGroupByRegex("com\\.google.*")
                    includeGroupByRegex("androidx.*")
                }
            }
            mavenCentral()
        }
        dependencies { classpath("com.android.tools.build:gradle:$agpVersion") }
    }
}

plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

// Shared convention for pure Kotlin/JVM modules (no build-logic module on purpose).
subprojects {
    plugins.withId("org.jetbrains.kotlin.jvm") {
        extensions.configure<org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension> {
            jvmToolchain(21)
            compilerOptions {
                jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
                allWarningsAsErrors.set(true)
            }
        }
        tasks.withType<JavaCompile>().configureEach {
            options.release.set(17)
        }
        tasks.withType<Test>().configureEach {
            useJUnitPlatform()
            // shared/ lives next to android/ at the repo root.
            systemProperty("shared.dir", rootDir.parentFile.resolve("shared").path)
            systemProperty("android.dir", rootDir.path)
            // Tests read fixtures, copy and constants from shared/ at run time; declare them
            // as inputs so a shared/ change re-runs tests instead of reusing the cached result.
            inputs.dir(rootDir.parentFile.resolve("shared/fixtures")).withPropertyName("sharedFixtures")
            inputs.dir(rootDir.parentFile.resolve("shared/copy")).withPropertyName("sharedCopy")
            inputs.file(rootDir.parentFile.resolve("shared/constants.json")).withPropertyName("sharedConstants")
            testLogging {
                events("passed", "failed", "skipped")
                exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
            }
        }
    }
}
