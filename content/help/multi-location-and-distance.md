---
title: Multi-location picks + max distance
category: Location Guides
summary: Let clients choose multiple locations for moving sessions, and set rules so they stay close together.
order: 1
updated: 2026-04-30
---

Some sessions move between locations — engagement shoots that start at golden hour in a field and end downtown, or weddings with a getting-ready / ceremony / portraits split. Location Guides support that, with guardrails.

## Allowing multiple picks

When you create or edit a Location Guide, set **Maximum picks** to a number greater than 1. The client will see "Tap up to N locations" instead of "Tap a location" and they can select multiple before they hit **Send my picks**.

## Setting a max distance

If you also set **Maximum distance between picks** (in miles), the client UI will block selections that would create a pair of locations too far apart. The picks they've already made stay; the new one fades to disabled with a "Too far from your other pick" hint.

This keeps a mile-radius engagement session from accidentally turning into a session with stops 30 minutes apart.

## Single-pick is the default

If you don't change anything, the guide defaults to single-pick — one location per session. That's the right choice for most session types.
