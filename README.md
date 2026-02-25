# Motorsport Countdown

A lightweight static web app focused on Formula 1 and MotoGP events.

## What it does

- Shows official Motorsport Calendar countdown widgets for F1, MotoGP, and an "Others" rotation.
- Displays next-event details for F1 and MotoGP from local ICS sources.
- Provides a monthly calendar tab with highlighted event dates and a month event list.
- Supports automatic/manual light-dark theme switching and saves user preferences.
- Works as a PWA (installable on mobile/desktop) with offline caching of static assets.

## How it works

- Frontend only: `index.html`, `styles.css`, `script.js`.
- Event data comes from local files: `f1.ics`, `motogp.ics`.
- Countdown widgets are loaded from `https://motorsportscalendar.com/widgets/countdown.js`.
- PWA setup uses `manifest.json` and `service-worker.js`.

## Deployment

- Repository is configured for GitHub Pages.
- Deployment is manual from GitHub Actions (`Deploy to GitHub Pages` workflow).
