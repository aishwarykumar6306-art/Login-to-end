export const ROLES = {
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  EMPLOYEE: "EMPLOYEE",
} as const;

export const STATUSES = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DISABLED: "DISABLED",
} as const;

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  FAILED_LOGIN: "FAILED_LOGIN",
  ROLE_CHANGED: "ROLE_CHANGED",
  USER_CREATED: "USER_CREATED",
  USER_DISABLED: "USER_DISABLED",
  USER_ENABLED: "USER_ENABLED",
  USER_SUSPENDED: "USER_SUSPENDED",
  PASSWORD_RESET: "PASSWORD_RESET",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type Status = (typeof STATUSES)[keyof typeof STATUSES];
export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const ROLE_HIERARCHY: Record<string, number> = {
  EMPLOYEE: 1,
  MODERATOR: 2,
  ADMIN: 3,
};