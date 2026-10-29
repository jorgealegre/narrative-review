import SwiftUI
import AppKit
import UniformTypeIdentifiers

@main
struct NarrativeReviewApp: App {
    @State private var model = AppModel.shared

    init() {
        #if DEBUG
        DebugSnapshot.start(model: AppModel.shared)
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .frame(minWidth: 1024, minHeight: 700)
        }
        .defaultSize(width: 1500, height: 940)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Import Story JSON…") { importStory() }
                    .keyboardShortcut("i", modifiers: [.command, .shift])
                Button("Check GitHub Now") { Task { await model.refreshInbox() } }
                    .keyboardShortcut("r", modifiers: .command)
            }
            CommandMenu("Go") {
                Button("Back") { model.goBack() }
                    .keyboardShortcut("[", modifiers: .command)
                    .disabled(!model.canGoBack)
                Button("Forward") { model.goForward() }
                    .keyboardShortcut("]", modifiers: .command)
                    .disabled(!model.canGoForward)
                Button("Home") { model.path = [] }
                    .keyboardShortcut("h", modifiers: [.command, .shift])
                Divider()
                Button("Open on GitHub") { if let u = model.openPR.flatMap({ URL(string: $0.url) }) { NSWorkspace.shared.open(u) } }
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(model.openPR == nil)
                Button("Tell the Story") { if let r = model.openPR { model.tellStory(for: r) } }
                    .keyboardShortcut("t", modifiers: .command)
                    .disabled(model.openPR == nil)
            }
        }
        Settings {
            SettingsView().environment(model)
        }
    }

    private func importStory() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = true
        panel.message = "Pick a review.json produced by the Narrative Review action or by this app."
        if panel.runModal() == .OK {
            for url in panel.urls { model.importFixture(url) }
        }
    }
}
