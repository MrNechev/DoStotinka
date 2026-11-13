import DoStotinkaCore
import SwiftUI

/// First start: the address of the user's own DoStotinka server.
struct SetupView: View {
    @EnvironmentObject private var store: AppStore
    @State private var address = AppSettings.server?.absoluteString ?? ""
    @State private var checking = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Image("Logo")
                .resizable()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            Text("DoStotinka")
                .font(.largeTitle.weight(.bold))
            Text("Enter the address of your DoStotinka server – the same as in the browser, e.g. http://192.168.1.10:8742.")
                .foregroundStyle(.secondary)
            TextField("Server address", text: $address)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .onSubmit(connect)
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            Button(action: connect) {
                HStack {
                    if checking { ProgressView().tint(.white) }
                    Text("Connect").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Color("AccentColor"))
            .controlSize(.large)
            .disabled(checking || address.trimmingCharacters(in: .whitespaces).isEmpty)
            Text("Plain http:// works too (home network, Tailscale, VPN). Nothing is sent anywhere else.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
            Spacer()
        }
        .padding(28)
    }

    private func connect() {
        guard let url = ServerAddress.normalize(address) else {
            error = String(localized: "This is not a valid address.")
            return
        }
        checking = true
        error = nil
        Task {
            defer { checking = false }
            do {
                var request = URLRequest(url: url.appendingPathComponent("api/health"))
                request.timeoutInterval = 10
                let (data, _) = try await URLSession.shared.data(for: request)
                if ServerAddress.isHealthy(data) {
                    store.connect(to: url)
                } else {
                    error = String(localized: "No DoStotinka server answers at this address.")
                }
            } catch {
                self.error = String(
                    format: String(localized: "Could not connect: %@"), error.localizedDescription)
            }
        }
    }
}
