import { Context, Markup } from 'telegraf';
import { UIManager } from './UIManager';
import { MappingService } from '../services/mappingService';
import { UserStateService } from '../services/userStateService';

export class AdminUI implements UIManager {
  getMainMenuKeyboard(ctx: Context) {
    // Admin menu: user requests, reservation queue, and stock & reservation wizard
    

    const userId = ctx.from?.id as number;
        const state = UserStateService.getState(userId);
        switch (state.state) {
          case 'initial': {
            return Markup.keyboard([
              ['Очікування користувачів', 'Резерви'],
              ['Залишки та резервування'],
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