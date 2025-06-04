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
  private static cache: UserRecord[] = [];
  private static watcher?: fs.FSWatcher;
  private static reloadTimer?: NodeJS.Timeout;

  private static watchUsers(): void {
    if (UserService.watcher) {
      return;
    }
    const dir = path.dirname(UserService.filePath);
    try {
      UserService.watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename || filename !== path.basename(UserService.filePath)) {
          return;
        }
        // Debounce reload in case of rapid file writes
        if (UserService.reloadTimer) {
          clearTimeout(UserService.reloadTimer);
        }
        UserService.reloadTimer = setTimeout(() => {
          const filePath = UserService.filePath;
          if (fs.existsSync(filePath)) {
            try {
              const raw = fs.readFileSync(filePath, 'utf-8');
              const data = JSON.parse(raw) as UserRecord[];
              UserService.cache = data;
              console.log(`[UserService] Reloaded users (${UserService.cache.length} entries)`);
            } catch (err) {
              console.error(`[UserService] Error reloading mappings: ${err}`);
            }
          } else {
            UserService.cache = [];
            console.log(`[UserService] users.json removed, cleared users`);
          }
        }, 200);
      });
    } catch (err) {
      console.error(`[UserService] Error watching users directory: ${err}`);
    }
  }

  static loadUsers(): UserRecord[] {
    // Always reload from users.json to reflect any external or programmatic changes
    try {
      if (this.cache.length === 0 && fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.cache = JSON.parse(raw) as UserRecord[];
      }
    } catch {
      this.cache = [];
    }
    UserService.watchUsers();
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
    const users = this.loadUsers();
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
    const users = this.loadUsers();
    return users.find(u => u.userId === userId);
  }

  /**
   * Update status of existing user
   */
  static updateStatus(userId: number, status: UserStatus): void {
    const users = this.loadUsers();
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
    const users = this.loadUsers();
    this.cache = users.filter(u => u.userId !== userId);
    this.save();
  }

  /**
   * Get all users
   */
  static getAll(): UserRecord[] {
    return this.loadUsers();
  }
}

UserService.loadUsers();