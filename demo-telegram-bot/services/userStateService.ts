export type WizardState =
  | 'initial'
  | 'chooseCatalog'
  | 'chooseBrand'
  | 'chooseAction'
  | 'awaiting_stock_input'
  | 'awaiting_reserve_input';

interface StatePayload {
  state: WizardState;
  selectedCatalog?: string;
  selectedBrand?: string;
  selectedItemCode?: string;
}

export class UserStateService {
  private static states: Record<number, StatePayload> = {};

  /** Initialize user with first wizard state */
  static initialize(userId: number): void {
    UserStateService.states[userId] = { state: 'initial' };
  }

  static getState(userId: number): StatePayload {
    return (
      UserStateService.states[userId] || { state: 'initial' }
    );
  }

  static setState(userId: number, state: WizardState): void {
    const cur = UserStateService.getState(userId);
    UserStateService.states[userId] = { ...cur, state };
  }

  static setCatalog(userId: number, catalog: string): void {
    const cur = UserStateService.getState(userId);
    UserStateService.states[userId] = { ...cur, selectedCatalog: catalog };
  }

  static setBrand(userId: number, brand: string): void {
    const cur = UserStateService.getState(userId);
    UserStateService.states[userId] = { ...cur, selectedBrand: brand };
  }
  
  /**
   * Set selected item code after search.
   */
  static setItem(userId: number, code: string): void {
    const cur = UserStateService.getState(userId);
    UserStateService.states[userId] = { ...cur, selectedItemCode: code };
  }

  /** Clear wizard state (restart) */
  static clear(userId: number): void {
    UserStateService.initialize(userId);
  }
}