# Daftarche

Daftarche is a Persian, offline-first notebook for tasks, focus sessions and reading —
Jalali calendar, right-to-left throughout, and no runtime dependencies.
Everything lives on the device in `localStorage` and IndexedDB, so it works with the
network gone; an optional Node server in `server/` adds Web Push reminders.
It is a single static PWA: open `index.html` over any static server, or install it
from the browser. Tests run with `node --test` (no setup, no build step).

## Contributing

Start with `docs/design.md` for the architecture and the release rules. Keep changes
small and in the project's voice: Persian copy, logical CSS properties, colour tokens
instead of raw hex, and user text escaped through `esc()`. Before opening a change, run
`node --test` — it must stay green — and bump `BUILD` in `js/version.js` for any shell
file you touched, then add the release note to `CHANGELOG.md` and `js/changelog.js`.
