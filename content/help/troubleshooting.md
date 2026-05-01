---
title: Troubleshooting
category: Troubleshooting
summary: The most common things that go sideways and how to fix them fast.
order: 1
updated: 2026-04-30
---

## "I didn't get an email when my client picked"

A few things to check:

1. **Check your spam folder.** Confirmation emails come from `notifications@locateshoot.com` — Gmail and Outlook sometimes route the first one to spam until you mark it as not spam.
2. **Did the client actually submit?** Open the guide's link yourself; the dashboard shows every pick the moment it's submitted. If you don't see it on the dashboard, the client may have closed the tab without tapping **Send my pick**.
3. **Push notifications enabled?** Profile → Settings → Notifications. Push works on Chrome, Edge, Safari (with a quick tap-to-allow), and as an installed PWA on iOS / Android.

## "My client says the link doesn't work"

- **Expired guides** show a 410 page after their `expires_at` date. Create a fresh guide and resend the new link.
- **Single-use guides** ("Expire on submit") burn out after the first pick; if you have multiple clients sharing the same one, give each their own.
- On a custom domain (Pro), DNS sometimes takes 5–10 minutes to propagate after you set it up. Test the link on the apex domain (`locateshoot.com/pick/...`) to confirm the guide itself works, then fix the DNS.

## "The wrong photo is showing for a location"

Each portfolio entry can have multiple uploaded photos. The first one (lowest **sort order**) is the thumbnail used everywhere. Open the location in your portfolio, drag photos to reorder, and the thumbnail updates immediately. To remove a photo, tap the ✕ on it.

## "A location got auto-cropped — it looks wrong on the Pick page"

The detail-panel hero is a fixed 4:3 frame. For portrait photos we letterbox so the whole photo is visible — that's by design. The list-card thumbnails are intentionally cropped to keep them visually consistent.

## Still stuck?

Open the in-app **Feedback** button (bottom right on every signed-in page) and send us a note with the guide URL or a screenshot. Most issues get a same-day response.
