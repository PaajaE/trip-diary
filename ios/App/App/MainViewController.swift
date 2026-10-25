import UIKit
import Capacitor

/// Registers app-local Capacitor plugins. Plugins that live in the app target
/// (not in an npm package) are not auto-registered by Capacitor.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoMetadataPlugin())
        bridge?.registerPluginInstance(MediaLibraryPlugin())
        bridge?.registerPluginInstance(VideoPlugin())
        applyAdaptiveBackground()
    }

    /// Same values as `--color-background` in src/index.css (light / dark), so
    /// overscroll, rotation and the first frame never flash a mismatched colour.
    private func applyAdaptiveBackground() {
        let background = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x1f / 255, green: 0x24 / 255, blue: 0x20 / 255, alpha: 1)
                : UIColor(red: 0xf8 / 255, green: 0xf5 / 255, blue: 0xef / 255, alpha: 1)
        }
        view.backgroundColor = background
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background
        webView?.underPageBackgroundColor = background
    }
}
