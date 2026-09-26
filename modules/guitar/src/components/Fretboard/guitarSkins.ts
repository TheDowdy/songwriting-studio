/**
 * Guitar models as data (PLAN.md §4a). A model describes what is visible around the notes:
 * headstock outline, fretboard wood and inlays, strings, and the body edge past the last fret. The
 * renderer only interprets this, so a new model is a new entry here and no component changes.
 *
 * Every silhouette and colour scheme is an original design: no manufacturer's outline, trade dress
 * or name is used (there is a test guarding the names).
 *
 * Coordinates: the headstock is drawn in a 150 × 224 box whose right edge is the nut; the body in
 * a box whose left edge is the last fret wire, y = 0 at the top edge of the fretboard and 224 at
 * the bottom edge (the frame crops anything above 0 and below about 258).
 */
import type { SoundPresetId } from '../../audio/instrument';

export type WoodId = 'rosewood' | 'maple' | 'ebony';
export type InlayStyle = 'dots' | 'blocks' | 'none';
export type GuitarModelId =
  'steel-acoustic' | 'classical' | 'double-cut' | 'single-cut' | 'hollow-body';

export interface WoodDef {
  name: string;
  /** Top and bottom colour of the board's gradient. */
  board: readonly [string, string];
  /** How much of the grain texture shows (0–1). */
  grain: number;
  /** Inlay colour that reads on this wood. */
  inlay: string;
  /** A pale board needs dark outlines on out-of-key notes. */
  light: boolean;
}

export const WOODS: Record<WoodId, WoodDef> = {
  rosewood: {
    name: 'Rosewood',
    board: ['#4a2f22', '#3b241a'],
    grain: 0.55,
    inlay: 'rgba(240, 232, 210, 0.6)',
    light: false,
  },
  maple: {
    name: 'Maple',
    board: ['#d8b67a', '#c49b5c'],
    grain: 0.35,
    inlay: 'rgba(38, 26, 16, 0.75)',
    light: true,
  },
  ebony: {
    name: 'Ebony',
    board: ['#221e1d', '#151211'],
    grain: 0.3,
    inlay: 'rgba(240, 232, 210, 0.7)',
    light: false,
  },
};

export const INLAY_STYLES: readonly { id: InlayStyle; name: string }[] = [
  { id: 'dots', name: 'Dots' },
  { id: 'blocks', name: 'Blocks' },
  { id: 'none', name: 'Side dots only' },
];

/** Finish colours offered by the customiser. */
export const FINISHES: readonly { hex: string; name: string }[] = [
  { hex: '#c8894a', name: 'Honey' },
  { hex: '#a63a2c', name: 'Cherry' },
  { hex: '#1f7a8c', name: 'Teal' },
  { hex: '#1b1b1e', name: 'Black' },
  { hex: '#e6dcc0', name: 'Cream' },
  { hex: '#2f5d3a', name: 'Forest' },
  { hex: '#5a3a7a', name: 'Violet' },
];

/**
 * A colour, or a token resolved per guitar: @finish (the finish colour, customisable),
 * @finishDark, @finishLight, @pearl, @wood / @woodDark (the board), @black.
 */
export type Paint = string;

interface ShapeStyle {
  fill?: Paint;
  stroke?: Paint;
  width?: number;
  opacity?: number;
}
export type Shape =
  | ({ kind: 'path'; d: string } & ShapeStyle)
  | ({ kind: 'circle'; cx: number; cy: number; r: number } & ShapeStyle)
  | ({ kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & ShapeStyle);

export interface GuitarModel {
  id: GuitarModelId;
  name: string;
  /** Default finish colour (headstock face, body). */
  finish: string;
  defaultFrets: number;
  /** The sound this guitar naturally has ("Match sound to guitar"). */
  defaultSound: SoundPresetId;
  wood: WoodId;
  inlay: InlayStyle;
  /** Cream binding along the fretboard edges. */
  binding: boolean;
  nut: string;
  /** Fret wire: highlight and shadow colours. */
  fretWire: readonly [string, string];
  strings: {
    plain: string;
    wound: string;
    /** Thickness by string, lowest first. */
    widths: readonly number[];
    /** Which strings are wound (lowest first). */
    isWound: readonly boolean[];
    /** Draw the winding as a fine dashed pattern (round-wound); off = smooth (flat-wound, silk). */
    windPattern: boolean;
    /** Nylon trebles are translucent. */
    plainOpacity: number;
  };
  /** The first shape is the headstock outline, filled with `face`; the rest are decoration. */
  headstock: { face: Paint; shapes: readonly Shape[] };
  /** Drawn after the last fret; strings and note markers sit on top. */
  body: { shapes: readonly Shape[] };
}

const STEEL_STRINGS = {
  plain: '#d8d8d4',
  wound: '#c9a86a',
  widths: [2.8, 2.3, 1.9, 1.4, 1.1, 0.9],
  isWound: [true, true, true, false, false, false],
  windPattern: true,
  plainOpacity: 1,
} as const;

const NICKEL_STRINGS = {
  plain: '#cfd4d8',
  wound: '#b4bcc2',
  widths: [2.8, 2.2, 1.8, 1.3, 1.05, 0.85],
  isWound: [true, true, true, false, false, false],
  windPattern: true,
  plainOpacity: 1,
} as const;

/** Six pole pieces of a pickup, one under each string (string y = 22 + 36 × (5 − i)). */
const poles = (cx: number, fill: Paint): Shape[] =>
  [0, 1, 2, 3, 4, 5].map((i) => ({
    kind: 'circle' as const,
    cx,
    cy: 22 + 36 * i,
    r: 3.4,
    fill,
    stroke: '#000',
    width: 0.6,
  }));

export const GUITAR_MODELS: readonly GuitarModel[] = [
  {
    id: 'steel-acoustic',
    name: 'Steel-string acoustic',
    finish: '#c8894a',
    defaultFrets: 20,
    defaultSound: 'acoustic',
    wood: 'rosewood',
    inlay: 'dots',
    binding: false,
    nut: '#e8e0cc',
    fretWire: ['#d9d9d6', '#8f8f8a'],
    strings: STEEL_STRINGS,
    headstock: {
      face: '#37261b',
      shapes: [
        {
          kind: 'path',
          d: 'M150 0 L26 0 C10 0 2 10 6 28 C10 48 15 72 13 112 C15 152 10 176 6 196 C2 214 10 224 26 224 L150 224 Z',
          stroke: '#1d130d',
          width: 1.5,
        },
        { kind: 'path', d: 'M22 100 L28 112 L22 124 L16 112 Z', fill: '@pearl', opacity: 0.85 },
        { kind: 'path', d: 'M32 14 L32 210', stroke: '@pearl', width: 1, opacity: 0.35 },
      ],
    },
    body: {
      shapes: [
        // The top, with a rounded shoulder where the body swells out from the neck.
        {
          kind: 'path',
          d: 'M4 224 C10 227 24 240 44 258 L120 258 L120 -10 L4 -10 Z',
          fill: '@finish',
          stroke: '@finishDark',
          width: 1.5,
        },
        {
          kind: 'path',
          d: 'M4 224 C10 227 24 240 44 258',
          stroke: '@pearl',
          width: 3,
          opacity: 0.9,
        },
        // Sound hole with a ring rosette.
        { kind: 'circle', cx: 80, cy: 112, r: 44, fill: '#0d0806' },
        { kind: 'circle', cx: 80, cy: 112, r: 44, stroke: '@pearl', width: 2 },
        { kind: 'circle', cx: 80, cy: 112, r: 50, stroke: '@finishDark', width: 3 },
        { kind: 'circle', cx: 80, cy: 112, r: 55, stroke: '@pearl', width: 1.5 },
        // A pickguard swoop under the hole.
        {
          kind: 'path',
          d: 'M46 258 C50 230 70 204 120 198 L120 258 Z',
          fill: '#2a1a10',
          opacity: 0.85,
        },
      ],
    },
  },
  {
    id: 'classical',
    name: 'Classical (nylon)',
    finish: '#d9b27c',
    defaultFrets: 19,
    defaultSound: 'classical',
    wood: 'rosewood',
    inlay: 'none',
    binding: false,
    nut: '#f0e8d4',
    fretWire: ['#dcdcd6', '#9a9a92'],
    strings: {
      // Clear nylon trebles; silk-wound basses that look smooth and silvery.
      plain: '#f0efe6',
      wound: '#c9cbc2',
      widths: [2.6, 2.2, 1.8, 1.7, 1.5, 1.3],
      isWound: [true, true, true, false, false, false],
      windPattern: false,
      plainOpacity: 0.8,
    },
    headstock: {
      face: '#3d2a1d',
      shapes: [
        {
          kind: 'path',
          d: 'M150 0 L32 0 C14 0 8 8 8 24 L8 200 C8 216 14 224 32 224 L150 224 Z',
          stroke: '#1d130d',
          width: 1.5,
        },
        // The two long slots of a slotted headstock.
        { kind: 'rect', x: 14, y: 34, w: 24, h: 60, rx: 10, fill: '#0f0906' },
        { kind: 'rect', x: 14, y: 130, w: 24, h: 60, rx: 10, fill: '#0f0906' },
      ],
    },
    body: {
      shapes: [
        {
          kind: 'path',
          d: 'M6 224 C14 229 30 246 56 258 L120 258 L120 -10 L6 -10 Z',
          fill: '@finish',
          stroke: '@finishDark',
          width: 1.5,
        },
        { kind: 'path', d: 'M6 224 C14 229 30 246 56 258', stroke: '#2a1a10', width: 2.5 },
        { kind: 'circle', cx: 82, cy: 112, r: 44, fill: '#140b07' },
        // A patterned rosette: two dark bands between light rings.
        { kind: 'circle', cx: 82, cy: 112, r: 47, stroke: '#f2e8d0', width: 2 },
        { kind: 'circle', cx: 82, cy: 112, r: 52, stroke: '#4a3020', width: 5 },
        { kind: 'circle', cx: 82, cy: 112, r: 52, stroke: '#c79a58', width: 1, opacity: 0.9 },
        { kind: 'circle', cx: 82, cy: 112, r: 57, stroke: '#f2e8d0', width: 1.5 },
      ],
    },
  },
  {
    id: 'double-cut',
    name: 'Solid-body electric, double cutaway',
    finish: '#1f7a8c',
    defaultFrets: 24,
    defaultSound: 'clean',
    wood: 'maple',
    inlay: 'dots',
    binding: false,
    nut: '#efe6cf',
    fretWire: ['#d4d6d8', '#85898c'],
    strings: NICKEL_STRINGS,
    headstock: {
      face: '@finish',
      shapes: [
        // A tapered, slightly swept-back outline.
        {
          kind: 'path',
          d: 'M150 0 L44 3 C24 8 12 22 10 46 L6 186 C6 206 18 218 40 224 L150 224 Z',
          stroke: '@finishDark',
          width: 2,
        },
        { kind: 'path', d: 'M16 60 L16 164', stroke: '@pearl', width: 2.5, opacity: 0.8 },
        { kind: 'path', d: 'M24 44 L24 180', stroke: '@pearl', width: 1, opacity: 0.6 },
      ],
    },
    body: {
      shapes: [
        // Two horns reach along the neck; only the lower one shows below the board.
        {
          kind: 'path',
          d: 'M6 226 C10 240 16 246 26 250 C32 254 34 258 40 262 L120 262 L120 -10 L30 -10 C24 100 22 190 14 224 Z',
          fill: '@finish',
          stroke: '@finishDark',
          width: 2,
        },
        {
          kind: 'path',
          d: 'M6 226 C10 240 16 246 26 250 C32 254 34 258 40 262',
          stroke: '@pearl',
          width: 1.5,
          opacity: 0.6,
        },
        // A single-coil pickup with a pale cover.
        {
          kind: 'rect',
          x: 40,
          y: 6,
          w: 26,
          h: 212,
          rx: 6,
          fill: '#e9e2cd',
          stroke: '#8d8672',
          width: 1,
        },
        ...poles(53, '#5b5b58'),
        // Volume knob near the lower edge.
        { kind: 'circle', cx: 92, cy: 246, r: 9, fill: '#161213', stroke: '#8a8a86', width: 1.2 },
      ],
    },
  },
  {
    id: 'single-cut',
    name: 'Solid-body electric, single cutaway',
    finish: '#a63a2c',
    defaultFrets: 22,
    defaultSound: 'crunch',
    wood: 'ebony',
    inlay: 'blocks',
    binding: true,
    nut: '#f2ead2',
    fretWire: ['#e2cf9a', '#8a7440'],
    strings: NICKEL_STRINGS,
    headstock: {
      face: '@finish',
      shapes: [
        // A rounded, symmetrical spade shape.
        {
          kind: 'path',
          d: 'M150 0 L30 0 C8 0 3 20 8 44 C13 72 13 152 8 180 C3 204 8 224 30 224 L150 224 Z',
          stroke: '#f2ead2',
          width: 3,
        },
        {
          kind: 'path',
          d: 'M14 96 C20 104 20 120 14 128',
          stroke: '#f2ead2',
          width: 2,
          opacity: 0.8,
        },
      ],
    },
    body: {
      shapes: [
        // A deep lower bout; the cutaway on the upper side is off the top of the frame.
        {
          kind: 'path',
          d: 'M4 224 C8 240 26 258 60 262 L120 262 L120 -10 L4 -10 Z',
          fill: '@finish',
          stroke: '#f2ead2',
          width: 3,
        },
        // Two-coil pickup: dark cover, cream bobbins.
        {
          kind: 'rect',
          x: 30,
          y: 6,
          w: 44,
          h: 212,
          rx: 7,
          fill: '#141112',
          stroke: '#000',
          width: 1,
        },
        { kind: 'rect', x: 34, y: 12, w: 15, h: 200, rx: 4, fill: '#efe6cf' },
        { kind: 'rect', x: 55, y: 12, w: 15, h: 200, rx: 4, fill: '#efe6cf' },
        ...poles(41.5, '#8d8d88'),
        ...poles(62.5, '#8d8d88'),
        // A pale pickguard wing.
        {
          kind: 'path',
          d: 'M82 258 C84 232 96 214 120 210 L120 262 L84 262 Z',
          fill: '#f0e8d0',
          opacity: 0.9,
        },
      ],
    },
  },
  {
    id: 'hollow-body',
    name: 'Hollow-body electric',
    finish: '#9b4a22',
    defaultFrets: 22,
    defaultSound: 'jazz',
    wood: 'ebony',
    inlay: 'blocks',
    binding: true,
    nut: '#efe6cf',
    fretWire: ['#e2cf9a', '#8a7440'],
    strings: {
      // Flat-wound strings: smooth, dull nickel.
      plain: '#c4c6c4',
      wound: '#a9adb0',
      widths: [3, 2.4, 1.9, 1.3, 1.05, 0.85],
      isWound: [true, true, true, false, false, false],
      windPattern: false,
      plainOpacity: 1,
    },
    headstock: {
      face: '#211712',
      shapes: [
        // A sheared, off-square outline.
        {
          kind: 'path',
          d: 'M150 0 L20 10 C7 14 4 26 8 46 L12 182 C14 206 26 220 46 224 L150 224 Z',
          stroke: '#f0e6c8',
          width: 2,
        },
        { kind: 'path', d: 'M20 96 L28 112 L20 128 L12 112 Z', fill: '#efe6cf' },
      ],
    },
    body: {
      shapes: [
        // A deep, round-shouldered top with double binding.
        {
          kind: 'path',
          d: 'M4 224 C8 236 20 252 44 258 C56 262 70 262 80 262 L120 262 L120 -10 L4 -10 Z',
          fill: '@finish',
        },
        {
          kind: 'path',
          d: 'M4 224 C8 236 20 252 44 258 C56 262 70 262 80 262',
          stroke: '#f0e6c8',
          width: 3,
        },
        {
          kind: 'path',
          d: 'M6 218 C10 230 22 246 46 252 C58 256 72 256 82 256',
          stroke: '#2a1408',
          width: 1.5,
          opacity: 0.8,
        },
        // Part of an f-shaped sound hole.
        {
          kind: 'path',
          d: 'M84 70 C74 86 74 112 82 130 C88 144 88 158 82 172',
          stroke: '#0c0705',
          width: 8,
          opacity: 0.95,
        },
        { kind: 'circle', cx: 84, cy: 66, r: 6, fill: '#0c0705' },
        { kind: 'circle', cx: 82, cy: 178, r: 6, fill: '#0c0705' },
        // A floating humbucker with a gold cover.
        {
          kind: 'rect',
          x: 26,
          y: 8,
          w: 34,
          h: 208,
          rx: 8,
          fill: '#3a2f18',
          stroke: '#e2cf9a',
          width: 1.5,
        },
        ...poles(43, '#e2cf9a'),
      ],
    },
  },
];

export const DEFAULT_MODEL_ID: GuitarModelId = 'steel-acoustic';

export function getGuitarModel(id: string): GuitarModel {
  return GUITAR_MODELS.find((m) => m.id === id) ?? (GUITAR_MODELS[0] as GuitarModel);
}

export function isGuitarModelId(x: unknown): x is GuitarModelId {
  return GUITAR_MODELS.some((m) => m.id === x);
}

// ------------------------------------------------------------------ customising

/** Changes the user has made on top of a model; null = use the model's own. */
export interface Customise {
  wood: WoodId | null;
  inlay: InlayStyle | null;
  finish: string | null;
}

export const NO_CUSTOMISE: Customise = { wood: null, inlay: null, finish: null };

const HEX = /^#[0-9a-f]{6}$/i;

export function sanitizeCustomise(x: unknown): Customise {
  if (typeof x !== 'object' || x === null) return NO_CUSTOMISE;
  const r = x as Record<string, unknown>;
  return {
    wood: typeof r['wood'] === 'string' && r['wood'] in WOODS ? (r['wood'] as WoodId) : null,
    inlay: INLAY_STYLES.some((i) => i.id === r['inlay']) ? (r['inlay'] as InlayStyle) : null,
    finish: typeof r['finish'] === 'string' && HEX.test(r['finish']) ? r['finish'] : null,
  };
}

/** Mixes `hex` towards `target` (0–255 per channel) by `amount` (0–1). */
function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(v + (target - v) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export interface ResolvedSkin {
  model: GuitarModel;
  wood: WoodDef;
  woodId: WoodId;
  inlay: InlayStyle;
  finish: string;
  /** Colours for the @tokens used in shapes. */
  tokens: Readonly<Record<string, string>>;
  /** Pale board: note outlines and labels must be dark. */
  lightBoard: boolean;
}

/** A model with the user's customisations applied. */
export function resolveSkin(id: string, custom: Customise = NO_CUSTOMISE): ResolvedSkin {
  const model = getGuitarModel(id);
  const woodId = custom.wood ?? model.wood;
  const wood = WOODS[woodId];
  const finish = custom.finish ?? model.finish;
  return {
    model,
    wood,
    woodId,
    inlay: custom.inlay ?? model.inlay,
    finish,
    lightBoard: wood.light,
    tokens: {
      '@finish': finish,
      '@finishDark': mix(finish, 0, 0.45),
      '@finishLight': mix(finish, 255, 0.35),
      '@pearl': '#efe8d6',
      '@black': '#141112',
      '@wood': wood.board[0],
      '@woodDark': wood.board[1],
    },
  };
}

/** Resolves a paint (token or plain colour). */
export function paint(skin: ResolvedSkin, value: Paint | undefined, fallback = 'none'): string {
  if (value === undefined) return fallback;
  return value.startsWith('@') ? (skin.tokens[value] ?? fallback) : value;
}
