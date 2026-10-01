import { describe, expect, it } from 'vitest';
import { shouldToggleOnSpace, type SpaceKeyEvent, type SpaceKeyTarget } from './spaceKey';

const target = (over: Partial<SpaceKeyTarget> = {}): SpaceKeyTarget => ({
  tag: 'body',
  editable: false,
  keyboardFocused: false,
  insideOverlay: false,
  ...over,
});
const press = (over: Partial<SpaceKeyEvent> = {}): SpaceKeyEvent => ({
  key: ' ',
  repeat: false,
  defaultPrevented: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  target: target(),
  ...over,
});

describe('shouldToggleOnSpace', () => {
  it('toggles on a plain space over the page', () => {
    expect(shouldToggleOnSpace(press())).toBe(true);
    expect(shouldToggleOnSpace(press({ key: 'Spacebar' }))).toBe(true);
    expect(shouldToggleOnSpace(press({ target: null }))).toBe(true);
  });

  it('ignores other keys, repeats, handled events and any modifier', () => {
    expect(shouldToggleOnSpace(press({ key: 'Enter' }))).toBe(false);
    expect(shouldToggleOnSpace(press({ repeat: true }))).toBe(false);
    expect(shouldToggleOnSpace(press({ defaultPrevented: true }))).toBe(false);
    for (const m of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const) {
      expect(shouldToggleOnSpace(press({ [m]: true })), m).toBe(false);
    }
  });

  it('leaves Space to controls that use it', () => {
    for (const tag of ['textarea', 'select']) {
      expect(shouldToggleOnSpace(press({ target: target({ tag }) })), tag).toBe(false);
    }
    for (const inputType of ['text', 'number', 'range', 'checkbox', 'radio', 'search']) {
      expect(shouldToggleOnSpace(press({ target: target({ tag: 'input', inputType }) })), inputType).toBe(false);
    }
    expect(shouldToggleOnSpace(press({ target: target({ tag: 'input' }) }))).toBe(false); // no type = text
    expect(shouldToggleOnSpace(press({ target: target({ tag: 'div', editable: true }) }))).toBe(false);
    for (const role of ['textbox', 'slider', 'checkbox', 'switch', 'radio', 'tab', 'combobox']) {
      expect(shouldToggleOnSpace(press({ target: target({ tag: 'div', role }) })), role).toBe(false);
    }
  });

  it('does nothing while a dialog or overlay is open', () => {
    expect(shouldToggleOnSpace(press({ target: target({ insideOverlay: true }) }))).toBe(false);
  });

  it('toggles from a button that was focused by a click, so Space does not press it again', () => {
    expect(shouldToggleOnSpace(press({ target: target({ tag: 'button' }) }))).toBe(true);
    expect(shouldToggleOnSpace(press({ target: target({ tag: 'a' }) }))).toBe(true);
    expect(shouldToggleOnSpace(press({ target: target({ tag: 'g', role: 'button' }) }))).toBe(true);
    expect(shouldToggleOnSpace(press({ target: target({ tag: 'input', inputType: 'submit' }) }))).toBe(true);
  });

  it('keeps Space for a keyboard-focused button or link', () => {
    for (const t of [
      target({ tag: 'button', keyboardFocused: true }),
      target({ tag: 'a', keyboardFocused: true }),
      target({ tag: 'summary', keyboardFocused: true }),
      target({ tag: 'g', role: 'button', keyboardFocused: true }),
    ]) {
      expect(shouldToggleOnSpace(press({ target: t })), JSON.stringify(t)).toBe(false);
    }
  });
});
