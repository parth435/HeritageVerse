/**
 * Admin API surface. Keep this module as a thin alias layer over the shared
 * authenticated client so its paths and response types stay in sync with the
 * server's /api/admin routes.
 */
export {
  approveAdminImage,
  archiveAdminHeritage,
  createAdminCategory,
  createAdminHeritage,
  deleteAdminCategory,
  getAdminDashboard,
  getAdminHeritage,
  getAdminHeritageById,
  getAdminImages,
  getAdminUserById,
  getAdminUsers,
  updateAdminCategory,
  updateAdminHeritage,
  updateAdminUserRole,
  updateAdminUserStatus,
} from "@/lib/api";

export type {
  AdminDashboard,
  AdminHeritage,
  AdminHeritageQuery,
  AdminImage,
  AdminImageReview,
  AdminReviewImage,
  AdminUser,
  AdminUserDetails,
  AdminUserQuery,
} from "@/lib/api";
