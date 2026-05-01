---
title: Custom domain — link.yourstudio.com
category: Branding
summary: Pro feature — point a subdomain of your studio's website at LocateShoot so guides live at your URL instead of locateshoot.com.
order: 3
updated: 2026-05-01
---

Pro photographers can host Location Guides at a subdomain of their own studio website. So instead of:

> `locateshoot.com/pick/abc123`

your client sees:

> `links.yourstudio.com/pick/abc123`

It's the same guide, the same content — just served from a domain that reads as "yours."

## Setup at a glance

Profile → **Custom Domain** tab. Three steps:

1. Enter the subdomain you want (e.g., `links.yourstudio.com`)
2. Add a DNS CNAME record at your domain registrar pointing the subdomain to a target value LocateShoot gives you
3. Wait 5-30 minutes for DNS to propagate, then come back and click **Verify**

The Custom Domain tab shows you the exact CNAME record to create — name, value, copy buttons.

## Picking a subdomain

Common conventions:

- `links.yourstudio.com`
- `pick.yourstudio.com`
- `locations.yourstudio.com`
- `book.yourstudio.com`

Avoid using your apex (e.g. `yourstudio.com` itself) — that's where your main website lives, and a CNAME at the apex breaks email and other DNS for many providers.

## DNS specifics

You'll add a **CNAME** record. Most registrars (Namecheap, GoDaddy, Squarespace, Google Domains, Cloudflare) have a "DNS settings" or "Manage DNS" panel where you can add records. The fields are:

- **Type**: CNAME
- **Name / Host**: the subdomain part only — e.g., `links` (not `links.yourstudio.com`)
- **Value / Target / Points to**: the value LocateShoot gives you on the Custom Domain tab. Copy it from there.
- **TTL**: any default is fine (300 / 1800 / Auto)

After saving, DNS usually propagates in 5-30 minutes. Sometimes longer if your TTL was previously set high. The Custom Domain tab in your Profile shows the verification state — refresh it after you've added the record.

## What changes when it's verified

- Every Location Guide URL now works on **both** `locateshoot.com/pick/...` and `links.yourstudio.com/pick/...`. Your existing links don't break.
- The "copy link" button on your dashboard / Location Guides page starts giving you the custom-domain URL by default.
- Email link previews and confirmation emails reference the custom domain.

## Plan tier

**Pro only.** Free / Starter photographers see the tab but the form is disabled with a "Pro feature" prompt. Existing custom domains stay live if you downgrade — but you can't make changes until you're back on Pro.

## Troubleshooting

- **"DNS misconfigured"** — the CNAME isn't set up correctly, or it's pointing somewhere other than what LocateShoot expects. Re-check the value field exactly. Trailing dots, typos, and copy-paste artifacts are the usual culprits.
- **"Pending DNS"** — the record exists but DNS hasn't propagated yet. Wait 15 more minutes and try Verify again.
- **"Verified" but the link doesn't load** — try the link in an incognito window. If it works there, your local DNS cache hasn't refreshed yet. `ipconfig /flushdns` (Windows) or restart your router.
