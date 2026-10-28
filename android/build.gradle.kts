plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.android.application) apply false
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
                exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT
            }
        }
    }
}
