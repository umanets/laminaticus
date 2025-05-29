import fs from 'fs';
import path from 'path';

interface MappingEntry {
  Catalog: string;
  Brands: string;
}

export class MappingService {
  private static mappings: Record<string, MappingEntry> = MappingService.loadMappings();

  private static loadMappings(): Record<string, MappingEntry> {
    const file = path.resolve(__dirname, '../../data/mappings.json');
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw) as {
      keyMappings: Record<string, MappingEntry>;
    };
    return data.keyMappings;
  }

  /**
   * Get unique list of catalogs.
   */
  static getCatalogs(): string[] {
    const set = new Set<string>();
    for (const entry of Object.values(MappingService.mappings)) {
      set.add(entry.Catalog);
    }
    return Array.from(set);
  }

  /**
   * Get unique list of brands for given catalog.
   */
  static getBrands(catalog: string): string[] {
    const set = new Set<string>();
    for (const entry of Object.values(MappingService.mappings)) {
      if (entry.Catalog === catalog) {
        set.add(entry.Brands);
      }
    }
    return Array.from(set);
  }

  /**
   * Get mapping key by catalog and brand.
   */
  static getKey(catalog: string, brand: string): string | undefined {
    for (const [key, entry] of Object.entries(MappingService.mappings)) {
      if (entry.Catalog === catalog && entry.Brands === brand) {
        return key;
      }
    }
    return undefined;
  }
}