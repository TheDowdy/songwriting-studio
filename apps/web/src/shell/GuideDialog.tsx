import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { GUIDE, type GuideBlock } from './guide/content';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Renders `**bold**` spans, the guide's markup for on-screen control names. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Block({ block }: { block: GuideBlock }) {
  if ('p' in block) return <p className="my-2 text-sm leading-relaxed">{inline(block.p)}</p>;
  if ('h3' in block) return <h4 className="mb-1 mt-4 text-sm font-semibold">{block.h3}</h4>;
  if ('note' in block)
    return (
      <p className="my-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed">
        <strong>Note:</strong> {inline(block.note)}
      </p>
    );
  const List = 'ol' in block ? 'ol' : 'ul';
  const items = 'ol' in block ? block.ol : block.ul;
  return (
    <List className={`my-2 space-y-1 pl-5 text-sm leading-relaxed ${List === 'ol' ? 'list-decimal' : 'list-disc'}`}>
      {items.map((item, i) => (
        <li key={i}>{inline(item)}</li>
      ))}
    </List>
  );
}

/** The user guide (see `guide/content.ts`), opened from Settings. A full-height modal with a
 *  contents list that jumps to each section. Only in the DOM while open, like `SettingsDialog`. */
export function GuideDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  if (!open) return null;

  const jump = (id: string) =>
    bodyRef.current?.querySelector(`#guide-${id}`)?.scrollIntoView({ block: 'start' });

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="guide-title"
      className="m-auto h-[min(44rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-fg backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 id="guide-title" className="m-0 text-lg font-semibold">
            User guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg"
          >
            Close
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          <nav aria-label="Contents">
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {GUIDE.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jump(s.id)}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-surface-2"
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {GUIDE.map((s) => (
            <section key={s.id} id={`guide-${s.id}`} aria-labelledby={`guide-h-${s.id}`} className="mt-6">
              <h3 id={`guide-h-${s.id}`} className="m-0 text-base font-semibold">
                {s.title}
              </h3>
              {s.blocks.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
