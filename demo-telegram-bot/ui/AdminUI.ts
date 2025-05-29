import { Context, Markup } from 'telegraf';
import { UIManager } from './UIManager';

export class AdminUI implements UIManager {
  getMainMenuKeyboard(ctx: Context) {
    return Markup.keyboard([
      ['Очікування користувачів', 'Резерви']
    ]).resize();
  }
}