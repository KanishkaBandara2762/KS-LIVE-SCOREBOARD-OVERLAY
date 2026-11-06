/**
 * Privileged-role check shared by the UI.
 * `superadmin` is a superset of `admin`.
 */
export function isAdminRole(role) {
  const value = String(role || '').toLowerCase();
  return value === 'admin' || value === 'superadmin';
}
