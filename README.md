# Reps

A home workout planner and tracker with an iOS 26 Liquid Glass interface. Plain HTML, CSS and JavaScript: no build step, no server, no account. It runs on GitHub Pages and can be added to an iPhone home screen as an app.

## What it does

- **Plan wizard.** Choose a goal (strength, balanced, conditioning), level, plan length, small equipment (kettlebell, dumbbells, bands, jump rope, sliders, ab wheel, bodyweight), and minutes for each weekday. Days can differ in length, and a day set to zero becomes a rest day.
- **Generated plans.** Each workout has a warm-up, a main block (straight sets or circuits), an optional finisher and a cool-down, sized to fit the time you gave. Plans run in 4-week blocks: reps or intervals progress each week, the 4th week is a lighter deload, and exercises rotate each block.
- **Editing.** Change a day's time, sets, reps, work time and rest. Swap an exercise (optionally in later weeks too), reorder, add or remove exercises, switch a day between workout and rest, or generate a new workout for a day.
- **Today.** Week strip, the next workout, and widgets for this week, streak (completed rest days count), minutes and plan progress.
- **Calendar.** Months scroll vertically. Planned workouts are tinted, completed workouts and rest days get a check, and missed workouts get a hollow ring. Tap a day for its details.
- **Workout mode.**
  - *Timed:* a get-ready countdown, a rep counter paced to each exercise, countdowns for work and rest, an up-next card, pause/previous/next, +15 s rest, voice cues and beeps. The screen stays on while it runs.
  - *Own pace:* one set at a time, with a big Next button.
  - You can minimise a workout to a mini-player above the tab bar. Finishing marks the day complete, and you can also mark any day done by hand.
- **Exercise library.** 148 exercises, each with steps, coaching cues, muscles, and a YouTube demo that plays inside the app.

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

## Your data

Plans and history are stored in the browser's local storage on each device. Nothing is sent anywhere, so there is no sync between devices. Use **Settings → Back Up** to save a JSON file, and **Restore from Backup** to load it on another device.

## Project layout

```
index.html              App entry
styleguide.html         Liquid Glass component reference
css/app.css             Design tokens, glass materials, all screens
js/app.js               Shell, tab routing, event delegation
js/generator.js         Plan generator, progression, workout flattening
js/player.js            Workout mode (timed and own pace)
js/wizard.js            Plan setup flow
js/store.js             State and local storage
js/views/*.js           Today, Calendar, Plan, Library, Day sheet, Editor, Settings
js/data/exercises.js    Exercise and equipment database
js/icons.js             Lucide icons (generated)
sw.js                   Offline cache (network first)
```

## Credits

- Icons: [Lucide](https://lucide.dev) (ISC License).
- Demo videos are YouTube embeds and belong to their creators, mainly [Muscle & Strength](https://www.youtube.com/@muscleandstrength), plus NASM, Hinge Health and others. Reference links point to Muscle & Strength and ACE Fitness.
- Exercise descriptions, steps and cues were written for this project. They are general fitness guidance, not medical advice.
