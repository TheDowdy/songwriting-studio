import { useEffect, useRef } from 'react';
import { shouldToggleOnSpace, type SpaceKeyTarget } from '@sw/core';

/** Open dialogs and full-screen overlays (modal dialog, help mode, the print sheet): Space is theirs. */
const OVERLAY = 'dialog[open], [role="dialog"], [role="alertdialog"], .help-overlay, .sheet-overlay';

function describeTarget(target: EventTarget | null, keyboardFocused: boolean): SpaceKeyTarget | null {
  if (!(target instanceof Element)) return null;
  return {
    tag: target.tagName.toLowerCase(),
    inputType: target instanceof HTMLInputElement ? target.type : undefined,
    role: target.getAttribute('role'),
    editable: target instanceof HTMLElement && target.isContentEditable,
    keyboardFocused,
    insideOverlay: target.closest(OVERLAY) !== null || document.querySelector(OVERLAY) !== null,
  };
}

/**
 * Makes the space bar call `onToggle` (play / stop) while this is mounted and `enabled`. Which keys
 * and targets count is decided by `shouldToggleOnSpace` in `@sw/core`. Runs in the capture phase so
 * it works even while a chord or button the pointer just clicked still has focus, and it swallows
 * the key (down and up) so that button is not pressed a second time and the page does not scroll.
 */
export function useSpaceBarToggle(onToggle: () => void, enabled = true): void {
  const latest = useRef(onToggle);
  useEffect(() => {
    latest.current = onToggle;
  });

  useEffect(() => {
    if (!enabled) return;
    let swallowing = false;
    // How the focused element got focus. Tracked here rather than read from `:focus-visible`, which
    // Chrome switches on as soon as any key is pressed, even over an element a mouse just focused.
    let viaPointer = false;
    const onPointerDown = () => {
      viaPointer = true;
    };
    const isSpace = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Spacebar';
    const onKeyDown = (e: KeyboardEvent) => {
      if (swallowing && isSpace(e)) {
        // A held key: keep it from scrolling the page or re-pressing the focused button.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Not `{ ...e }`: a KeyboardEvent keeps its fields on the prototype, so a spread copies nothing.
      const handled = shouldToggleOnSpace({
        key: e.key,
        repeat: e.repeat,
        defaultPrevented: e.defaultPrevented,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        target: describeTarget(e.target, !viaPointer),
      });
      if (!handled) {
        // Tab, arrows and the like mean the keyboard is driving focus from here on.
        if (!isSpace(e) && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) viaPointer = false;
        return;
      }
      swallowing = true;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!swallowing || !isSpace(e)) return;
      swallowing = false;
      // A button is pressed when Space is released, so this is what stops it being pressed.
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
    };
  }, [enabled]);
}
