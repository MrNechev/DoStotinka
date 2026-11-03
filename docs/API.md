# Using the Slavotax API

Everything the web app does goes through a JSON REST API under `/api`. The interactive OpenAPI
documentation of your own server is at **`https://<your-server>/api/docs`**.

## Authentication

Create a personal **API token** in **Settings → API tokens** and send it with every request:

```
Authorization: Bearer <token>
```

Tokens are valid for ten years and can be revoked at any time in the same place. (Alternatively
`POST /api/auth/login` with `{"email", "password", "issueToken": true}` returns a session token.)

## Conventions

- **Amounts are integers in minor units** of the account currency: `1250` = 12.50 €. Amounts in
  requests are always positive; the record `type` (`expense`, `income`, `transfer`) gives the
  direction. Amounts in responses are signed (negative = money out).
- Dates and times are ISO 8601 (`2026-11-04T18:30:00+02:00`). Planned payment dates are plain dates
  (`2026-11-04`).
- Errors look like `{"statusCode": 400, "error": "Bad Request", "message": "…", "issues": […]}`.

## Examples

List your accounts (to get their IDs):

```bash
curl -H "Authorization: Bearer $TOKEN" https://money.example.com/api/accounts
```

Find a category ID, e.g. for groceries:

```bash
curl -H "Authorization: Bearer $TOKEN" https://money.example.com/api/categories \
  | jq '.[] | select(.name == "Groceries") | .id'
```

Add an expense:

```bash
curl -X POST https://money.example.com/api/records \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "accountId": "<account id>",
    "categoryId": "<category id>",
    "amount": 1250,
    "occurredAt": "2026-11-04T18:30:00+02:00",
    "payee": "Corner shop",
    "note": "Bread and milk"
  }'
```

Transfer between accounts:

```bash
curl -X POST https://money.example.com/api/records \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"transfer","accountId":"<from>","toAccountId":"<to>","amount":10000,"occurredAt":"2026-11-04T09:00:00Z"}'
```

Spending per category for October:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://money.example.com/api/stats/categories?from=2026-10-01T00:00:00%2B03:00&to=2026-11-01T00:00:00%2B02:00&tz=Europe/Sofia"
```

## Recipe: add an expense from an iPhone (Shortcuts)

1. Create a token in Slavotax (**Settings → API tokens**).
2. In the Shortcuts app create a shortcut with:
   - **Ask for Input** (Number) – “Amount”
   - **Calculate** – *Provided Input* × 100
   - **Get Contents of URL** – URL `https://<your-server>/api/records`, method **POST**, headers
     `Authorization: Bearer <token>` and `Content-Type: application/json`, request body **JSON** with
     `type` = `expense`, `accountId` = your cash account ID, `amount` = the calculated number and
     `occurredAt` = *Current Date* (format ISO 8601).
3. Add the shortcut to your home screen – one tap logs a cash expense.

The same request works from Android automation apps such as Tasker or HTTP Shortcuts.
