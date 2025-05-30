import fs from 'fs';
import path from 'path';

interface MappingEntry {
  Catalog: string;
  Brands: string;
}

export class MappingService {
  // Path to the mappings JSON file
  private static filePath: string = path.resolve(__dirname, '../../data/mappings.json');
  // In-memory cache of mappings
  private static mappings: Record<string, MappingEntry> = MappingService.loadMappings();
  // File system watcher for runtime updates
  private static watcher?: fs.FSWatcher;

  /**
   * Load mappings from file, handling missing files and errors.
   * Also initializes a watcher to reload on changes.
   */
  private static loadMappings(): Record<string, MappingEntry> {
    const file = MappingService.filePath;
    let mappings: Record<string, MappingEntry> = {};
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        const data = JSON.parse(raw) as { keyMappings: Record<string, MappingEntry> };
        mappings = data.keyMappings;
      } catch (err) {
        console.error(`[MappingService] Error loading mappings: ${err}`);
      }
    } else {
      console.warn(`[MappingService] mappings.json not found at ${file}, starting with empty mappings`);
    }
    MappingService.watchMappings();
    return mappings;
  }

  /**
   * Watch the mappings directory for changes to reload mappings at runtime.
   */
  private static watchMappings(): void {
    if (MappingService.watcher) {
      return;
    }
    const dir = path.dirname(MappingService.filePath);
    try {
      MappingService.watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename || filename !== path.basename(MappingService.filePath)) {
          return;
        }
        const filePath = MappingService.filePath;
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as { keyMappings: Record<string, MappingEntry> };
            MappingService.mappings = data.keyMappings;
            console.log(`[MappingService] Reloaded mappings (${Object.keys(MappingService.mappings).length} entries)`);
          } catch (err) {
            console.error(`[MappingService] Error reloading mappings: ${err}`);
          }
        } else {
          MappingService.mappings = {};
          console.log(`[MappingService] mappings.json removed, cleared mappings`);
        }
      });
    } catch (err) {
      console.error(`[MappingService] Error watching mappings directory: ${err}`);
    }
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