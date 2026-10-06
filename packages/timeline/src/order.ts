import type { Section, Song } from '@sw/core';

/**
 * Each section once, in the order the song first plays it, then any section the arrangement never
 * uses. A variant is a copy made to sit next to its source, so wherever it first plays, it is
 * pulled up to directly after that source: related sections stay side by side.
 */
export function sectionsInOrder(song: Song): Section[] {
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: Section[] = [];
  const add = (section: Section | undefined) => {
    if (!section || seen.has(section.id)) return;
    seen.add(section.id);
    out.push(section);
  };
  const variantsOf = (id: string) => song.sections.filter((s) => s.variantOf === id);
  const addWithVariants = (section: Section | undefined) => {
    if (!section || seen.has(section.id)) return;
    add(section);
    for (const v of variantsOf(section.id)) addWithVariants(v);
  };
  for (const id of song.arrangement) {
    const section = byId.get(id);
    // A variant whose source exists is placed with its source, not where it first plays.
    const source = section?.variantOf ? byId.get(section.variantOf) : undefined;
    addWithVariants(source ?? section);
  }
  for (const section of song.sections) addWithVariants(section);
  return out;
}
