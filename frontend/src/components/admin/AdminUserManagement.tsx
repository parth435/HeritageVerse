import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, RefreshCw, Search, ShieldCheck, UserRoundCog } from "lucide-react";
import { getAdminUserById, getAdminUsers, updateAdminUserRole, updateAdminUserStatus, type AdminUser, type AdminUserDetails, type AdminUserQuery } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const PAGE_SIZE = 25;
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-2 text-xs text-parchment/80 transition hover:border-gold/30 hover:bg-gold/[0.07] hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-45";
const primary = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-gold px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50";

type PendingChange = { user: AdminUser; field: "role" | "status"; value: "user" | "admin" | "ACTIVE" | "SUSPENDED" };

function displayDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function AdminUserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0 });
  const [draft, setDraft] = useState({ q: "", role: "", status: "" });
  const [filters, setFilters] = useState<AdminUserQuery>({});
  const [selected, setSelected] = useState<AdminUserDetails | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const response = await getAdminUsers({ ...filters, limit: PAGE_SIZE, offset: pagination.offset });
      if (request !== sequence.current) return;
      setUsers(response.users);
      setPagination(response.pagination);
      setError(null);
    } catch (reason) {
      if (request === sequence.current) setError(reason instanceof Error ? reason.message : "Could not load users.");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [filters, pagination.offset]);

  useEffect(() => { void load(); }, [load]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setPagination((page) => ({ ...page, offset: 0 }));
    setFilters({
      q: draft.q.trim() || undefined,
      role: draft.role ? draft.role as AdminUserQuery["role"] : undefined,
      status: draft.status ? draft.status as AdminUserQuery["status"] : undefined,
    });
    setSelected(null);
  };

  const inspect = async (userId: number) => {
    setDetailLoading(userId);
    try {
      setSelected(await getAdminUserById(userId));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load user details.");
    } finally {
      setDetailLoading(null);
    }
  };

  const applyChange = async () => {
    if (!pendingChange || savingId !== null) return;
    const change = pendingChange;
    setSavingId(change.user.id);
    try {
      const response = change.field === "role"
        ? await updateAdminUserRole(change.user.id, change.value as AdminUser["role"])
        : await updateAdminUserStatus(change.user.id, change.value as AdminUser["status"]);
      setNotice(response.message);
      setError(null);
      setPendingChange(null);
      await load();
      if (selected?.id === change.user.id) await inspect(change.user.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this account.");
      setNotice(null);
    } finally {
      setSavingId(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const movePage = (offset: number) => setPagination((page) => ({ ...page, offset }));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/[0.09] bg-[#15120f] p-4 sm:p-5">
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto] xl:items-end">
          <label className="text-xs text-parchment/55">Search name or email
            <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment/35" /><input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} maxLength={120} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d0b09] py-3 pl-10 pr-3 text-sm text-parchment outline-none focus:border-gold/55" placeholder="Name or email" /></span>
          </label>
          <label className="text-xs text-parchment/55">Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d0b09] px-3 py-3 text-sm text-parchment"><option value="">All roles</option><option value="user">User</option><option value="admin">Admin</option></select></label>
          <label className="text-xs text-parchment/55">Account status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d0b09] px-3 py-3 text-sm text-parchment"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
          <button type="submit" className={primary}><Search className="h-4 w-4" />Filter</button>
          <button type="button" disabled={loading} onClick={() => void load()} className={button}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        </form>
      </section>

      {error ? <p className="rounded-xl border border-red-300/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-100" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-100" role="status">{notice}</p> : null}

      {pendingChange ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/25 bg-gold/[0.06] p-4" aria-live="polite">
          <p className="text-sm text-parchment/80">Confirm {pendingChange.field === "role" ? `${pendingChange.value === "admin" ? "promoting" : "demoting"} ${pendingChange.user.name}` : `${pendingChange.value === "SUSPENDED" ? "suspending" : "reactivating"} ${pendingChange.user.name}`}?</p>
          <div className="flex gap-2"><button type="button" onClick={() => setPendingChange(null)} disabled={savingId !== null} className={button}>Cancel</button><button type="button" onClick={() => void applyChange()} disabled={savingId !== null} className={primary}>{savingId === pendingChange.user.id ? "Saving…" : "Confirm change"}</button></div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#15120f]" aria-labelledby="admin-users-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4"><div><h2 id="admin-users-heading" className="font-display text-2xl">Registered accounts</h2><p className="mt-1 text-xs text-parchment/45">{pagination.total.toLocaleString()} accounts · {PAGE_SIZE} per page</p></div><ShieldCheck className="h-5 w-5 text-gold" aria-hidden="true" /></div>
        {loading ? <div className="px-5 py-12 text-center text-sm text-parchment/55" role="status">Loading user accounts…</div> : users.length === 0 ? <div className="px-5 py-12 text-center text-sm text-parchment/55">No accounts match these filters.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.15em] text-parchment/40"><tr><th className="px-5 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Administration</th></tr></thead><tbody className="divide-y divide-white/[0.06]">
            {users.map((account) => {
              const isSelf = account.id === currentUser?.id;
              const updating = savingId === account.id;
              return <tr key={account.id}>
                <td className="px-5 py-4"><p className="font-medium text-parchment">{account.name}{isSelf ? <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">You</span> : null}</p><p className="mt-1 text-xs text-parchment/45">{account.email}</p></td>
                <td className="px-4 py-4 text-xs text-parchment/55">{displayDate(account.created_at)}</td>
                <td className="px-4 py-4"><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-parchment/70">{account.role}</span></td>
                <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${account.status === "ACTIVE" ? "border-emerald-300/20 text-emerald-100" : "border-amber-300/20 text-amber-100"}`}>{account.status}</span></td>
                <td className="px-5 py-4"><div className="flex flex-wrap gap-2">
                  <button type="button" disabled={detailLoading === account.id} onClick={() => void inspect(account.id)} className={button}><Eye className="h-3.5 w-3.5" />{detailLoading === account.id ? "Loading" : "Details"}</button>
                  {account.role === "user" ? <button type="button" disabled={updating || account.status !== "ACTIVE" || isSelf} onClick={() => setPendingChange({ user: account, field: "role", value: "admin" })} className={button}>Promote</button> : <button type="button" disabled={updating || isSelf} onClick={() => setPendingChange({ user: account, field: "role", value: "user" })} className={button}>Demote</button>}
                  {account.status === "ACTIVE" ? <button type="button" disabled={updating || isSelf} onClick={() => setPendingChange({ user: account, field: "status", value: "SUSPENDED" })} className={button}>Suspend</button> : <button type="button" disabled={updating} onClick={() => setPendingChange({ user: account, field: "status", value: "ACTIVE" })} className={button}>Reactivate</button>}
                </div></td>
              </tr>;
            })}
          </tbody></table></div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3 text-xs text-parchment/45"><span>Page {currentPage} of {pageCount}</span><div className="flex gap-2"><button type="button" disabled={loading || currentPage <= 1} onClick={() => movePage(Math.max(0, pagination.offset - pagination.limit))} className={button}><ChevronLeft className="h-4 w-4" />Previous</button><button type="button" disabled={loading || currentPage >= pageCount} onClick={() => movePage(pagination.offset + pagination.limit)} className={button}>Next<ChevronRight className="h-4 w-4" /></button></div></div>
      </section>

      {selected ? <section className="rounded-2xl border border-white/[0.09] bg-[#15120f] p-5 sm:p-6" aria-live="polite"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.2em] text-gold">Account details · #{selected.id}</p><h2 className="font-display mt-2 text-3xl">{selected.name}</h2><p className="mt-1 text-sm text-parchment/50">{selected.email}</p></div><button type="button" onClick={() => setSelected(null)} className={button}>Close details</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([["Role", selected.role], ["Status", selected.status], ["Joined", displayDate(selected.created_at)], ["Favorites", selected.favorites_count], ["Visits", selected.visits_count], ["Reviews", selected.reviews_count], ["Journeys", selected.journeys_count]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.07] bg-ink/50 p-4"><p className="text-[10px] uppercase tracking-wider text-parchment/40">{label}</p><p className="mt-2 text-sm text-parchment/85">{value}</p></div>)}</div><p className="mt-4 flex items-center gap-2 text-xs text-parchment/40"><UserRoundCog className="h-4 w-4 text-gold/70" />Role and status changes are recorded in the admin activity log.</p></section> : null}
    </div>
  );
}
