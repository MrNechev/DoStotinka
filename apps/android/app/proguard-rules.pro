# The JavaScript bridge is called by name from the web app.
-keepclassmembers class app.dostotinka.android.AppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
