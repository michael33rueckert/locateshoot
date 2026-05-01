---
title: Password and two-factor authentication
category: Account
summary: Change your password and set up an authenticator app for two-factor sign-in.
order: 2
updated: 2026-05-01
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

The most common case: you got a new phone and forgot to migrate your authenticator. If you can still sign in on a device that's already authenticated, remove the factor and re-add it from the new phone.

If you can't get in at all, contact support via the Feedback button on any signed-in page (well, you can't, since you can't sign in — so use the contact form on the home page or email support directly). Account recovery typically requires confirming the email associated with the account.

### Backup codes

Authenticator apps like Authy and 1Password sync across devices via your iCloud / cloud account, which is the simplest "backup" — get a new phone, the codes follow you. If you use Google Authenticator (which traditionally didn't sync), the cleanest path is a second authenticator app or a hardware key.
