export type UserRole = 'admin' | 'support' | 'viewer';

export interface User {
  id: number;
  name: string;
  role: UserRole;
}

export interface AuditLog {
  id: number;
  timestamp: Date;
  userName: string;
  userRole?: UserRole;
  action: string;
  details: string;
}