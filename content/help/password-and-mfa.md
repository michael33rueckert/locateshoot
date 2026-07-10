---
title: Password and two-factor authentication
category: Account
summary: Change your password, set up an authenticator app, and recover access if you lose your phone.
order: 2
updated: 2026-07-10
---

Profile → **Password & Security** tab.

## Changing your password

Three fields: current password, new password, confirm new. Save commits the change immediately. You'll stay signed in on this device but other sessions on other devices are kicked out — they'll need to sign in again with the new password.

If you've forgotten your current password and need to reset, sign out and use the **Forgot password?** link on the sign-in screen instead. It emails you a reset link.

## Two-factor authentication (2FA)

Strongly recommended on any account that has client data or can access billing. Same Profile → Password & Security tab.

The app supports **TOTP** (time-based one-time passwords) — the standard 6-digit codes that Google Authenticator, Authy, 1Password, and Microsoft Authenticator generate.

### Setting it up

1. Tap **Add factor** in the Two-factor authentication section
2. A QR code appears
3. Open your authenticator app (Authy / Google Authenticator / 1Password / etc.) and scan the QR
4. Type the 6-digit code your app shows back into LocateShoot to confirm
5. Done — next sign-in will require both your password AND a fresh code from the authenticator

### Using it on sign-in

After typing your password, you'll see a 6-digit code prompt. Open your authenticator app, find the LocateShoot entry, type the current code. The codes rotate every 30 seconds.

### Removing a factor

Same tab — each enrolled factor has a remove button. Removing all factors disables 2FA entirely (back to password-only sign-in).

### Lost your authenticator app?

If you get a new phone and can still sign in on a device that's already authenticated, the easy path is: sign in on the old device, remove the factor from Profile → Password & Security, then re-enroll from the new phone.

If you're locked out entirely — new phone, no backup, no other signed-in device — use the built-in recovery flow:

1. On the sign-in screen, enter your email and password as usual. You'll get to the "Enter your 6-digit code" prompt.
2. Below the Verify button, tap **Lost access to your authenticator?**.
3. Confirm the account email shown and tap **Send reset link**. We email a one-time link to that address.
4. Open the email within 30 minutes and click the link. Confirm **Yes, remove my MFA** on the page that opens.
5. Sign in with just your email and password — no code required this time.
6. Go straight to Profile → Password & Security and enroll a fresh authenticator so your account is protected again.

Only whoever controls the mailbox at that address can complete the reset. The link is single-use and expires after 30 minutes, and there's a hard cap of 3 reset requests per hour to keep the flow from being used to spam your inbox.

### Backup strategies

Even with the email recovery flow in place, an authenticator that syncs across your devices is worth setting up so you don't have to reset every time you replace a phone. **Authy**, **1Password**, and **iCloud Keychain** all sync via your cloud account — get a new phone, sign into the app, your codes follow you. **Google Authenticator** now supports Google-account sync too (turn it on in Settings). Or enroll a second authenticator on a spare device / hardware key as a manual backup.

## Password requirements

Every password on LocateShoot must include:

- At least **8 characters**
- A **lowercase** letter (a–z)
- An **uppercase** letter (A–Z)
- A **number** (0–9)
- A **symbol** (anything that isn't a letter or number — `!@#$%^&*`, punctuation, spaces, etc.)

Both the sign-up form and the "New password" form on Profile → Password &amp; Security show a live checklist next to the field so you can see which requirements you've hit as you type.

If you use a password manager, letting it generate a 16+ character random password will meet all of these automatically. If you're typing your own, a short passphrase like `Sunset-Loose-Park-2026!` hits every rule and is easier to remember than a scrambled string.
