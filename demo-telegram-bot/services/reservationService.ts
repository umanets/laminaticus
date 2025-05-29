import fs from 'fs';
import path from 'path';

/**
 * Interface for reservation records persisted to file.
 */
export interface ReservationRecord {
  userId: number;
  key: string;
  code: string;
  reserv_qty: number;
  /**
   * Reservation status: ongoing, approved, declined, processed
   */
  status: 'ongoing' | 'approved' | 'declined' | 'processed';
}

/**
 * Service to manage persistent reservations in a JSON file.
 */
export class ReservationService {
  private static filePath = path.resolve(__dirname, '../../data/reservations.json');
  private static cache: ReservationRecord[] | null = null;

  /**
   * Load reservations from file, or initialize empty array.
   */
  private static load(): ReservationRecord[] {
    if (this.cache) return this.cache;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.cache = JSON.parse(raw) as ReservationRecord[];
      } else {
        this.cache = [];
      }
    } catch (err) {
      this.cache = [];
    }
    return this.cache;
  }

  /**
   * Save current cache to file.
   */
  private static save(): void {
    if (this.cache === null) return;
    try {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.cache, null, 2),
        'utf-8'
      );
    } catch {
      // ignore write errors
    }
  }

  /**
   * Add a new reservation record and persist.
   */
  static addReservation(
    userId: number,
    key: string,
    code: string,
    reserv_qty: number,
    status: 'ongoing' | 'approved' | 'declined' | 'processed' = 'ongoing'
  ): void {
    const data = this.load();
    data.push({ userId, key, code, reserv_qty, status });
    this.save();
  }
  /**
   * Update status of reservation at given index.
   */
  static updateStatus(index: number, status: ReservationRecord['status']): void {
    const data = this.load();
    if (index >= 0 && index < data.length) {
      data[index].status = status;
      this.save();
    }
  }

  /**
   * Retrieve all reservations.
   */
  static getAll(): ReservationRecord[] {
    return this.load();
  }
}