// agent — MUSCLE. Behavior as an ES module. The bridge comes from the uni
// itself (imported by URL); this plugin asks for theme + storage and reads
// its own drawer on load.
import { uni } from "/uni/uni.js";
import { stream, thinking } from "./lib/motion.js";

const $ = (id) => document.getElementById(id);
const form = $("prompt"), input = $("input"), sendBtn = $("send-btn");
const plusBtn = $("plus-btn"), fileInput = $("file-input");
const menu = $("menu"), chips = $("chips");
const turns = $("turns"), empty = $("empty"), log = $("log");
const stateText = $("state-text"), thinkBox = $("state-think");
const jumpBtn = $("jump-btn"), jumpUnread = $("jump-unread");

// ---- State ----
let files = [];        // attachment chips (names only — nothing reads them yet)
let busy = false;
let mode = null;       // "sources" | "commands" | null
let cursor = 0;
let rows = [];
let closingTimer = null;

// ---- Sticky-follow ----
// The transcript follows the newest turn only while the reader is near the
// bottom. Scrolling up releases it; scrolling back down re-arms it.
let following = true;
let unread = 0;

const NEAR_BOTTOM = 80;
const atBottom = () =>
  log.scrollHeight - log.scrollTop - log.clientHeight < NEAR_BOTTOM;

const renderJump = () => {
  const away = !following && !atBottom();
  jumpBtn.hidden = !away;
  jumpBtn.classList.toggle("is-shown", away);
  jumpBtn.classList.toggle("has-unread", away && unread > 0);
  jumpUnread.textContent = unread > 9 ? "9+" : String(unread || "");
};

const scrollToBottom = () => { log.scrollTop = log.scrollHeight; };

log.addEventListener("scroll", () => {
  if (atBottom()) {
    following = true;
    unread = 0;
  } else if (following) {
    following = false;
  }
  renderJump();
}, { passive: true });

jumpBtn.addEventListener("click", () => {
  following = true;
  unread = 0;
  renderJump();
  scrollToBottom();
  input.focus();
});

// ---- Persisted state: the drawer ----
// The thread survives reloads through uni.storage: every turn is appended
// to `log` and written to the drawer; on load the log comes back and the
// transcript is rebuilt. `mode === "bridge"` is guaranteed by the
// permission gate before this runs.
const thread = [];
/** During restore, addTurn replays saved turns without re-writing them. */
let restoring = false;
const saveThread = () => {
  void uni.storage.set({ thread }).then((r) => {
    if (!r.ok) console.warn("drawer refused:", r.erro);
  });
};
void uni.storage.get().then((r) => {
  if (!r.ok) return console.warn("drawer refused:", r.erro);
  const saved = r.value?.thread;
  if (!Array.isArray(saved) || saved.length === 0) return;
  restoring = true;
  try {
    for (const t of saved) addTurn(t.role, t.text, t.files);
  } finally {
    restoring = false;
  }
  scrollToBottom();
});

// ---- Board's copy: honest rows, no invented backends ----
const SOURCES = [
  { key: "files", name: "Photos & files", desc: "attach from this device", attach: true },
  { key: "web", name: "Web search", desc: "live results", soon: true },
  { key: "memory", name: "Memory", desc: "what the agent remembers", soon: true },
];
const COMMANDS = [
  { key: "clear", name: "/clear", desc: "empty this transcript" },
  { key: "help", name: "/help", desc: "what the agent can do today" },
];

const ICONS = {
  attach: '<svg class="icon" width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 9 10 15.5a4 4 0 0 1-5.5-5.5L11 3.5a2.7 2.7 0 0 1 3.8 3.8l-6.6 6.6a1.4 1.4 0 0 1-2-2L12.5 5.5"/></svg>',
  web: '<svg class="icon" width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13M10 3.5c-4.5 4-4.5 9 0 13 4.5-4 4.5-9 0-13Z"/></svg>',
  memory: '<svg class="icon" width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M7.5 8.5h5M7.5 11.5h3"/></svg>',
};

// ---- Textarea: grows with the draft ----
const LINE = 24, MAX_ROWS = 4;
const fit = () => {
  input.style.height = "0px";
  const max = LINE * MAX_ROWS;
  input.style.height = Math.min(input.scrollHeight, max) + "px";
  input.style.overflowY = input.scrollHeight > max ? "auto" : "hidden";
};

const armed = () => (input.value.trim().length > 0 || files.length > 0) && !busy;

const sync = () => {
  form.classList.toggle("is-armed", armed());
  form.classList.toggle("is-busy", busy);
  sendBtn.disabled = !armed();
  sendBtn.setAttribute("aria-label", busy ? "Stop" : "Send message");
  // The header narrates the busy state with P28 thinking states; at rest the
  // plain line returns.
  $("state-think").hidden = !busy;
  stateText.hidden = busy;
  renderChips();
};

// ---- Chips ----
const renderChips = () => {
  chips.hidden = files.length === 0;
  chips.replaceChildren(...files.map((name, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    const label = document.createElement("span");
    label.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove " + name);
    remove.innerHTML = '<svg class="icon" width="12" height="12" viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>';
    remove.addEventListener("click", () => {
      files = files.filter((_, j) => j !== i);
      sync();
      input.focus();
    });
    chip.append(label, remove);
    return chip;
  }));
};

// ---- Menus: @ sources, / commands. Keyboard first, pointer welcome. ----
const token = () => {
  const m = /(^|\s)([/@])([\w-]*)$/.exec(input.value);
  return m ? { kind: m[2] === "@" ? "sources" : "commands", query: m[3].toLowerCase() } : null;
};

const query = () => {
  const t = token();
  return t ? t.query : "";
};

const paint = () => {
  menu.querySelectorAll(".row").forEach((el, i) => {
    el.setAttribute("aria-selected", String(i === cursor));
  });
};

const renderMenu = () => {
  const t = mode ? { kind: mode, query: query() } : token();
  if (!t) {
    closeMenuFx();
    window.setTimeout(() => { if (!mode) menu.hidden = true; }, 150);
    plusBtn.setAttribute("aria-expanded", "false");
    return;
  }

  rows = t.kind === "sources"
    ? SOURCES.filter((s) => s.name.toLowerCase().includes(t.query))
    : COMMANDS.filter((c) => c.name.slice(1).startsWith(t.query));

  menu.replaceChildren();
  if (rows.length === 0) {
    const none = document.createElement("p");
    none.className = "none";
    none.textContent = "no matches";
    menu.append(none);
  } else {
    const label = document.createElement("p");
    label.className = "label";
    label.innerHTML = t.kind === "sources"
      ? 'attach <b>sources</b> the agent can read'
      : 'agent <b>commands</b>';
    menu.append(label);
    rows.forEach((row, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "row";
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", String(i === cursor));
      if (row.soon) el.setAttribute("aria-disabled", "true");
      const icon = document.createElement("span");
      icon.innerHTML = t.kind === "sources" ? (ICONS[row.key] ?? "") : "";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = row.name;
      const tail = document.createElement("span");
      tail.className = row.soon ? "soon" : "desc";
      tail.textContent = row.soon ? "coming soon" : (row.desc ?? "");
      el.append(icon, name, tail);
      el.addEventListener("pointerenter", () => { cursor = i; paint(); });
      el.addEventListener("click", () => pick(row));
      menu.append(el);
    });
  }
  menu.hidden = false;
  openMenuFx();
  paint();
};

// P02 Menu dropdown: open adds .is-open; close swaps to .is-closing so the
// closing scale animates before the element resets.
const openMenuFx = () => {
  if (closingTimer !== null) window.clearTimeout(closingTimer);
  closingTimer = null;
  menu.classList.remove("is-closing");
  menu.classList.add("is-open");
};
const closeMenuFx = () => {
  if (!menu.classList.contains("is-open")) return;
  menu.classList.remove("is-open");
  menu.classList.add("is-closing");
  closingTimer = window.setTimeout(() => menu.classList.remove("is-closing"), 150);
};

const pick = (row) => {
  if (row.soon) return;
  if (row.attach) {
    const t = token();
    if (t) input.value = input.value.slice(0, input.value.length - t.query.length - 1);
    closeMenu();
    fileInput.click();
    return;
  }
  const t = token();
  const head = t ? input.value.slice(0, input.value.length - t.query.length - 1) : input.value;
  if (t.kind === "commands") {
    closeMenu();
    runCommand(row.key);
    input.value = head.trimEnd();
    if (input.value) send();
    return;
  }
  input.value = head + row.name + " ";
  closeMenu();
  input.focus();
};

const runCommand = (key) => {
  if (key === "clear") {
    turns.replaceChildren();
    turns.hidden = true;
    empty.hidden = false;
    thread.length = 0;
    saveThread();
    addTurn("agent", "transcript cleared — the thread starts fresh here.");
    return;
  }
  if (key === "help") {
    addTurn("agent",
      "today the agent keeps this transcript and takes attachments — nothing more.\n" +
      "the uni doesn't call a model yet; when one is connected, the same bar sends\n" +
      "your message and this thread becomes the conversation.");
    return;
  }
};

const closeMenu = () => {
  mode = null;
  closeMenuFx();
  window.setTimeout(() => { if (!mode) menu.hidden = true; }, 150);
  plusBtn.setAttribute("aria-expanded", "false");
};

// ---- Sending: the honest turn ----
const addTurn = (role, text, fileList) => {
  empty.hidden = true;
  turns.hidden = false;
  const turn = document.createElement("article");
  turn.className = "turn";
  turn.setAttribute("data-role", role);
  const who = document.createElement("p");
  who.className = "who";
  if (role === "agent") {
    const lamp = document.createElement("span");
    lamp.className = "lamp";
    const name = document.createElement("span");
    name.textContent = "agent";
    who.append(lamp, name);
  } else {
    who.textContent = "you";
  }
  const body = document.createElement("p");
  body.className = "text";
  body.textContent = text;
  turn.append(who, body);
  if (fileList && fileList.length > 0) {
    const wrap = document.createElement("p");
    wrap.className = "files";
    for (const name of fileList) {
      const code = document.createElement("code");
      code.textContent = name;
      wrap.append(code);
    }
    turn.append(wrap);
  }
  turns.append(turn);
  // Every turn is kept in the drawer: reloads come back with the thread.
  if (!restoring) {
    thread.push({ role, text, files: fileList ? [...fileList] : [] });
    saveThread();
  }
  // The agent's words stream in (P30); the user's own turn just reveals.
  if (role === "agent") {
    stream(body);
    if (following) {
      let chasing = true;
      const chase = () => {
        if (!chasing || !following) return;
        scrollToBottom();
        window.setTimeout(chase, 120);
      };
      window.setTimeout(chase, 0);
      window.setTimeout(() => { chasing = false; }, 6000);
    } else {
      unread += 1;
    }
  } else if (following) {
    scrollToBottom();
  } else {
    unread += 1;
  }
  renderJump();
};

const send = () => {
  if (!armed()) return;
  const text = input.value.trim();
  const sent = [...files];
  input.value = "";
  files = [];
  fit();
  sync();
  closeMenu();

  addTurn("you", text, sent);
  busy = true;
  sync();
  thinking.start(thinkBox, "reaching for a model…");
  // No model answers yet — the honest beat, then the thread stays open.
  window.setTimeout(() => {
    busy = false;
    thinking.stop();
    sync();
    addTurn("agent",
      "no model connected yet — your message is kept in this transcript.\n" +
      "connect a model and the agent picks up from here.");
    input.focus();
  }, 900);
};

// ---- Theme events: the Board switches, this plugin reacts ----
uni.on("theme-changed", () => {
  // Restyle is free (the injected variables flipped); this handler exists so
  // the event contract is exercised and ready for logic that needs it.
});

// ---- Events ----
input.addEventListener("input", () => {
  fit();
  sync();
  cursor = 0;
  const t = token();
  mode = t ? t.kind : null;
  renderMenu();
});

input.addEventListener("keydown", (e) => {
  if (!menu.hidden && rows.length > 0) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cursor = (cursor + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
      paint();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); pick(rows[cursor]); return; }
    if (e.key === "Tab") { e.preventDefault(); pick(rows[cursor]); return; }
  }
  if (e.key === "Escape" && !menu.hidden) { e.preventDefault(); closeMenu(); return; }
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});

input.addEventListener("focus", () => form.classList.add("is-focused"));
input.addEventListener("blur", () => form.classList.remove("is-focused"));

plusBtn.addEventListener("click", () => {
  // The plus opens the sources menu pinned (works without a token typed).
  if (mode === "sources" && !menu.hidden) { closeMenu(); return; }
  mode = "sources";
  cursor = 0;
  renderMenu();
  input.focus();
});

fileInput.addEventListener("change", () => {
  for (const f of fileInput.files ?? []) files.push(f.name);
  fileInput.value = "";
  sync();
  input.focus();
});

form.addEventListener("submit", (e) => { e.preventDefault(); send(); });

document.addEventListener("pointerdown", (e) => {
  if (!menu.hidden && !menu.contains(e.target) && e.target !== plusBtn) closeMenu();
});

fit();
sync();
