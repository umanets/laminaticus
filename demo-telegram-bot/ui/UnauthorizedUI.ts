import { Context, Markup } from 'telegraf';
import { UIManager } from './UIManager';

export class UnauthorizedUI implements UIManager {
  getMainMenuKeyboard(ctx: Context) {
    // Show request access button
    return Markup.keyboard([
      ['📩 Запросити доступ']
    ]).resize();
  }
}