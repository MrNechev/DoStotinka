# User guide

This guide explains how DoStotinka works from a user's point of view. For installation see the
[README](../README.md); for scripts and automations see the [API guide](API.md).

- [First steps](#first-steps)
- [Accounts](#accounts)
- [Records](#records)
- [Categories and labels](#categories-and-labels)
- [Rules and payees](#rules-and-payees)
- [Statistics and reports](#statistics-and-reports)
- [Monthly review](#monthly-review)
- [Net worth and investments](#net-worth-and-investments)
- [Calendar](#calendar)
- [Planned payments](#planned-payments)
- [Budgets](#budgets)
- [Savings goals](#savings-goals)
- [Debts](#debts)
- [Currencies](#currencies)
- [Import and export](#import-and-export)
- [Automatic import](#automatic-import)
- [Households](#households)
- [Settings and security](#settings-and-security)
- [Keyboard shortcuts and tips](#keyboard-shortcuts-and-tips)
- [Using DoStotinka on your phone](#using-dostotinka-on-your-phone) (Android app, iPhone app,
  offline entry)

## First steps

1. **Create your accounts** – one for every place your money lives: the wallet in your pocket,
   your bank account, a savings account, a credit card … Enter today's balance as the starting
   balance.
2. **Log what you spend and earn** with **Add record** (or <kbd>N</kbd> on the keyboard).
3. Optionally **plan regular payments** (rent, salary, subscriptions) and **set budgets**.

The dashboard shows a checklist until these steps are done. Coming from another app? See
[Import and export](#import-and-export).

## Accounts

An account has a name, a type (cash, food vouchers, bank account, savings, credit card, deposit,
investment, loan, other), a currency, a colour and an icon. Its **balance** is the starting balance
plus all records of the account.

- **Icon:** tap the round icon next to the name. Besides general icons you can pick the logo of your
  bank or voucher provider (currently DSK Bank, UBB, Revolut, Pluxee and Edenred). The logo is
  shown on a white disc with a ring in the account's colour.
- **Food vouchers** (meal vouchers such as Pluxee or Edenred cards) are money your employer gives
  you that can only be spent on food. Give them their own account so they don't mix with your
  bank money; groceries paid with them are normal expenses from that account.

- **Adjust balance** sets the balance to what your bank shows – DoStotinka adds a correction record
  for the difference.
- **Exclude from statistics** for accounts that should not influence charts (e.g. an investment
  depot). An explicit account selection in the statistics still includes them.
- **Archive** accounts you no longer use; their history stays.
- The account page shows the same statistics as the Statistics page, for that account only.

The Accounts page sums positive balances as **assets** and negative balances (credit cards,
loans) as **liabilities**.

## Records

A record is an **expense**, an **income** or a **transfer** between two of your accounts.

- **Amount** – both `12,50` and `12.50` work, and simple maths too: `12.40+3.10`, `3*2.5`.
- **Paid in another currency** – choose the currency next to the amount (e.g. USD on holiday). The
  amount is converted into the account currency and the original amount is kept in the note.
- **Transfers** between accounts in different currencies ask for the received amount, suggested
  from your exchange rates. Transfers are never counted as income or expenses.
- **Payee**, **note** and **labels** are optional. While you type a note, notes you wrote before
  are suggested above the field (tap one, or use ↓ / ↑ and Enter). Switch this off in
  *Settings → Preferences → Suggest notes while typing*.
- **Category from rules** – when a [rule](#rules-and-payees) matches the payee or note of a new
  record, it picks the category (until you choose one yourself).
- **Receipts & files** – attach photos or PDFs (up to 10 per record). Photos are scaled down
  before uploading. A paperclip in the list marks records with files.
- **Templates** – “Save as template” stores account, category, payee, note and labels – e.g. a
  template “Lidl” with the category *Groceries* and the note “Lidl”. The amount is only stored when
  you tick *Also fill in the amount* (handy for fixed prices like a bus ticket). Templates appear
  at the top of the editor; one tap fills everything in, then you type the amount. Edit, remove
  the amount from or delete templates in Settings. **Quick add** suggestions are learned automatically from your frequent records.
- **Duplicate** creates a copy dated now.

On the Records page you can filter by period, accounts, category, label and type, and search
notes, payees and categories (also amounts, e.g. `12.50`). **Select** enables bulk editing:
change the category, move to another account, add or remove labels, or delete many records at
once. **Export CSV** exports exactly the filtered records.

## Categories and labels

DoStotinka comes with a detailed two-level category tree (groups such as *Food & Drinks* with
subcategories such as *Groceries* or *Café & coffee*) for expenses and income. You can rename,
recolour, reorder, archive or delete categories and add your own. Deleting a category moves its
records to the parent group (or leaves them uncategorized).

**Labels** cut across categories – e.g. “Vacation” on flights, hotels and restaurants of a trip.

## Rules and payees

**Rules** (*Categories → Rules*, or *Inbox → Rules*) fill in transactions for you: “when the payee,
note or bank text **contains** *LIDL* → category *Groceries*, rename the payee to *Lidl*, note
*Groceries*, label *Food*”. A rule can also match only the start or the whole text, only expenses
or income and only one account.

Rules are used

- for every transaction in the **inbox** (phone notifications, bank connection) – before the
  category learned from your records;
- in the **CSV import** (categories from the file are kept; switch rules off for one import with
  the API option `applyRules: false`);
- in the **record editor**: a matching rule picks the category of a new record.

Rules higher up win when several set the same thing; labels of all matching rules are added.
**Apply to past records** (in the ⋯ menu of a rule) shows how many records would change and then
changes them – categories already set are only replaced when you tick the box.

**Payees** lists every payee with the number of records. Rename one (e.g. “LIDL BULGARIA EOOD 123”
→ “Lidl”) to change it in all records, templates and planned payments; renaming to an existing payee
merges the two.

## Statistics and reports

The Statistics page shows, for the chosen period and accounts:

- **Income, expenses, cash flow** and **average spending per day**, compared with the previous
  period.
- **Spending over time** per day, week or month, coloured by category. Click a bar to see its
  records; pick a category to see its subcategories over time.
- **Spending / income by category** as a donut chart – click a group to see its subcategories,
  click a row to open the matching records.
- **Cash flow** and **balance trend** charts.
- A **report** table with every category per month (or week).

Periods: last 7 / 30 days, last 12 weeks, last 6 / 12 months, the current week / month / year
(with arrows to go back), all time, or any custom range. Weeks start on the day chosen in Settings.

## Monthly review

*Statistics → Monthly review* (and, in the first days of a month, a card on the dashboard) shows
what happened in a month compared with the up to six months before:

- income, expenses, what was left over (and which share of the income), and the change of the
  balance;
- **what was different** – categories with clearly more or less than usual;
- **where the money went** (categories) and the **top payees** (or the note of records without a
  payee);
- the **largest payments** – marked *unusual* when they are much higher than usual for their
  category;
- how the **monthly budgets** ended.

Use the arrows to look at earlier months. With [reminders](#settings-and-security) switched on, tick
*Monthly review* to get a short summary on the 1st of each month (ntfy, Gotify, Discord, Slack or a
webhook).

## Net worth and investments

*Accounts → Net worth* adds up everything you own and owe: all accounts, investments, property and
open debts (money lent counts as yours, money borrowed as owed). It shows the parts and a chart of
the last 1 – 10 years (month ends; the chart leaves out money lent and borrowed).

- **Property & valuables** is an account type for a car, a flat or anything else of value. Set its
  value with *Adjust balance* whenever it changes.
- **Investments**: in an account of the type *Investment* (your broker) add the **holdings** –
  ETFs, shares, funds, bonds or crypto – with the number of units, the price of one unit and what
  you paid in total. Prices can be typed in or updated automatically every 6 hours from **Yahoo
  Finance** (tickers like `VWCE.DE`, `AAPL`, `IWDA.AS`) or **CoinGecko** (coins like `bitcoin`).
  *Look up* fills in name, price and currency. Only the ticker is sent to these services; the
  server administrator can switch it off with `PRICE_UPDATES=false`.
- An investment account shows its **value**: the balance from its records (what you paid in) plus
  the gain or loss of its holdings. Statistics keep using the records.

## Calendar

A month view with the spending of every day and the planned payments that are due. Select a day
to see its records and add one for that day.

## Planned payments

Recurring or one-time payments – rent, salary, subscriptions, taxes. A plan has an amount, an
account, a category and a schedule (daily, weekly, monthly, yearly with an interval, optional end
date).

When a payment is due it appears on the dashboard and on the Planned payments page:

- **Paid** creates the record (you can change the amount, account and date).
- **Skip** moves the plan to the next date without a record.
- **Record automatically** creates the record on the due date without asking.

The navigation shows a badge with the number of overdue payments. The dashboard forecasts the
month-end balance from today's balance and the open planned payments. With **reminders**
(Settings → Reminders) you get a daily message on your phone.

## Budgets

A budget is a weekly, monthly or yearly limit for a set of categories (a group includes its
subcategories) and optionally a set of accounts. The budget card shows what is spent and left, a
marker for today and how much you can still spend per day. Budgets can be viewed for past
periods, and the history shows every past period.

## Savings goals

Save towards a target amount, optionally by a date. Progress comes either from the balance of a
linked account (e.g. your savings account) or from amounts you add by hand. With a target date
DoStotinka tells you how much to put aside every month.

## Debts

Track money you lent to someone or borrowed from someone:

- **New debt** – choose *I lent money* or *I borrowed money*, the person and the amount. With an
  account, a record moves the money (out of the account when you lend, in when you borrow). For a
  debt from before you started using DoStotinka choose *No account* – then only the amount owed is
  tracked.
- **Record a repayment / Pay back** records the money coming back or going out; **Lend more /
  Borrow more** increases the debt.
- A debt is settled automatically when nothing is owed any more; you can also mark it as settled
  (e.g. forgiven) or reopen it.

Debt records change your account balances but are **not income or expenses** – they never appear
in statistics or budgets. In the record list they are shown as “Lent to Alex”, “Repaid by Alex”
and so on.

## Currencies

Your **base currency** (Euro by default) is used for totals and statistics. Every account has its
own currency. Exchange rates are updated daily from the European Central Bank; you can also enter
rates by hand (Settings → Currencies) – manual rates are kept until you update them again.

## Import and export

- **Import** (Records → Import) reads CSV files: exports of Wallet by BudgetBakers are recognised
  automatically (see [Moving from Wallet](MIGRATING_FROM_WALLET.md)), and any bank statement with
  date and amount columns works too. You map the columns, accounts and categories step by step;
  duplicates are skipped.
- **Import profiles:** after an import, **Save these settings for next time** remembers the column
  mapping, date format and accounts. The next file with the same columns – e.g. next month's
  statement of the same bank – gets them automatically (or choose a profile by hand).
- **Export CSV** on the Records page exports the filtered records.
- **Backup** (Settings → Your data) downloads all your data as JSON, which you can **restore** –
  also on another DoStotinka server. Attached files are not part of this backup (they are part of
  the database backup the administrator makes).

## Automatic import

Records can also arrive on their own. There are two ways, and you can switch each one on or off
separately in **Settings → Automatic import** (or use both at the same time):

| | Payment notifications from your phone | Bank connection (open banking) |
| --- | --- | --- |
| How | Your phone forwards the notifications of your banking apps, Google Wallet or bank SMS | DoStotinka reads the transactions from your bank through [Enable Banking](https://enablebanking.com) |
| Speed | Instant | Up to four updates a day; card payments appear when the bank books them |
| What | Everything that shows a notification | Everything: payments, transfers, fees, interest – and the bank balance |
| Needs | An automation app (MacroDroid, Tasker) or iPhone Shortcuts | A free Enable Banking account; confirming at the bank every 180 days |

New transactions land in the **Inbox** (in the menu, and as a banner on the dashboard). Check the
account, category (suggested from your earlier records with the same payee) and payee, then tap
**Add record** – or **Dismiss**. When everything is filled in, **Add all ready transactions** adds
them in one go. Optionally a phone or bank can **add records without review**; transactions that need
a decision (unknown account, possible duplicate, possible transfer) still wait in the inbox.

DoStotinka avoids double entries:

- the same notification sent twice, or the same bank transaction fetched again, is ignored;
- a bank booking of a payment that already came in as a notification (or a Google Wallet
  notification for a payment your banking app also announced) is marked **Already recorded**;
- a transaction that looks like a record you entered by hand asks **Same transaction / Not the same**;
- money leaving one of your accounts and arriving in another one is offered as **Save as transfer**.

### Payment notifications from your phone

1. Switch on **Payment notifications from your phone** and click **Add phone**. Copy the address and
   the token that are shown (the token is shown only once and can only add notifications).
2. Set up an automation app on the phone:
   - **Android – MacroDroid:** trigger *Notification received* (choose your banking apps and Google
     Wallet; or *SMS received* for SMS from your bank), action *HTTP request*: method POST, the address,
     header `Authorization: Bearer <token>`, body *form* with the fields `app`, `title` and `text`,
     filled with the notification's app name, title and text via the *…* (magic text) button.
   - **Android – Tasker:** event *Notification*, task *HTTP Request* (POST) with the same address and
     header and the body `app=…&title=…&text=…`, filled with the event values `%evtprm1`–`%evtprm3`
     (their order differs between Tasker versions – flash `%evtprm()` once to check).
   - **Anything else** that can send an HTTP request works too: send `title` and `text` (DoStotinka
     reads both together, so it does not matter much which is which) or `amount` and `merchant`.
   - **iPhone – Shortcuts:** automation *Transaction* (Wallet), action *Get Contents of URL*: POST, the
     address and header, body *Form* with `merchant`, `amount` and `app` (Apple Pay payments only –
     iOS does not let apps read other apps' notifications).
3. Make a payment. The app appears under **Apps** – choose the DoStotinka account it belongs to (or
   switch the app off). Notifications that are not payments (one-time codes, declined payments,
   adverts) are not imported; you can see them for two weeks under **Inbox → Not recognised**.

Tips: exclude the automation app from battery optimisation; on Android 13+ apps installed outside
an app store need *Allow restricted settings* before they get notification access. The formats of
DSK, UBB, Revolut and Google Wallet notifications are recognised; if a bank's notifications are not,
please open an issue with an example text (with the numbers changed).

### Bank connection (open banking)

Banks only give account data to licensed providers. DoStotinka uses your own free
[Enable Banking](https://enablebanking.com) application for this – no company in between, your data
goes from the bank via Enable Banking straight to your server, and your bank password is never
entered in DoStotinka.

1. Create an account at Enable Banking and register an application (*Production*, key generated in the
   browser – a `.pem` file is downloaded). As **redirect URL** enter the address DoStotinka shows you.
   Enable Banking only accepts `https://` addresses: if you open DoStotinka over plain `http://`,
   register `https://localhost/dostotinka-bank-callback` – after confirming at the bank you land on a
   page that does not load; copy its address and paste it into DoStotinka.
2. Click **Activate by linking accounts** in the Enable Banking control panel and log in to your banks
   there – in the free mode only accounts linked this way can be read.
3. In DoStotinka switch on **Bank connection**, enter the application ID and choose the `.pem` file.
4. **Connect a bank**: choose country and bank, confirm at the bank, and pick the DoStotinka account
   for every bank account. Only transactions from **Import from** onwards are imported (default: the
   day you connected), so your existing records are not duplicated.

DoStotinka fetches new booked transactions up to four times a day (**Update now** fetches them right
away) and shows the bank's balance next to the DoStotinka balance. About every 180 days the bank asks
for a new confirmation: **Renew access** (DoStotinka reminds you a week before via your reminder
channel). Pending card payments are imported once the bank books them.

## Households

Several people can keep one budget together – e.g. a couple with joint and personal accounts:

1. Everybody needs their own account on the server (sign up, or an administrator creates it).
2. In **Settings → Household** the person whose data should be shared invites the others by e-mail.
3. The invited person opens **Settings → Household** and chooses **Join**.

Members then see and edit the owner's accounts, records, budgets, planned payments, goals, debts and
categories – exactly like the owner. Personal stay: name, e-mail, password, two-factor login,
language, theme, sessions and API tokens. The main currency is set by the owner, and only the owner
can restore a backup over the shared data.

A member's own data is not deleted when joining – it is hidden and comes back when they **leave**
the household (or are removed by the owner). Records they added for the household stay there.

## Settings and security

- **Profile and preferences** – name, e-mail, base currency, time zone, first day of the week,
  number format, theme, language (English, Bulgarian) and whether notes are suggested while typing.
- **Two-factor login** – protect your account with an authenticator app (Aegis, 2FAS, Google
  Authenticator, 1Password …); turning it on asks for your password. Keep the ten recovery codes
  somewhere safe; each works once. After five wrong codes, logging in is blocked for 15 minutes.
- **Sessions** – see where you are logged in and sign out other devices.
- **API tokens** – for scripts and phone automations, see the [API guide](API.md).
- **Reminders** – daily messages about due payments via ntfy, Gotify, Discord, Slack or a webhook,
  and optionally the [monthly review](#monthly-review) on the 1st of each month.
- **Single sign-on** – if your administrator connected an identity provider, use “Log in with SSO”.
  If you already had an account, connect it once in Settings → Security → Single sign-on.

Administrators additionally see **Administration**: add users, reset passwords, switch off
two-factor login for a user who lost their phone, grant administrator rights and close sign-ups.
When a new DoStotinka version is released, Administration shows it (with the release notes and the
update command) and the menu item gets a dot – the server looks for it once a day
(`UPDATE_CHECK=false` switches this off).

## Keyboard shortcuts and tips

- <kbd>N</kbd> – add a record (anywhere outside text fields).
- <kbd>Enter</kbd> in the record editor saves; **Save & add another** keeps the dialog open.
- DoStotinka can be installed as an app on phones and desktops – see below.

## Using DoStotinka on your phone

### The Android app

The DoStotinka app for Android shows your own server full-screen – no address bar, no tabs – and
can import payment notifications by itself:

1. Download `dostotinka-<version>.apk` from the
   [releases page](https://github.com/MrNechev/DoStotinka/releases) on your phone and install it
   (Android asks once to allow installing apps from your browser).
2. Enter the address of your server, e.g. `http://192.168.1.10:8742` or your Tailscale address, and
   log in as usual.
3. For the automatic import open **Settings → Automatic import**, switch on *Payment notifications
   from your phone* and tap **Use this phone**. Allow notification access when asked (on Android
   13+ apps installed from an APK first need *App info → ⋮ → Allow restricted settings*).
4. After your banking apps showed a notification they appear under **Forward notifications of** –
   switch on the ones to import. Only these are sent, and only to your server.

**Settings → App** shows the server the app is connected to and lets you change it.

### The iPhone app

The iPhone app works like the Android app – your server full-screen, offline entry – and adds the
Shortcuts action **Add payment to DoStotinka** for card payments (iOS does not let apps read
notifications). See [apps/ios](../apps/ios/README.md) for installing it (AltStore / SideStore or
Xcode) and for setting up the Wallet *Transaction* automation.

### Offline entry

Away from home, when your server cannot be reached, you can still add records:

- In the **Android and iPhone apps** DoStotinka opens from the copy kept on the phone.
- In the **browser** an already open DoStotinka keeps working; a page loaded fresh needs the server
  (or HTTPS, then the browser keeps a copy too).

New records are saved on the device – a yellow bar shows how many wait – and are sent by themselves
as soon as the server can be reached again (or tap **Send now**). Each record is created only once,
even when sending is repeated. Files (receipts) cannot be attached offline.

### In the browser

Open DoStotinka in the phone's browser and add it to the home screen. It then starts full-screen
like a normal app, without the browser's address bar and tabs:

- **Chrome, Vivaldi, Edge, Samsung Internet (Android):** browser menu → *Install app* or *Add to
  home screen*.
- **Safari (iPhone/iPad):** share button → *Add to Home Screen*.

**HTTP or HTTPS?** Browsers only allow a *full* installation (with the app icon in the app drawer and
a faster start through offline caching) when the address starts with `https://`, or is `localhost`.
If you open DoStotinka with a plain `http://` address (e.g. `http://192.168.1.10:8742` or a Tailscale
`http://…ts.net:8742` address), the menu may say the app cannot be installed. *Add to home screen*
still works and opens DoStotinka full-screen. For the full installation, serve it over HTTPS, e.g.
with a [reverse proxy](../README.md#reverse-proxy) or, on a Tailscale network, with
`tailscale serve --bg --https=8443 http://localhost:8742`. Then open
`https://<machine>.<tailnet>.ts.net:8443` and set `TRUST_PROXY=true`.

On touch screens the category picker doesn't open the keyboard by itself – tap the search field
if you want to type, or just tap through the groups.
