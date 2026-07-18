# P2P Integration Demo

Third-party integration tester for the P2P platform business API.

## Run

```bash
# Terminal 1 — Backend
cd ../backend && pnpm start:dev

# Terminal 2 — User app (FinGuard)
cd ../user && pnpm dev

# Terminal 3 — This app
cd integration && pnpm install && pnpm dev
```

Open **http://localhost:5177**

## P2P deposit test (2 users)

You **cannot** pay your own withdrawal. Use two users:

| Role | Email | Password |
|------|-------|----------|
| Withdrawer (A) | `dev1@gmail.com` | (your password) |
| Depositor (B) | `dev2@gmail.com` | `Test@123` |

1. As **User A**: create a withdrawal (user app `/withdrawals` or Partner Simulator → Withdraw)
2. Logout A (or use another browser / Incognito)
3. Login as **User B** on `http://localhost:5174` **or** Partner Simulator → B → **Deposit (Pay requests)**
4. Open `/deposits` → **Pay requests** → User A’s open withdrawals should list
5. Pay with UTR + screenshot → admin/auto approve → B wallet + partner balance credited

## Classic integration setup

1. **Business panel** (`http://localhost:5176/integration`) — create business profile, copy API Key + Secret
2. **Admin panel** (`http://localhost:5173/businesses`) — **approve** the business
3. **Integration app** — paste credentials → **Verify Connection**
4. Register users, redirects, webhooks as needed

## API endpoints used

| Step | Method | Path |
|------|--------|------|
| Verify | GET | `/integration/verify` |
| Register user | POST | `/integration/users` |
| List users | GET | `/integration/users` |
| Redirect deposit | POST | `/integration/redirect/deposit` → FinGuard `/deposits` |
| Redirect withdrawal | POST | `/integration/redirect/withdrawal` |
| Test webhook | POST | `/integration/webhook/test` |

Headers: `X-Api-Key`, `X-Api-Secret`
