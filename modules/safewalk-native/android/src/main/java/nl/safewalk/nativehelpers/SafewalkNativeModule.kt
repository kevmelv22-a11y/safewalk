package nl.safewalk.nativehelpers

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
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

    // Alarm-voorgronddienst (type mediaPlayback) met vaste melding "SafeWalk-alarm actief".
    Function("startAlarmForegroundService") {
      appContext.reactContext?.let { AlarmForegroundService.start(it.applicationContext) } ?: false
    }

    Function("stopAlarmForegroundService") {
      appContext.reactContext?.let { AlarmForegroundService.stop(it.applicationContext) } ?: false
    }

    Function("isAlarmForegroundServiceRunning") { AlarmForegroundService.isRunning }

    // Automatische sms (alleen als JS dat expliciet vraagt; geen verzending vanuit native zelf).
    // Weigert zonder SEND_SMS, bij een ongeldig nummer of een te lange tekst (max. 160 tekens = 1 sms).
    Function("hasSendSmsPermission") {
      val ctx = appContext.reactContext ?: return@Function false
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
    }

    Function("canSendSms") { true }

    AsyncFunction("sendSms") { phone: String, body: String ->
      val ctx = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "reason" to "no_context")
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "permission")
      }
      if (!phone.matches(Regex("^\\+[0-9]{8,15}$"))) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "bad_phone")
      }
      if (body.isBlank() || body.length > 160) {
        return@AsyncFunction mapOf("ok" to false, "reason" to "bad_body")
      }
      try {
        @Suppress("DEPRECATION")
        val sms = SmsManager.getDefault()
        sms.sendTextMessage(phone, null, body, null, null)
        mapOf("ok" to true)
      } catch (e: Exception) {
        mapOf("ok" to false, "reason" to "failed")
      }
    }

    Function("getCapabilities") {
      mapOf(
        "volumeDoublePress" to true,
        "backgroundTorch" to false,
        "alarmForegroundService" to true,
        "autoSms" to true,
        "notes" to "Volume×2 alleen terwijl SafeWalk Activity op voorgrond is. Torch vereist foreground CameraView; geen background torch. Automatische sms alleen na opt-in en SEND_SMS."
      )
    }
  }

  companion object {
    @JvmStatic var keyCallback: ((Int, Int) -> Boolean)? = null
    @JvmStatic var activityHolder: WeakReference<android.app.Activity?> = WeakReference(null)
  }
}
