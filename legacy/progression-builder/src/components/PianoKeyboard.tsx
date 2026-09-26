import { chordStack } from '../theory/chords';
import { chroma, fmt } from '../theory/scales';
import type { ChordRef } from '../theory/types';
import { pianoVoicing } from '../theory/voicings';

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const isWhite = (midi: number) => WHITE_PCS.has(((midi % 12) + 12) % 12);

const LOW = 36; // C2
const HIGH = 79; // G5, spans the bass register plus ~2 octaves of upper voicing
const KEY_W = 20;
const KEY_H = 88;
const BLACK_W = 13;
const BLACK_H = 54;

interface Props {
  chord: ChordRef;
}

/** A ~2-octave-plus-bass piano keyboard (section 7.6) with the chord's voicing highlighted and
 *  labelled with correctly spelled note names (matching the chord's own spelling, not a fixed
 *  sharps-only chromatic scale). */
export default function PianoKeyboard({ chord }: Props) {
  const voicing = pianoVoicing(chord);
  const highlighted = new Set(voicing);
  const spelling = new Map(chordStack(chord).map((n) => [chroma(n), fmt(n)]));
  const label = (midi: number) => spelling.get(((midi % 12) + 12) % 12) ?? '';

  const notes = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i);
  const whiteNotes = notes.filter(isWhite);
  const blackNotes = notes.filter((m) => !isWhite(m));
  const whiteIndex = new Map(whiteNotes.map((m, i) => [m, i]));
  const width = whiteNotes.length * KEY_W;

  return (
    <svg viewBox={`0 0 ${width} ${KEY_H}`} width={width} height={KEY_H} role="img" aria-label={`Piano voicing: ${voicing.map(label).join(', ')}`}>
      {whiteNotes.map((m) => {
        const i = whiteIndex.get(m)!;
        const hi = highlighted.has(m);
        return (
          <g key={m}>
            <rect x={i * KEY_W} y={0} width={KEY_W} height={KEY_H} fill={hi ? 'var(--accent)' : 'var(--surface)'} stroke="var(--line)" />
            {hi && (
              <text x={i * KEY_W + KEY_W / 2} y={KEY_H - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--accent-fg)">
                {label(m)}
              </text>
            )}
          </g>
        );
      })}
      {blackNotes.map((m) => {
        let p = m - 1;
        while (!isWhite(p)) p--;
        const i = whiteIndex.get(p)!;
        const x = (i + 1) * KEY_W - BLACK_W / 2;
        const hi = highlighted.has(m);
        return (
          <g key={m}>
            <rect x={x} y={0} width={BLACK_W} height={BLACK_H} fill={hi ? 'var(--accent)' : '#1c1c2b'} stroke="var(--line)" />
            {hi && (
              <text x={x + BLACK_W / 2} y={BLACK_H - 6} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--accent-fg)">
                {label(m)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
