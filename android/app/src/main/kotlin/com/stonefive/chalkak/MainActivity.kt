package com.stonefive.chalkak

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.stonefive.chalkak.ui.ChalkakRoot
import com.stonefive.chalkak.ui.theme.ChalkakTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as ChalkakApplication).container
        setContent {
            ChalkakTheme {
                ChalkakRoot(copy = container.copy)
            }
        }
    }
}
