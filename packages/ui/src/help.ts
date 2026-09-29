/**
 * The shape of one piece of in-app help, shared by the shell (which shows it) and every module
 * and shared component (which supply it). Help is looked up by what a control is *called* — its
 * accessible name or visible text — rather than annotated onto each element, so the wording for a
 * whole module lives in one file (`help.ts` beside its `index.ts`) and the components stay clean.
 */
export interface HelpEntry {
  /** Matches an element's accessible name: its `aria-label`, its `<label>` text, or its visible
   *  text. A string must match exactly; use a RegExp for names that include a chord or number. */
  name?: string | RegExp;
  /** Matches an element directly, for anything with no name of its own (a fretboard dot). */
  selector?: string;
  /** Only elements inside this selector match, so the same name can mean different things in
   *  different modules (both modules have a "Duplicate" button). */
  scope?: string;
  /** One or two short sentences: what selecting or changing this does. */
  text: string;
}
