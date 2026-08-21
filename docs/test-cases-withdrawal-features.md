# Withdrawal + Platform Payment — Test Cases

Automated: `cd backend && npm test`

Third-party **out of scope**: bank name-verify API, WhatsApp, native PhonePe SDK.

---

## Automated (Jest)

| File | Covers |
|------|--------|
| `investor-limit-lifo.util.spec.ts` | Investor add-amount lots, **LIFO consume** (no preset plans) |
| `p2p-pay-quota.util.spec.ts` | Business limit **+ earned (deposits)** / **− used (withdrawals)** |
| `p2p-list-chip.util.spec.ts` | Completed / fully-paid WD **no** “Awaiting Platform Payment” chip |
| `withdrawal-destination.validation.spec.ts` | Name, UPI 9-digit vs **admin mobile-UPI toggle**, IFSC, bank name, UPI **payer name required** |
| `withdrawal-visibility.util.spec.ts` | TAT cancel, pay-list listed-only, I2I helper |
| `partial-pay.util.spec.ts` | Partial min ₹5,000 / leftover rule |
| `payment-notification.util.spec.ts` | Full vs Partial received copy |
| `business-staff.util.spec.ts` | Staff roles: deposit verify, withdrawals, **manual WD** |
| `ticket-attachment.util.spec.ts` | Image / PDF / docs allowed |
| `totp.util.spec.ts` | 2FA TOTP |
| `investor-commission-visibility.util.spec.ts` | Admin can hide investor commission |
| `platform-commission-withdraw.util.spec.ts` | Admin WD from platform commission cannot exceed available |

---

## Manual QA

### Investor limit (no plans, LIFO)

| ID | Steps | Expected |
|----|--------|----------|
| I1 | Investor login without adding amount | Prompt: add pay-limit amount (not 25k/50k plans) |
| I2 | Add 10,000 then add 5,000 | Newest lot shown first (LIFO) |
| I3 | Pay 6,000 | Consumes newest lot first |
| I4 | Available WD list | **Newest first (LIFO)** |

### Business limit

| ID | Steps | Expected |
|----|--------|----------|
| L1 | User deposit/pay toward that business | Business remaining **increases** |
| L2 | Business/user WD completes | Remaining **decreases** |
| L3 | Business WD create over remaining | Blocked |

### Investor ≠ investor

| ID | Steps | Expected |
|----|--------|----------|
| X1 | Investor A pay list | Investor B’s WDs **hidden** |
| X2 | Claim/pay investor WD | Forbidden |

### Business WD + admin

| ID | Steps | Expected |
|----|--------|----------|
| B1 | Business creates WD | Investors see it after **admin verify/list** |
| B2 | Business cannot Approve own origin=business | Only admin Verify |
| B3 | Admin can Pay / Mark paid | Works without user proof |

### Confirm received

| ID | Steps | Expected |
|----|--------|----------|
| R1 | Owner Confirm received | Payment auto-approved |
| R2 | Full amount confirmed | WD **Completed**, **no** Awaiting chip on admin |

### User live lists + amount-first

| ID | Steps | Expected |
|----|--------|----------|
| U1 | User deposits / WD pages | Auto-refresh ~10s + Refresh |
| U2 | Enter amount first | Matching WDs; **no list-sum total** |
| U3 | User list order | FIFO (oldest first) |

### UPI

| ID | Steps | Expected |
|----|--------|----------|
| P1 | Admin Settings: mobile-number UPI **off** | `9876543210@paytm` blocked |
| P2 | Toggle **on**, save | Same UPI allowed |
| P3 | UPI without account name | Blocked (name required) |
| P4 | Pay modal | PhonePe / GPay / Paytm links |

### Business ledger + staff

| ID | Steps | Expected |
|----|--------|----------|
| G1 | Business ledger | Credit / Debit / **Balance** like statement; CSV includes Balance |
| G2 | Staff: deposit verify only | Cannot open manual WD |
| G3 | Staff: manual withdrawal | Can submit business WD |

### CSV / admin details

| ID | Steps | Expected |
|----|--------|----------|
| C1 | Business: WD, deposits, ledger | CSV download |
| C2 | Admin: WD details | User **and** payer: name, **role**, email |
| C3 | Admin sidebar | Commissions + Audit + CSV on report pages |
| C4 | `/investors` | Redirects to Withdrawals (no separate investors hub) |
| C5 | Admin Wallet: Withdraw commission | WD listed on user/investor pay list; capped by available |

### Phone + 2FA + tickets

| ID | Steps | Expected |
|----|--------|----------|
| M1 | User/Investor register | Mobile **required** |
| M2 | Business users/WD lists | **No phone** column |
| T1 | Support all sides | Files + Camera; PDF/image/docs |
| F1 | Any role Settings | 2FA enable/disable optional |

### Proof + TAT

| ID | Steps | Expected |
|----|--------|----------|
| S1 | Pay proof on mobile | **From files** and **Camera** |
| S2 | TAT over | Cancel/Edit **hidden** |

---

## Out of scope (third-party)

| ID | Note |
|----|------|
| H1 | Bank account-holder verify API / APK |
| H2 | WhatsApp payment confirmations |
