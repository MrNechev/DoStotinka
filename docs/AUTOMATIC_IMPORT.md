# Automatic transaction import – research

> **Status: implemented in 0.6.0** – options 1 and 2 below, with the inbox described under
> [Proposed design](#proposed-design-for-dostotinka). How to set it up is in the
> [user guide](USER_GUIDE.md#automatic-import). This document keeps the research behind it
> (November 2026): what is possible, how other apps do it and why DoStotinka does it this way.

The goal: records (expenses, income, transfers) should appear in DoStotinka on their own, without
typing them in. The banks looked at in detail are the ones the project is used with today: **DSK Bank**
and **UBB** (Bulgaria) and **Revolut**. The question of whether **Google services** (Google Pay /
Google Wallet, Gmail) can help is answered too.

## Contents

- [Summary](#summary)
- [Why banks don't simply have an open API, and what they have instead](#why-banks-dont-simply-have-an-open-api-and-what-they-have-instead)
- [Option 1 – Open banking (PSD2) through an aggregator](#option-1--open-banking-psd2-through-an-aggregator)
- [Option 2 – Capturing payment notifications on the phone](#option-2--capturing-payment-notifications-on-the-phone)
- [Option 3 – Bank e-mails](#option-3--bank-e-mails)
- [What Google services can and cannot do](#what-google-services-can-and-cannot-do)
- [Option 4 – Semi-automatic: statement files](#option-4--semi-automatic-statement-files)
- [What not to do](#what-not-to-do)
- [Comparison](#comparison)
- [How other apps do it](#how-other-apps-do-it)
- [Proposed design for DoStotinka](#proposed-design-for-dostotinka)
- [Things to verify with real accounts before building](#things-to-verify-with-real-accounts-before-building)
- [Sources](#sources)

## Summary

- **Yes, it can be done for DSK, UBB and Revolut**, in two ways that work well together:
  1. **Open banking (PSD2)** through a licensed aggregator. [Enable Banking](https://enablebanking.com)
     covers [DSK Bank and UBB](https://enablebanking.com/docs/markets/bg/) as well as
     [Revolut](https://enablebanking.com/docs/markets/lt/). Its terms make it **free for private
     individuals who connect their own accounts**. The data is complete and official, including
     transfers, fees and balances. On the other hand, it arrives with a delay (a few syncs per day,
     card payments often only once they are booked), and you have to confirm the connection in your
     banking app **every 180 days**.
  2. **Reading the payment notifications** that the banking apps (and Google Wallet) show on your
     phone, and forwarding them to DoStotinka. This is **instant** and needs no third party. However,
     it is Android-only for bank notifications (on iPhone only Apple Pay payments can be captured),
     every bank's message format has to be parsed, and it breaks when a bank changes the wording.
- **E-mail is the weakest option for these three banks.** None of them e-mails card payments.
  DSK offers SMS/Viber/push only, UBB e-mails only account movements *without* card transactions,
  and Revolut has no per-transaction e-mails. E-mail parsing is still useful for other banks,
  PayPal, online shops and utility bills.
- **Google Pay / Google Wallet has no API** for reading your transactions. Google helps only
  indirectly: on Android, Google Wallet shows a notification with merchant and amount after every
  tap-to-pay, and that notification can be captured (option 2). Gmail can pass bank e-mails on with a
  small Apps Script (option 3).
- **Recommendation:** build an **“Inbox” for automatically imported transactions** plus a
  **notification webhook** first (works today with Tasker / MacroDroid on Android and Shortcuts on
  iPhone, no mobile app needed). Then add an **Enable Banking connection** that fills in everything
  notifications miss and confirms the amounts. See [Proposed design](#proposed-design-for-dostotinka).

## Why banks don't simply have an open API, and what they have instead

You are right that no bank lets *anyone* read your account through a public API. Since the EU
**Payment Services Directive 2 (PSD2)**, however, every bank in the EU **must** offer an API, the
“dedicated interface”. Only **licensed third parties** may use it, and only **with your explicit
consent**:

- Only companies that are authorised by a central bank as an **Account Information Service Provider
  (AISP)** can call it. They identify themselves with special eIDAS certificates that contain their
  licence. An individual (or a self-hosted app like DoStotinka) cannot get such a certificate.
- You never give your bank password to the third party. You are redirected to **your bank's own login
  page or app** (strong customer authentication, e.g. confirming in *DSK mToken* or *ОББ Мобайл*) and
  approve read-only access to selected accounts.
- The access is **read-only**, **limited in time** (at most 180 days, then you confirm again) and you
  can revoke it at any time.
- Without you actively using the app, the third party may fetch your data **at most four times per
  24 hours** (PSD2 RTS on strong customer authentication, Art. 36(5)).

Both Bulgarian banks published their PSD2 APIs in 2019: DSK on its
[developer portal](https://developer.dskbank.bg/TPP-Journey) (Berlin Group NextGenPSD2 standard plus
the Bulgarian *BISTRA* market initiative; account information, payment initiation and funds
confirmation) and UBB through its
[API gateway](https://ubb.bg/en/news/view/obb-startira-api-portal-za-razrabotchici-v-testova-sreda).
Revolut documents its [Open Banking API](https://developer.revolut.com/docs/guides/build-banking-apps/introduction-to-the-open-banking-api/introduction.md),
which “PSD2-regulated AISPs and PISPs can access without a formal contract”. All three are only open
to licensed providers. **The practical way in is therefore an aggregator**: a licensed company that
has already connected to thousands of banks and passes the data on to you.

The successor rules, **PSD3 and the Payment Services Regulation (PSR)**, were agreed politically in
November 2025, and the final compromise texts were published in April 2026. They are expected to apply
from around 2027–2028. They keep this model and add a **permissions dashboard** in each bank where you
can see and revoke every third-party access. Nothing in them gives private individuals direct API
access.

## Option 1 – Open banking (PSD2) through an aggregator

### How this fits a self-hosted app

A licensed provider has to sit between the app and the bank – but it does not have to be the
author of the app. Every person who runs DoStotinka creates their **own** free Enable Banking
application, so nobody else is in between:

```
 your browser ──► your DoStotinka server ──(your app key)──► Enable Banking ──PSD2──► your bank
```

- You confirm read-only access on the bank's own page or app – the bank password never reaches
  Enable Banking or DoStotinka.
- Your history is stored only in your DoStotinka database; new transactions pass through Enable
  Banking (a regulated EU provider) on their way from the bank. If even that is too much, the
  phone-notification option is fully local.
- A central service run by the developer would be worse: it would need a paid business contract,
  and everybody's bank data would flow through someone else's servers.
- In production Enable Banking only accepts `https://` redirect URLs. Servers opened over plain
  `http://` register an https address that does not have to load (e.g.
  `https://localhost/dostotinka-bank-callback`) and paste the address of the page they land on into
  DoStotinka.


### Aggregators a self-hoster can actually use (November 2026)

| Provider | Free for personal use? | DSK / UBB / Revolut | Notes |
| --- | --- | --- | --- |
| **[Enable Banking](https://enablebanking.com)** | **Yes.** In *restricted production* mode you can only access accounts you linked yourself in its control panel. According to its terms (version of January 2026) this is free of charge for “evaluation purposes or for the personal use of private individuals”. | ✅ / ✅ / ✅ | Finnish AISP covering 2,500+ banks in 29 countries. Used by Firefly III and (experimentally) Actual Budget. **The best fit for DoStotinka.** |
| GoCardless Bank Account Data (formerly Nordigen) | Was free (4 syncs/day per bank) | ✅ / ✅ / ✅ | **No new sign-ups since July 2025.** Existing accounts still work. Not an option for new users. |
| Lunch Flow | No, paid subscription per connection | via GoCardless | A paid middleman that forwards data to Actual, Firefly III etc. |
| Salt Edge, Tink, Yapily, TrueLayer, Plaid | No, business contracts | partly | Built for companies. Wallet by BudgetBakers uses Salt Edge and Yodlee. |
| SimpleFIN Bridge | Paid, cheap | ❌ | US/Canada banks only. |

### DSK, UBB and Revolut in detail

| | DSK Bank | UBB (ОББ) | Revolut |
| --- | --- | --- | --- |
| PSD2 API | yes, since 2019 | yes, since 2019 | yes |
| Through Enable Banking | yes | yes | yes (listed under Lithuania – EU Revolut accounts are held with Revolut Bank UAB) |
| How you confirm access | DSK Direct username and password on a web page (no app-to-app switch) | in the *ОББ Мобайл* app (automatic app switch on the phone) | in the Revolut app (app switch supported) or PIN + app approval + SMS |
| Known limitation | – | – | Credit card accounts can only be selected when confirming in the mobile app, not on the web |

### How it would work in DoStotinka

1. You create a free Enable Banking account and register an *application*. You get an application
   ID and a private key and register DoStotinka's callback URL. Then you link your own bank accounts
   in the Enable Banking control panel, which is required in restricted mode. This is the same setup
   Actual Budget and the Firefly III importer use. The redirect happens in your browser, so DoStotinka
   does not have to be reachable from the internet. The URL must be registered, though, and
   Actual's guide uses an `https://` address.
2. In DoStotinka: **Settings → Automatic import → Connect a bank** → choose country and bank → you
   are sent to the bank, confirm, and come back. You then map each bank account to a DoStotinka
   account.
3. A background job (DoStotinka already has a scheduler for planned payments) fetches new
   transactions and balances **up to four times a day**. It turns them into records in the Inbox
   (see below) and warns you before the 180-day consent runs out, using the existing reminder
   channels: ntfy, Gotify, Discord, Slack or webhook.

Technically, Enable Banking is a small REST API. Requests are authenticated with a JWT that DoStotinka
signs with the application's private key. The flow is: `POST /auth` (bank and consent validity) →
redirect → `POST /sessions` with the returned code → `GET /accounts/{id}/transactions` and
`/balances`. The API also reports per bank how long the consent may last and how many days of history
are available.

### Pros and cons

- ➕ Official, complete and accurate: card payments, transfers, fees, salary and interest all arrive,
  and so does the real balance. Works the same for every supported bank, so there are no parsers to
  maintain.
- ➕ Read-only. DoStotinka never sees your bank password.
- ➖ Not instant. At most four automatic syncs per day, and card payments often show up only when
  the bank *books* them (usually 1–3 days later). Whether DSK and UBB also return pending card
  payments has to be tested.
- ➖ Every 180 days you have to click a link and confirm in your banking app again.
- ➖ It depends on a third party (Enable Banking) and on its free personal tier staying available.
  GoCardless shows that such tiers can close. The connector should therefore be written so that
  other providers can be added later.
- ➖ The bank's transaction descriptions are often cryptic (e.g. `POS 1234 LIDL BULGARIA EOOD
  SOFIA`), so payee clean-up and category rules are needed.

## Option 2 – Capturing payment notifications on the phone

Every payment already produces a notification on your phone. These can be read and forwarded to
DoStotinka **in the same second**.

### What the banks send

| Source | Channel | Contains | Cost |
| --- | --- | --- | --- |
| **DSK** | Push in *DSK Mobile* (rolled out gradually since [October 2026](https://dskbank.bg/en/news-and-promotions/details/2026/10/05/notifications-for-your-banking-transactions-in-dsk-mobile)) for incoming money, card payments, ATM operations, cancelled/declined payments and refunds | according to DSK, “limited information about the transaction” (to be checked whether the amount and merchant are included) | free |
| | SMS / Viber (“Електронни известия”: debit operations, incoming payments, card control) | details of the operation (exact wording to be checked) | charged per message (card control is free for credit cards) |
| **UBB** | Push in *ОББ Мобайл* for **card transactions** (free for all cardholders since November 2024) and **account movements** (free since June 2023) | transaction details (exact wording to be checked) | free |
| | SMS / Viber for card transactions; SMS / Viber / **e-mail** for account movements | | SMS packages are paid. Turning on push for an account or card **stops** its SMS/Viber/e-mail notifications. |
| **Revolut** | Push for every payment, top-up, transfer and exchange | merchant, amount, currency | free |
| **Google Wallet** (any card) | Push after every tap-to-pay with the phone or a Wear OS watch | merchant, amount, card | free |

### Android

Android lets an app read notifications if you grant it **notification access**. This is exactly how
*Wallet by BudgetBakers* records Google Pay payments: it listens only to the Google Wallet app
(`com.google.android.apps.walletnfcrel`) and parses merchant, amount and currency. It offers this only
in a few countries, not in Bulgaria. Bluecoins and several open-source apps (e.g. Neme Budget) do the
same for bank apps.

For DoStotinka there are two steps:

1. **Now, without a DoStotinka app:** an automation app such as **Tasker**, **MacroDroid** or
   **Automate** with the trigger *“notification from DSK Mobile / ОББ Мобайл / Revolut / Google
   Wallet”* (or *“SMS from DSK”*) and the action *HTTP request*. The action sends the notification's
   title and text to a DoStotinka endpoint with an API token. The [API guide](API.md) already contains
   a similar recipe for manual entry.
2. **Later, in the DoStotinka mobile app** (already on the roadmap): a built-in notification listener
   with a list of bank apps to watch.

Caveats:

- Parsing is per bank and per language. A rule has to be written and tested for each notification
  format. When a bank changes its wording, the parser has to be updated.
- Battery savers (Samsung, Xiaomi, Huawei …) can kill background listeners. The automation app has to
  be excluded from battery optimisation.
- Since Android 13, and stricter since Android 15, apps installed outside an app store
  (“sideloaded”) cannot be given notification access until you allow *restricted settings* for them.
  Google is also introducing mandatory developer verification for sideloaded apps (first countries
  from September 2026, worldwide from 2027). This matters for how a future DoStotinka app is
  distributed: Google Play / F-Droid vs. APK downloads.
- Paying with the phone produces **two** notifications (Google Wallet and the bank). DoStotinka has
  to recognise them as the same payment.
- Only payments that produce a notification are captured. Standing orders, bank fees and interest
  usually don't, and the open-banking sync fills those gaps.

### iPhone

iOS doesn't allow apps to read other apps' notifications. What it does have, since iOS 17, is the
**Shortcuts automation “Transaction”** (called “Wallet” in iOS 26). It runs after every **Apple Pay**
payment and passes on the **merchant, amount and card**. A shortcut can send these to DoStotinka with
*Get Contents of URL*. People use exactly this with YNAB and other budget apps. It only covers Apple
Pay tap-to-pay: no plastic-card payments, no online payments and no incoming money.

## Option 3 – Bank e-mails

The idea is good in general, but it barely works for these three banks:

| Bank | Transaction e-mails? |
| --- | --- |
| DSK | No. Notifications are SMS/Viber/push only. |
| UBB | Only for **account movements** (transfers, cash in/out). The UBB terms explicitly exclude card transactions and fees, and the e-mails stop if push is turned on for the account. |
| Revolut | No per-transaction e-mails (users have been asking for it in the Revolut community). Only statements. |

Where a bank or service *does* send e-mails (other banks, PayPal, online shops, utility bills), there
are three ways to get them into DoStotinka:

- **Gmail + Google Apps Script (recommended for Gmail users).** A Gmail filter labels the bank's
  e-mails. A small time-triggered Apps Script running *in your own Google account* reads new
  labelled e-mails and posts them to DoStotinka with `UrlFetchApp`. No Google verification is needed
  because the script only touches your own mailbox. DoStotinka would publish a ready-made script.
- **IMAP.** DoStotinka connects to a mailbox and reads a folder. This works with any provider, and
  with Gmail through an app password (requires 2-step verification). A separate mailbox that only
  receives forwarded bank e-mails keeps the risk small.
- **Gmail API built into DoStotinka: not practical.** Reading mail requires a *restricted* scope. A
  public app would need Google's verification and a yearly CASA security assessment, and in testing
  mode the login expires every 7 days.

## What Google services can and cannot do

| Google service | Usable? |
| --- | --- |
| **Google Pay API** | No. It is for *merchants* to accept payments, not for reading yours. |
| **Google Wallet API** | No. It is for issuing passes and tickets. The new Receipts API announced at I/O 2026 lets merchants *send* receipts to Wallet, not apps read them. |
| **Google Wallet transaction history** (app and wallet.google.com) | Visible to you, but there is **no API**. |
| **Google Takeout** | Can export some Google Pay data, but only manually or every two months. Not automatic. |
| **Google Wallet notifications on Android** | **Yes**, through notification access (option 2). This is what Wallet by BudgetBakers does. |
| **Gmail** | **Yes**, for banks that send e-mails, through Apps Script or IMAP (option 3). |

In short: Google Pay is not a data source in itself, but on Android its notifications are a handy
real-time source for every phone payment, whatever the bank.

## Option 4 – Semi-automatic: statement files

DoStotinka can already import CSV bank statements (with duplicate detection). The Revolut app exports
statements as a spreadsheet, and DSK Direct and UBB Online offer statement downloads (which formats
besides PDF has to be checked). Small improvements would make this a decent fallback without any
third party:

- remember the column mapping per bank (“import profile”), so a monthly import is three clicks;
- optionally, a watched folder or an upload e-mail address for statements.

## What not to do

- **Screen scraping / storing bank passwords.** Logging into online banking with your password and
  reading the pages is fragile, breaks with every strong-authentication prompt and violates the
  banks' terms. PSD2 forbids it for providers precisely because the official API exists.
- **Unofficial Revolut API.** Some projects call the private API of the Revolut app. That violates
  Revolut's terms and can get the account blocked. Revolut's own *Business API* (with
  `TransactionCreated` webhooks) exists only for business accounts.
- **Parsing notifications with a cloud AI.** A local regex parser is enough for known formats.
  Bank notifications should not be sent to third-party services.

## Comparison

| | Open banking (Enable Banking) | Android notifications | iPhone Shortcuts | E-mail | Statement files |
| --- | --- | --- | --- | --- | --- |
| DSK | ✅ | ✅ push/SMS (check content) | Apple Pay only | ❌ | ✅ |
| UBB | ✅ | ✅ | Apple Pay only | transfers only | ✅ |
| Revolut | ✅ | ✅ | Apple Pay only | ❌ | ✅ |
| Speed | hours to days | instant | instant | minutes | manual |
| Completeness | everything incl. fees, interest, balance | only what triggers a notification | only Apple Pay taps | depends on bank | everything |
| Third party | Enable Banking | none | none | e-mail provider | none |
| Maintenance | low (one connector) | parsers per bank | low | parsers per bank | low |
| Recurring effort for you | confirm every 180 days | none | none | none | monthly export |

The two best options complement each other. Notifications give instant records, and open banking
confirms them and fills the gaps.

## How other apps do it

- **Commercial apps** (Wallet by BudgetBakers, Emma, YNAB …) pay a licensed aggregator (Salt Edge,
  Yodlee, Plaid, Tink, GoCardless). Bank sync is their main premium feature. Wallet additionally
  reads Google Pay notifications on Android in some countries.
- **Self-hosted apps** let every user bring their own aggregator credentials:
  - **Firefly III** data importer: Enable Banking, GoCardless (existing users only), SimpleFIN,
    Lunch Flow, CSV.
  - **Actual Budget:** GoCardless (closed to new users since July 2025), SimpleFIN (US), Pluggy
    (Brazil), Enable Banking (experimental).
- **Hobby setups:** Tasker/MacroDroid forwarding notifications to a webhook, Gmail Apps Scripts that
  parse bank e-mails into Google Sheets or Firefly III, iOS Shortcuts on the Apple Pay trigger. SMS
  parsing is very common where banks send detailed SMS, e.g. in India.

## Proposed design for DoStotinka

### On/off at every level

- **Instance:** the administrator can turn automatic import off for the whole server.
- **User:** *Settings → Automatic import*, **off by default**. When it is off, the webhook rejects
  requests and no bank sync runs.
- **Source:** every bank connection and every notification source can be paused or removed.
- Switching it off never deletes records that were already imported. Removing a bank connection
  also revokes the consent at the provider.

### The Inbox

Imported transactions don't go straight into the statistics. They land in an **Inbox** (“To
review”):

- each entry shows account, amount, date, payee and a **suggested category**. One tap confirms it,
  or you edit it first;
- **rules** (“payee contains LIDL → Groceries”) are learned from confirmed entries and from existing
  records, so most entries need no editing after a few weeks. The existing frequent-combination
  suggestions are a good start;
- per source you can choose **“trust this source”** to skip the Inbox and create records directly;
- **duplicates are merged**: same account, same amount, time within a window. A Google Wallet
  notification, the bank's push and the bank sync for one payment become one record. The bank sync
  then fills in the exact booking date and confirms the amount;
- records keep their **source** and the bank's **transaction ID**, so a later sync never creates
  them twice.

### Sources

1. **Notification webhook:** `POST /api/inbox` with a new *ingest-only* API token. The body contains
   the raw text (`source`, `app`, `title`, `text`, `receivedAt`), and parsing happens on the
   **server**, in `packages/shared` with tests based on real sample notifications. Tasker, MacroDroid,
   iOS Shortcuts and the future mobile app then only forward text and never need updating when a
   parser changes. Ready-made recipes for DSK, UBB, Revolut and Google Wallet go into the docs, plus a
   simple editor for custom rules for other banks.
2. **Enable Banking connector:** per user (everyone brings their own Enable Banking application,
   which keeps it within the “personal use” terms). It covers the consent flow, account mapping, a
   sync job up to 4×/day, balance check and reminders before the consent expires. Written behind a
   small provider interface, so other aggregators can be added.
3. **Later:** IMAP / Apps Script e-mail source, a notification listener in the mobile app, and import
   profiles for statement files.

### Security

- No bank passwords anywhere. Only read-only access tokens and the Enable Banking private key, both
  **encrypted at rest** with a server secret.
- The ingest token can only add Inbox entries. It cannot read anything.
- Raw notification texts are kept only until the entry is confirmed, then deleted.
- Rate limiting on the webhook, and an audit list of every source and when it last delivered data.

### Suggested order of work

| Phase | Content | Size |
| --- | --- | --- |
| 1 | Settings switch, Inbox UI, rules, duplicate detection, `POST /api/inbox`, parsers for DSK / UBB / Revolut / Google Wallet, Tasker / MacroDroid / Shortcuts recipes | medium |
| 2 | Enable Banking connector with consent flow, sync job, reconciliation with phase 1 entries, expiry reminders | large |
| 3 | E-mail source, statement import profiles, notification listener in the mobile app | medium each |

Phase 1 alone already gives instant automatic records for every phone payment and costs nothing.
Phase 2 makes the data complete.

## Things to verify with real accounts before building

- What exactly the new **DSK Mobile** push notifications contain (amount? merchant?). If they only
  say “new transaction”, the DSK SMS/Viber texts or the bank sync are needed for DSK.
- The exact wording of **UBB**, **Revolut** and **Google Wallet** notifications in Bulgarian and in
  English, to build test samples for the parsers.
- Whether DSK and UBB return **pending** card payments over PSD2, or only booked ones, and how many
  days of history they give on the first sync.
- That Enable Banking's restricted mode still works for private individuals at the time of building,
  and how long DSK, UBB and Revolut allow a consent to last (up to 180 days).
- Whether the automation apps can read the bank apps' notifications (some apps mark them as
  sensitive).

## Sources

Open banking and regulation
- DSK Bank – PSD2 developer portal, TPP journey: <https://developer.dskbank.bg/TPP-Journey>
- UBB – API portal for developers (2019): <https://ubb.bg/en/news/view/obb-startira-api-portal-za-razrabotchici-v-testova-sreda>
- Revolut – Open Banking API introduction: <https://developer.revolut.com/docs/guides/build-banking-apps/introduction-to-the-open-banking-api/introduction.md>
- Revolut – Business API webhooks: <https://developer.revolut.com/docs/business/set-up-webhook>
- Enable Banking – Bulgaria (DSK, UBB …): <https://enablebanking.com/docs/markets/bg/>
- Enable Banking – Lithuania (Revolut): <https://enablebanking.com/docs/markets/lt/>
- Enable Banking – 180-day consent (changelog July 2023): <https://enablebanking.com/blog/2023/08/20/changelog-july-2023>
- Firefly III – Enable Banking import (free restricted mode): <https://docs.firefly-iii.org/tutorials/data-importer/eb/>
- Firefly III – third-party providers: <https://docs.firefly-iii.org/how-to/data-importer/import/third-party-providers/>
- Actual Budget – Enable Banking: <https://actualbudget.org/docs/advanced/bank-sync/enable-banking>
- Actual Budget – GoCardless (no new sign-ups since July 2025): <https://actualbudget.org/docs/advanced/bank-sync/gocardless/>
- Overview of free open banking APIs (2026): <https://www.openbankingtracker.com/guides/free-open-banking-apis>
- PSD3 / PSR provisional agreement: <https://www.taylorwessing.com/en/insights-and-events/insights/2025/11/eu-lawmakers-strike-a-deal-on-payments-reforms>,
  final compromise texts: <https://www.williamfry.com/knowledge/psd3-psr-final-compromise-texts-are-published/>
- EBA – 180-day re-authentication (amended RTS on SCA): <https://paytechlaw.com/en/regulatory-technical-standards-rts-sca-csc/>

Bank notifications
- DSK – push notifications in DSK Mobile (5 October 2026): <https://dskbank.bg/en/news-and-promotions/details/2026/10/05/notifications-for-your-banking-transactions-in-dsk-mobile>
- DSK – electronic notifications (SMS/Viber): [dskbank.bg › Електронни известия](https://dskbank.bg/%D0%B8%D0%BD%D0%B4%D0%B8%D0%B2%D0%B8%D0%B4%D1%83%D0%B0%D0%BB%D0%BD%D0%B8-%D0%BA%D0%BB%D0%B8%D0%B5%D0%BD%D1%82%D0%B8/%D0%B5%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%BE%D0%BD%D0%BD%D0%BE-%D0%B1%D0%B0%D0%BD%D0%BA%D0%B8%D1%80%D0%B0%D0%BD%D0%B5/%D0%B5%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%BE%D0%BD%D0%BD%D0%B8-%D0%B8%D0%B7%D0%B2%D0%B5%D1%81%D1%82%D0%B8%D1%8F)
- UBB – electronic notifications for individuals: <https://ubb.bg/en/individual-clients/smetki-i-plashtaniya/elektronni-izvestiya-ik>
- UBB – terms of the electronic notification service: <https://www.ubb.bg/attachments/Product/165/download_en/Terms-and-conditions-for-using-the-Electronic-notification-service.pdf>
- UBB – free push notifications for account movements: <https://ubb.bg/en/news/view/novo-bezplatni-push-izvestiya-pri-dvijenie-po-smetka>
- UBB – change in card transaction notifications: <https://ubb.bg/en/news/view/promyana-v-izvestyavaneto-za-kartovi-transaktsii>
- Revolut community – request for transaction e-mails: <https://community.revolut.com/t/real-time-email-alerts-and-notifications/4544>

Google, phones and other apps
- Google Wallet – transaction receipts / notifications: <https://developers.google.com/wallet/tickets/open-loop/mobile-features/transaction-receipts>
- Google Wallet – view transactions: <https://support.google.com/wallet/answer/12059878>
- Google Wallet transaction history (January 2026): <https://9to5google.com/2026/01/13/google-wallet-transaction-history/>
- Wallet by BudgetBakers – notification access for Google Pay: <https://support.budgetbakers.com/hc/en-us/articles/27357560590098-Notification-Access-Permission>
- Wallet by BudgetBakers review (Salt Edge / Yodlee): <https://getfinny.app/blog/wallet-budgetbakers-review-2026>
- Android restricted settings (Android 15): <https://9to5google.com/2024/09/12/android-15-sideloaded-apps-restrictions/>
- Android developer verification: <https://engadget.com/apps/android-will-hide-app-sideloading-behind-a-new-one-time-security-process-184651171.html>
- Apple Pay transaction automation in Shortcuts: <https://www.idropnews.com/ios-17/this-new-ios-17-shortcut-will-help-you-keep-track-of-your-spending/197589/>
- Neme Budget (notification listener, open source): <https://github.com/universalindex/Neme-Budget>
- Gmail app passwords: <https://cli.nylas.com/guides/gmail-app-password-setup.md>
