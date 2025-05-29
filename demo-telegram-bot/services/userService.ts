import fs from 'fs';
import path from 'path';

/**
 * Status of user access
 */
export type UserStatus = 'requireAccess' | 'approved' | 'admin' | 'blocked';

/**
 * Record for a user in users.json
 */
export interface UserRecord {
  userId: number;
  date: string;          // ISO string of record creation
  displayName: string;   // user's display name
  status: UserStatus;    // access status
}

/**
 * Service to manage persistent user records in users.json
 */
export class UserService {
  private static filePath = path.resolve(__dirname, '../../data/users.json');
  private static cache: UserRecord[] | null = null;

  private static load(): UserRecord[] {
    // Always reload from users.json to reflect any external or programmatic changes
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.cache = JSON.parse(raw) as UserRecord[];
      } else {
        this.cache = [];
      }
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

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
   * Add a new user with default status 'requireAccess'
   * If user already exists, does nothing.
   */
  static addUser(
    userId: number,
    displayName: string,
    status: UserStatus = 'requireAccess'
  ): void {
    const users = this.load();
    if (users.find(u => u.userId === userId)) return;
    const record: UserRecord = {
      userId,
      date: new Date().toISOString(),
      displayName,
      status,
    };
    users.push(record);
    this.save();
  }

  /**
   * Get user record by userId
   */
  static getUser(userId: number): UserRecord | undefined {
    const users = this.load();
    return users.find(u => u.userId === userId);
  }

  /**
   * Update status of existing user
   */
  static updateStatus(userId: number, status: UserStatus): void {
    const users = this.load();
    const user = users.find(u => u.userId === userId);
    if (user) {
      user.status = status;
      this.save();
    }
  }
  /**
   * Delete user record entirely (reject access).
   */
  static deleteUser(userId: number): void {
    const users = this.load();
    this.cache = users.filter(u => u.userId !== userId);
    this.save();
  }

  /**
   * Get all users
   */
  static getAll(): UserRecord[] {
    return this.load();
  }
}