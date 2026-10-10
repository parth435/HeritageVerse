import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  Archive,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  createHeritageSite,
  createMediaReference,
  createStory,
  createTimelineEvent,
  deleteHeritageSite,
  deleteMediaReference,
  deleteStory,
  deleteTimelineEvent,
  getAdminActivity,
  getAdminStats,
  getAdminUsers,
  getHeritageSites,
  getMediaReferences,
  getStories,
  getTimelineEvents,
  updateHeritageSite,
  updateStory,
  updateTimelineEvent,
  updateUserRole,
  updateUserStatus,
} from "@/services/adminApi";
import type {
  AdminActivity,
  AdminDashboardStats,
  AdminUser,
  HeritageSite,
  MediaReference,
  Status,
  Story,
  TimelineEvent,
  UserRole,
  UserStatus,
} from "@/types/admin";

type Page = "dashboard" | "heritage" | "timeline" | "stories" | "media" | "users" | "settings";

const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "heritage", label: "Heritage Sites", icon: Landmark },
  { id: "timeline", label: "Timeline", icon: Archive },
  { id: "stories", label: "Stories", icon: FileText },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "users", label: "Users", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

const title: Record<Page, string> = {
  dashboard: "Dashboard",
  heritage: "Heritage sites",
  timeline: "Timeline",
  stories: "Stories",
  media: "Media library",
  users: "Users",
  settings: "Settings",
};

const statusClass: Record<Status, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  DRAFT: "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-stone-100 text-stone-600",
};

function Badge({ value }: { value: Status | UserStatus | UserRole }) {
  const roleClass =
    value === "ADMIN"
      ? "bg-purple-50 text-purple-700"
      : value === "USER"
      ? "bg-stone-100 text-stone-600"
      : "";
  const statusClassValue =
    value === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700"
      : value === "SUSPENDED"
      ? "bg-red-50 text-red-700"
      : value in statusClass
      ? statusClass[value as Status]
      : roleClass;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${statusClassValue}`}
    >
      {value}
    </span>
  );
}

function PageHead({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-stone-400">
          HeritageVerse / Admin
        </p>
        <h1 className="font-display text-4xl text-stone-900">{children}</h1>
      </div>
      {action}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50/70">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-[.14em] text-stone-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center text-stone-800">
      <AlertCircle className="mx-auto mb-2 text-red-500" size={24} />
      <p className="text-sm font-semibold text-red-900">Failed to load data</p>
      <p className="mt-1 text-xs text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800"
      >
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
}

function TableSkeleton({ rows = 4, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-stone-100 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-5 py-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* =========================================================================
 * 1. DASHBOARD COMPONENT
 * ========================================================================= */
function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const reduce = useReducedMotion();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, activityRes] = await Promise.all([
        getAdminStats(),
        getAdminActivity(),
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const statsItems = [
    [
      "Heritage sites",
      stats ? String(stats.heritageSitesCount) : "—",
      stats?.heritageSitesChange || "+8 this month",
      Landmark,
    ],
    [
      "Registered users",
      stats ? String(stats.registeredUsersCount) : "—",
      stats?.registeredUsersChange || "+12.4%",
      Users,
    ],
    [
      "Timeline events",
      stats ? String(stats.timelineEventsCount) : "—",
      stats?.timelineEventsChange || "+6 this month",
      Archive,
    ],
    [
      "Published stories",
      stats ? String(stats.publishedStoriesCount) : "—",
      stats?.publishedStoriesChange || "+4 this month",
      BookOpen,
    ],
  ] as const;

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-stone-400">
          {todayFormatted}
        </p>
        <h1 className="font-display text-4xl text-stone-900">Good morning, Admin</h1>
        <p className="mt-2 text-sm text-stone-500">Here's what's happening across HeritageVerse.</p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statsItems.map(([label, number, change, Icon], i) => (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                key={label}
                className="border border-stone-200 bg-white p-5 shadow-sm"
              >
                <div className="flex justify-between">
                  <span className="text-sm text-stone-500">{label}</span>
                  <Icon size={17} className="text-stone-400" />
                </div>
                {loading ? (
                  <div className="mt-5 h-9 w-20 animate-pulse rounded bg-stone-200" />
                ) : (
                  <p className="mt-5 font-display text-4xl text-stone-900">{number}</p>
                )}
                <p className="mt-2 text-xs font-medium text-emerald-700">{change}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl text-stone-900">Recent activity</h2>
                <button
                  onClick={loadData}
                  className="flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-950"
                  title="Refresh activity"
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
              </div>

              {loading ? (
                <div className="mt-4 space-y-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-4 py-3">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-stone-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-1/3 animate-pulse rounded bg-stone-200" />
                        <div className="h-2.5 w-1/4 animate-pulse rounded bg-stone-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="mt-6 text-center text-sm text-stone-400 py-8">
                  No recent activity logged.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-stone-100">
                  {activity.map((item) => {
                    const Icon =
                      item.type === "Heritage Site"
                        ? Landmark
                        : item.type === "User"
                        ? Users
                        : FileText;
                    return (
                      <div className="flex items-center gap-4 py-4" key={item.id}>
                        <span className="rounded-full bg-stone-100 p-2.5 text-stone-600">
                          <Icon size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-stone-800">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-400">{item.type}</p>
                        </div>
                        <time className="shrink-0 text-xs text-stone-400">
                          {item.timeAgo ||
                            (item.timestamp
                              ? new Date(item.timestamp).toLocaleDateString()
                              : "Recently")}
                        </time>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl bg-stone-900 p-6 text-stone-100 flex flex-col justify-between shadow-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.15em] text-stone-400">
                  Editorial pulse
                </p>
                <h2 className="mt-5 font-display text-3xl leading-tight">
                  Database connected & active.
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  All platform statistics, heritage sites, and editorial content are synchronizing directly with the live backend.
                </p>
              </div>
              <button
                onClick={() => onNavigate("heritage")}
                className="mt-8 inline-flex items-center gap-2 border border-stone-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white hover:text-stone-900"
              >
                Review sites collection <ChevronLeft className="rotate-180" size={15} />
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}

/* =========================================================================
 * 2. HERITAGE SITES COMPONENT
 * ========================================================================= */
function Heritage({ onToast }: { onToast: (x: string) => void }) {
  const [sites, setSites] = useState<HeritageSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("All states");
  const [editing, setEditing] = useState<HeritageSite | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadSites = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHeritageSites();
      setSites(res.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load heritage sites");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
  }, []);

  const filtered = useMemo(() => {
    return sites.filter((x) => {
      const matchesState = state === "All states" || x.state.toLowerCase() === state.toLowerCase();
      const matchesQuery =
        x.name.toLowerCase().includes(query.toLowerCase()) ||
        x.location.toLowerCase().includes(query.toLowerCase()) ||
        x.category.toLowerCase().includes(query.toLowerCase());
      return matchesState && matchesQuery;
    });
  }, [sites, query, state]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const name = String(d.get("name")).trim();
    const stateVal = String(d.get("state")).trim();
    const category = String(d.get("category")).trim();
    const location = String(d.get("location")).trim();
    const era = String(d.get("era")).trim();
    const statusVal = String(d.get("status")).trim() as Status;
    const description = String(d.get("description")).trim();
    const image = String(d.get("image")).trim();

    if (!name || !stateVal || !category) {
      onToast("Name, state, and category are required");
      return;
    }

    setSubmitting(true);
    try {
      if (editing && editing.id) {
        const res = await updateHeritageSite(editing.id, {
          name,
          state: stateVal,
          category,
          location,
          era,
          status: statusVal,
          description,
          image: image || editing.image,
        });
        setSites((prev) => prev.map((s) => (s.id === editing.id ? res.data : s)));
        onToast("Heritage site updated");
      } else {
        const res = await createHeritageSite({
          name,
          state: stateVal,
          category,
          location: location || "India",
          era: era || "Historical",
          status: statusVal || "PUBLISHED",
          description,
          image: image || "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80",
        });
        setSites((prev) => [res.data, ...prev]);
        onToast("Heritage site created");
      }
      setEditing(null);
    } catch (err: any) {
      onToast(err?.message || "Failed to save heritage site");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setSubmitting(true);
    try {
      await deleteHeritageSite(id);
      setSites((prev) => prev.filter((x) => x.id !== id));
      setDeletingId(null);
      onToast("Heritage site removed from collection");
    } catch (err: any) {
      onToast(err?.message || "Failed to delete site");
    } finally {
      setSubmitting(false);
    }
  };

  if (editing) {
    return (
      <>
        <PageHead
          action={
            <button
              onClick={() => setEditing(null)}
              className="text-sm text-stone-600 hover:text-stone-900"
            >
              Cancel
            </button>
          }
        >
          {editing.id ? "Edit heritage site" : "Add heritage site"}
        </PageHead>
        <form onSubmit={save} className="max-w-4xl rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-stone-700">
              Name *
              <input
                required
                name="name"
                defaultValue={editing.name}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Location
              <input
                name="location"
                defaultValue={editing.location}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              State *
              <input
                required
                name="state"
                defaultValue={editing.state}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Category *
              <input
                required
                name="category"
                defaultValue={editing.category}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Era
              <input
                name="era"
                defaultValue={editing.era}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Status
              <select
                name="status"
                defaultValue={editing.status || "PUBLISHED"}
                className="mt-2 w-full border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              >
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-xs font-semibold text-stone-700">
              Image URL
              <input
                name="image"
                defaultValue={editing.image}
                placeholder="https://..."
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="sm:col-span-2 text-xs font-semibold text-stone-700">
              Description
              <textarea
                name="description"
                rows={4}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
                defaultValue={editing.description || "A carefully documented place in India's living architectural history."}
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Save site
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setEditing(null)}
              className="border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <PageHead
        action={
          <div className="flex gap-2">
            <button
              onClick={loadSites}
              title="Refresh sites"
              className="inline-flex items-center gap-1.5 border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={() =>
                setEditing({
                  id: "",
                  name: "",
                  location: "",
                  state: "Maharashtra",
                  category: "Fort",
                  era: "",
                  status: "DRAFT",
                  updatedAt: "",
                  image: "",
                  description: "",
                })
              }
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <Plus size={16} /> Add heritage site
            </button>
          </div>
        }
      >
        Heritage sites
      </PageHead>
      <p className="-mt-4 mb-6 text-sm text-stone-500">
        Manage the places and narratives that shape the collection.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={loadSites} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-2.5 text-stone-400" size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sites"
                className="w-full sm:w-64 border border-stone-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-800"
            >
              <option>All states</option>
              <option>Maharashtra</option>
              <option>Odisha</option>
              <option>Karnataka</option>
            </select>
          </div>

          <Table
            headers={[
              "Heritage site",
              "Location",
              "Category",
              "Era",
              "Status",
              "Last updated",
              "Actions",
            ]}
          >
            {loading ? (
              <TableSkeleton rows={4} cols={7} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-stone-500">
                  No heritage sites found matching "{query || state}".
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <motion.tr
                  whileHover={{ backgroundColor: "#fafaf9" }}
                  key={s.id}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-5 py-4 font-medium text-stone-800">{s.name}</td>
                  <td className="px-5 py-4 text-sm text-stone-500">{s.location}</td>
                  <td className="px-5 py-4 text-sm text-stone-600">{s.category}</td>
                  <td className="px-5 py-4 text-sm text-stone-600">{s.era}</td>
                  <td className="px-5 py-4">
                    <Badge value={s.status} />
                  </td>
                  <td className="px-5 py-4 text-xs text-stone-400">{s.updatedAt}</td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        className="rounded px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingId(s.id)}
                        aria-label={`Delete ${s.name}`}
                        className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </Table>

          <AnimatePresence>
            {deletingId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
                >
                  <h3 className="font-display text-xl text-stone-900">Remove heritage site</h3>
                  <p className="mt-2 text-sm text-stone-600">
                    Are you sure you want to remove this site from the collection? This action will take effect immediately.
                  </p>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      disabled={submitting}
                      onClick={() => setDeletingId(null)}
                      className="border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={submitting}
                      onClick={() => confirmDelete(deletingId)}
                      className="inline-flex items-center gap-1.5 bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {submitting && <Loader2 size={12} className="animate-spin" />}
                      Confirm delete
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );
}

/* =========================================================================
 * 3. TIMELINE EVENTS COMPONENT
 * ========================================================================= */
function TimelineView({ onToast }: { onToast: (x: string) => void }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimelineEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTimelineEvents();
      setEvents(res.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load timeline events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const year = String(d.get("year")).trim();
    const event = String(d.get("event")).trim();
    const site = String(d.get("site")).trim();
    const statusVal = String(d.get("status")).trim() as Status;
    const description = String(d.get("description")).trim();

    if (!year || !event) {
      onToast("Year and event title are required");
      return;
    }

    setSubmitting(true);
    try {
      if (editing && editing.id) {
        const res = await updateTimelineEvent(editing.id, {
          year,
          event,
          site: site || "Heritage Site",
          status: statusVal || "PUBLISHED",
          description,
        });
        setEvents((prev) => prev.map((t) => (t.id === editing.id ? res.data : t)));
        onToast("Timeline event updated");
      } else {
        const res = await createTimelineEvent({
          year,
          event,
          site: site || "Heritage Site",
          status: statusVal || "PUBLISHED",
          description,
        });
        setEvents((prev) => [res.data, ...prev]);
        onToast("Timeline event created");
      }
      setEditing(null);
    } catch (err: any) {
      onToast(err?.message || "Failed to save timeline event");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setSubmitting(true);
    try {
      await deleteTimelineEvent(id);
      setEvents((prev) => prev.filter((x) => x.id !== id));
      setDeletingId(null);
      onToast("Timeline event removed");
    } catch (err: any) {
      onToast(err?.message || "Failed to delete timeline event");
    } finally {
      setSubmitting(false);
    }
  };

  if (editing) {
    return (
      <>
        <PageHead
          action={
            <button
              onClick={() => setEditing(null)}
              className="text-sm text-stone-600 hover:text-stone-900"
            >
              Cancel
            </button>
          }
        >
          {editing.id ? "Edit timeline event" : "Add timeline event"}
        </PageHead>
        <form onSubmit={save} className="max-w-4xl rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-stone-700">
              Year *
              <input
                required
                name="year"
                defaultValue={editing.year}
                placeholder="e.g. 1192 or 17th Century"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Event title *
              <input
                required
                name="event"
                defaultValue={editing.event}
                placeholder="Event summary"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Related site
              <input
                name="site"
                defaultValue={editing.site}
                placeholder="Heritage site name"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Status
              <select
                name="status"
                defaultValue={editing.status || "PUBLISHED"}
                className="mt-2 w-full border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              >
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-xs font-semibold text-stone-700">
              Description
              <textarea
                name="description"
                rows={3}
                defaultValue={editing.description}
                placeholder="Historical context and details"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Save event
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setEditing(null)}
              className="border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <PageHead
        action={
          <div className="flex gap-2">
            <button
              onClick={loadEvents}
              title="Refresh timeline"
              className="inline-flex items-center gap-1.5 border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={() =>
                setEditing({
                  id: "",
                  year: "",
                  event: "",
                  description: "",
                  site: "",
                  status: "PUBLISHED",
                })
              }
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <Plus size={16} /> Add timeline event
            </button>
          </div>
        }
      >
        Timeline
      </PageHead>
      <p className="-mt-4 mb-6 text-sm text-stone-500">
        Place events in their historical context.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={loadEvents} />
      ) : (
        <Table headers={["Year", "Event", "Related heritage site", "Status", "Actions"]}>
          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : events.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-5 py-12 text-center text-sm text-stone-500">
                No timeline events found. Add your first event.
              </td>
            </tr>
          ) : (
            events.map((t) => (
              <motion.tr
                whileHover={{ backgroundColor: "#fafaf9" }}
                key={t.id}
                className="border-b border-stone-100 last:border-0"
              >
                <td className="px-5 py-4 font-medium text-stone-800">{t.year}</td>
                <td className="px-5 py-4 text-sm text-stone-600">{t.event}</td>
                <td className="px-5 py-4 text-sm text-stone-600">{t.site}</td>
                <td className="px-5 py-4">
                  <Badge value={t.status} />
                </td>
                <td className="px-3 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditing(t)}
                      className="rounded px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingId(t.id)}
                      aria-label={`Delete event ${t.event}`}
                      className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))
          )}
        </Table>
      )}

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            >
              <h3 className="font-display text-xl text-stone-900">Remove timeline event</h3>
              <p className="mt-2 text-sm text-stone-600">
                Are you sure you want to delete this historical timeline event?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  disabled={submitting}
                  onClick={() => setDeletingId(null)}
                  className="border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  onClick={() => confirmDelete(deletingId)}
                  className="inline-flex items-center gap-1.5 bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Confirm delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* =========================================================================
 * 4. STORIES & EDITORIAL COMPONENT
 * ========================================================================= */
function StoriesView({ onToast }: { onToast: (x: string) => void }) {
  const [storiesList, setStoriesList] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Story | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadStories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStories();
      setStoriesList(res.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load stories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStories();
  }, []);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const titleVal = String(d.get("title")).trim();
    const category = String(d.get("category")).trim();
    const author = String(d.get("author")).trim();
    const statusVal = String(d.get("status")).trim() as Status;
    const published = String(d.get("published")).trim();
    const content = String(d.get("content")).trim();

    if (!titleVal || !category || !author) {
      onToast("Title, category, and author are required");
      return;
    }

    setSubmitting(true);
    try {
      if (editing && editing.id) {
        const res = await updateStory(editing.id, {
          title: titleVal,
          category,
          author,
          status: statusVal || "PUBLISHED",
          published: published || editing.published,
          content,
        });
        setStoriesList((prev) => prev.map((s) => (s.id === editing.id ? res.data : s)));
        onToast("Story updated");
      } else {
        const res = await createStory({
          title: titleVal,
          category,
          author,
          status: statusVal || "PUBLISHED",
          published: published || "Just now",
          content,
        });
        setStoriesList((prev) => [res.data, ...prev]);
        onToast("Story created");
      }
      setEditing(null);
    } catch (err: any) {
      onToast(err?.message || "Failed to save story");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setSubmitting(true);
    try {
      await deleteStory(id);
      setStoriesList((prev) => prev.filter((x) => x.id !== id));
      setDeletingId(null);
      onToast("Story deleted");
    } catch (err: any) {
      onToast(err?.message || "Failed to delete story");
    } finally {
      setSubmitting(false);
    }
  };

  if (editing) {
    return (
      <>
        <PageHead
          action={
            <button
              onClick={() => setEditing(null)}
              className="text-sm text-stone-600 hover:text-stone-900"
            >
              Cancel
            </button>
          }
        >
          {editing.id ? "Edit story" : "Add story"}
        </PageHead>
        <form onSubmit={save} className="max-w-4xl rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-stone-700">
              Title *
              <input
                required
                name="title"
                defaultValue={editing.title}
                placeholder="Story headline"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Category *
              <input
                required
                name="category"
                defaultValue={editing.category}
                placeholder="e.g. Art & Architecture"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Author *
              <input
                required
                name="author"
                defaultValue={editing.author}
                placeholder="Author name or Editorial"
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="text-xs font-semibold text-stone-700">
              Status
              <select
                name="status"
                defaultValue={editing.status || "PUBLISHED"}
                className="mt-2 w-full border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              >
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-xs font-semibold text-stone-700">
              Published Date Label
              <input
                name="published"
                defaultValue={editing.published || "Just now"}
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
            <label className="sm:col-span-2 text-xs font-semibold text-stone-700">
              Story Content
              <textarea
                name="content"
                rows={4}
                defaultValue={editing.content}
                placeholder="Full article or editorial text..."
                className="mt-2 w-full border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-stone-800"
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Save story
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setEditing(null)}
              className="border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <PageHead
        action={
          <div className="flex gap-2">
            <button
              onClick={loadStories}
              title="Refresh stories"
              className="inline-flex items-center gap-1.5 border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={() =>
                setEditing({
                  id: "",
                  title: "",
                  category: "Living Heritage",
                  author: "Editorial Team",
                  status: "PUBLISHED",
                  published: "Just now",
                  content: "",
                })
              }
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <Plus size={16} /> Add story
            </button>
          </div>
        }
      >
        Stories
      </PageHead>
      <p className="-mt-4 mb-6 text-sm text-stone-500">
        Editorial stories and heritage content.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={loadStories} />
      ) : (
        <Table headers={["Title", "Category", "Author", "Status", "Published", "Actions"]}>
          {loading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : storiesList.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-12 text-center text-sm text-stone-500">
                No stories found. Create your first heritage story.
              </td>
            </tr>
          ) : (
            storiesList.map((s) => (
              <motion.tr
                whileHover={{ backgroundColor: "#fafaf9" }}
                key={s.id}
                className="border-b border-stone-100 last:border-0"
              >
                <td className="px-5 py-4 font-medium text-stone-800">{s.title}</td>
                <td className="px-5 py-4 text-sm text-stone-600">{s.category}</td>
                <td className="px-5 py-4 text-sm text-stone-600">{s.author}</td>
                <td className="px-5 py-4">
                  <Badge value={s.status} />
                </td>
                <td className="px-5 py-4 text-xs text-stone-400">{s.published}</td>
                <td className="px-3 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditing(s)}
                      className="rounded px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingId(s.id)}
                      aria-label={`Delete ${s.title}`}
                      className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))
          )}
        </Table>
      )}

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            >
              <h3 className="font-display text-xl text-stone-900">Remove story</h3>
              <p className="mt-2 text-sm text-stone-600">
                Are you sure you want to delete this editorial story?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  disabled={submitting}
                  onClick={() => setDeletingId(null)}
                  className="border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  onClick={() => confirmDelete(deletingId)}
                  className="inline-flex items-center gap-1.5 bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Confirm delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* =========================================================================
 * 5. USER MANAGEMENT COMPONENT
 * ========================================================================= */
function UsersView({ onToast }: { onToast: (x: string) => void }) {
  const { user: currentUser } = useAuth();
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminUsers();
      setUsersList(res.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load user accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const toggleStatus = async (user: AdminUser) => {
    const nextStatus: UserStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    if (user.email === currentUser?.email && nextStatus === "SUSPENDED") {
      if (!confirm("Warning: You are suspending your own administrator account. Proceed?")) {
        return;
      }
    }

    setActionId(user.id);
    try {
      const res = await updateUserStatus(user.id, nextStatus);
      setUsersList((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: res.data.status } : u)));
      onToast(`User status updated to ${nextStatus}`);
    } catch (err: any) {
      onToast(err?.message || "Failed to update user status");
    } finally {
      setActionId(null);
    }
  };

  const toggleRole = async (user: AdminUser) => {
    const nextRole: UserRole = user.role === "ADMIN" ? "USER" : "ADMIN";

    if (user.email === currentUser?.email && nextRole === "USER") {
      if (!confirm("Warning: Removing administrator privileges from your current account will immediately revoke your Admin access. Proceed?")) {
        return;
      }
    }

    setActionId(user.id);
    try {
      const res = await updateUserRole(user.id, nextRole);
      setUsersList((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: res.data.role } : u)));
      onToast(`User role updated to ${nextRole}`);
    } catch (err: any) {
      onToast(err?.message || "Failed to update user role");
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <PageHead
        action={
          <button
            onClick={loadUsers}
            title="Refresh users"
            className="inline-flex items-center gap-1.5 border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      >
        Users
      </PageHead>
      <p className="-mt-4 mb-6 text-sm text-stone-500">
        Manage roles and access privileges across the platform.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={loadUsers} />
      ) : (
        <Table headers={["Name", "Email", "Role", "Status", "Joined", "Actions"]}>
          {loading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : usersList.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-12 text-center text-sm text-stone-500">
                No users found.
              </td>
            </tr>
          ) : (
            usersList.map((u) => {
              const isSelf = u.email === currentUser?.email;
              const isActionRunning = actionId === u.id;
              return (
                <motion.tr
                  whileHover={{ backgroundColor: "#fafaf9" }}
                  key={u.id}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-5 py-4 font-medium text-stone-800">
                    <span className="flex items-center gap-2">
                      {u.name}
                      {isSelf && (
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-500">
                          YOU
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-stone-600">{u.email}</td>
                  <td className="px-5 py-4">
                    <Badge value={u.role} />
                  </td>
                  <td className="px-5 py-4">
                    <Badge value={u.status} />
                  </td>
                  <td className="px-5 py-4 text-xs text-stone-400">{u.joined || "—"}</td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        disabled={isActionRunning}
                        onClick={() => toggleRole(u)}
                        title={u.role === "ADMIN" ? "Demote to User" : "Promote to Admin"}
                        className="inline-flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
                      >
                        <Shield size={12} className={u.role === "ADMIN" ? "text-purple-600" : ""} />
                        {u.role === "ADMIN" ? "Demote" : "Make Admin"}
                      </button>
                      <button
                        disabled={isActionRunning}
                        onClick={() => toggleStatus(u)}
                        title={u.status === "ACTIVE" ? "Suspend Account" : "Activate Account"}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                          u.status === "ACTIVE"
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {u.status === "ACTIVE" ? (
                          <>
                            <UserX size={12} /> Suspend
                          </>
                        ) : (
                          <>
                            <UserCheck size={12} /> Activate
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })
          )}
        </Table>
      )}
    </>
  );
}

/* =========================================================================
 * 6. MEDIA LIBRARY COMPONENT
 * ========================================================================= */
function MediaView({ onToast }: { onToast: (x: string) => void }) {
  const [mediaList, setMediaList] = useState<MediaReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMediaReferences();
      setMediaList(res.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load media references");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const addMedia = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const imageUrl = String(d.get("imageUrl")).trim();
    const siteName = String(d.get("siteName")).trim() || "Heritage Site";
    const caption = String(d.get("caption")).trim();
    const statusVal = String(d.get("status")).trim() as Status;

    if (!imageUrl) {
      onToast("Image URL is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createMediaReference({
        imageUrl,
        siteId: "1",
        siteName,
        caption,
        status: statusVal || "PUBLISHED",
      });
      setMediaList((prev) => [res.data, ...prev]);
      setAdding(false);
      onToast("Media reference added successfully");
    } catch (err: any) {
      onToast(err?.message || "Failed to add media reference");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setSubmitting(true);
    try {
      await deleteMediaReference(id);
      setMediaList((prev) => prev.filter((m) => m.id !== id));
      setDeletingId(null);
      onToast("Media reference removed");
    } catch (err: any) {
      onToast(err?.message || "Failed to delete media");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHead
        action={
          <div className="flex gap-2">
            <button
              onClick={loadMedia}
              title="Refresh media"
              className="inline-flex items-center gap-1.5 border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            >
              <Plus size={16} /> Add media reference
            </button>
          </div>
        }
      >
        Media library
      </PageHead>
      <p className="-mt-4 mb-6 text-sm text-stone-500">
        Curate photography and visual assets tied to heritage monuments.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={loadMedia} />
      ) : loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="h-44 bg-stone-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-stone-200" />
                <div className="h-3 w-1/2 rounded bg-stone-200" />
              </div>
            </div>
          ))}
        </div>
      ) : mediaList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <ImageIcon className="mx-auto mb-2 text-stone-300" size={36} />
          <p className="text-sm font-semibold text-stone-700">No media assets in library</p>
          <p className="mt-1 text-xs text-stone-400">Add an image URL to link assets to heritage sites.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mediaList.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="relative h-44 bg-stone-100">
                <img
                  className="h-full w-full object-cover"
                  src={item.imageUrl}
                  alt={item.caption || item.siteName}
                  onError={(e) => {
                    // Fallback placeholder on broken image URLs
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80";
                  }}
                />
              </div>
              <div className="p-4">
                <p className="font-medium text-stone-800">{item.siteName || "Heritage Asset"}</p>
                {item.caption && (
                  <p className="mt-1 text-xs text-stone-500 line-clamp-1">{item.caption}</p>
                )}
                <p className="mt-1 text-[11px] text-stone-400">
                  Uploaded {item.uploadedAt || "recently"}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                  <Badge value={item.status} />
                  <button
                    onClick={() => setDeletingId(item.id)}
                    aria-label="Delete media reference"
                    className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 transition"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Add Media Modal */}
      <AnimatePresence>
        {adding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            >
              <h3 className="font-display text-xl text-stone-900">Add media reference</h3>
              <p className="mt-1 text-xs text-stone-500">
                Enter an image URL to register a visual asset in the library.
              </p>
              <form onSubmit={addMedia} className="mt-4 space-y-4">
                <label className="block text-xs font-semibold text-stone-700">
                  Image URL *
                  <input
                    required
                    name="imageUrl"
                    placeholder="https://images.unsplash.com/..."
                    className="mt-1.5 w-full border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-stone-700">
                  Site Name / Landmark
                  <input
                    name="siteName"
                    placeholder="e.g. Panhala Fort"
                    className="mt-1.5 w-full border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-stone-700">
                  Caption
                  <input
                    name="caption"
                    placeholder="Brief description of the image"
                    className="mt-1.5 w-full border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-800"
                  />
                </label>
                <label className="block text-xs font-semibold text-stone-700">
                  Status
                  <select
                    name="status"
                    defaultValue="PUBLISHED"
                    className="mt-1.5 w-full border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-800"
                  >
                    <option value="PUBLISHED">PUBLISHED</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                </label>
                <div className="mt-6 flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setAdding(false)}
                    className="border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {submitting && <Loader2 size={12} className="animate-spin" />}
                    Add to library
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Media Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            >
              <h3 className="font-display text-xl text-stone-900">Remove media reference</h3>
              <p className="mt-2 text-sm text-stone-600">
                Are you sure you want to remove this media reference from the collection?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  disabled={submitting}
                  onClick={() => setDeletingId(null)}
                  className="border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  onClick={() => confirmDelete(deletingId)}
                  className="inline-flex items-center gap-1.5 bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Confirm delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* =========================================================================
 * 7. SETTINGS PAGE COMPONENT
 * ========================================================================= */
function SettingsPage({ onToast }: { onToast: (x: string) => void }) {
  const { user } = useAuth();
  return (
    <>
      <PageHead>Settings</PageHead>
      <div className="max-w-3xl space-y-5">
        {[
          ["Admin profile", user?.name || "Administrator", user?.email || "admin@heritageverse.in"],
          ["Platform settings", "HeritageVerse India", "Collection visibility and defaults"],
          ["Content preferences", "Editorial workflow", "Live synchronization with PostgreSQL database"],
          ["Appearance", "Light workspace", "System preference is enabled"],
        ].map(([h, a, b]) => (
          <section key={h} className="border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-stone-900">{h}</h2>
                <p className="mt-2 text-sm text-stone-600">{a}</p>
                <p className="mt-1 text-xs text-stone-400">{b}</p>
              </div>
              <button
                onClick={() => onToast(`${h} preferences verified`)}
                className="border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-800"
              >
                Edit
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* =========================================================================
 * ROOT ADMIN APP COMPONENT
 * ========================================================================= */
export function AdminApp() {
  const { user, signOut } = useAuth();
  const [page, setPage] = useState<Page>(
    () => (location.pathname.split("/")[2] as Page) || "dashboard"
  );
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  const navigate = (p: Page) => {
    history.pushState({}, "", p === "dashboard" ? "/admin" : `/admin/${p}`);
    setPage(p);
    setOpen(false);
  };

  const toastNow = (x: string) => {
    setToast(x);
    window.setTimeout(() => setToast(""), 2800);
  };

  const render =
    page === "dashboard" ? (
      <Dashboard onNavigate={navigate} />
    ) : page === "heritage" ? (
      <Heritage onToast={toastNow} />
    ) : page === "timeline" ? (
      <TimelineView onToast={toastNow} />
    ) : page === "stories" ? (
      <StoriesView onToast={toastNow} />
    ) : page === "media" ? (
      <MediaView onToast={toastNow} />
    ) : page === "users" ? (
      <UsersView onToast={toastNow} />
    ) : (
      <SettingsPage onToast={toastNow} />
    );

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "AD";
  const displayName = user?.name || "Administrator";

  return (
    <div className="min-h-svh bg-stone-50 font-sans text-stone-800">
      <AnimatePresence>
        {open && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-stone-950/30 lg:hidden"
            aria-label="Close navigation"
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col bg-stone-950 px-4 py-6 text-stone-300 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <button
            onClick={() => navigate("dashboard")}
            className="font-display text-2xl tracking-wide text-white"
          >
            Heritage<span className="text-[#d4af7a]">Verse</span>
          </button>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-stone-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <p className="px-2 pt-1 text-[10px] uppercase tracking-[.22em] text-stone-500">
          Administration
        </p>

        <nav className="mt-9 space-y-1">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition ${
                page === id
                  ? "bg-white/10 text-white font-medium"
                  : "hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <a
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 text-sm text-stone-400 hover:text-white transition"
          >
            <ChevronLeft size={17} /> Back to HeritageVerse
          </a>
          <div className="mt-4 flex items-center justify-between px-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d4af7a] text-xs font-bold text-stone-900">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{displayName}</p>
                <p className="text-[10px] text-stone-500">Administrator</p>
              </div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="shrink-0 p-1.5 text-stone-400 hover:text-white transition"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-1 text-stone-600 hover:text-stone-900"
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-sm font-semibold text-stone-800">{title[page]}</p>
              <p className="text-[10px] text-stone-400">Admin / {title[page]}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              aria-label="Notifications"
              className="relative text-stone-500 hover:text-stone-800"
            >
              <Bell size={19} />
              <i className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-amber-500" />
            </button>
            <div className="hidden items-center gap-2 text-xs font-semibold sm:flex text-stone-700">
              {displayName} <ChevronDown size={14} />
            </div>
          </div>
        </header>

        <main className="p-5 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {render}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 right-5 z-50 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
