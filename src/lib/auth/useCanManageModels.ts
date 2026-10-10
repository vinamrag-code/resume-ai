import { useAuth } from './store'

/** Plain function version of the rule below, for code outside React. */
export function canManageModels(s: { required: boolean; isAdmin: boolean }): boolean {
  return !s.required || s.isAdmin
}

/**
 * Who may see and change provider and model settings: admins, and everyone when no sign-in is configured
 * (a private or local install, where the user is the owner). Members always use the admin's defaults.
 */
export function useCanManageModels(): boolean {
  return useAuth((s) => canManageModels(s))
}
