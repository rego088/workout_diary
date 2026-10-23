# Workout Diary

A small, mobile-first workout and weight diary. It is a static site written in plain HTML, CSS and JavaScript. There is no build step, no backend and no account.
**All data stays on your device** in the browser's `localStorage`. Nothing is sent anywhere.

## Features

- **Profile:** height, current weight and goal weight, with your BMI and how far you are from your goal.
- **Weight:** a one-tap "Log today's weight" button, a history list and a line chart (inline SVG).
- **Weekly plan:** add workouts to any weekday with sets × reps or a duration, total minutes and a reminder time. It comes with presets (push-ups, squats, plank, running, cycling, …), and any custom exercise you add is remembered.
- **Today:** today's workouts with Done checkboxes, a streak counter and a summary of the week.
- **Suggest my week:** builds a beginner plan from your profile with simple rules: 3–4 sessions of 20–40 minutes, alternating cardio and strength, with low-impact options for a higher BMI.
- **Add to calendar:** exports the plan as weekly repeating `.ics` events with alerts, so your iPhone reminds you.
- **Backup:** export and import all of your data as JSON.
- Works **offline** and can be installed on the home screen. Supports light and dark mode.

## How to use

1. Open the **Profile** tab and enter your height, weight and goal weight.
2. Go to **Plan** and tap **Suggest my week**, or add workouts day by day with **+ Add workout**.
3. Tap **Add to calendar** and choose **Add All** to get reminders in the iPhone Calendar app.
4. Each day, open **Today** and tick off your workouts. Your streak counts the planned days you finished in a row. Rest days don't break it.
5. Log your weight on the **Weight** tab whenever you weigh yourself.
6. Every now and then, use **Profile → Export data** to keep a backup.

Want to try it first? Use **Profile → Load demo data**, which fills the app with made-up example values.

## Add it to your iPhone home screen

1. Open the app's URL in **Safari**.
2. Tap the **Share** button (the square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open it from the new icon. It runs full screen and works without internet.

> Tip: do the calendar export from Safari, not from the home-screen app. Safari shows the "Add All" calendar sheet directly. In the home-screen app, the file opens in the share sheet; save it to Files and open it from there.

Data saved in Safari and data saved in the home-screen app are kept separately on iOS. Pick one to use day to day. You can move data between them with Export and Import.

## Run locally

Any static file server works. For example:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Styles, light and dark theme |
| `app.js` | All app logic: storage, plan rules, chart, `.ics` export |
| `sw.js` | Service worker for offline use (bump `VERSION` after changes) |
| `manifest.webmanifest`, `icons/` | Install and home-screen metadata |
