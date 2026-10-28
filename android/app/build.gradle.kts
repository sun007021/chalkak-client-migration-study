import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.FileSystemOperations
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import javax.inject.Inject

plugins {
    id("com.android.application") // version: root buildscript classpath (agp in libs.versions.toml)
    alias(libs.plugins.kotlin.compose)
}

/**
 * Copies `shared/copy/ko.json` and `shared/constants.json` into generated assets (`assets/shared/...`) at build time.
 * Nothing is duplicated in git; the files are read at run time by `Copy` / tests through `AssetManager`.
 */
abstract class CopySharedAssetsTask @Inject constructor(private val fs: FileSystemOperations) : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val copyJson: RegularFileProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val constantsJson: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        fs.delete { delete(outputDir) }
        fs.copy {
            from(copyJson) { into("shared/copy") }
            from(constantsJson) { into("shared") }
            into(outputDir)
        }
    }
}

val sharedDir = rootProject.projectDir.parentFile.resolve("shared")

// `-PapiBaseUrl=https://...` (origin only; the app appends /api/v1). Debug defaults to the mock server as seen from the emulator.
val apiBaseUrlOverride: String? = providers.gradleProperty("apiBaseUrl").orNull?.takeIf { it.isNotBlank() }
fun String.asBuildConfigString(): String = "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.stonefive.chalkak"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.stonefive.chalkak"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", (apiBaseUrlOverride ?: "http://10.0.2.2:4010").asBuildConfigString())
        }
        release {
            // Release never points at the mock server; the default is the dev server unless -PapiBaseUrl is given.
            buildConfigField("String", "API_BASE_URL", (apiBaseUrlOverride ?: "https://chalkak-dev.pysun.kr").asBuildConfigString())
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = true
        compose = true
    }
    testOptions {
        unitTests {
            // Robolectric needs merged resources/assets/manifest.
            isIncludeAndroidResources = true
            all {
                // BuildConfigTest pins the default API_BASE_URL only when -PapiBaseUrl did not replace it.
                if (apiBaseUrlOverride != null) it.systemProperty("apiBaseUrlOverridden", "true")
            }
        }
    }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        allWarningsAsErrors.set(true)
    }
}

androidComponents {
    onVariants { variant ->
        val task = tasks.register<CopySharedAssetsTask>("copySharedAssets${variant.name.replaceFirstChar { it.uppercase() }}") {
            copyJson.set(sharedDir.resolve("copy/ko.json"))
            constantsJson.set(sharedDir.resolve("constants.json"))
            outputDir.set(layout.buildDirectory.dir("generated/sharedAssets/${variant.name}"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(task, CopySharedAssetsTask::outputDir)
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:network"))
    implementation(project(":core:data"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:onboarding"))
    implementation(project(":feature:home"))
    implementation(project(":feature:display"))
    implementation(project(":feature:settings"))
    implementation(project(":feature:notification"))
    implementation(project(":feature:record"))
    implementation(project(":feature:aireview"))
    implementation(project(":feature:upload"))
    implementation(project(":feature:navigation"))

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.kotlinx.serialization.json)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit4)
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.kotlinx.coroutines.test)
}
