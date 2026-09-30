import { Pool } from 'pg';

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
  /** Unit of quantity remaining. */
  unit: string;
}


// Initialize Postgres connection pool; configure via PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  user: process.env.PGUSER || 'laminaticus',
  password: process.env.PGPASSWORD || 'laminaticus_pass',
  database: process.env.PGDATABASE || 'laminaticus',
});

export class DataService {
  /**
   * Return all items for given tag key from Postgres.
   */
  static async getItems(key: string): Promise<DataItem[]> {
    const sql = `
      SELECT article AS code, name, quantity, unit
      FROM reports
      WHERE tag = $1
    `;
    const res = await pool.query(sql, [key]);
    return res.rows.map(r => ({
      code: r.code,
      name: r.name,
      remains: parseFloat(r.quantity),
      unit: r.unit
    }));
  }

  /**
   * Search items by code or name containing query (case-insensitive) in Postgres.
   */
  static async searchItems(key: string, query: string): Promise<DataItem[]> {
    const q = `%${query.toLowerCase()}%`;
    const sql = `
      SELECT article AS code, name, quantity, unit
      FROM reports
      WHERE tag = $1
        AND (LOWER(article) LIKE $2 OR LOWER(name) LIKE $2)
    `;
    const res = await pool.query(sql, [key, q]);
    return res.rows.map(r => ({
      code: r.code,
      name: r.name,
      remains: parseFloat(r.quantity),
      unit: r.unit
    }));
  }
}