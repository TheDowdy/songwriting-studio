import { useEffect, useRef, useState } from 'react';
import { HELP_ENTRIES } from './registry';
import { resolveHelp } from './resolve';
import { useHelpMode } from './store';

const HOVER_DELAY_MS = 500;
const PROMPT = 'Select any button, control or part of the screen to see what it does.';
const NO_HELP = "There's no description for this part of the screen. Try selecting a button or a control.";

interface Spot {
  text: string;
  rect: DOMRect | null;
}

/**
 * In-app help, mounted once above the router so it covers every screen.
 *
 * - **Pointer hover** (a mouse; touch has no hover): after a short pause, a tooltip near the
 *   element says what it does. Keyboard focus shows the same tooltip.
 * - **Help mode** (the "?" button; the way to get help on a phone): the screen is shaded, a
 *   full-screen overlay swallows every tap so nothing is activated by accident, and selecting any
 *   element describes it instead of using it.
 */
export function HelpLayer() {
  const on = useHelpMode((s) => s.on);
  const setOn = useHelpMode((s) => s.setOn);
  const [tip, setTip] = useState<Spot | null>(null);
  const [picked, setPicked] = useState<Spot | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  // Hover and keyboard-focus tooltips (off while help mode is on, which has its own).
  useEffect(() => {
    if (on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Element | null = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const show = (target: Element | null, delay: number) => {
      const found = resolveHelp(target, HELP_ENTRIES);
      // A native `title` already shows on hover; don't stack a second tooltip on it.
      if (!found || found.fromTitle) return hide();
      if (found.el === current) return;
      hide();
      current = found.el;
      const { text, el } = found;
      timer = setTimeout(() => setTip({ text, rect: el.getBoundingClientRect() }), delay);
    };
    const over = (e: PointerEvent) => e.pointerType === 'mouse' && show(e.target as Element, HOVER_DELAY_MS);
    const focus = (e: FocusEvent) => {
      const t = e.target as Element;
      if (t.matches(':focus-visible')) show(t, 0);
    };
    const leave = (e: PointerEvent) => e.relatedTarget === null && hide();
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', leave);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
    };
  }, [on]);

  // Help mode: Escape leaves it; a keyboard "click" (Enter/Space on a focused control, which
  // never touches the overlay) is described rather than performed.
  useEffect(() => {
    if (!on) {
      setPicked(null);
      return;
    }
    const before = document.activeElement as HTMLElement | null;
    doneRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOn(false);
      }
    };
    const click = (e: MouseEvent) => {
      const t = e.target as Element;
      if (e.detail !== 0 || t.closest('[data-help-ui]')) return;
      e.preventDefault();
      e.stopPropagation();
      describe(t);
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('click', click, true);
      before?.focus?.();
    };
  }, [on, setOn]);

  function describe(target: Element | null) {
    const found = resolveHelp(target, HELP_ENTRIES);
    setPicked(found ? { text: found.text, rect: found.el.getBoundingClientRect() } : { text: NO_HELP, rect: null });
  }

  // A tap on the overlay: describe whatever is underneath it.
  const onOverlayClick = (e: React.MouseEvent) => {
    const under = document.elementsFromPoint(e.clientX, e.clientY).find(
      (el) => el !== overlayRef.current && !el.closest('[data-help-ui]'),
    );
    describe(under ?? null);
  };

  const cardOnTop = picked?.rect ? picked.rect.top + picked.rect.height / 2 > window.innerHeight / 2 : false;

  return (
    <>
      {tip && <Tooltip {...tip} />}
      {on && (
        <>
          <div
            ref={overlayRef}
            className={`help-overlay${picked?.rect ? '' : ' help-overlay-shaded'}`}
            onClick={onOverlayClick}
            aria-hidden="true"
          />
          {picked?.rect && (
            <div
              className="help-spot"
              aria-hidden="true"
              style={{
                top: picked.rect.top - 4,
                left: picked.rect.left - 4,
                width: picked.rect.width + 8,
                height: picked.rect.height + 8,
              }}
            />
          )}
          <div
            className={`help-card${cardOnTop ? ' help-card-top' : ''}`}
            role="dialog"
            aria-label="Help mode"
            data-help-ui
          >
            <div className="help-card-body" role="status">
              <strong>Help mode</strong>
              <p>{picked?.text ?? PROMPT}</p>
            </div>
            <button ref={doneRef} type="button" className="help-card-done" onClick={() => setOn(false)}>
              Done
            </button>
          </div>
        </>
      )}
    </>
  );
}

const TIP_WIDTH = 288;

function Tooltip({ text, rect }: Spot) {
  const below = rect!.bottom + 90 < window.innerHeight;
  const left = Math.max(8, Math.min(rect!.left, window.innerWidth - TIP_WIDTH - 8));
  return (
    <div
      role="tooltip"
      className="help-tip"
      style={{ left, ...(below ? { top: rect!.bottom + 6 } : { bottom: window.innerHeight - rect!.top + 6 }) }}
    >
      {text}
    </div>
  );
}
