# Moving from Wallet by BudgetBakers to DoStotinka

DoStotinka can import the CSV export of *Wallet by BudgetBakers*, so you can keep your history.

## 1. Export your records from Wallet

1. Open the Wallet **web app** (web.budgetbakers.com) and log in.
2. Go to **Records**, choose the period *All time* (or the range you want) and make sure all
   accounts are selected.
3. Click **Export** and choose **CSV**.

The file contains one row per record with the columns `account`, `category`, `currency`, `amount`,
`type`, `note`, `date`, `transfer`, `payee`, `labels` and a few more.

## 2. Import it into DoStotinka

1. In DoStotinka open **Records → Import** (or **Settings → Your data → Import from CSV**).
2. Choose the exported file. DoStotinka shows *“Wallet export detected”* and fills in the column mapping
   automatically.
3. **Accounts:** every Wallet account found in the file is listed. Pick an existing DoStotinka account or
   let DoStotinka create a new one (with the right currency and type).
4. **Categories:** Wallet's default categories are matched to DoStotinka categories automatically
   (e.g. *Restaurant, fast-food* → *Food & Drinks › Restaurants*, *Wage, invoices* →
   *Salary & Wages › Salary*). Custom categories are matched by name when possible – check the
   suggestions and adjust them.
5. Review the summary and click **Import**.

Transfers between accounts appear twice in a Wallet export (once per account). DoStotinka pairs the two
halves and imports them as a single transfer. Importing the same file again is safe: records that
already exist (same account, time and amount) are skipped.

## 3. Check the balances

Wallet exports records, not account balances. After the import open **Accounts** and compare each
balance with Wallet. If one differs (for example because the account had a starting balance in
Wallet), use **Adjust balance** on the account page – it changes the starting balance without
creating a record.

## 4. Recreate planned payments and budgets

Planned payments, budgets and goals are not part of the export. Add them again under
**Planned payments**, **Budgets** and **Goals** – it only takes a few minutes.

## Tips

- Use **Select** on the Records page to recategorise many imported records at once.
- Labels from Wallet are imported and created automatically.
- Records in a currency different from their account (e.g. a USD purchase on a EUR card) are
  converted with your exchange rates (**Settings → Currencies**); the original amount is kept in the
  note. Set the rates before importing for the best result.
