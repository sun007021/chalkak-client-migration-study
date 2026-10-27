plugins {
    alias(libs.plugins.kotlin.jvm) apply false
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
            testLogging {
                events("passed", "failed", "skipped")
                exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT
            }
        }
    }
}
