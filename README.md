# Agent

A uni plugin (v2 contract): the chat tab.

- `uni.plugin.json` — identity + permissions (`theme`, `storage`).
- `index.html` — the **skeleton**: markup only.
- `app.css` — the **skin**: visual, only `var(--uni-*); the theme comes
  injected by the server.
- `app.js` — the **muscle**: the transcript, the prompt bar, the drawer.
- `lib/motion.js` — transitions.dev orchestration (P07/P28/P30/P02).

## The prompt bar

Adapted from React Bits' micro PromptBar to the Board: same anatomy (pill
input, side cluster, keyboard-navigated menus, attachment chips), zero
dependencies, Board tokens only. `@` opens sources, `/` opens commands.

## The bridge

`uni.js` is imported from the uni (`/uni/uni.js`), never copied. The drawer
(`uni.storage`) is exercised on load; `theme-changed` is subscribed.
