# Reps

A home workout planner and tracker with an iOS 26 Liquid Glass interface. Plain HTML, CSS and JavaScript: no build step, no server, no account. It runs on GitHub Pages and can be added to an iPhone home screen as an app.

## What it does

- **Plan wizard.** Choose a goal (strength, balanced, conditioning), level, plan length, small equipment (kettlebell, dumbbells, bands, jump rope, sliders, ab wheel, bodyweight), and minutes for each weekday. Days can differ in length, and a day set to zero becomes a rest day.
- **Evidence-based plans.** Sets, reps, rest, effort, warm-ups, weekly volume, progression and deloads follow the 2026 ACSM position stand, systematic reviews and published training studies. Every number and its source is in [docs/programming-evidence.md](docs/programming-evidence.md) (63 references, each checked at PubMed or the publisher). Days of 30 minutes or less use alternating pairs (supersets) to save time; plans run in 4-week blocks with double progression, and intermediate and advanced plans get a lighter 4th week.
- **Proven workouts.** The 7-Minute Circuit (Klika & Jordan 2013), the 11-minute 5BX session (Archila 2021), Tabata-style 20/10, kettlebell swing intervals (Lake & Lauder 2012), kettlebell snatch 15:15 (Falatic 2015), Simple & Sinister (practitioner programme, labelled as untested) and a minimal-dose strength session. Conditioning days use them automatically, and any day can be swapped for one.
- **Editing.** Change a day's time, sets, reps, work time and rest. Swap an exercise (optionally in later weeks too), reorder, add or remove exercises, switch a day between workout and rest, or generate a new workout for a day.
- **Today.** Week strip, the next workout, and widgets for this week, streak (completed rest days count), minutes and plan progress.
- **Calendar.** Months scroll vertically. Planned workouts are tinted, completed workouts and rest days get a check, and missed workouts get a hollow ring. Tap a day for its details.
- **Workout mode.**
  - *Timed:* a get-ready countdown, a rep counter paced to each exercise, countdowns for work and rest, an up-next card, pause/previous/next, +15 s rest, voice cues and beeps. The screen stays on while it runs.
  - *Own pace:* one set at a time, with a big Next button.
  - You can minimise a workout to a mini-player above the tab bar. Finishing marks the day complete, and you can also mark any day done by hand.
- **Exercise library.** 148 exercises, each with steps, coaching cues, muscles, and a YouTube demo that plays inside the app. Swipe left on an exercise to stop it being suggested; if upcoming workouts use it, pick a replacement and those workouts are updated.
- **Profiles.** "Who's training?" on first launch (and optionally every launch). Each person has their own plan, history, settings, photo and hidden exercises. The avatar at top right opens the account sheet and switches profiles.
- **Sync across devices.** Each profile can sync to a secret GitHub Gist (see below).
- **Gestures.** Press and slide along the tab bar to move a glass bubble between tabs; drag the workout mini-player up to open the full workout.

## Design rules (Apple HIG, Liquid Glass)

- Liquid Glass is used only on the floating control layer: tab bar, toolbar buttons, sheets, alerts, menus and workout controls. Content cards stay solid.
- The tab bar is a floating capsule with a sliding selection. Search is a separate glass circle at the trailing end. Tabs navigate and never perform actions.
- The accent colour fills the one or two primary buttons in a view. Everything else stays monochrome.
- Half-height sheets float inset in glass and turn opaque at full height. Radii are concentric: capsules, 26 pt cards, 38 pt sheets.
- Colours use Apple's iOS 26 system palette in light and dark mode. The font is the system font (San Francisco on Apple devices); timers and metrics use SF Rounded.
- Background gradients are not used.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. ES modules don't load from `file://`.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, open **Settings → Pages**. Set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After about a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.
4. On iPhone, open it in Safari, then tap **Share → Add to Home Screen** for a full-screen app.

## Your data and sync

Each profile's plan, history and settings are stored in the browser on the device. To keep a profile the same on several devices:

1. On GitHub, create a classic token with only the **gist** scope (Reps links straight to the page) and give it an expiry date.
2. In Reps, tap your avatar → **Sync with GitHub** and paste the token. The other profiles on that device are synced too (each gets its own gist); a profile added later shows a **Sync … Too** row in the account sheet.
3. On another device, use **Set Up from GitHub** on the "Who's training?" screen (or **Add Profiles from GitHub** in the account sheet) with a token for the same account. A profile with the same name already on that device is merged rather than duplicated.

How it works: each profile is one secret gist (`reps-profile.json`). Reps pulls when it opens, pushes a few seconds after a change, and works offline. The most recently changed plan and settings win; completed days merge day by day, so finishing a workout on one device and editing the plan on another keeps both.

Limits to know:
- A secret gist is unlisted, not encrypted. Anyone with its exact link could read the workout data.
- The token is stored in the browser on each device. Give it only the gist scope and an expiry date.
- Timestamps come from each device's clock, so a device with a badly wrong clock can win a conflict it shouldn't.
- **Back Up / Restore** in the account sheet still saves a JSON file of the current profile.

## Project layout

```
index.html              App entry
styleguide.html         Liquid Glass component reference
css/app.css             Design tokens, glass materials, all screens
js/app.js               Shell, tab routing, event delegation
js/generator.js         Plan generator (evidence-based), progression, workout flattening
js/data/templates.js    Proven workouts from published studies
docs/                   programming-evidence.md: sources for every training number
js/player.js            Workout mode (timed and own pace)
js/wizard.js            Plan setup flow
js/store.js             Profiles, per-profile state, local storage
js/sync.js              GitHub Gist sync and merge
js/views/*.js           Today, Calendar, Plan, Library, Day sheet, Editor, Settings, Profiles, Sync
js/data/exercises.js    Exercise and equipment database
js/icons.js             Lucide icons (generated)
sw.js                   Offline cache (network first)
```

## Credits

- Icons: [Lucide](https://lucide.dev) (ISC License).
- Demo videos are YouTube embeds and belong to their creators, mainly [Muscle & Strength](https://www.youtube.com/@muscleandstrength), plus NASM, Hinge Health and others. Reference links point to Muscle & Strength and ACE Fitness.
- Exercise descriptions, steps and cues were written for this project. They are general fitness guidance, not medical advice.
