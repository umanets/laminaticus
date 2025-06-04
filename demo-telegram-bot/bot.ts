import dotenv from 'dotenv';
import path from 'path';
import { Telegraf, Markup, Context } from 'telegraf';
import fs from 'fs';
import { UIManager } from './ui/UIManager';
import { UnauthorizedUI } from './ui/UnauthorizedUI';
import { UserUI } from './ui/UserUI';
import { AdminUI } from './ui/AdminUI';
import { MappingService } from './services/mappingService';
import { DataService } from './services/dataService';
import { UserStateService } from './services/userStateService';
import { UserService } from './services/userService';
import { ReservationService } from './services/reservationService';

// Load environment variables from parent .env (project root)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Types and Interfaces
type ReservationStatus = 'Ожидание' | 'Обработка' | 'Выгружен' | 'Отменено';
interface Reservation {
  id: number;
  item: string;
  qty: number;
  status: ReservationStatus;
}

// --- In-memory Data Stores
const reservations: Record<number, Reservation[]> = {};
const userNames: Record<number, string> = {};

// --- Role & UI Manager
type Role = 'unauthorized' | 'authorized' | 'admin';
const userRoles: Record<number, Role> = {};
function getRole(userId: number): Role {
  return userRoles[userId] || 'unauthorized';
}

function getUIMgr(ctx: Context): UIManager {
  // Ensure from.id exists, otherwise treat as unauthorized
  const fromId = ctx.from?.id;
  if (fromId == null) {
    return new UnauthorizedUI();
  }
  const role = getRole(fromId);
  if (role === 'admin') {
    return new AdminUI();
  }
  if (role === 'unauthorized') {
    return new UnauthorizedUI();
  }
  return new UserUI();
}

// --- Helper Functions
function saveUserName(ctx: Context): void {
  const from = ctx.from;
  if (!from) return;
  let name = from.first_name || '';
  if (from.last_name) name += ` ${from.last_name}`;
  if (from.username) name += ` (@${from.username})`;
  userNames[from.id] = name.trim();
}

// --- Bot Initialization
const bot = new Telegraf<Context>(process.env.BOT_TOKEN!);
// Track access request state per user
const accessRequests: Record<number, boolean> = {};

/**
 * Middleware to synchronize in-memory role with persistent UserService.
 * If the role changed (e.g. operator updated status), reinitialize UI.
 */
bot.use(async (ctx, next) => {
  const fromId = ctx.from?.id;
  if (!fromId) {
    return next();
  }
  const urec = UserService.getUser(fromId);
  // Map persistent status to our Role
  let desiredRole: Role;
  if (!urec || urec.status === 'requireAccess') {
    desiredRole = 'unauthorized';
  } else if (urec.status === 'admin') {
    desiredRole = 'admin';
  } else {
    desiredRole = 'authorized';
  }
  const currentRole = getRole(fromId);
  if (currentRole !== desiredRole) {
    // Update role and reset state for authorized users
    userRoles[fromId] = desiredRole;
    if (desiredRole === 'authorized') {
      UserStateService.initialize(fromId);
    }
    // Send updated menu
    await ctx.reply('Ваші права оновлено. Оновлюємо меню.', getUIMgr(ctx).getMainMenuKeyboard(ctx));
  }
  return next();
});

// Middleware to inform users if 1C is unavailable (error.log exists)
const errorLogPath = path.resolve(__dirname, '../data/error.log');
bot.use((ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  if (fs.existsSync(errorLogPath)) {
    const role = getRole(userId);
    if (role === 'authorized') {
      ctx.reply('Регламентні роботи', getUIMgr(ctx).getMainMenuKeyboard(ctx));
      return;
    }
    if (role === 'admin') {
      ctx.reply(
        'Немає зв\'язку з 1С, запустіть 1С вручну в монопольному режимі та закрийте після цього. ' +
        'Через 5 хвилин зв\'язок з 1С повинен бути відновлений і бот почне роботу в нормальному режимі. ' +
        'Або зв\'яжіться з розробником.',
        getUIMgr(ctx).getMainMenuKeyboard(ctx)
      );
      return;
    }
  }
  return next();
});

bot.start((ctx) => {
  const userId = ctx.from.id;
  saveUserName(ctx);
  const displayName = userNames[userId] || `${userId}`;
  // Check user record
  const urec = UserService.getUser(userId);
  if (!urec) {
    // New user: request access
    userRoles[userId] = 'unauthorized';
    ctx.reply(
      'Ласкаво просимо! У вас немає доступу. Запросіть доступ до бота.',
      getUIMgr(ctx).getMainMenuKeyboard(ctx)
    );
    return;
  }
  if (urec.status === 'requireAccess') {
    // Existing user, access pending: offer status check button
    userRoles[userId] = 'unauthorized';
    ctx.reply(
      'Ваш запит на доступ обробляється.',
      Markup.keyboard([['Перевірити статус']]).resize()
    );
    return;
  }
  // Admin user: initialize state and show actions menu
  if (urec.status === 'admin') {
    userRoles[userId] = 'admin';
    // Initialize user state for stock & reservation wizard
    UserStateService.initialize(userId);
    ctx.reply(
      'Оберіть дію.',
      getUIMgr(ctx).getMainMenuKeyboard(ctx)
    );
    return;
  }
  // Approved (regular) user
  userRoles[userId] = 'authorized';
  UserStateService.initialize(userId);
  ctx.reply(
    'Ласкаво просимо! Будь ласка, оберіть дію.',
    getUIMgr(ctx).getMainMenuKeyboard(ctx)
  );
});

// --- Admin: list pending users
bot.hears('Очікування користувачів', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || getRole(userId) !== 'admin') {
    ctx.reply('Доступ лише для адміністратора.');
    return;
  }
  const pending = UserService.getAll().filter(u => u.status === 'requireAccess');
  if (pending.length === 0) {
    ctx.reply('Немає користувачів, що очікують.');
    return;
  }
  for (const u of pending) {
    const text = `👤 ${u.userId} — ${u.displayName}`;
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('Підтвердити', `admin_approve_${u.userId}`),
        Markup.button.callback('Відхилити', `admin_reject_${u.userId}`),
        Markup.button.callback('Заблокувати', `admin_block_${u.userId}`),
      ],
    ]);
    await ctx.reply(text, buttons as any);
  }
});

// --- Admin: show ongoing reservations
bot.hears('Резерви', async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId || getRole(adminId) !== 'admin') {
    ctx.reply('Доступ лише для адміністратора.');
    return;
  }
  const allRecs = ReservationService.getAll();
  const ongoing = allRecs.filter(r => r.status === 'ongoing');
  if (ongoing.length === 0) {
    ctx.reply('Немає активних резервів.', getUIMgr(ctx).getMainMenuKeyboard(ctx));
    return;
  }
  // For each ongoing reservation, show inline buttons
  for (const rec of ongoing) {
    const idx = allRecs.indexOf(rec);
    const userRec = UserService.getUser(rec.userId);
    const displayName = userRec ? userRec.displayName : `${rec.userId}`;
    const items = await DataService.getItems(rec.key);
    const item = items.find(i => i.code === rec.code);
    const itemName = item ? item.name : rec.code;
    const msg = `<b>${displayName}</b>\n${itemName} - ${rec.reserv_qty}`;
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('Approve', `res_approve_${idx}`),
        Markup.button.callback('Decline', `res_decline_${idx}`),
      ],
    ]);
    await ctx.reply(msg, { parse_mode: 'HTML', ...buttons as any });
  }
});

// --- Admin actions on reservations
bot.action(/res_approve_(\d+)/, async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId || getRole(adminId) !== 'admin') return ctx.answerCbQuery('Немає доступу');
  const idx = parseInt(ctx.match![1], 10);
  ReservationService.updateStatus(idx, 'approved');
  await ctx.editMessageText('Резерв схвалено.');
  ctx.answerCbQuery('Схвалено');
});

bot.action(/res_decline_(\d+)/, async (ctx) => {
  const adminId = ctx.from?.id;
  if (!adminId || getRole(adminId) !== 'admin') return ctx.answerCbQuery('Немає доступу');
  const idx = parseInt(ctx.match![1], 10);
  ReservationService.updateStatus(idx, 'declined');
  await ctx.editMessageText('Резерв відхилено.');
  ctx.answerCbQuery('Відхилено');
});

// --- Callbacks for inline item selection and reservation
// When user selects an item from search results
bot.action(/select_(.+)/, async (ctx) => {
  const code = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  const state = UserStateService.getState(userId);
  const key = MappingService.getKey(state.selectedCatalog!, state.selectedBrand!);
  if (!key) {
    await ctx.answerCbQuery('Ошибка ключа');
    return;
  }
  const items = await DataService.getItems(key);
  const item = items.find(i => i.code === code);
  if (!item) {
    await ctx.answerCbQuery('Товар не знайдено.');
    return;
  }
  // Present reservation button for selected item
  // Calculate available stock subtracting ongoing reservations
  const allRes = ReservationService.getAll();
  const reservedSum = allRes
    .filter(r => r.key === key && r.code === item.code && r.status === 'ongoing')
    .reduce((sum, r) => sum + r.reserv_qty, 0);
  const available = item.remains - reservedSum;
  // Present reservation button and back button
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('📝 Резервування', `reserve_${code}`)],
    [Markup.button.callback('⬅️ Назад', 'back_to_action')]
  ]);
  await ctx.editMessageText(
    `Ви обрали: ${item.name}\nЗалишок: ${available} ${item.unit}`,
    buttons as any
  );
});

// When user clicks reservation button
bot.action(/reserve_(.+)/, async (ctx) => {
  const code = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCbQuery();
  // Move to reservation input or confirm
  // store selected item for reservation
  UserStateService.setItem(userId, code);
  UserStateService.setState(userId, 'awaiting_reserve_input');
  ctx.reply(`Розпочнемо резервування товару: ${code}\nБудь ласка, введіть кількість.`, Markup.removeKeyboard());
});

// When user clicks back button after selecting item
bot.action('back_to_action', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCbQuery();
  // Return to action choice
  UserStateService.setState(userId, 'chooseAction');
  const uiMgr = getUIMgr(ctx);
  ctx.reply('Виберіть дію.', uiMgr.getMainMenuKeyboard(ctx));
});

// When user clicks retry button after invalid reserve amount
bot.action('retry_reservation', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCbQuery();
  // Prompt to re-enter quantity
  ctx.reply('Будь ласка, введіть іншу кількість для резерву.', Markup.removeKeyboard());
  UserStateService.setState(userId, 'awaiting_reserve_input');
});

// --- Admin actions on pending users
bot.action(/admin_approve_(\d+)/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || getRole(userId) !== 'admin') return ctx.answerCbQuery('Нет доступа');
  const target = parseInt(ctx.match![1], 10);
  UserService.updateStatus(target, 'approved');
  await ctx.editMessageText('Користувача підтверджено.');
  ctx.answerCbQuery('Підтверджено');
});

bot.action(/admin_reject_(\d+)/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || getRole(userId) !== 'admin') return ctx.answerCbQuery('Нет доступа');
  const target = parseInt(ctx.match![1], 10);
  UserService.deleteUser(target);
  await ctx.editMessageText('Користувача видалено.');
  ctx.answerCbQuery('Видалено');
});

bot.action(/admin_block_(\d+)/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || getRole(userId) !== 'admin') return ctx.answerCbQuery('Нет доступа');
  const target = parseInt(ctx.match![1], 10);
  UserService.updateStatus(target, 'blocked');
  await ctx.editMessageText('Користувача заблоковано.');
  ctx.answerCbQuery('Заблоковано');
});

async function stockSearch(text:string, state: any, ctx: any, userId: any, uiMgr: any) {
    const query = text;
    const catalog = state.selectedCatalog!;
    const brand = state.selectedBrand!;
    const key = MappingService.getKey(catalog, brand);
    if (!key) {
      ctx.reply('Неверный каталог или бренд.', uiMgr.getMainMenuKeyboard(ctx));
      UserStateService.initialize(userId);
      return
    }
    const results = await DataService.searchItems(key, query);
    if (results.length > 0) {
      // build inline buttons for each found item
      const buttons = [
        ...results.map(item => [Markup.button.callback(`${item.code} ${item.name}`, `select_${item.code}`)]),
        [Markup.button.callback('⬅️ Назад', 'back_to_action')]
      ];
      
      ctx.reply('Знайдені товари (Клацнiть для резервування):', Markup.inlineKeyboard(buttons));
    } else {
      // Nothing found -> return to action menu
      UserStateService.setState(userId, 'chooseAction');
      ctx.reply('Нічого не знайдено.', uiMgr.getMainMenuKeyboard(ctx));
    }
}

// --- Wizard Handler for authorized users
bot.on('text', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const uiMgr = getUIMgr(ctx);
  const text = ctx.message.text;
  // Unauthorized access or pending
  const userRec = UserService.getUser(userId);
  if (!userRec) {
    // New user: request access
    const txt = ctx.message.text;
    if (accessRequests[userId]) {
      const company = txt.trim();
      UserService.addUser(userId, company, 'requireAccess');
      accessRequests[userId] = false;
      ctx.reply('Дякуємо! Ваш запит надіслано адміністрації. Чекайте підтвердження.', Markup.keyboard([['Перевірити статус']]).resize());
    } else if (txt === '📩 Запросити доступ') {
      ctx.reply('Будь ласка, введіть назву вашої компанії для запиту доступу.', Markup.removeKeyboard());
      accessRequests[userId] = true;
    } else {
      ctx.reply('У вас немає доступу. Натисніть кнопку "📩 Запросити доступ".', uiMgr.getMainMenuKeyboard(ctx));
    }
    return;
  }

  // Handle status check for pending users
  if (text === 'Перевірити статус') {
    const fresh = UserService.getUser(userId);
    if (!fresh) {
      ctx.reply(
        'У вас немає доступу. Натисніть кнопку "📩 Запросити доступ".',
        Markup.keyboard([['📩 Запросити доступ']]).resize()
      );
    } else if (fresh.status === 'requireAccess') {
      ctx.reply(
        'Очікуйте на підтвердження.',
        Markup.keyboard([['Перевірити статус']]).resize()
      );
    } else if (fresh.status === 'approved') {
      userRoles[userId] = 'authorized';
      UserStateService.initialize(userId);
      ctx.reply(
        'Доступ дозволено. Будь ласка, оберіть дію.',
        getUIMgr(ctx).getMainMenuKeyboard(ctx)
      );
    } else if (fresh.status === 'admin') {
      userRoles[userId] = 'admin';
      ctx.reply(
        'Ви тепер адмін. Оберіть дію.',
        getUIMgr(ctx).getMainMenuKeyboard(ctx)
      );
    } else {
      userRoles[userId] = 'unauthorized';
      ctx.reply('Доступ заборонено.', Markup.removeKeyboard());
    }
    return;
  }

  // If still pending initial requests
  if (userRec.status === 'requireAccess') {
    ctx.reply(
      'Ваша заявка на доступ обробляється.',
      Markup.keyboard([['Перевірити статус']]).resize()
    );
    return;
  }

  // Initial menu for approved and admin users for stock & reservation wizard
  if (getRole(userId) === 'authorized' || getRole(userId) === 'admin') {
    const stateInitial = UserStateService.getState(userId);
    if (stateInitial.state === 'initial') {
      if (text === 'Мої резерви') {
        const all = ReservationService.getAll();
        const mine = all.filter(r => r.userId === userId && r.status === 'ongoing');
        if (mine.length === 0) {
          await ctx.reply('Немає резервів на очікуванні.');
        } else {
          const lines: string[] = [];
          for (const r of mine) {
            const items = await DataService.getItems(r.key);
            const item = items.find(i => i.code === r.code);
            const name = item ? item.name : r.code;
            lines.push(`${name} — ${r.reserv_qty} ${r.unit}`);
          }
          await ctx.reply(lines.join('\n'));
        }
        getUIMgr(ctx).getMainMenuKeyboard(ctx);
        return;
      }
      if (text === 'Залишки та резервування') {
        UserStateService.setState(userId, 'chooseCatalog');
        ctx.reply('Будь ласка, виберіть каталог.', getUIMgr(ctx).getMainMenuKeyboard(ctx));
        return;
      }
    }
  }

  // Authorized users continue wizard
  const state = UserStateService.getState(userId);
  switch (state.state) {
    case 'chooseCatalog': {
      if (text === '⬅️ Назад') {
        UserStateService.setState(userId, 'initial');
        ctx.reply('Виберіть каталог.', uiMgr.getMainMenuKeyboard(ctx));
        break;
      }
      const catalogs = MappingService.getCatalogs();
      if (catalogs.includes(text)) {
        UserStateService.setCatalog(userId, text);
        UserStateService.setState(userId, 'chooseBrand');
        ctx.reply(`Каталог "${text}" обрано. Виберіть бренд.`, uiMgr.getMainMenuKeyboard(ctx));
      } else {
        ctx.reply('Будь ласка, виберіть каталог зі списку.', uiMgr.getMainMenuKeyboard(ctx));
      }
      break;
    }
    case 'chooseBrand': {
      if (text === '⬅️ Назад') {
        UserStateService.setState(userId, 'chooseCatalog');
        ctx.reply('Виберіть каталог.', uiMgr.getMainMenuKeyboard(ctx));
        break;
      }
      const catalog = state.selectedCatalog!;
      const brands = MappingService.getBrands(catalog);
      if (brands.includes(text)) {
        UserStateService.setBrand(userId, text);
        UserStateService.setState(userId, 'chooseAction');
        ctx.reply(`Бренд "${text}" обрано. Виберіть дію. Будь ласка, напишіть назву або код товару для перевірки залишку. Або виберіть дію.`, uiMgr.getMainMenuKeyboard(ctx));
      } else {
        ctx.reply('Будь ласка, виберіть бренд зі списку.', uiMgr.getMainMenuKeyboard(ctx));
      }
      break;
    }
    case 'chooseAction': {
      if (text === '⬅️ Назад') {
        // go back to brand selection
        UserStateService.setState(userId, 'chooseBrand');
        ctx.reply('Виберіть бренд.', uiMgr.getMainMenuKeyboard(ctx));
      } else if (text === '🏠 Додому') {
        // go to catalog selection
        UserStateService.initialize(userId);
        ctx.reply('Оберіть дію.', uiMgr.getMainMenuKeyboard(ctx));
      } else if (text === '📦 Залишок') {
        UserStateService.setState(userId, 'awaiting_stock_input');
        ctx.reply('Будь ласка, напишіть назву або код товару для перевірки залишку.', Markup.removeKeyboard());
      } else {
        UserStateService.setState(userId, 'awaiting_stock_input');
        await stockSearch(text, state, ctx, userId, uiMgr)
      }
      break;
    }
    case 'awaiting_stock_input': {
      await stockSearch(text, state, ctx, userId, uiMgr);
      break;
    }
    case 'awaiting_reserve_input': {
      // Parse quantity as float, allow comma as decimal separator
      const rawQty = text.replace(',', '.').trim();
      const qty = parseFloat(rawQty);
      if (isNaN(qty) || qty <= 0) {
        ctx.reply('Будь ласка, введіть коректне число. Наприклад: 2.5 або 2,5.');
        break;
      }
      const selCode = state.selectedItemCode!;
      if (!selCode) {
        ctx.reply('Не вибрано товар.');
        UserStateService.initialize(userId);
        break;
      }
      const itemName = selCode;
      // Check stock remains
      const catalog = state.selectedCatalog!;
      const brand = state.selectedBrand!;
      const mapKey = MappingService.getKey(catalog, brand)!;
      const allItems = await DataService.getItems(mapKey);
      const selectedItem = allItems.find(i => i.code === selCode)!;
      const remains = selectedItem.remains;
      if (qty > remains) {
        // Cannot reserve more than available: offer retry or back
        const msg = `Неможливо зарезервувати ${qty} шт. товару "${selectedItem.name}", залишилося тільки ${remains} ${selectedItem.unit}.`;
        ctx.reply(
          msg,
          Markup.inlineKeyboard([
          [
              Markup.button.callback('Повторити', 'retry_reservation'),
              Markup.button.callback('⬅️ Назад', 'back_to_action')
            ]
          ])
        );
        break;
      }
      // Save reservation in memory
      const newRes: Reservation = { id: Date.now(), item: itemName, qty, status: 'Ожидание' };
      reservations[userId] = reservations[userId] || [];
      reservations[userId].push(newRes);
      // Persist reservation to file
      const mapKey2 = mapKey; // reuse key for persistence
      ReservationService.addReservation(userId, mapKey2, selCode, qty, selectedItem.unit);
      // Confirm reservation and return to actions menu
      UserStateService.setState(userId, 'chooseAction');
      ctx.reply(
        `Зарезервовано ${qty} ${selectedItem.unit} товару "${itemName}".`,
        uiMgr.getMainMenuKeyboard(ctx)
      );
      break;
    }
    default:
      // reset or unknown state
      UserStateService.initialize(userId);
      ctx.reply('Будь ласка, виберіть каталог.', uiMgr.getMainMenuKeyboard(ctx));
  }
});


// Launch the bot and notify in console
bot.launch();
console.log('Bot is running...');