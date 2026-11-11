package nl.safewalk.nativehelpers

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Foreground service (type mediaPlayback) voor het SafeWalk-gevaaralarm.
 *
 * Het alarmgeluid zelf speelt via expo-audio in het app-proces; deze service houdt dat proces
 * als voorgronddienst actief zolang het alarm klinkt (ook met scherm uit) en toont een vaste,
 * zichtbare melding. Tikken op de melding opent SafeWalk weer, waar het alarm alleen met de
 * veiligheidscode stopt. Er zit bewust geen "Stop"-knop in de melding.
 *
 * Start: ACTION_START (vanuit de app terwijl die op de voorgrond is, bij het starten van het alarm).
 * Stop: ACTION_STOP / stopService(), en automatisch als de taak wordt weggeveegd.
 */
class AlarmForegroundService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopAlarmForeground()
      return START_NOT_STICKY
    }
    createChannelIfNeeded(this)
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      isRunning = true
      // stop() kwam binnen vóór deze START werd verwerkt: nu (na startForeground) netjes stoppen,
      // anders gooit Android "startForegroundService() did not then call startForeground()".
      if (stopRequested) stopAlarmForeground()
    } catch (e: Exception) {
      // Bijv. ForegroundServiceStartNotAllowedException als de app al op de achtergrond is.
      Log.w(TAG, "Alarm-voorgronddienst kon niet starten", e)
      isRunning = false
      stopSelf()
    }
    // Niet herstarten na proceskill: zonder app-proces speelt er ook geen alarmgeluid.
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // App weggeveegd: alarmgeluid stopt met het proces, dus melding ook opruimen.
    stopAlarmForeground()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  private fun stopAlarmForeground() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    isRunning = false
    stopSelf()
  }

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val contentIntent = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    builder
      .setContentTitle(TITLE)
      .setContentText(TEXT)
      .setStyle(Notification.BigTextStyle().bigText(TEXT))
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }

  companion object {
    private const val TAG = "SafeWalkAlarmFgs"
    const val CHANNEL_ID = "safewalk_alarm_channel"
    const val NOTIFICATION_ID = 4711
    const val ACTION_START = "nl.safewalk.nativehelpers.action.START_ALARM"
    const val ACTION_STOP = "nl.safewalk.nativehelpers.action.STOP_ALARM"
    const val TITLE = "SafeWalk-alarm actief"
    const val TEXT = "Het alarm speelt door, ook met je scherm uit. Tik om SafeWalk te openen en stop het alarm met je veiligheidscode."

    @Volatile @JvmStatic var isRunning = false
    @Volatile private var stopRequested = false

    fun createChannelIfNeeded(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      // Stil kanaal: het alarmgeluid komt uit de app zelf, de melding zelf maakt geen extra geluid.
      val channel = NotificationChannel(CHANNEL_ID, "SafeWalk-alarm", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Vaste melding zolang het SafeWalk-gevaaralarm klinkt"
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
      nm.createNotificationChannel(channel)
    }

    /** Start de dienst. Moet aangeroepen worden terwijl de app op de voorgrond is (Android 12+). */
    fun start(context: Context): Boolean {
      val intent = Intent(context, AlarmForegroundService::class.java).setAction(ACTION_START)
      stopRequested = false
      return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
        true
      } catch (e: Exception) {
        Log.w(TAG, "startForegroundService mislukt", e)
        false
      }
    }

    fun stop(context: Context): Boolean {
      stopRequested = true
      // Nog niet op de voorgrond? Dan stopt onStartCommand(START) zelf direct na startForeground.
      if (!isRunning) return true
      return try {
        context.stopService(Intent(context, AlarmForegroundService::class.java))
        isRunning = false
        true
      } catch (e: Exception) {
        Log.w(TAG, "stopService mislukt", e)
        false
      }
    }
  }
}
