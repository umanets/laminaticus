import { Context, Markup } from 'telegraf';
import { UIManager } from './UIManager';
import { MappingService } from '../services/mappingService';
import { UserStateService } from '../services/userStateService';

/**
 * UI for authorized (regular) users.
 */
export class UserUI implements UIManager {
  getMainMenuKeyboard(ctx: Context) {
    const userId = ctx.from?.id as number;
    const state = UserStateService.getState(userId);
    switch (state.state) {
      case 'initial': {
        return Markup.keyboard([
          ['Мої резерви'],
          ['Залишки та резервування'],
          ['Прайси'],
        ]).resize();
      }
      case 'chooseCatalog': {
        const catalogs = MappingService.getCatalogs();
        const buttons = catalogs.map(c => [c]);
        buttons.push(['⬅️ Назад']);
        return Markup.keyboard(buttons).resize();
      }
      case 'chooseBrand': {
        const catalog = state.selectedCatalog!;
        const brands = MappingService.getBrands(catalog);
        const buttons = brands.map(b => [b]);
        buttons.push(['⬅️ Назад']);
        return Markup.keyboard(buttons).resize();
      }
      case 'chooseAction': {
        return Markup.keyboard([
          // ['📦 Залишок'],
          ['⬅️ Назад', '🏠 Додому'],
        ]).resize();
      }
      default:
        return Markup.removeKeyboard();
    }
  }
}