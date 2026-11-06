package nl.safewalk.native

import android.content.Intent
import android.net.Uri
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Foreground-only volume double-press.
 * Geen AccessibilityService, geen globale key-intercept buiten de Activity.
 * Background torch wordt bewust NIET geclaimd.
 */
class SafewalkNativeModule : Module() {
  private var enabled = false
  private var lastAt = 0L
  private var lastCode = 0

  override fun definition() = ModuleDefinition {
    Name("SafewalkNative")
    Events("onVolumeDoublePress")

    OnCreate {
      activityHolder = WeakReference(appContext.currentActivity)
      keyCallback = { code, action ->
        if (!enabled || action != KeyEvent.ACTION_DOWN) false
        else if (code != KeyEvent.KEYCODE_VOLUME_UP && code != KeyEvent.KEYCODE_VOLUME_DOWN) false
        else {
          val now = System.currentTimeMillis()
          val isDouble = code == lastCode && now - lastAt < 450
          lastAt = now
          lastCode = code
          if (isDouble) {
            sendEvent("onVolumeDoublePress", mapOf<String, Any>())
            // consume niet: systeem mag volume nog wijzigen; voorkomt "dode" volumeknop
            false
          } else false
        }
      }
    }

    OnDestroy {
      keyCallback = null
      activityHolder = WeakReference(null)
    }

    Function("isVolumeDoublePressSupported") { true }

    Function("setVolumeDoublePressEnabled") { value: Boolean ->
      enabled = value
    }

    // Alleen ACTION_DIAL + tel:112 — nooit ACTION_CALL, geen CALL_PHONE-permission.
    AsyncFunction("openEmergencyDialer") {
      val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:112"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        val ctx = appContext.reactContext
          ?: throw IllegalStateException("Geen Activity/Context voor kiezer")
        ctx.startActivity(intent)
      }
      true
    }

    Function("getCapabilities") {
      mapOf(
        "volumeDoublePress" to true,
        "backgroundTorch" to false,
        "notes" to "Volume×2 alleen terwijl SafeWalk Activity op voorgrond is. Torch vereist foreground CameraView; geen background torch."
      )
    }
  }

  companion object {
    @JvmStatic var keyCallback: ((Int, Int) -> Boolean)? = null
    @JvmStatic var activityHolder: WeakReference<android.app.Activity?> = WeakReference(null)
  }
}
