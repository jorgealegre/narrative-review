import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            NavigationStack(path: $model.path) {
                DashboardView()
                    .navigationDestination(for: String.self) { id in
                        if let ref = model.ref(id) {
                            PRDetailView(ref: ref).id(id)
                        } else {
                            ContentUnavailableView("Not in the inbox", systemImage: "questionmark.folder")
                        }
                    }
            }
            StatusBar()
        }
        .task { model.startRunner() }
    }
}
