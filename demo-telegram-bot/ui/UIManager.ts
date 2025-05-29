import { Context, Markup } from 'telegraf';

/**
 * UIManager defines interface for generating UI elements per user role/state.
 */
export interface UIManager {
  /**
   * Return menu keyboard markup for context (user role and state).
   */
  getMainMenuKeyboard(ctx: Context): ReturnType<typeof Markup.keyboard> | ReturnType<typeof Markup.removeKeyboard>;
}