import type { Mode } from './types';

/**
 * Next-chord rule tables, one per mode. Data, not logic.
 *
 * Nodes are scale degrees 0–6 (0 = tonic chord). In minor, node 7 (HV) is the major V
 * borrowed from harmonic minor. Reasons are templates: {from} and {to} are filled with the
 * Roman numerals of the actual chords, so one template reads correctly in any key.
 * Keep every rendered reason under ~60 characters and free of unexplained jargon.
 */
export const HV = 7;

/** [from, to, score, reason, inversion?] */
export type Rule = readonly [from: number, to: number, score: number, reason: string, inversion?: number];

const HOME = '{from} → {to}: the strongest pull home';
const SETUP = '{from} → {to}: classic setup for heading home';
const AMEN = "{from} → {to}: the gentle 'amen' ending";
const FAKE_MAJ = '{from} → {to}: a fake-out, sounds like home but sadder';
const FAKE_MIN = '{from} → {to}: a fake-out, skips home for a bright chord';
const FIFTH = '{from} → {to}: roots fall a fifth, a smooth, common move';
const HARMONIC_V = "{from} → {to}: harmonic minor's major V pulls hard home";
const POP = '{from} → {to}: a pop favourite, lifts the mood';
const SETTLE = '{from} → {to}: settles back home';
const TENSE_HOME = '{from} → {to}: a tense chord that settles home';
const WARM = '{from} → {to}: a warm, open step away from home';
const BUILD = '{from} → {to}: builds tension that wants to return';
const LOC_HOME = '{from} → {to}: home here is diminished, so it feels unstable';

const MAJOR: Rule[] = [
  [0, 3, 0.9, WARM],
  [0, 4, 0.85, BUILD],
  [0, 5, 0.6, '{from} → {to}: a sadder mood using the same notes'],
  [0, 1, 0.55, '{from} → {to}: a gentle lift that leads on to V'],
  [0, 2, 0.3, '{from} → {to}: a soft, less common colour'],
  [1, 4, 0.95, SETUP],
  [1, 3, 0.6, '{from} → {to}: a smooth swap between similar chords'],
  [1, 6, 0.5, '{from} → {to}: a tense chord that pulls to I'],
  [1, 0, 0.3, '{from} → {to}: home chord, 5th in the bass, leads to V', 2],
  [2, 5, 0.85, FIFTH],
  [2, 3, 0.6, '{from} → {to}: a gentle step up to a brighter chord'],
  [2, 1, 0.3, '{from} → {to}: a step down to a mellow chord'],
  [3, 4, 0.9, '{from} → {to}: builds up towards home'],
  [3, 0, 0.85, AMEN],
  [3, 1, 0.55, '{from} → {to}: a softer swap that then heads to V'],
  [3, 5, 0.3, '{from} → {to}: a moody sideways step'],
  [4, 0, 1, HOME],
  [4, 5, 0.6, FAKE_MAJ],
  [4, 3, 0.3, '{from} → {to}: backs away from home, a surprise'],
  [5, 3, 0.85, POP],
  [5, 1, 0.8, FIFTH],
  [5, 4, 0.6, '{from} → {to}: raises the tension, heading home'],
  [5, 2, 0.3, '{from} → {to}: a soft sideways move'],
  [6, 0, 0.95, '{from} → {to}: a tense chord that settles home'],
  [6, 2, 0.55, '{from} → {to}: tension drifts to a softer chord'],
  [6, 5, 0.3, '{from} → {to}: tension melts into a minor chord'],
];

// Natural minor degrees: i ii° III iv v VI VII, plus HV = major V from harmonic minor.
const MINOR: Rule[] = [
  [0, 3, 0.85, WARM],
  [0, HV, 0.8, HARMONIC_V],
  [0, 5, 0.75, '{from} → {to}: a wide, emotional lift'],
  [0, 6, 0.7, '{from} → {to}: a relaxed step down, common in rock'],
  [0, 2, 0.6, '{from} → {to}: brighter mood, same notes'],
  [0, 4, 0.55, '{from} → {to}: natural v, softer and moodier than V'],
  [0, 1, 0.3, '{from} → {to}: a tense, unsettled step up'],
  [1, HV, 0.95, "{from} → {to}: classic setup, harmonic minor's V heads home"],
  [1, 4, 0.5, '{from} → {to}: a softer, moodier route to i'],
  [1, 3, 0.4, '{from} → {to}: a step to a milder minor chord'],
  [2, 5, 0.75, FIFTH],
  [2, 3, 0.6, '{from} → {to}: steps up, a gentle darkening'],
  [2, 6, 0.6, '{from} → {to}: a bright, open move'],
  [2, 0, 0.4, '{from} → {to}: steps back to the minor home'],
  [2, 4, 0.3, '{from} → {to}: a step up to a moodier chord'],
  [3, HV, 0.85, HARMONIC_V],
  [3, 0, 0.8, AMEN],
  [3, 6, 0.6, '{from} → {to}: a smooth step up in minor'],
  [3, 4, 0.5, '{from} → {to}: natural v keeps it soft and moody'],
  [3, 5, 0.5, '{from} → {to}: a warm step up'],
  [3, 1, 0.4, '{from} → {to}: a tense chord that leads on'],
  [4, 0, 0.75, '{from} → {to}: a soft, relaxed return home'],
  [4, 5, 0.7, FAKE_MIN],
  [4, 3, 0.4, '{from} → {to}: a step back, dark and moody'],
  [4, 2, 0.4, '{from} → {to}: a step up to a brighter chord'],
  [5, 6, 0.8, '{from} → {to}: a rising step, a bright lift'],
  [5, 3, 0.7, '{from} → {to}: a smooth, familiar minor move'],
  [5, HV, 0.65, HARMONIC_V],
  [5, 2, 0.55, '{from} → {to}: a step down, gentle and bright'],
  [5, 0, 0.55, SETTLE],
  [5, 1, 0.4, '{from} → {to}: tension builds towards V'],
  [6, 2, 0.85, FIFTH],
  [6, 0, 0.8, '{from} → {to}: a smooth step back home'],
  [6, 5, 0.55, '{from} → {to}: a step up, warm and bright'],
  [6, 4, 0.3, '{from} → {to}: a step down, softer and moodier'],
  [HV, 0, 1, HOME],
  [HV, 5, 0.65, FAKE_MIN],
  [HV, 3, 0.3, '{from} → {to}: backs away from home, a surprise'],
];

// Dorian: i ii ♭III IV v vi° ♭VII. Signature: i ↔ IV (the major IV).
const DORIAN: Rule[] = [
  [0, 3, 0.95, "{from} → {to}: Dorian's signature, minor with a bright IV"],
  [0, 6, 0.7, '{from} → {to}: a relaxed, open step down'],
  [0, 4, 0.6, '{from} → {to}: keeps the moody minor colour'],
  [0, 2, 0.55, '{from} → {to}: a brighter lift, same notes'],
  [0, 1, 0.4, '{from} → {to}: a gentle step up'],
  [1, 0, 0.65, '{from} → {to}: steps back home'],
  [1, 2, 0.6, '{from} → {to}: a step up to a brighter chord'],
  [1, 3, 0.5, '{from} → {to}: a familiar step, keeping the lift'],
  [2, 6, 0.7, '{from} → {to}: a bright, open pairing'],
  [2, 3, 0.65, '{from} → {to}: steps up, staying bright'],
  [2, 0, 0.6, SETTLE],
  [2, 4, 0.4, '{from} → {to}: a step up to a moodier chord'],
  [3, 0, 0.95, "{from} → {to}: home again, keeping Dorian's lift"],
  [3, 6, 0.6, '{from} → {to}: a step down, open and bluesy'],
  [3, 4, 0.55, '{from} → {to}: a step up, moody but bright'],
  [3, 2, 0.4, '{from} → {to}: a step down to a bright chord'],
  [4, 0, 0.7, '{from} → {to}: a soft return home'],
  [4, 3, 0.65, "{from} → {to}: shifts to Dorian's bright chord"],
  [4, 6, 0.5, '{from} → {to}: a step up, open and relaxed'],
  [5, 6, 0.6, '{from} → {to}: a tense chord that steps up to settle'],
  [5, 0, 0.5, TENSE_HOME],
  [5, 3, 0.5, '{from} → {to}: a tense chord that leans into a bright one'],
  [6, 0, 0.9, '{from} → {to}: a smooth, open return home'],
  [6, 3, 0.7, '{from} → {to}: a familiar open rise, brightening'],
  [6, 2, 0.6, '{from} → {to}: a bright, open pairing'],
  [6, 4, 0.4, '{from} → {to}: a step down to a moody chord'],
];

// Phrygian: i ♭II ♭III iv v° ♭VI ♭vii. Signature: i ↔ ♭II.
const PHRYGIAN: Rule[] = [
  [0, 1, 0.95, "{from} → {to}: Phrygian's signature, dark and Spanish"],
  [0, 2, 0.6, '{from} → {to}: a dark lift, same notes'],
  [0, 3, 0.6, '{from} → {to}: a warm, dark step away from home'],
  [0, 6, 0.5, '{from} → {to}: a step down, dark and relaxed'],
  [0, 5, 0.5, '{from} → {to}: a wide, brooding lift'],
  [1, 0, 0.95, '{from} → {to}: sinks back home, the classic dark landing'],
  [1, 2, 0.5, '{from} → {to}: a step up, brighter but still dark'],
  [1, 6, 0.5, '{from} → {to}: a step up, moody'],
  [1, 5, 0.4, '{from} → {to}: a step up, heavy and dark'],
  [2, 3, 0.6, '{from} → {to}: steps up, a gentle darkening'],
  [2, 1, 0.6, '{from} → {to}: a step down to the signature chord'],
  [2, 5, 0.5, '{from} → {to}: a step up, wide and dark'],
  [2, 0, 0.5, SETTLE],
  [2, 6, 0.5, '{from} → {to}: a step down, dark and calm'],
  [3, 0, 0.8, '{from} → {to}: a dark, gentle return home'],
  [3, 1, 0.6, "{from} → {to}: drops to Phrygian's dark chord"],
  [3, 5, 0.5, '{from} → {to}: a step up, wide and dark'],
  [3, 2, 0.4, '{from} → {to}: a step down to a brighter chord'],
  [4, 0, 0.7, TENSE_HOME],
  [4, 1, 0.4, "{from} → {to}: a tense chord dropping to Phrygian's chord"],
  [4, 2, 0.4, '{from} → {to}: a tense chord easing into a bright one'],
  [5, 6, 0.65, '{from} → {to}: a step up, heavy and dark'],
  [5, 1, 0.6, "{from} → {to}: heads to Phrygian's signature chord"],
  [5, 0, 0.6, SETTLE],
  [5, 3, 0.5, '{from} → {to}: a smooth, dark move'],
  [5, 2, 0.4, '{from} → {to}: a step up to a brighter chord'],
  [6, 0, 0.8, '{from} → {to}: a smooth step back home'],
  [6, 5, 0.6, '{from} → {to}: a step down, heavy and dark'],
  [6, 2, 0.5, '{from} → {to}: a bright, open move'],
  [6, 3, 0.4, '{from} → {to}: a step up, moody'],
];

// Lydian: I II iii ♯iv° V vi vii. Signature: I ↔ II (the major II).
const LYDIAN: Rule[] = [
  [0, 1, 0.95, "{from} → {to}: Lydian's signature, bright and floating"],
  [0, 4, 0.7, BUILD],
  [0, 5, 0.55, '{from} → {to}: a sadder mood using the same notes'],
  [0, 2, 0.5, '{from} → {to}: a soft, dreamy colour'],
  [0, 6, 0.5, '{from} → {to}: a step down, gentle and airy'],
  [0, 3, 0.2, '{from} → {to}: an unstable, eerie colour'],
  [1, 0, 0.9, '{from} → {to}: floats back down home'],
  [1, 4, 0.65, '{from} → {to}: a step down, keeping it bright'],
  [1, 6, 0.5, '{from} → {to}: a step up, soft and dreamy'],
  [1, 2, 0.4, '{from} → {to}: a step up to a softer chord'],
  [2, 5, 0.7, FIFTH],
  [2, 1, 0.5, '{from} → {to}: a step down to the bright chord'],
  [2, 0, 0.5, SETTLE],
  [2, 4, 0.4, '{from} → {to}: a step up, brightening'],
  [3, 4, 0.55, '{from} → {to}: a tense chord that leads on'],
  [3, 6, 0.5, '{from} → {to}: a tense chord that steps up'],
  [3, 0, 0.5, TENSE_HOME],
  [4, 0, 0.9, HOME],
  [4, 5, 0.6, FAKE_MAJ],
  [4, 1, 0.55, '{from} → {to}: a bright, dreamy step down'],
  [4, 2, 0.4, '{from} → {to}: a step down to a soft chord'],
  [5, 1, 0.7, "{from} → {to}: heads to Lydian's bright chord"],
  [5, 4, 0.6, '{from} → {to}: raises the tension, heading home'],
  [5, 2, 0.5, '{from} → {to}: a soft sideways move'],
  [5, 0, 0.5, SETTLE],
  [6, 2, 0.7, FIFTH],
  [6, 0, 0.6, SETTLE],
  [6, 1, 0.5, '{from} → {to}: a step down to the bright chord'],
  [6, 5, 0.4, '{from} → {to}: a step down, soft and mellow'],
];

// Mixolydian: I ii iii° IV v vi ♭VII. Signatures: I ↔ ♭VII, ♭VII → IV → I.
const MIXOLYDIAN: Rule[] = [
  [0, 6, 0.9, "{from} → {to}: Mixolydian's signature, rock and blues"],
  [0, 3, 0.9, WARM],
  [0, 4, 0.55, '{from} → {to}: a minor v, softer than the usual V'],
  [0, 5, 0.5, '{from} → {to}: a sadder mood using the same notes'],
  [0, 1, 0.5, '{from} → {to}: a gentle, mellow lift'],
  [1, 4, 0.6, FIFTH],
  [1, 3, 0.6, '{from} → {to}: a smooth swap between similar chords'],
  [1, 0, 0.6, SETTLE],
  [1, 6, 0.5, '{from} → {to}: a step down, bluesy and open'],
  [2, 3, 0.6, '{from} → {to}: a tense chord that steps up'],
  [2, 5, 0.5, '{from} → {to}: a tense chord easing into a mellow one'],
  [2, 0, 0.5, TENSE_HOME],
  [3, 0, 0.9, AMEN],
  [3, 6, 0.55, '{from} → {to}: a step back to the bluesy chord'],
  [3, 4, 0.5, '{from} → {to}: a step up, mellow and relaxed'],
  [3, 1, 0.5, '{from} → {to}: a softer swap that leads on'],
  [3, 5, 0.35, '{from} → {to}: a moody sideways step'],
  [4, 0, 0.7, '{from} → {to}: a relaxed return home'],
  [4, 3, 0.65, '{from} → {to}: a step up, opening out'],
  [4, 6, 0.5, '{from} → {to}: a step up, bluesy and open'],
  [4, 5, 0.4, '{from} → {to}: a step up, mellow'],
  [5, 3, 0.75, POP],
  [5, 1, 0.6, FIFTH],
  [5, 6, 0.55, '{from} → {to}: a step up, bluesy and open'],
  [5, 0, 0.5, SETTLE],
  [5, 4, 0.4, '{from} → {to}: a step down, mellow'],
  [6, 3, 0.9, '{from} → {to}: the classic rise, then home'],
  [6, 0, 0.85, '{from} → {to}: rock-style step back home'],
  [6, 4, 0.5, '{from} → {to}: a step down, mellow'],
  [6, 5, 0.4, '{from} → {to}: a step down, moody'],
];

// Locrian: i° ♭II ♭iii iv ♭V ♭VI ♭vii. The tonic is diminished and unstable: advanced territory.
const LOCRIAN: Rule[] = [
  [0, 3, 0.6, '{from} → {to}: a steadier minor chord to lean on'],
  [0, 1, 0.6, '{from} → {to}: a solid major chord beside the shaky home'],
  [0, 5, 0.55, '{from} → {to}: a wide, brooding lift'],
  [0, 2, 0.5, '{from} → {to}: a step up, dark and heavy'],
  [0, 6, 0.5, '{from} → {to}: a step down, dark and tense'],
  [0, 4, 0.35, '{from} → {to}: an eerie, unstable colour'],
  [1, 4, 0.6, '{from} → {to}: a tense, dark move'],
  [1, 0, 0.55, LOC_HOME],
  [1, 5, 0.5, '{from} → {to}: a step up, heavy and dark'],
  [1, 2, 0.5, '{from} → {to}: a step up, moody'],
  [2, 3, 0.6, '{from} → {to}: steps up, a gentle darkening'],
  [2, 5, 0.6, '{from} → {to}: a step up, wide and dark'],
  [2, 6, 0.55, '{from} → {to}: a step up, tense and dark'],
  [2, 0, 0.4, LOC_HOME],
  [3, 6, 0.6, '{from} → {to}: a smooth, dark move'],
  [3, 4, 0.55, '{from} → {to}: a step up, tense'],
  [3, 0, 0.5, LOC_HOME],
  [3, 1, 0.5, '{from} → {to}: a step down to a solid major chord'],
  [4, 1, 0.6, '{from} → {to}: a step down to a solid major chord'],
  [4, 0, 0.5, LOC_HOME],
  [4, 5, 0.5, '{from} → {to}: a step up, heavy and dark'],
  [4, 2, 0.4, '{from} → {to}: a step down, moody'],
  [5, 6, 0.6, '{from} → {to}: a step up, tense and dark'],
  [5, 3, 0.6, '{from} → {to}: a smooth, dark move'],
  [5, 0, 0.5, LOC_HOME],
  [5, 1, 0.5, '{from} → {to}: a step down to a solid major chord'],
  [5, 2, 0.4, '{from} → {to}: a step down, moody'],
  [6, 5, 0.6, '{from} → {to}: a step down, heavy and dark'],
  [6, 2, 0.55, '{from} → {to}: a step down, moody'],
  [6, 0, 0.5, LOC_HOME],
  [6, 3, 0.5, '{from} → {to}: a step up, dark and tense'],
];

export const RULES: Record<Mode, Rule[]> = {
  major: MAJOR,
  minor: MINOR,
  dorian: DORIAN,
  phrygian: PHRYGIAN,
  lydian: LYDIAN,
  mixolydian: MIXOLYDIAN,
  locrian: LOCRIAN,
};
