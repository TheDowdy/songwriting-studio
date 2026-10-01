import { useEffect, useMemo, useRef } from 'react';
import {
  Accidental,
  Barline,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Voice,
} from 'vexflow/bravura';
import { keyLabel } from '@sw/core';
import { useStore } from '../state/store';
import { buildSheet, type SheetBar, type SheetData, type SheetNote } from './layout';

/** Drawing units. Each system is its own SVG, scaled to the page width with CSS. */
const WIDTH = 760;
const MARGIN = 10;
/** A stave's top `y` sits 40 units above its first line; symbols and numerals are placed relative to the lines. */
const TREBLE_Y = 14;
const BASS_Y = 104;
const HEIGHT = 246;
const BARS_PER_SYSTEM = 4;
const INK = '#111111';

const restKey = (staff: 'treble' | 'bass') => (staff === 'treble' ? 'b/4' : 'd/3');

function makeNotes(cells: SheetNote[], staff: 'treble' | 'bass'): StaveNote[] {
  return cells.map((cell) => {
    const keys = cell[staff];
    const isRest = cell.rest || keys.length === 0;
    const note = new StaveNote({
      keys: isRest ? [restKey(staff)] : keys,
      duration: isRest ? `${cell.vex}r` : cell.vex,
      clef: staff,
    });
    if (cell.vex.endsWith('d')) Dot.buildAndAttach([note], { all: true });
    return note;
  });
}

interface SystemProps {
  bars: SheetBar[];
  data: SheetData;
  /** The key signature this system is drawn in (its section's). */
  keySignature: string;
  /** The previous section's signature, to cancel with naturals where the key changes. */
  cancelKeySignature?: string;
  showTime: boolean;
  repeatStart: boolean;
  repeatEnd: boolean;
  showNumerals: boolean;
}

function drawSystem(div: HTMLDivElement, { bars, data, keySignature, cancelKeySignature, showTime, repeatStart, repeatEnd, showNumerals }: SystemProps) {
  div.innerHTML = '';
  const renderer = new Renderer(div, Renderer.Backends.SVG);
  renderer.resize(WIDTH, HEIGHT);
  const ctx = renderer.getContext();
  ctx.setFillStyle(INK);
  ctx.setStrokeStyle(INK);

  const sigCount = Math.abs(sharpsOrFlats(keySignature)) + (cancelKeySignature ? Math.abs(sharpsOrFlats(cancelKeySignature)) : 0);
  const prefix = 44 + sigCount * 11 + (showTime ? 26 : 0);
  const barWidth = (WIDTH - 2 * MARGIN - prefix) / BARS_PER_SYSTEM;
  const time = `${data.timeSig.beats}/${data.timeSig.unit}`;

  const drawnNotes: { treble: StaveNote[]; bass: StaveNote[]; cells: SheetNote[] }[] = [];

  bars.forEach((bar, i) => {
    const x = i === 0 ? MARGIN : MARGIN + prefix + i * barWidth;
    const w = i === 0 ? prefix + barWidth : barWidth;
    const treble = new Stave(x, TREBLE_Y, w);
    const bass = new Stave(x, BASS_Y, w);
    if (i === 0) {
      treble.addClef('treble').addKeySignature(keySignature, cancelKeySignature);
      bass.addClef('bass').addKeySignature(keySignature, cancelKeySignature);
      if (showTime) {
        treble.addTimeSignature(time);
        bass.addTimeSignature(time);
      }
      if (repeatStart) {
        treble.setBegBarType(Barline.type.REPEAT_BEGIN);
        bass.setBegBarType(Barline.type.REPEAT_BEGIN);
      }
    }
    if (i === bars.length - 1 && repeatEnd) {
      treble.setEndBarType(Barline.type.REPEAT_END);
      bass.setEndBarType(Barline.type.REPEAT_END);
    }
    treble.setContext(ctx).draw();
    bass.setContext(ctx).draw();

    const trebleNotes = makeNotes(bar.notes, 'treble');
    const bassNotes = makeNotes(bar.notes, 'bass');
    const voices = [trebleNotes, bassNotes].map((notes) => {
      const voice = new Voice({ numBeats: data.timeSig.beats, beatValue: data.timeSig.unit }).setStrict(false);
      voice.addTickables(notes);
      return voice;
    });
    Accidental.applyAccidentals(voices, keySignature);
    const usable = w - (i === 0 ? prefix : 0) - 24;
    new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]).format(voices, Math.max(40, usable));
    voices[0].draw(ctx, treble);
    voices[1].draw(ctx, bass);
    drawnNotes.push({ treble: trebleNotes, bass: bassNotes, cells: bar.notes });

    // Chord symbols sit on a fixed line above the staff (and numerals below it), aligned to each
    // chord's note, so they never collide with noteheads or ledger lines.
    bar.notes.forEach((cell, k) => {
      const x = trebleNotes[k].getAbsoluteX();
      if (cell.symbol) {
        ctx.setFont('Arial', 16, 'bold');
        ctx.fillText(cell.symbol, x - 4, TREBLE_Y + 34);
      }
      if (showNumerals && cell.numeral) {
        ctx.setFont('Arial', 12, 'normal', 'italic');
        ctx.fillText(cell.numeral, x - 2, BASS_Y + 128);
      }
    });

    if (i === 0) {
      new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
      new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();
    }
    new StaveConnector(treble, bass).setType(i === bars.length - 1 && repeatEnd ? 'none' : 'singleRight').setContext(ctx).draw();
  });

  // Ties for chords held across notes or bar lines (only where both notes are on this system).
  const flat = drawnNotes.flatMap((b) => b.cells.map((cell, i) => ({ cell, treble: b.treble[i], bass: b.bass[i] })));
  flat.forEach((cur, i) => {
    const next = flat[i + 1];
    if (!cur.cell.tieNext || !next || cur.cell.rest) return;
    for (const staff of ['treble', 'bass'] as const) {
      const count = cur.cell[staff].length;
      if (count === 0) continue;
      new StaveTie({
        firstNote: cur[staff],
        lastNote: next[staff],
        firstIndexes: Array.from({ length: count }, (_, k) => k),
        lastIndexes: Array.from({ length: count }, (_, k) => k),
      })
        .setContext(ctx)
        .draw();
    }
  });

  const svg = div.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';
  }
}

/** Number of sharps (+) or flats (-) in a major key signature. */
function sharpsOrFlats(major: string): number {
  const table: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5 };
  return table[major] ?? 0;
}

function System(props: SystemProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) drawSystem(ref.current, props);
  });
  return <div ref={ref} className="sheet-system" />;
}

export default function SheetMusic({ showNumerals }: { showNumerals: boolean }) {
  const song = useStore((s) => s.song);
  const data = useMemo(() => buildSheet(song, keyLabel(song.key)), [song]);

  let systemsSoFar = 0;
  return (
    <div className="sheet-paper" data-testid="sheet-paper">
      <header className="sheet-head">
        <h1>{data.title}</h1>
        <p>
          {data.keyLabel} &nbsp;|&nbsp; {data.timeSig.beats}/{data.timeSig.unit} &nbsp;|&nbsp; {data.bpm} bpm
        </p>
      </header>
      {data.sections.length === 0 && <p className="sheet-empty">Add some chords to see the sheet music.</p>}
      {data.sections.map((section, si) => {
        const rows: SheetBar[][] = [];
        for (let i = 0; i < section.bars.length; i += BARS_PER_SYSTEM) rows.push(section.bars.slice(i, i + BARS_PER_SYSTEM));
        return (
          <section key={si} className="sheet-section">
            <h2>
              {section.name}
              {section.repeat > 1 && <span> &nbsp;x{section.repeat}</span>}
              {section.keyChange && <span className="sheet-key-change"> &nbsp;· key of {section.keyLabel}</span>}
            </h2>
            {rows.map((bars, ri) => {
              const isFirstSystem = systemsSoFar === 0;
              systemsSoFar += 1;
              return (
                <System
                  key={`${si}-${ri}`}
                  bars={bars}
                  data={data}
                  keySignature={section.keySignature}
                  cancelKeySignature={ri === 0 ? section.cancelKeySignature : undefined}
                  showTime={isFirstSystem}
                  repeatStart={section.repeat > 1 && ri === 0}
                  repeatEnd={section.repeat > 1 && ri === rows.length - 1}
                  showNumerals={showNumerals}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
