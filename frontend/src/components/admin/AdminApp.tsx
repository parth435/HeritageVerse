/**
 * Compatibility entry point for callers of the older admin component name.
 * Keep all admin routes on the server-backed workspace instead of the
 * disconnected mock screen.
 */
export { AdminRealApp as AdminApp, AdminRealApp as default } from "./AdminRealApp";
