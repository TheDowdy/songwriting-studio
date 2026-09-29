/**
 * Finds the help text for whatever the user is pointing at. Starting at the element under the
 * pointer it walks up through its ancestors and returns the first that has help: an inline
 * `data-help`, a registry entry (see `HelpEntry`), or a `title`. So a tap on the icon inside a
 * button finds the button's help, and a tap on a chord box finds the chord box's.
 */
import type { HelpEntry } from '@sw/ui';

/** Elements whose name is worth matching against `HelpEntry.name`. */
const NAMED = 'button, a, select, input, textarea, summary, label, [role], [aria-label]';
const SKIP_IN_NAME = new Set(['SELECT', 'INPUT', 'TEXTAREA', 'OPTION', 'SCRIPT', 'STYLE']);

/** Visible text of `node`, leaving out form controls (a `<label>` around a `<select>` would
 *  otherwise include every option). */
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP_IN_NAME.has((node as Element).tagName.toUpperCase())) return '';
  return Array.from(node.childNodes).map(textOf).join('');
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** An element's accessible name, as far as help needs it. */
export function nameOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return tidy(aria);
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return tidy(textOf(labels[0]!));
  return tidy(textOf(el)).slice(0, 120);
}

const nameMatches = (want: string | RegExp, name: string) =>
  typeof want === 'string' ? want === name : want.test(name);

export interface ResolvedHelp {
  text: string;
  /** The element the help is about (highlighted in help mode, anchored to by the tooltip). */
  el: Element;
  /** True when the text came from a native `title`, which the browser already shows on hover. */
  fromTitle: boolean;
}

export function resolveHelp(target: Element | null, entries: readonly HelpEntry[]): ResolvedHelp | null {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.hasAttribute('data-help-ui')) return null;
    const inline = el.getAttribute('data-help');
    if (inline) return { text: inline, el, fromTitle: false };
    const isNamed = el.matches(NAMED);
    const name = isNamed ? nameOf(el) : '';
    for (const e of entries) {
      if (e.scope && !el.closest(e.scope)) continue;
      // An entry with both a name and a selector needs both to match.
      const hit =
        (e.selector !== undefined || e.name !== undefined) &&
        (e.selector === undefined || el.matches(e.selector)) &&
        (e.name === undefined || (isNamed && nameMatches(e.name, name)));
      if (hit) return { text: e.text, el, fromTitle: false };
    }
    const title = el.getAttribute('title');
    if (title) return { text: title, el, fromTitle: true };
  }
  return null;
}
