/** Every help entry in the app, in match order: each module's own (scoped to its root, so the
 *  most specific wording wins), then the shared components', then the shell's. */
import { UI_HELP, type HelpEntry } from '@sw/ui';
import { MODULES } from '../modules';
import { SHELL_HELP } from './shellHelp';

export const HELP_ENTRIES: HelpEntry[] = [...MODULES.flatMap((m) => m.help ?? []), ...UI_HELP, ...SHELL_HELP];
