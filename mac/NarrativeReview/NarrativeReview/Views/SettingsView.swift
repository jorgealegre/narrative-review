import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var apiKey: String = Keychain.read("anthropic") ?? ""

    var body: some View {
        @Bindable var model = model
        Form {
            Section("Storyteller") {
                Picker("Brain", selection: $model.storytellerKind) {
                    ForEach(StorytellerKind.allCases) { Text($0.rawValue).tag($0) }
                }
                Picker("Claude model", selection: $model.claudeModelID) {
                    ForEach(ClaudeModel.all) { m in
                        Text("\(m.name)  ($\(m.inputPerMTok, specifier: "%.2f") in / $\(m.outputPerMTok, specifier: "%.2f") out per MTok)").tag(m.id)
                    }
                }
                TextField("Monthly budget (USD), warns in the status bar", value: $model.monthlyBudget, format: .number)
                SecureField("Claude API key", text: $apiKey)
                    .onChange(of: apiKey) { _, v in Keychain.write("anthropic", v.trimmingCharacters(in: .whitespacesAndNewlines)) }
                Text("Stored in your login Keychain, never on disk. Create a key with its own spend limit at platform.claude.com.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Inbox") {
                Toggle("Write stories in the background with the free on-device brain", isOn: $model.autoTell)
                Stepper("Check GitHub every \(model.pollMinutes) min", value: $model.pollMinutes, in: 1...30)
                TextField("GitHub search scope", text: $model.inboxScope)
                Text("Added to `is:pr is:open involves:@me`. Examples: `org:sp0n-7`, `user:jorgealegre`, empty for everything.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 560)
        .padding()
    }
}
