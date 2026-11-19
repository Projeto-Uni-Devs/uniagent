// motion.js — transitions.dev orchestration for the Agent plugin. The CSS in
// app.css owns the animation; this module only triggers and sequences it.

/** P30 Streaming text: wrap each word once and resolve them in order through
 *  opacity + blur. Words rest visible; only the entrance animates.
 *  setTimeout, not requestAnimationFrame: in a background tab rAF never fires
 *  and the words would stay invisible forever — the fade itself is a CSS
 *  transition, so the compositor still does the work. */
export const stream = (block) => {
  const words = block.textContent.split(/(\s+)/);
  block.textContent = "";
  const spans = [];
  for (const part of words) {
    if (/^\s+$/.test(part)) {
      block.append(part);
      continue;
    }
    const s = document.createElement("span");
    s.className = "t-stream-w";
    s.textContent = part;
    block.append(s);
    spans.push(s);
  }
  const gap = ms("--stream-gap", 24);
  spans.forEach((s, i) => {
    window.setTimeout(() => s.classList.add("is-in"), i * gap);
  });
  return spans.length * gap + ms("--stream-fade", 320);
};

/** P28 Thinking states: hold the line, then swap. Both copies are absolutely
 *  positioned over the hidden sizer, so outgoing and incoming animate at the
 *  same time and the box never resizes. textContent + data-text move together
 *  so the shimmer's ::before always matches the visible line. */
const LINES = ["reaching for a model…", "keeping your turn…", "listening…"];

export const thinking = {
  start(box, first) {
    this.stop();
    const sizer = document.createElement("span");
    sizer.className = "t-think-sizer";
    sizer.textContent = LINES[0];
    box.append(sizer);
    const live = document.createElement("span");
    live.className = "t-think-text";
    live.textContent = first;
    live.setAttribute("data-text", first);
    box.append(live);
    this.live = live;
    this.box = box;
    this.index = 0;
    this.timer = window.setTimeout(() => this.swap(), hold());
  },

  swap() {
    const swap = ms("--think-swap", 150);
    const gap = ms("--think-gap", 50);
    const leaving = this.live;
    this.index = (this.index + 1) % LINES.length;
    const text = LINES[this.index];

    leaving.classList.add("is-exit");
    const next = document.createElement("span");
    next.className = "t-think-text is-enter-start";
    next.textContent = text;
    next.setAttribute("data-text", text);
    this.box.append(next);
    this.live = next;

    const release = () => {
      void next.offsetWidth; // flush the enter-start rest state
      next.classList.remove("is-enter-start");
    };
    if (gap > 0) window.setTimeout(release, gap);
    else release();

    this.timer = window.setTimeout(() => {
      leaving.remove();
      this.swap();
    }, swap + gap);
  },

  stop() {
    if (this.timer !== null && this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.box) this.box.replaceChildren();
    this.live = null;
    this.box = null;
  },
};

const ms = (name, fallback) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};
const hold = () => ms("--think-hold", 2000);
