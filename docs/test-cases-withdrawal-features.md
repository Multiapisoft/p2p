# Withdrawal + Platform Payment — Test Cases (Noida features)

Automated Jest: `cd backend && pnpm test` (or `npm test`).

Manual QA below — mark Pass/Fail while testing on staging.

---

## A. Withdrawal create (User / Investor) — #15 #16

| ID | Steps | Expected |
|----|--------|----------|
| A1 | User → New withdrawal → Bank: name with digits `Raju1` | Blocked: name alphabets+space only |
| A2 | UPI id `9876543210@ybl` (10 digits) | Blocked: max 9 consecutive digits |
| A3 | Account `12AB34` | Blocked: numeric only |
| A4 | IFSC `SBIN1001234` (5th not 0) | Blocked: IFSC pattern |
| A5 | Bank without bank name | Blocked: bank name required |
| A6 | Valid bank details → Submit | Confirm modal shows NAME / A/C / IFSC / BANK |
| A7 | Confirm modal → Confirm | WD created; list shows destination details |
| A8 | Investor same flow (no notes box) | Same validations + confirm |

## B. TAT cancel window — #8 #24

| ID | Steps | Expected |
|----|--------|----------|
| B1 | Create WD; within TAT (~2 min) | User sees Cancel + timer |
| B2 | Same WD — Business Withdrawals list | **Not visible** during TAT |
| B3 | Same WD — Admin Withdrawals | **Not visible** (business WD until listed) |
| B4 | Same WD — Investor/User Available pay list | **Not visible** (not listed) |
| B5 | Wait TAT expire | User Cancel disappears / blocked |
| B6 | Business list now shows WD | Can List for Platform Payment |
| B7 | List for Platform Payment before TAT | Error: cancel window still active |
| B8 | After list | User cannot cancel |

## C. Who sees pay requests — User / Investor — #3 #9 #23

| ID | Steps | Expected |
|----|--------|----------|
| C1 | Business lists WD | Appears in User deposits Available + Investor fulfill/invest |
| C2 | Owner of WD opens Available | Own WD **not** shown |
| C3 | Same-business User2 opens Available | WD **is** available (same biz OK) |
| C4 | Investor without plan | Prompt to select 25k/50k/1L/2L |
| C5 | Investor claims WD | Timer ~5 min; locked from others ~7 min |
| C6 | Claim expires without pay | Available again to others |

## D. Payment submit + notifications — #12 #13 #21 #22

| ID | Steps | Expected |
|----|--------|----------|
| D1 | Pay partial amount | Owner notif: **Partial Payment Received** |
| D2 | Pay remaining to full | Owner notif: **Full Payment Received** |
| D3 | Owner Confirm received | Calm confirm copy (no “cannot be undone easily”) |
| D4 | Confirm succeeds | No “Insufficient balance” error |
| D5 | After full confirm | WD status **Completed** (not stuck Processing / Open) |

## E. Admin / Business details — #17 #19 #25

| ID | Steps | Expected |
|----|--------|----------|
| E1 | Business WD detail | Shows NAME / IFSC / Account / Bank or UPI |
| E2 | Admin → Details | Same destination fields |
| E3 | Biz2 user pays Biz1 WD | Payer sees payment in Mine from start |
| E4 | Biz2 Deposits → Platform Payment activity | Sees outbound pay by its user |

## F. Commission — #26

| ID | Steps | Expected |
|----|--------|----------|
| F1 | Deposit approve (business user) | User credited **full** amount; no COMMISSION ledger on user |
| F2 | Investor bonus before target | Bonus **not** credited |
| F3 | Investor crosses 110% plan target | Bonus can credit |

## G. Copy — #7

| ID | Steps | Expected |
|----|--------|----------|
| G1 | Admin Businesses / layout / integration | UI says Platform Payment (not P2P) |

## H. Out of scope / known gap

| ID | Note |
|----|------|
| H1 | #18 Bank account holder verify API — needs third-party; not automated |

---

## Automated coverage map

| File | Covers |
|------|--------|
| `withdrawal-destination.validation.spec.ts` | #15 field rules |
| `withdrawal-visibility.util.spec.ts` | #8 cancel + #24 filters |
| `payment-notification.util.spec.ts` | #12 full/partial + #26 bonus gate |
| `withdrawal-feature-matrix.spec.ts` | User/Investor/Business/Admin visibility matrix |
