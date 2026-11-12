#if canImport(UIKit)
import SwiftUI
import UIKit
import WebKit
import WidgetKit

/// Where the diary lives. Anything outside it opens in the right iPhone app instead.
enum Diary {
    static let start = URL(string: "https://vianshah.github.io/for-you/diary/")!
    static let host = "vianshah.github.io"
    static let pathPrefix = "/for-you/"
    static func isDiary(_ url: URL) -> Bool { url.host == host && url.path.hasPrefix(pathPrefix) }
    /// Shared with the widget (App Group): which of us this phone is, and the key that opens the diary.
    static let appGroup = "group.com.vianshah.ourdiary"
    /// The diary's own cream (and its dark desk in dark mode), shown while it loads.
    static let background = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.086, green: 0.063, blue: 0.075, alpha: 1)
            : UIColor(red: 0.984, green: 0.961, blue: 0.937, alpha: 1)
    }
}

struct DiaryView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> DiaryViewController { DiaryViewController() }
    func updateUIViewController(_ controller: DiaryViewController, context: Context) {}
}

final class DiaryViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let refresh = UIRefreshControl()
    private var offline: UIView?
    private var downloads: [ObjectIdentifier: URL] = [:]

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()          // remembers the secret word and whose phone it is
        config.allowsInlineMediaPlayback = true          // videos and the camera play inside the page
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "OurDiaryApp/1.0" // lets the diary know it's in the app
        // Once the secret word is typed, the diary hands the widget its key through here.
        config.userContentController.add(WeakMessageHandler(self), name: "ourDiaryApp")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true // the back swipe closes the diary's popups
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = Diary.background
        webView.scrollView.backgroundColor = Diary.background
        webView.isInspectable = true // Safari's Web Inspector can look inside while testing

        refresh.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: Diary.start))
    }

    @objc private func pullToRefresh() {
        hideOffline()
        if webView.url == nil { webView.load(URLRequest(url: Diary.start)) } else { webView.reload() }
    }

    // MARK: - Where links go

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if action.shouldPerformDownload { return decisionHandler(.download) }
        switch url.scheme?.lowercased() {
        case "http", "https":
            if Diary.isDiary(url) || action.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)   // anywhere else: Safari, or the app it belongs to
                decisionHandler(.cancel)
            }
        case "blob", "data", "about":
            decisionHandler(.allow)
        default:
            UIApplication.shared.open(url)       // facetime://, facetime-audio://, tel:, mailto:…
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    // A link that opens a new window (e.g. "▶ open the video"): show it in a sheet with a Done button.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme), !Diary.isDiary(url) {
            UIApplication.shared.open(url)
            return nil
        }
        let popup = PopupViewController(configuration: configuration)
        popup.webView.uiDelegate = self
        let nav = UINavigationController(rootViewController: popup)
        topController().present(nav, animated: true)
        return popup.webView
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView !== self.webView { topController().dismiss(animated: true) }
    }

    // MARK: - Loading, and when the diary can't be reached

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresh.endRefreshing()
        hideOffline()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        refresh.endRefreshing()
        let code = (error as NSError).code
        if code == NSURLErrorCancelled || code == 102 /* frame load interrupted, e.g. a download */ { return }
        showOffline()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refresh.endRefreshing()
    }

    // iOS sometimes stops the page in the background to save memory: bring it straight back.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func showOffline() {
        guard offline == nil else { return }
        let box = UIStackView()
        box.axis = .vertical
        box.alignment = .center
        box.spacing = 14
        let title = UILabel()
        title.text = "Can't reach the diary"
        title.font = .preferredFont(forTextStyle: .title2)
        let hint = UILabel()
        hint.text = "Check the internet connection, then try again."
        hint.font = .preferredFont(forTextStyle: .body)
        hint.textColor = .secondaryLabel
        hint.numberOfLines = 0
        hint.textAlignment = .center
        var again = UIButton.Configuration.filled()
        again.title = "try again"
        again.cornerStyle = .capsule
        again.baseBackgroundColor = UIColor(red: 0.431, green: 0.137, blue: 0.216, alpha: 1)
        let button = UIButton(configuration: again, primaryAction: UIAction { [weak self] _ in self?.pullToRefresh() })
        [title, hint, button].forEach(box.addArrangedSubview)

        let cover = UIView()
        cover.backgroundColor = Diary.background
        cover.translatesAutoresizingMaskIntoConstraints = false
        box.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(box)
        view.addSubview(cover)
        NSLayoutConstraint.activate([
            cover.topAnchor.constraint(equalTo: view.topAnchor),
            cover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            cover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            box.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            box.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: 32),
            box.trailingAnchor.constraint(equalTo: cover.trailingAnchor, constant: -32),
        ])
        offline = cover
    }

    private func hideOffline() {
        offline?.removeFromSuperview()
        offline = nil
    }

    // MARK: - The diary's confirm / prompt / alert boxes (an app window skips them unless we show them)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, orElse: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { field in
            field.text = defaultText
            field.autocapitalizationType = .sentences
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text ?? "") })
        present(alert) { completionHandler(nil) }
    }

    // MARK: - Camera and microphone (the diary's camera, voice notes)

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // Only our diary may ask; iOS still shows its own camera/microphone prompt the first time.
        decisionHandler(origin.host == Diary.host ? .grant : .deny)
    }

    // MARK: - Downloads → the share sheet (save to Photos, Files, AirDrop…)

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(suggestedFilename.isEmpty ? "from-our-diary" : suggestedFilename)
        downloads[ObjectIdentifier(download)] = file
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = view
        share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
        topController().present(share, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        let alert = UIAlertController(title: "Couldn't save that", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert) {}
    }

    // MARK: - Feeding the widget

    /// The diary posts `{ type: "widget", name, key }` once it's unlocked: the widget keeps both
    /// in the App Group so it can read the diary on its own. The key never leaves this iPhone.
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == Diary.host,
              let body = message.body as? [String: Any], body["type"] as? String == "widget",
              let name = body["name"] as? String, let key = body["key"] as? String,
              let shared = UserDefaults(suiteName: Diary.appGroup) else { return }
        if shared.string(forKey: "name") == name && shared.string(forKey: "key") == key { return }
        shared.set(name, forKey: "name")
        shared.set(key, forKey: "key")
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: - Helpers

    private func topController() -> UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    /// Shows an alert, or, if something else is already on screen, answers for it straight away:
    /// the page waits for every confirm/prompt to be answered exactly once.
    private func present(_ alert: UIAlertController, orElse fallback: @escaping () -> Void) {
        let top = topController()
        if top is UIAlertController || top.isBeingPresented || view.window == nil {
            fallback()
            return
        }
        top.present(alert, animated: true)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .default }
}

/// WKUserContentController holds on to its handlers; this keeps it from holding the screen too.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// A second window the diary opened (a video, a picture), with a Done button.
final class PopupViewController: UIViewController {
    let webView: WKWebView

    init(configuration: WKWebViewConfiguration) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    override func loadView() {
        webView.backgroundColor = .black
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
    }
}
#endif
