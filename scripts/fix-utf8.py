#!/usr/bin/env python3
"""Convert invalid-encoding frontend sources to strict UTF-8."""
from __future__ import annotations

import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = [
    "user/src/features/withdrawals/pages/WithdrawalsPage.tsx",
    "user/src/features/integration/pages/IntegrationCheckoutPage.tsx",
    "user/src/features/withdrawals/components/SavedWithdrawalMethodsPanel.tsx",
    "investor/src/features/withdrawals/components/SavedWithdrawalMethodsPanel.tsx",
    "investor/src/features/withdrawals/pages/WithdrawalsPage.tsx",
    "bussness/src/features/withdrawals/components/BusinessWithdrawalForm.tsx",
    "bussness/src/features/withdrawals/components/SavedWithdrawalMethodsPanel.tsx",
    "admin/src/features/wallet/components/PlatformCommissionWithdrawForm.tsx",
    "admin/src/features/wallet/components/SavedWithdrawalMethodsPanel.tsx",
]

REPL = {
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "*",
    "\u2026": "...",
    "\u00a0": " ",
    "\u00b7": " · ",
    "\u2192": "->",
    "\u20b9": "INR ",
    "\u0091": "'",
    "\u0092": "'",
    "\u0093": '"',
    "\u0094": '"',
    "\u0095": "*",
    "\u0096": "-",
    "\u0097": "-",
    "\u009d": "",
    "\ufffd": "",
}


def main() -> None:
    for rel in FILES:
        path = ROOT / rel
        raw = path.read_bytes()
        try:
            raw.decode("utf-8")
            print(f"OK  {rel}")
            continue
        except UnicodeDecodeError as err:
            print(f"FIX {rel}: {err}")

        text = raw.decode("cp1252", errors="replace")
        for old, new in REPL.items():
            text = text.replace(old, new)
        # Collapse accidental double spaces from · expansion
        while "  ·  " in text:
            text = text.replace("  ·  ", " · ")
        out = text.encode("utf-8")
        out.decode("utf-8")
        path.write_bytes(out)
        print(f"    wrote {len(out)} utf-8 bytes")


if __name__ == "__main__":
    main()
