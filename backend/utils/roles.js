/**
 * KS Live — Role helpers
 *
 * Two privileged roles exist:
 *   - `admin`      : operational admin (customers, subscriptions, entitlements)
 *   - `superadmin` : owner-level admin; passes every admin check as well
 *
 * Keep this the single source of truth for "is this role privileged?" so a new
 * admin feature never accidentally locks superadmins out.
 */

const ADMIN_ROLES = Object.freeze(['admin', 'superadmin']);

function isAdminRole(role) {
  return ADMIN_ROLES.includes(String(role || '').toLowerCase());
}

module.exports = { ADMIN_ROLES, isAdminRole };
