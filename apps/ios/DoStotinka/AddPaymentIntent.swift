import AppIntents
import DoStotinkaCore
import Foundation

/// Shortcuts action "Add payment to DoStotinka" – meant for the Wallet "Transaction" automation:
/// every card payment arrives in the inbox with amount, merchant and card.
struct AddPaymentIntent: AppIntent {
    static var title: LocalizedStringResource = "Add payment to DoStotinka"
    static var description = IntentDescription(
        "Sends a payment to the inbox of your DoStotinka server. Use it in the Wallet “Transaction” automation of the Shortcuts app.")
    static var openAppWhenRun = false

    @Parameter(title: "Amount")
    var amount: IntentCurrencyAmount

    @Parameter(title: "Merchant")
    var merchant: String?

    @Parameter(title: "Card")
    var card: String?

    @Parameter(title: "Income", default: false)
    var income: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$amount) at \(\.$merchant)") {
            \.$card
            \.$income
        }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let payment = Payment(
            amount: amount.amount, currency: amount.currencyCode, merchant: merchant, card: card, income: income)
        switch await PaymentSender.shared.send(payment) {
        case .sent:
            return .result(dialog: "Sent to DoStotinka.")
        case .queued:
            return .result(dialog: "Saved – it is sent when your server can be reached.")
        case .notConnected:
            return .result(
                dialog: "Open DoStotinka → Settings → Automatic import and tap “Use this iPhone” first.")
        }
    }
}

struct DoStotinkaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddPaymentIntent(),
            phrases: ["Add a payment to \(.applicationName)"],
            shortTitle: "Add payment",
            systemImageName: "creditcard")
    }
}
