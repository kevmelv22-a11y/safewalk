import ExpoModulesCore

/**
 * iOS levert geen betrouwbare app-level volume-knop events zonder private API.
 * Module blijft aanwezig voor uniforme JS API; volumeDoublePress = false.
 * Background torch wordt niet geclaimd (Camera alleen foreground).
 */
public class SafewalkNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SafewalkNative")
    Events("onVolumeDoublePress")

    Function("isVolumeDoublePressSupported") { () -> Bool in
      return false
    }

    Function("setVolumeDoublePressEnabled") { (_: Bool) in
      // no-op on iOS
    }

    Function("getCapabilities") { () -> [String: Any] in
      return [
        "volumeDoublePress": false,
        "backgroundTorch": false,
        "notes": "iOS: geen volume×2 hook. Gebruik App Shortcut / Control / deep link safewalk://quick-ping. Torch alleen met actieve Camera (foreground)."
      ]
    }
  }
}
