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
                .environment(\.dynamicTypeSize, model.textScale >= 1.3 ? .xLarge : model.textScale >= 1.1 ? .large : model.textScale <= 0.9 ? .small : .medium)
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
            CommandGroup(after: .toolbar) {
                Button("Enter Full Screen") { NSApp.keyWindow?.toggleFullScreen(nil) }
                    .keyboardShortcut("f", modifiers: [.command, .control])
                Button("Bigger Text") { model.textScale = min(1.6, model.textScale + 0.1) }.keyboardShortcut("+", modifiers: .command)
                Button("Smaller Text") { model.textScale = max(0.8, model.textScale - 0.1) }.keyboardShortcut("-", modifiers: .command)
                Button("Actual Size") { model.textScale = 1 }.keyboardShortcut("0", modifiers: .command)
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
                Button("Next PR in Queue") { model.stepQueue(1) }.keyboardShortcut(.downArrow, modifiers: .option)
                Button("Previous PR in Queue") { model.stepQueue(-1) }.keyboardShortcut(.upArrow, modifiers: .option)
                Button("Copy Link") {
                    if let u = model.openPR?.url { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(u, forType: .string) }
                }.keyboardShortcut("c", modifiers: [.command, .shift]).disabled(model.openPR == nil)
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
