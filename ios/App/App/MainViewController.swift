import UIKit
import Capacitor

/// Registers app-local Capacitor plugins. Plugins that live in the app target
/// (not in an npm package) are not auto-registered by Capacitor.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoMetadataPlugin())
        bridge?.registerPluginInstance(MediaLibraryPlugin())
    }
}
