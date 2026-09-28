import { Midi } from '@tonejs/midi';
import { toNoteStrikes } from '../state/playback';
import { eventVoicing, flattenDetailed } from '@sw/core';
import type { Song } from '@sw/core';

/** song.bpm counts `timeSig.unit` note values per minute (section 8.1); MIDI tempo is always
 *  quarter notes per minute, so convert by how many quarters one `unit` note is worth. */
function quarterBpm(song: Song): number {
  return song.bpm * (4 / song.timeSig.unit);
}

/**
 * The whole arrangement as a Standard MIDI File (section 10): one track with the notes as heard
 * (the selected pattern, strums staggered as they sound), and a second, simpler track of block
 * chords. On the guitar instrument both use each committed voicing's actual notes (Phase 5 item
 * 3). Tempo and time signature are set in the header.
 */
export function buildMidi(song: Song): Midi {
  const midi = new Midi();
  midi.header.setTempo(quarterBpm(song));
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [song.timeSig.beats, song.timeSig.unit] });

  const secondsPerBeat = 60 / song.bpm;

  const strikes = toNoteStrikes(song);
  if (strikes.length > 0) {
    const patternTrack = midi.addTrack();
    patternTrack.name = `Chords (${song.pattern})`;
    for (const strike of strikes) {
      const duration = Math.max(0.02, strike.durationBeats * secondsPerBeat * 0.97);
      strike.midi.forEach((note, i) => {
        const time = Math.max(0, strike.offsetBeats * secondsPerBeat + i * (strike.strumSeconds ?? 0));
        patternTrack.addNote({ midi: note, time, duration, velocity: 0.8 });
      });
    }
  }

  const blockTrack = midi.addTrack();
  blockTrack.name = 'Block chords';
  let prevVoicing: number[] | null = null;
  for (const { event, offsetBeats } of flattenDetailed(song)) {
    const voicing = eventVoicing(event, song.instrument, prevVoicing);
    prevVoicing = voicing;
    const time = offsetBeats * secondsPerBeat;
    const duration = Math.max(0.02, event.beats * secondsPerBeat * 0.97);
    for (const note of voicing) blockTrack.addNote({ midi: note, time, duration, velocity: 0.7 });
  }

  return midi;
}

export function midiFilename(song: Song): string {
  const slug = song.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'song'}.mid`;
}

/** Build the MIDI file and trigger a browser download. */
export function downloadMidi(song: Song): void {
  const bytes = buildMidi(song).toArray();
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = midiFilename(song);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
