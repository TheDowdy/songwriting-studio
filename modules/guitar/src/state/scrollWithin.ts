/**
 * Centres `el` horizontally inside its scrolling `container`, moving nothing else. Unlike
 * `el.scrollIntoView()`, which also scrolls every ancestor (the page included) to reveal the
 * element, this never changes the page's scroll position — a chord change during playback, or a
 * tuning/capo change re-picking the voicing, must not drag the view away from where the user was.
 */
export function centreWithin(container: Element | null, el: Element | null): void {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  container.scrollTo({ left: container.scrollLeft + (e.left + e.width / 2) - (c.left + c.width / 2) });
}
