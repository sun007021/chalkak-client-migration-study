package com.stonefive.chalkak

import android.app.Application
import com.stonefive.chalkak.di.AppContainer

class ChalkakApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer.create(this)
    }
}
