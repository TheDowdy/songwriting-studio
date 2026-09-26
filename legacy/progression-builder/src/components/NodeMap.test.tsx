import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { diatonicChords } from '../theory/chords';
import { startChords, suggestNext } from '../theory/suggestions';
import type { ChordRef } from '../theory/types';
import NodeMap from './NodeMap';

const key = { tonic: 'D', mode: 'dorian' } as const;
const noop = () => {};

function render(center: ChordRef | null) {
  return renderToStaticMarkup(
    <NodeMap
      musicKey={key}
      center={center}
      suggestions={center ? suggestNext(center, key) : []}
      startRing={startChords(key)}
      onPreview={noop}
      onAdd={noop}
    />,
  );
}

/** Every animated <g class="map-node"> must sit inside a positioned <g transform="translate(...)">. */
function check(html: string, expectedNodes: number) {
  // A CSS animation overrides the SVG transform attribute, so animated groups must not carry it.
  expect(html).not.toMatch(/<g[^>]*class="map-node"[^>]*transform=/);
  expect(html).not.toMatch(/<g[^>]*transform=[^>]*class="map-node"/);
  const positions = [...html.matchAll(/<g transform="translate\(([\d.-]+) ([\d.-]+)\)"><g[^>]*class="map-node"/g)].map(
    (m) => [Number(m[1]), Number(m[2])],
  );
  expect(positions).toHaveLength(expectedNodes);
  for (const [x, y] of positions) {
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(400);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(400);
  }
  return positions;
}

describe('NodeMap layout', () => {
  it('start ring: centre + 7 chords, tonic at the top', () => {
    const pos = check(render(null), 8);
    expect(pos[0]).toEqual([200, 200]);
    expect(pos[1][0]).toBeCloseTo(200);
    expect(pos[1][1]).toBeLessThan(100);
  });

  it('with a centre chord: centre + suggestions, best at the top, none stacked', () => {
    const center = diatonicChords(key)[6]; // ♭VII
    const n = suggestNext(center, key).length;
    const pos = check(render(center), n + 1);
    expect(pos[1][0]).toBeCloseTo(200);
    expect(pos[1][1]).toBeLessThan(100);
    expect(new Set(pos.slice(1).map((p) => p.join())).size).toBe(n);
  });
});
