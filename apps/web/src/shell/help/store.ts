import { create } from 'zustand';

/** Whether help mode (tap anything to learn what it does) is on. Not persisted: it's a momentary
 *  state, and reopening the app already shaded would be confusing. */
export const useHelpMode = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: false,
  setOn: (on) => set({ on }),
}));
