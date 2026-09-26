import { useMemo, useRef } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { useDisplay } from '../../hooks/useDisplay';
import { useFretKeyboard } from '../../hooks/useFretKeyboard';
import { useGuitarSkin } from '../../hooks/useGuitarSkin';
import { useStrumGestures } from '../../hooks/useStrumGestures';
import { useStore } from '../../state/store';
import { chromaticSpelling } from '../../theory/notes';
import { TuningPeg } from '../TuningPeg/TuningPeg';
import { Frets } from './Frets';
import {
  boardHeight,
  fretCentreXs,
  interpolateAtFret,
  interpolateClamped,
  markerRadius,
  stringY,
  fretSpaceWidths,
  fretWireXs,
  mirrorX,
  STRING_COUNT,
  totalHeight,
  totalWidth,
  shouldUseRealisticSpacing,
} from './geometry';
import { Inlays } from './Inlays';
import { Neck } from './Neck';
import { NoteMarkers } from './NoteMarkers';
import { Strings } from './Strings';

export function Fretboard() {
  const tuning = useStore((s) => s.tuning);
  const fretCount = useStore((s) => s.fretCount);
  const pref = useStore((s) => s.accidentalPref);
  const leftHanded = useStore((s) => s.leftHanded);
  const spacingSetting = useStore((s) => s.fretSpacing);

  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(containerRef);
  const realistic = shouldUseRealisticSpacing(spacingSetting, containerWidth);

  const wires = useMemo(() => fretWireXs(fretCount, realistic), [fretCount, realistic]);
  const centres = useMemo(() => fretCentreXs(wires), [wires]);
  const spaces = useMemo(() => fretSpaceWidths(wires), [wires]);
  const display = useDisplay();
  const guitar = useGuitarSkin();
  const exploreSpelling = useMemo(() => chromaticSpelling(pref), [pref]);
  // In a key or chord, notes are spelled for it (B♭ in F major); otherwise by the ♯/♭ preference.
  const spelling = display?.spelling ?? exploreSpelling;

  const keyboard = useFretKeyboard({ fretCount, leftHanded, spelling });
  const strumHandlers = useStrumGestures();
  const largeNeck = useStore((s) => s.largeNeck);

  // Board graphics are drawn right-handed and flipped as a group; text is positioned
  // with mirrored coordinates so it never appears mirrored.
  const flip = leftHanded ? `translate(${totalWidth} 0) scale(-1 1)` : undefined;

  return (
    <section className="fretboard" aria-label="Guitar fretboard">
      <p className="rotate-hint">Rotate your device for the full neck.</p>
      <div className="fretboard-scroll" ref={containerRef}>
        <svg
          className="fretboard-svg"
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          role="application"
          aria-label={`Guitar fretboard, ${tuning.name} tuning, ${fretCount} frets. Arrow keys move between notes, Enter plays one, Shift and Enter strums.`}
          data-large={largeNeck || undefined}
          tabIndex={0}
          {...strumHandlers}
          {...keyboard.handlers}
        >
          <g transform={flip}>
            <Neck skin={guitar} />
            <Inlays fretCount={fretCount} centres={centres} spaces={spaces} skin={guitar} />
            <Frets wires={wires} skin={guitar} />
            <Strings skin={guitar} />
          </g>
          {keyboard.focused && keyboard.cursor && (
            <circle
              className="fret-cursor"
              cx={mirrorX(interpolateAtFret(centres, keyboard.cursor.fret), leftHanded)}
              cy={stringY(keyboard.cursor.string)}
              r={markerRadius(interpolateClamped(spaces, keyboard.cursor.fret)) + 4}
              fill="none"
              stroke="#ffd23f"
              strokeWidth={3}
              strokeDasharray="5 3"
              pointerEvents="none"
            />
          )}
          <NoteMarkers
            fretCount={fretCount}
            spelling={spelling}
            centres={centres}
            spaces={spaces}
            leftHanded={leftHanded}
            display={display}
            lightBoard={guitar.lightBoard}
          />
          {Array.from({ length: STRING_COUNT }, (_, i) => (
            <TuningPeg key={i} string={i} leftHanded={leftHanded} />
          ))}
          <g
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
            fontSize={13}
            fill="currentColor"
            opacity={0.75}
          >
            {centres.slice(1).map((cx, i) => (
              <text key={i + 1} x={mirrorX(cx, leftHanded)} y={boardHeight + 22}>
                {i + 1}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {keyboard.announcement}
      </p>
    </section>
  );
}
