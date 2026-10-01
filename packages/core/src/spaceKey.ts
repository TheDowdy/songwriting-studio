/**
 * When should the space bar act as "play / stop" for the whole app? Pure, so it can be tested
 * without a DOM: the UI layer describes the key event and what it landed on, this decides.
 *
 * Space already means something to many controls (typing a space, ticking a checkbox, pressing a
 * button), and a keyboard user must keep those. The rule:
 *
 * - Never while a modifier is held, on key repeat, after something else already handled the key, or
 *   while a dialog or overlay is open.
 * - Never in a control that owns Space: text fields, selects, sliders, checkboxes, radios, switches,
 *   tabs and the like.
 * - On a button or link, only if it got focus from the pointer. After you click "+ Add" or a chord,
 *   focus stays on that button, and Space would press it again, which is the opposite of what was
 *   meant. When the button has *keyboard* focus (`:focus-visible`), Space keeps its native meaning.
 * - Anywhere else (the page, a non-interactive element), yes.
 */
export interface SpaceKeyTarget {
  /** Lower-case tag name of the event target. */
  tag: string;
  /** `type` of an `<input>`; undefined for anything else. */
  inputType?: string;
  /** The `role` attribute, if any. */
  role?: string | null;
  /** Contenteditable. */
  editable: boolean;
  /** The element matches `:focus-visible`: focus came from the keyboard rather than a click. */
  keyboardFocused: boolean;
  /** Inside, or covered by, an open dialog or overlay. */
  insideOverlay: boolean;
}

export interface SpaceKeyEvent {
  key: string;
  repeat: boolean;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Null when the target is not an element (treated as the page). */
  target: SpaceKeyTarget | null;
}

/** Roles whose own keyboard behaviour uses Space. */
const SPACE_OWNING_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'spinbutton',
  'slider',
  'checkbox',
  'radio',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
]);

/** `<input>` types that behave like buttons rather than taking input. */
const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

export function shouldToggleOnSpace(e: SpaceKeyEvent): boolean {
  if (e.key !== ' ' && e.key !== 'Spacebar') return false;
  if (e.repeat || e.defaultPrevented) return false;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;

  const t = e.target;
  if (!t) return true;
  if (t.insideOverlay || t.editable) return false;
  if (t.tag === 'textarea' || t.tag === 'select') return false;
  if (t.tag === 'input' && !BUTTON_INPUT_TYPES.has(t.inputType ?? 'text')) return false;
  if (t.role && SPACE_OWNING_ROLES.has(t.role)) return false;

  const activatable =
    t.tag === 'button' ||
    t.tag === 'a' ||
    t.tag === 'summary' ||
    t.tag === 'input' ||
    t.role === 'button' ||
    t.role === 'link';
  return activatable ? !t.keyboardFocused : true;
}
