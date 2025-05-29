import fs from 'fs';
import path from 'path';

/**
 * DataItem represents a product for display and reservation.
 */
export interface DataItem {
  /** Unique code for the product (article). */
  code: string;
  /** Display name of the product. */
  name: string;
  /** Available quantity remaining. */
  remains: number;
}

/**
 * Internal representation of the raw product record from report.json
 */
interface ProductRecord {
  id: string;
  tag: string;
  name: string;
  article: string;
  quantity: string;
  unit: string;
  category: string;
  brand: string;
}

export class DataService {
  /**
   * Load fresh product records from report.json on each call.
   */
  private static loadData(): ProductRecord[] {
    const file = path.resolve(__dirname, '../../data/report.json');
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as ProductRecord[];
  }

  /**
   * Return all items for given key.
   */
  /**
   * Return all items for given mapping key (product.tag).
   */
  static getItems(key: string): DataItem[] {
    // Reload data on each call to pick up latest report.json
    const records = DataService.loadData();
    return records
      .filter(rec => rec.tag === key)
      .map(rec => ({
        code: rec.article,
        name: rec.name,
        remains: parseFloat(rec.quantity)
      }));
  }

  /**
   * Search items by code or name containing query (case-insensitive).
   */
  static searchItems(key: string, query: string): DataItem[] {
    const items = DataService.getItems(key);
    const q = query.toLowerCase();
    return items.filter(i =>
      i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    );
  }
}