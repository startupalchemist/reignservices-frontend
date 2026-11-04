import {
  createContext,
  cloneElement,
  isValidElement,
  type ReactElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  HardHat,
  FileText,
  Ruler,
  Sparkles,
  Search,
  Plus,
  ChevronRight,
  ArrowUpRight,
  Clock3,
  LogOut,
  Menu,
  X,
  Settings2,
  Plug,
  Mail,
  Image,
  Globe,
  Check,
  Phone,
  CalendarDays,
  TrendingUp,
  Wallet,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { request, AgentConversation } from "./reign-agent";
import SitePlans from "./site-plans";
import "./reign-workspace.css";
type Page =
  | "dashboard"
  | "contacts"
  | "deals"
  | "projects"
  | "proposals"
  | "measurements"
  | "assistant"
  | string;
const money = (v: any) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v || 0) / 100);
const fullMoney = (v: any) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v || 0) / 100,
  );
const date = (v: any) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not scheduled";
const calendarDate = (v: any) => {
  if (!v) return "Not scheduled";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
const localDate = (v: any) => (v ? String(v).slice(0, 10) : "");
const localTime = (v: any) =>
  v
    ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const iso = (v: string) => (v ? new Date(v).toISOString() : null);
const label = (v: string) =>
  v.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
const stages = [
  "new",
  "qualified",
  "assessment",
  "proposal",
  "negotiation",
  "won",
  "lost",
];
const palette = [
  "#6845d6",
  "#43b5a0",
  "#f5b954",
  "#4e8de6",
  "#d77eae",
  "#87b9ab",
  "#c8cdd5",
];
function useRows(path: string) {
  return useQuery<any>({ queryKey: [path], staleTime: 15000, refetchInterval: 60000, refetchOnWindowFocus: true });
}
const Workspace = createContext<any>(null);
const useWork = () => useContext(Workspace);
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="rw-field">
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<any>, { "aria-label": label })
        : children}
    </label>
  );
}
function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rw-empty">
      <span className="rw-empty-icon">
        <HardHat size={24} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const work = useWork();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"rw-modal " + (wide ? "rw-modal-wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="rw-icon"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="rw-modal-body">
        {work?.error && (
          <div role="alert" className="rw-alert">
            {work.error}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
function OwnerSelect({
  value,
  onChange,
  ...accessibility
}: {
  value: any;
  onChange: (v: any) => void;
  "aria-label"?: string;
}) {
  const { team } = useWork();
  return (
    <select
      {...accessibility}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Unassigned</option>
      {team.map((u: any) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
function ContactSelect({
  value,
  onChange,
  ...accessibility
}: {
  value: any;
  onChange: (v: any) => void;
  "aria-label"?: string;
}) {
  const { contacts } = useWork();
  return (
    <select
      {...accessibility}
      required
      value={value || ""}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value="">Select a contact</option>
      {contacts.map((c: any) => (
        <option key={c.id} value={c.id}>
          {c.name} — {c.vehicle || c.company || "General enquiry"}
        </option>
      ))}
    </select>
  );
}
function Pill({ value }: { value: string }) {
  return <span className={"rw-pill rw-status-" + value}>{label(value)}</span>;
}
function Head({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rw-page-head">
      <div>
        {eyebrow && <p className="rw-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
      <div className="rw-head-actions">{children}</div>
    </div>
  );
}
export default function ReignWorkspace({
  renderLegacy,
}: {
  renderLegacy: (page: string) => ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [page, setPage] = useState<Page>(() => {
      const raw = window.location.hash.slice(1);
      const aliases: Record<string, string> = {
        dyno: "dashboard",
        leads: "contacts",
        operations: "proposals",
      };
      const page = aliases[raw] || raw;
      return [
        "dashboard",
        "contacts",
        "deals",
        "projects",
        "proposals",
        "measurements",
        "assistant",
        "blog",
        "newsletter",
        "services",
        "gallery",
        "integrations",
        "users",
        "seo",
      ].includes(page)
        ? page
        : "dashboard";
    }),
    [mobile, setMobile] = useState(false),
    [focus, setFocus] = useState<number | null>(null),
    [search, setSearch] = useState(""),
    [contactForm, setContactForm] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const contactsQ = useRows("/api/crm/contacts"),
    teamQ = useRows("/api/crm/team");
  const contacts = contactsQ.data || [],
    team = teamQ.data || [],
    admin = user?.role === "root" || user?.role === "admin";
  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);
  const go = (p: Page, id?: number) => {
    setPage(p);
    setMobile(false);
    setError("");
    if (id !== undefined) setFocus(id);
    window.history.replaceState(null, "", "#" + p);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };
  async function run(fn: () => Promise<any>, message = "Saved") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      await queryClient.invalidateQueries();
      setNotice(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  if (loading || !user)
    return <div className="rw-loading">Opening your workspace…</div>;
  const nav = [
    ["dashboard", "Overview", LayoutDashboard],
    ["contacts", "Contacts", Users],
    ["deals", "Deal pipeline", KanbanSquare],
    ["projects", "Projects & tasks", HardHat],
    ["proposals", "Estimates & proposals", FileText],
    ["measurements", "Measurements", Ruler],
    ["assistant", "Reign assistant", Sparkles],
  ] as const;
  const manage = [
    ["blog", "Blog", FileText],
    ["newsletter", "Newsletter", Mail],
    ...(admin
      ? [
          ["services", "Services", Settings2],
          ["gallery", "Gallery", Image],
          ["integrations", "Integrations", Plug],
          ["users", "Team", Users],
          ["seo", "SEO & analytics", Globe],
        ]
      : []),
  ] as any[];
  const value = {
    user,
    admin,
    contacts,
    team,
    focus,
    setFocus,
    go,
    run,
    busy,
    setError,
    setNotice,
    setContactForm,
    search,
    setSearch,
    error,
  };
  return (
    <Workspace.Provider value={value}>
      <div className="rw">
        <aside className={"rw-sidebar " + (mobile ? "is-open" : "")}>
          <a className="rw-brand" href="/">
            <span>R</span>
            <div>
              REIGN<small>SERVICES / WORKSPACE</small>
            </div>
          </a>
          <button
            className="rw-mobile-close rw-icon"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
          <p className="rw-nav-heading">WORKSPACE</p>
          <nav aria-label="Workspace navigation">
            {nav.map(([key, title, Icon]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <Icon size={18} />
                {title}
                {key === "assistant" && <span className="rw-ai-dot" />}
              </button>
            ))}
            <p className="rw-nav-heading">BUSINESS</p>
            {manage.map(([key, title, Icon]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <Icon size={18} />
                {title}
              </button>
            ))}
          </nav>
          <div className="rw-sidebar-foot">
            <span className="rw-avatar">{user.name.slice(0, 1)}</span>
            <div>
              {user.name}
              <small>{admin ? "Administrator" : "Reign employee"}</small>
            </div>
            <button
              className="rw-icon"
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                queryClient.clear();
                navigate("/login");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="rw-nav-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="rw-main">
          <header className="rw-topbar">
            <button
              className="rw-menu rw-icon"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <div className="rw-breadcrumb">
              Workspace <ChevronRight size={14} />
              <strong>
                {[...nav, ...manage].find((n) => n[0] === page)?.[1] ||
                  "Overview"}
              </strong>
            </div>
            <label className="rw-search">
              <Search size={17} />
              <input
                aria-label="Search contacts"
                placeholder="Search contacts…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocus(null);
                  if (page !== "contacts") go("contacts");
                }}
              />
            </label>
            <button
              className="rw-button rw-primary"
              aria-label="Add contact"
              onClick={() => setContactForm({})}
            >
              <Plus size={16} />
              <span>Add contact</span>
            </button>
          </header>
          <main className="rw-content">
            {error && (
              <div className="rw-alert" role="alert">
                {error}
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  ×
                </button>
              </div>
            )}
            {notice && (
              <div className="rw-notice" role="status">
                {notice}
                <button
                  onClick={() => setNotice("")}
                  aria-label="Dismiss notice"
                >
                  ×
                </button>
              </div>
            )}
            {contactsQ.isError && (
              <div className="rw-alert" role="alert">
                Could not load CRM contacts.{" "}
                <button onClick={() => contactsQ.refetch()}>Retry</button>
              </div>
            )}
            {page === "dashboard" ? (
              <Overview />
            ) : page === "contacts" ? (
              <Contacts />
            ) : page === "deals" ? (
              <Deals />
            ) : page === "projects" ? (
              <Projects />
            ) : page === "proposals" ? (
              <Proposals />
            ) : page === "measurements" ? (
              <Measurements />
            ) : page === "assistant" ? (
              <Assistant />
            ) : (
              <>
                {page === "integrations" && admin && <IntegrationSetup />}
                {renderLegacy(page)}
              </>
            )}
          </main>
          <footer className="rw-footer">
            REIGN SERVICES <span>Built for the work ahead.</span>
            <a href="/" target="_blank" rel="noreferrer">
              View website <ArrowUpRight size={12} />
            </a>
          </footer>
        </div>
        {contactForm && (
          <ContactForm
            initial={contactForm}
            close={() => setContactForm(null)}
          />
        )}
      </div>
    </Workspace.Provider>
  );
}
function Overview() {
  const { go, setContactForm } = useWork(),
    q = useRows("/api/crm/overview"),
    d = q.data;
  if (q.isLoading) return <p>Loading workspace metrics…</p>;
  if (q.isError || !d)
    return (
      <Empty
        title="Metrics could not be loaded"
        action={
          <button className="rw-button" onClick={() => q.refetch()}>
            Try again
          </button>
        }
      />
    );
  const open = d.deals.filter((r: any) => !["won", "lost"].includes(r.stage)),
    pipeline = open.reduce((n: number, r: any) => n + Number(r.value_cents), 0),
    active = d.projects.filter((p: any) => p.stage === "in_progress").length,
    issued = d.proposals.find((p: any) => p.status === "issued"),
    phases = ["planning", "in_progress", "on_hold", "complete"]
      .map((stage) => ({
        name: label(stage),
        value: d.projects.filter((p: any) => p.stage === stage).length,
      }))
      .filter((v) => v.value);
  const costs = d.projects
    .filter((p: any) => p.budget_cents !== null || p.spent_cents !== null)
    .slice(0, 6)
    .map((p: any) => ({
      name: p.title,
      budget: p.budget_cents === null ? null : Number(p.budget_cents) / 100,
      spent: p.spent_cents === null ? null : Number(p.spent_cents) / 100,
    }));
  return (
    <>
      <Head
        eyebrow="YOUR BUSINESS, AT A GLANCE"
        title={"Good to see you. Let’s build."}
        detail={
          "Live workspace • Updated " +
          new Date(d.asOf).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        }
      >
        <button className="rw-button" onClick={() => q.refetch()}>
          <RefreshCw size={15} />
          Refresh
        </button>
        <button
          className="rw-button rw-primary"
          onClick={() => go("proposals")}
        >
          <Plus size={16} />
          Create estimate
        </button>
      </Head>
      <div className="rw-kpis">
        {[
          [
            Users,
            "Contacts",
            d.contacts.total,
            d.contacts.clients + " clients",
            "contacts",
          ],
          [
            TrendingUp,
            "Open pipeline",
            money(pipeline),
            open.reduce((n: number, r: any) => n + r.count, 0) +
              " active opportunities",
            "deals",
          ],
          [
            FileText,
            "Awaiting a decision",
            money(issued?.value_cents),
            (issued?.count || 0) + " issued proposals",
            "proposals",
          ],
          [
            HardHat,
            "Active projects",
            active,
            d.projects.length + " projects in your workspace",
            "projects",
          ],
        ].map(([Icon, title, value, sub, page]: any) => (
          <button className="rw-kpi" key={title} onClick={() => go(page)}>
            <div>
              <span className="rw-kpi-icon">
                <Icon size={20} />
              </span>
              <ArrowUpRight size={16} />
            </div>
            <p>{title}</p>
            <strong>{value}</strong>
            <small>{sub}</small>
          </button>
        ))}
      </div>
      {d.contacts.overdue_followups > 0 && (
        <button className="rw-attention" onClick={() => go("contacts")}>
          <Clock3 size={19} />
          <span>
            <strong>
              {d.contacts.overdue_followups} follow-up
              {d.contacts.overdue_followups === 1 ? "" : "s"} need attention
            </strong>
            <small>Keep the next conversation moving.</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <div className="rw-grid rw-grid-two">
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Project delivery</h2>
              <p>Task completion from your project plans</p>
            </div>
            <button className="rw-text-button" onClick={() => go("projects")}>
              All projects <ChevronRight size={14} />
            </button>
          </div>
          {d.projects.length ? (
            <div className="rw-project-table">
              {d.projects.slice(0, 6).map((p: any) => (
                <button key={p.id} onClick={() => go("projects", p.lead_id)}>
                  <div>
                    <strong>{p.title}</strong>
                    <small>{calendarDate(p.due_date)}</small>
                  </div>
                  <Pill value={p.stage} />
                  <div className="rw-progress-cell">
                    {p.task_count ? (
                      <>
                        <span>
                          {Math.round((p.complete_tasks / p.task_count) * 100)}%{" "}
                          <small>
                            {p.complete_tasks}/{p.task_count} tasks
                          </small>
                        </span>
                        <div className="rw-progress">
                          <i
                            style={{
                              width:
                                (p.complete_tasks / p.task_count) * 100 + "%",
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <small>Task plan not set</small>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Your next project starts here"
              detail="Add a client project, assign tasks, and track real progress."
              action={
                <button className="rw-button" onClick={() => go("projects")}>
                  <Plus size={16} />
                  Add project
                </button>
              }
            />
          )}
        </section>
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Deal pipeline</h2>
              <p>Opportunity value by stage • not realized revenue</p>
            </div>
            <KanbanSquare size={18} />
          </div>
          {d.deals.length ? (
            <>
              <div className="rw-pipeline">
                {stages.map((stage, i) => {
                  const row = d.deals.find((r: any) => r.stage === stage);
                  return (
                    <button key={stage} onClick={() => go("deals")}>
                      <span>
                        <i style={{ background: palette[i] }} />
                        {label(stage)}
                      </span>
                      <div>
                        <i
                          style={{
                            width:
                              Math.max(
                                0,
                                ((row?.count || 0) /
                                  Math.max(
                                    ...d.deals.map((r: any) => r.count),
                                    1,
                                  )) *
                                  100,
                              ) + "%",
                            background: palette[i],
                          }}
                        />
                      </div>
                      <strong>{row?.count || 0}</strong>
                      <small>{money(row?.value_cents)}</small>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty
              title="A clear path from lead to client"
              detail="Create your first opportunity to track scope, value, owner, and next steps."
              action={
                <button className="rw-button" onClick={() => go("deals")}>
                  Open pipeline
                </button>
              }
            />
          )}
        </section>
      </div>
      <div className="rw-grid rw-grid-three">
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Project budgets</h2>
              <p>Entered budget vs. recorded spend, USD</p>
            </div>
            <Wallet size={18} />
          </div>
          {costs.length ? (
            <div className="rw-chart">
              <ResponsiveContainer width="100%" height={235}>
                <BarChart
                  data={costs}
                  margin={{ left: 0, right: 8, bottom: 5 }}
                >
                  <CartesianGrid vertical={false} stroke="#edf0f4" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => String(v).slice(0, 14)}
                  />
                  <YAxis
                    width={48}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      "$" + (v >= 1000 ? v / 1000 + "k" : v)
                    }
                  />
                  <Tooltip
                    formatter={(v: any) => "$" + Number(v).toLocaleString()}
                  />
                  <Legend />
                  <Bar
                    dataKey="budget"
                    name="Budget"
                    fill="#d8cbfa"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="spent"
                    name="Recorded spend"
                    fill="#6845d6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="Budget visibility, without guesses"
              detail="Enter project budgets and recorded costs to see the comparison."
            />
          )}
        </section>
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Projects by stage</h2>
              <p>Current project records</p>
            </div>
          </div>
          {phases.length ? (
            <div className="rw-chart">
              <ResponsiveContainer width="100%" height={235}>
                <PieChart>
                  <Pie
                    data={phases}
                    dataKey="value"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={4}
                  >
                    {phases.map((p, i) => (
                      <Cell key={p.name} fill={palette[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="No project stages yet"
              detail="Your portfolio breakdown will appear as projects are added."
            />
          )}
        </section>
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Where contacts come from</h2>
              <p>Website forms, manual entry, and integrations</p>
            </div>
          </div>
          {d.sources.length ? (
            <div className="rw-sources">
              {d.sources.slice(0, 7).map((s: any, i: number) => (
                <div key={s.source}>
                  <span>
                    <i style={{ background: palette[i % palette.length] }} />
                    {s.source}
                  </span>
                  <strong>{s.count}</strong>
                  <div className="rw-progress">
                    <i
                      style={{
                        width: (s.count / d.contacts.total) * 100 + "%",
                        background: palette[i % palette.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Every source, one CRM"
              detail="New website enquiries automatically appear in Contacts."
            />
          )}
        </section>
      </div>
      <div className="rw-grid rw-grid-two">
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Next up</h2>
              <p>Open tasks ordered by due date</p>
            </div>
            <button className="rw-text-button" onClick={() => go("projects")}>
              Manage tasks <ChevronRight size={14} />
            </button>
          </div>
          {d.tasks.length ? (
            <div className="rw-task-list">
              {d.tasks.map((t: any) => (
                <div key={t.id}>
                  <span
                    className={
                      "rw-task-dot " +
                      (t.due_date && localDate(t.due_date) < today()
                        ? "overdue"
                        : "")
                    }
                  />
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {t.project_title} · {t.owner_name || "Unassigned"}
                    </small>
                  </div>
                  <Pill value={t.priority} />
                  <small>{calendarDate(t.due_date)}</small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Nothing on the task list yet"
              detail="Add project tasks to surface owners, priorities, and deadlines."
            />
          )}
        </section>
        <section className="rw-panel">
          <div className="rw-panel-head">
            <div>
              <h2>Team workload</h2>
              <p>Recorded project tasks per assignee</p>
            </div>
          </div>
          {d.workload.length ? (
            <div className="rw-chart">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.workload} layout="vertical">
                  <CartesianGrid horizontal={false} stroke="#edf0f4" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="complete"
                    name="Complete"
                    stackId="a"
                    fill="#43b5a0"
                  />
                  <Bar
                    dataKey="remaining"
                    name="Remaining"
                    stackId="a"
                    fill="#6845d6"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="A balanced team starts with a plan"
              detail="Assign project tasks to see each person’s workload."
            />
          )}
        </section>
      </div>
      <div className="rw-shortcuts">
        <div>
          <Sparkles size={22} />
          <strong>A little help goes a long way.</strong>
          <span>
            Ask Reign to summarize follow-ups or prepare a draft estimate.
          </span>
        </div>
        <button className="rw-button" onClick={() => go("assistant")}>
          Open assistant <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}
function ContactForm({ initial, close }: { initial: any; close: () => void }) {
  const { run, busy, go } = useWork();
  const [v, setV] = useState({
    name: initial.name || "",
    email: initial.email || "",
    phone: initial.phone || "",
    project: initial.vehicle || "",
    company: initial.company || "",
    address: initial.address || "",
    contactType: initial.contact_type || "lead",
    assignedTo: initial.assigned_to || null,
    nextFollowUpAt: localTime(initial.next_follow_up_at),
    message: initial.message || "",
  });
  const set = (key: string, value: any) =>
    setV((s) => ({ ...s, [key]: value }));
  return (
    <Modal
      title={initial.id ? "Edit contact" : "Add a lead or client"}
      onClose={close}
    >
      <form
        className="rw-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            () =>
              request(
                initial.id
                  ? "/api/crm/contacts/" + initial.id
                  : "/api/crm/contacts",
                { ...v, nextFollowUpAt: iso(v.nextFollowUpAt) },
                initial.id ? "PATCH" : "POST",
              ),
            "Contact saved",
          );
          if (r) {
            close();
            go("contacts", r.id);
          }
        }}
      >
        <div className="rw-form-grid">
          <Field label="Full name">
            <input
              required
              autoFocus
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Contact type">
            <select
              value={v.contactType}
              onChange={(e) => set("contactType", e.target.value)}
            >
              <option value="lead">Lead</option>
              <option value="client">Client</option>
            </select>
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={v.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Company">
            <input
              value={v.company}
              onChange={(e) => set("company", e.target.value)}
            />
          </Field>
          <Field label="Project / service interest">
            <input
              value={v.project}
              onChange={(e) => set("project", e.target.value)}
            />
          </Field>
        </div>
        <p className="rw-help">
          Add at least an email address or phone number.
        </p>
        <Field label="Property address">
          <input
            value={v.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
        <div className="rw-form-grid">
          <Field label="Assigned team member">
            <OwnerSelect
              value={v.assignedTo}
              onChange={(v) => set("assignedTo", v)}
            />
          </Field>
          <Field label="Next follow-up">
            <input
              type="datetime-local"
              value={v.nextFollowUpAt}
              onChange={(e) => set("nextFollowUpAt", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Project context">
          <textarea
            value={v.message}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
          />
        </Field>
        <div className="rw-form-actions">
          <button type="button" className="rw-button" onClick={close}>
            Cancel
          </button>
          <button
            disabled={busy || (!v.email && !v.phone)}
            className="rw-button rw-primary"
          >
            Save contact
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Contacts() {
  const { contacts, focus, setFocus, search, setSearch, setContactForm } =
    useWork();
  const [kind, setKind] = useState("all"),
    [due, setDue] = useState(false);
  const rows = contacts.filter(
    (c: any) =>
      (kind === "all" || c.contact_type === kind) &&
      (!due ||
        (c.next_follow_up_at && new Date(c.next_follow_up_at) < new Date())) &&
      [c.name, c.phone, c.email, c.vehicle, c.company]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (focus && contacts.some((c: any) => c.id === focus))
    return <ContactProfile key={focus} id={focus} back={() => setFocus(null)} />;
  return (
    <>
      <Head
        eyebrow="RELATIONSHIPS, BUILT TO LAST"
        title="Contacts"
        detail="Every enquiry, conversation, and client in one place."
      >
        <button
          className="rw-button rw-primary"
          onClick={() => setContactForm({})}
        >
          <Plus size={16} />
          Add lead or client
        </button>
      </Head>
      <div className="rw-filterbar">
        <label className="rw-inline-search">
          <Search size={16} />
          <input
            aria-label="Filter contacts"
            placeholder="Search by name, company, phone, or project"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Contact type filter"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All contacts</option>
          <option value="lead">Leads</option>
          <option value="client">Clients</option>
        </select>
        <button
          className={"rw-button " + (due ? "rw-selected" : "")}
          onClick={() => setDue(!due)}
        >
          <Clock3 size={15} />
          Follow-ups due
        </button>
        <small>{rows.length} contacts</small>
      </div>
      {contacts.length >= 2000 && (
        <p className="rw-help">Showing the most recent 2,000 contacts.</p>
      )}
      {rows.length ? (
        <div className="rw-panel rw-contact-table">
          <div className="rw-table-heading">
            <span>Contact / project</span>
            <span>Reach out</span>
            <span>Owner</span>
            <span>Next follow-up</span>
          </div>
          {rows.map((c: any) => (
            <button
              className="rw-contact-row"
              key={c.id}
              onClick={() => setFocus(c.id)}
            >
              <div className="rw-person">
                <span className="rw-avatar">{c.name.slice(0, 1)}</span>
                <div>
                  <strong>
                    {c.name} <Pill value={c.contact_type} />
                  </strong>
                  <small>
                    {c.company || c.vehicle || "Project details not added"}
                  </small>
                </div>
              </div>
              <div>
                <span>{c.email || "No email"}</span>
                <small>{c.phone || "No phone"}</small>
              </div>
              <span>{c.owner_name || "Unassigned"}</span>
              <div>
                <span
                  className={
                    c.next_follow_up_at &&
                    new Date(c.next_follow_up_at) < new Date()
                      ? "rw-overdue"
                      : ""
                  }
                >
                  {date(c.next_follow_up_at)}
                </span>
                <small>{c.utm_source || "Website / direct"}</small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search || due
              ? "No contacts match these filters"
              : "Meet your next client"
          }
          detail="Add contacts manually, receive a website enquiry, or connect a workflow in Integrations."
          action={
            <button className="rw-button" onClick={() => setContactForm({})}>
              <Plus size={16} />
              Add contact
            </button>
          }
        />
      )}
    </>
  );
}
function ContactProfile({ id, back }: { id: number; back: () => void }) {
  const { run, busy, go, setContactForm, setError, setNotice, admin } =
      useWork(),
    q = useRows("/api/crm/contacts/" + id),
    d = q.data;
  const [activity, setActivity] = useState(false),
    [url, setUrl] = useState(""),
    [v, setV] = useState({
      kind: "note",
      subject: "",
      body: "",
      outcome: "",
      nextFollowUpAt: "",
    });
  async function invite(delivery: string) {
    await run(
      async () => {
        const r = await fetch("/api/crm/contacts/" + id + "/invite", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery }),
        });
        const data = await r.json();
        if (data.url) setUrl(data.url);
        if (!r.ok) throw Error(data.message);
        return data;
      },
      delivery === "email"
        ? "Invitation accepted by the email provider."
        : "Private invitation link created. Earlier links were revoked.",
    );
  }
  if (q.isLoading) return <p>Loading contact…</p>;
  if (!d)
    return (
      <Empty
        title="Contact could not be loaded"
        action={
          <button className="rw-button" onClick={back}>
            Back to contacts
          </button>
        }
      />
    );
  const c = d.contact;
  return (
    <>
      <button className="rw-text-button" onClick={back}>
        ← All contacts
      </button>
      <Head
        eyebrow={
          c.contact_type === "client" ? "CLIENT PROFILE" : "LEAD PROFILE"
        }
        title={c.name}
        detail={c.company || c.vehicle || "A new relationship"}
      >
        <button className="rw-button" onClick={() => setContactForm(c)}>
          Edit contact
        </button>
        <button
          className="rw-button rw-primary"
          onClick={() => setActivity(true)}
        >
          <Plus size={16} />
          Log interaction
        </button>
      </Head>
      <div className="rw-profile-layout">
        <aside className="rw-panel rw-profile-details">
          <div className="rw-profile-avatar">{c.name.slice(0, 1)}</div>
          <h2>{c.name}</h2>
          <Pill value={c.contact_type} />
          <dl>
            <dt>Email</dt>
            <dd>
              {c.email ? (
                <a href={"mailto:" + encodeURIComponent(c.email)}>{c.email}</a>
              ) : (
                "Not added"
              )}
            </dd>
            <dt>Phone</dt>
            <dd>
              {c.phone ? (
                <a href={"tel:" + c.phone.replace(/[^+\d]/g, "")}>{c.phone}</a>
              ) : (
                "Not added"
              )}
            </dd>
            <dt>Property address</dt>
            <dd>{c.address || "Not added"}</dd>
            <dt>Owner</dt>
            <dd>{c.owner_name || "Unassigned"}</dd>
            <dt>Next follow-up</dt>
            <dd>{date(c.next_follow_up_at)}</dd>
            <dt>Source</dt>
            <dd>{c.utm_source || "Website / direct"}</dd>
            <dt>Created</dt>
            <dd>{date(c.created_at)}</dd>
          </dl>
          {c.message && (
            <>
              <h3>Project context</h3>
              <p className="rw-prewrap">{c.message}</p>
            </>
          )}
          <div className="rw-profile-actions">
            <button className="rw-button" onClick={() => go("proposals", id)}>
              Create estimate
            </button>
            <button
              className="rw-button"
              onClick={() => go("measurements", id)}
            >
              Measure property
            </button>
          </div>
        </aside>
        <div className="rw-stack">
          <section className="rw-panel">
            <div className="rw-panel-head">
              <div>
                <h2>Customer portal</h2>
                <p>
                  {d.portal
                    ? "Access active until " + date(d.portal.expires_at)
                    : "Invite this customer to view issued proposals and record a decision."}
                </p>
              </div>
              <Mail size={19} />
            </div>
            <div className="rw-invite-actions">
              <button
                disabled={busy}
                className="rw-button rw-primary"
                onClick={() => invite("link")}
              >
                Create private invitation
              </button>
              <button
                disabled={busy || !c.email}
                className="rw-button"
                onClick={() => invite("email")}
              >
                Email invitation
              </button>
            </div>
            <p className="rw-help">
              Links expire after 30 days. Creating another invitation revokes
              earlier links. Only issued proposals appear in the portal.
            </p>
            {url && (
              <div className="rw-share-link">
                <input
                  aria-label="Private customer portal invitation"
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="rw-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      setNotice("Invitation copied");
                    } catch {
                      setError("Select the private link and copy it manually.");
                    }
                  }}
                >
                  Copy link
                </button>
                <a
                  className="rw-text-button"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview
                </a>
              </div>
            )}
            {d.portal && admin && (
              <button
                disabled={busy}
                className="rw-text-button rw-danger"
                onClick={() => {
                  if (confirm("Revoke this customer’s portal access?"))
                    run(
                      () =>
                        request(
                          "/api/operations/portal-access/" + id,
                          undefined,
                          "DELETE",
                        ),
                      "Portal access revoked",
                    );
                }}
              >
                Revoke access
              </button>
            )}
          </section>
          <div className="rw-profile-stats">
            {[
              [d.deals.length, "Deals", "deals"],
              [d.projects.length, "Projects", "projects"],
              [d.proposals.length, "Proposals", "proposals"],
              [d.measurements.length, "Measurements", "measurements"],
            ].map(([count, title, page]: any) => (
              <button
                className="rw-panel"
                key={title}
                onClick={() => go(page, id)}
              >
                <strong>{count}</strong>
                <span>{title}</span>
              </button>
            ))}
          </div>
          <section className="rw-panel">
            <div className="rw-panel-head">
              <div>
                <h2>Contact timeline</h2>
                <p>Logged conversations, notes, and next steps</p>
              </div>
              <button
                className="rw-text-button"
                onClick={() => setActivity(true)}
              >
                Log interaction <Plus size={14} />
              </button>
            </div>
            {d.activities.length ? (
              <div className="rw-timeline">
                {d.activities.map((a: any) => (
                  <article key={a.id}>
                    <span className="rw-timeline-dot" />
                    <div>
                      <div className="rw-timeline-meta">
                        <Pill value={a.kind} />
                        <small>
                          {date(a.created_at)} ·{" "}
                          {a.author_name || "Team member"}
                        </small>
                      </div>
                      <h3>{a.subject}</h3>
                      {a.body && <p className="rw-prewrap">{a.body}</p>}
                      {a.outcome && (
                        <p>
                          <strong>Outcome: </strong>
                          {a.outcome}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="Start the conversation history"
                detail="Log calls, meetings, site visits, emails, and notes. Logging an email records activity; it does not send a message."
              />
            )}
          </section>
          {d.deals.length > 0 && (
            <section className="rw-panel">
              <div className="rw-panel-head">
                <h2>Related opportunities</h2>
              </div>
              {d.deals.map((r: any) => (
                <div className="rw-summary-row" key={r.id}>
                  <strong>{r.title}</strong>
                  <Pill value={r.stage} />
                  <span>{money(r.value_cents)}</span>
                </div>
              ))}
            </section>
          )}
          {d.proposals.length > 0 && (
            <section className="rw-panel">
              <div className="rw-panel-head">
                <h2>Estimates & proposals</h2>
                <button
                  className="rw-text-button"
                  onClick={() => go("proposals", id)}
                >
                  Open tools
                </button>
              </div>
              {d.proposals.map((p: any) => (
                <div className="rw-summary-row" key={p.id}>
                  <strong>{p.document.title}</strong>
                  <Pill value={p.status} />
                  <span>{fullMoney(p.document.totalCents)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      {activity && (
        <Modal title="Log an interaction" onClose={() => setActivity(false)}>
          <form
            className="rw-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await run(
                () =>
                  request("/api/crm/contacts/" + id + "/activities", {
                    ...v,
                    ...(v.nextFollowUpAt
                      ? { nextFollowUpAt: iso(v.nextFollowUpAt) }
                      : { nextFollowUpAt: undefined }),
                  }),
                "Interaction saved",
              );
              if (result) {
                setActivity(false);
                setV({
                  kind: "note",
                  subject: "",
                  body: "",
                  outcome: "",
                  nextFollowUpAt: "",
                });
              }
            }}
          >
            <Field label="Activity type">
              <select
                value={v.kind}
                onChange={(e) => setV({ ...v, kind: e.target.value })}
              >
                {["note", "call", "email", "meeting", "site_visit"].map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject">
              <input
                autoFocus
                required
                value={v.subject}
                onChange={(e) => setV({ ...v, subject: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                rows={4}
                value={v.body}
                onChange={(e) => setV({ ...v, body: e.target.value })}
              />
            </Field>
            <Field label="Outcome / next step">
              <input
                value={v.outcome}
                onChange={(e) => setV({ ...v, outcome: e.target.value })}
              />
            </Field>
            <Field label="Set next follow-up">
              <input
                type="datetime-local"
                value={v.nextFollowUpAt}
                onChange={(e) => setV({ ...v, nextFollowUpAt: e.target.value })}
              />
            </Field>
            <p className="rw-help">
              This logs the interaction. It does not send an email or place a
              call.
            </p>
            <button disabled={busy} className="rw-button rw-primary">
              Save interaction
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function dealPayload(d: any) {
  return {
    leadId: d.lead_id,
    title: d.title,
    stage: d.stage,
    valueCents: Number(d.value_cents),
    assignedTo: d.assigned_to,
    expectedClose: localDate(d.expected_close) || null,
    notes: d.notes || "",
  };
}
function Deals() {
  const { focus, setFocus, run, busy } = useWork(),
    q = useRows("/api/crm/deals"),
    [editing, setEditing] = useState<any>(null),
    [view, setView] = useState("board"),
    [all, setAll] = useState(false);
  const rows = (q.data || []).filter(
    (d: any) => !focus || all || d.lead_id === focus,
  );
  return (
    <>
      <Head
        eyebrow="TURN OPPORTUNITY INTO WORK"
        title="Deal pipeline"
        detail="Track every opportunity from the first enquiry to a signed scope."
      >
        <button className="rw-button rw-primary" onClick={() => setEditing({})}>
          <Plus size={16} />
          Add deal
        </button>
      </Head>
      <div className="rw-filterbar">
        <button
          className={"rw-button " + (view === "board" ? "rw-selected" : "")}
          onClick={() => setView("board")}
        >
          Board
        </button>
        <button
          className={"rw-button " + (view === "list" ? "rw-selected" : "")}
          onClick={() => setView("list")}
        >
          List
        </button>
        {focus && !all && (
          <button className="rw-text-button" onClick={() => setAll(true)}>
            Showing selected contact · Show all
          </button>
        )}
        <small>{rows.length} opportunities</small>
      </div>
      {q.isError ? (
        <Empty
          title="Could not load deals"
          action={
            <button onClick={() => q.refetch()} className="rw-button">
              Retry
            </button>
          }
        />
      ) : view === "board" ? (
        <div className="rw-board">
          {stages.map((stage, i) => {
            const deals = rows.filter((r: any) => r.stage === stage);
            return (
              <section key={stage} className="rw-board-column">
                <div className="rw-column-head">
                  <i style={{ background: palette[i] }} />
                  <strong>{label(stage)}</strong>
                  <span>{deals.length}</span>
                  <small>
                    {money(
                      deals.reduce(
                        (n: number, r: any) => n + Number(r.value_cents),
                        0,
                      ),
                    )}
                  </small>
                </div>
                {deals.map((d: any) => (
                  <article className="rw-deal-card" key={d.id}>
                    <button
                      className="rw-card-title"
                      onClick={() => setEditing(d)}
                    >
                      {d.title}
                    </button>
                    <p>{d.contact_name}</p>
                    <strong>{fullMoney(d.value_cents)}</strong>
                    <small>
                      {d.owner_name || "Unassigned"} ·{" "}
                      {calendarDate(d.expected_close)}
                    </small>
                    <select
                      aria-label={"Stage for " + d.title}
                      disabled={busy}
                      value={d.stage}
                      onChange={(e) =>
                        run(
                          () =>
                            request(
                              "/api/crm/deals/" + d.id,
                              {
                                version: d.version,
                                data: {
                                  ...dealPayload(d),
                                  stage: e.target.value,
                                },
                              },
                              "PATCH",
                            ),
                          "Deal stage updated",
                        )
                      }
                    >
                      {stages.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
                {!deals.length && (
                  <p className="rw-column-empty">No opportunities here</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rw-panel">
          {rows.length ? (
            rows.map((d: any) => (
              <button
                className="rw-list-row"
                key={d.id}
                onClick={() => setEditing(d)}
              >
                <div>
                  <strong>{d.title}</strong>
                  <small>
                    {d.contact_name} · {d.owner_name || "Unassigned"}
                  </small>
                </div>
                <Pill value={d.stage} />
                <strong>{money(d.value_cents)}</strong>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="No opportunities yet"
              action={
                <button className="rw-button" onClick={() => setEditing({})}>
                  Add your first deal
                </button>
              }
            />
          )}
        </div>
      )}
      {editing && <DealForm initial={editing} close={() => setEditing(null)} />}
    </>
  );
}
function DealForm({ initial, close }: { initial: any; close: () => void }) {
  const { focus, run, busy } = useWork();
  const [v, setV] = useState({
    leadId: initial.lead_id || focus || "",
    title: initial.title || "",
    stage: initial.stage || "new",
    value: String(Number(initial.value_cents || 0) / 100),
    assignedTo: initial.assigned_to || null,
    expectedClose: localDate(initial.expected_close),
    notes: initial.notes || "",
  });
  return (
    <Modal
      title={initial.id ? "Edit opportunity" : "Add opportunity"}
      onClose={close}
    >
      <form
        className="rw-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const { value, ...rest } = v,
            data = {
              ...rest,
              leadId: Number(v.leadId),
              valueCents: Math.round(Number(value) * 100),
              expectedClose: v.expectedClose || null,
            };
          const r = await run(
            () =>
              request(
                initial.id ? "/api/crm/deals/" + initial.id : "/api/crm/deals",
                initial.id ? { version: initial.version, data } : data,
                initial.id ? "PATCH" : "POST",
              ),
            "Opportunity saved",
          );
          if (r) close();
        }}
      >
        <Field label="Contact">
          <ContactSelect
            value={v.leadId}
            onChange={(leadId) => setV({ ...v, leadId })}
          />
        </Field>
        <Field label="Opportunity name">
          <input
            autoFocus
            required
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </Field>
        <div className="rw-form-grid">
          <Field label="Stage">
            <select
              value={v.stage}
              onChange={(e) => setV({ ...v, stage: e.target.value })}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opportunity value ($)">
            <input
              type="number"
              min="0"
              step=".01"
              required
              value={v.value}
              onChange={(e) => setV({ ...v, value: e.target.value })}
            />
          </Field>
          <Field label="Owner">
            <OwnerSelect
              value={v.assignedTo}
              onChange={(assignedTo) => setV({ ...v, assignedTo })}
            />
          </Field>
          <Field label="Expected close">
            <input
              type="date"
              value={v.expectedClose}
              onChange={(e) => setV({ ...v, expectedClose: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Scope / next steps">
          <textarea
            rows={4}
            value={v.notes}
            onChange={(e) => setV({ ...v, notes: e.target.value })}
          />
        </Field>
        <button disabled={busy} className="rw-button rw-primary">
          Save opportunity
        </button>
      </form>
    </Modal>
  );
}
function projectPayload(p: any) {
  return {
    leadId: p.lead_id,
    title: p.title,
    stage: p.stage,
    budgetCents: p.budget_cents === null ? null : Number(p.budget_cents),
    spentCents: p.spent_cents === null ? null : Number(p.spent_cents),
    startDate: localDate(p.start_date) || null,
    dueDate: localDate(p.due_date) || null,
    assignedTo: p.assigned_to,
    notes: p.notes || "",
  };
}
function Projects() {
  const { focus, run, busy } = useWork(),
    q = useRows("/api/crm/projects"),
    [editing, setEditing] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [all, setAll] = useState(false);
  const rows = (q.data || []).filter(
    (p: any) => !focus || all || p.lead_id === focus,
  );
  return (
    <>
      <Head
        eyebrow="FROM SCOPE TO HANDOVER"
        title="Projects & tasks"
        detail="Keep the work, team, budget, and next milestone connected."
      >
        <button className="rw-button rw-primary" onClick={() => setEditing({})}>
          <Plus size={16} />
          Add project
        </button>
      </Head>
      {focus && !all && (
        <button className="rw-text-button" onClick={() => setAll(true)}>
          Showing selected contact · Show all
        </button>
      )}
      {q.isError ? (
        <Empty
          title="Could not load projects"
          action={
            <button className="rw-button" onClick={() => q.refetch()}>
              Retry
            </button>
          }
        />
      ) : rows.length ? (
        <div className="rw-project-cards">
          {rows.map((p: any) => (
            <article className="rw-panel rw-project-card" key={p.id}>
              <div>
                <Pill value={p.stage} />
                <button
                  className="rw-text-button"
                  onClick={() => setEditing(p)}
                >
                  Edit
                </button>
              </div>
              <h2>{p.title}</h2>
              <p>{p.contact_name}</p>
              <div className="rw-progress-label">
                <strong>
                  {p.task_count
                    ? Math.round((p.complete_tasks / p.task_count) * 100) + "%"
                    : "No task plan"}
                </strong>
                <small>
                  {p.complete_tasks || 0}/{p.task_count || 0} tasks complete
                </small>
              </div>
              <div className="rw-progress">
                <i
                  style={{
                    width:
                      (p.task_count
                        ? (p.complete_tasks / p.task_count) * 100
                        : 0) + "%",
                  }}
                />
              </div>
              <dl className="rw-project-facts">
                <div>
                  <dt>Budget</dt>
                  <dd>
                    {p.budget_cents === null
                      ? "Not entered"
                      : money(p.budget_cents)}
                  </dd>
                </div>
                <div>
                  <dt>Recorded spend</dt>
                  <dd>
                    {p.spent_cents === null
                      ? "Not entered"
                      : money(p.spent_cents)}
                  </dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{p.owner_name || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{calendarDate(p.due_date)}</dd>
                </div>
              </dl>
              <button className="rw-button" onClick={() => setSelected(p)}>
                Open project tasks <ChevronRight size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Build a plan that’s easy to follow"
          detail="Add a project, enter a real budget, and give every task an owner."
          action={
            <button className="rw-button" onClick={() => setEditing({})}>
              <Plus size={16} />
              Add project
            </button>
          }
        />
      )}
      {editing && (
        <ProjectForm initial={editing} close={() => setEditing(null)} />
      )}
      {selected && (
        <ProjectTasks project={selected} close={() => setSelected(null)} />
      )}
    </>
  );
}
function ProjectForm({ initial, close }: { initial: any; close: () => void }) {
  const { focus, run, busy } = useWork();
  const [v, setV] = useState({
    leadId: initial.lead_id || focus || "",
    title: initial.title || "",
    stage: initial.stage || "planning",
    budget:
      initial.budget_cents == null
        ? ""
        : String(Number(initial.budget_cents) / 100),
    spent:
      initial.spent_cents == null
        ? ""
        : String(Number(initial.spent_cents) / 100),
    startDate: localDate(initial.start_date),
    dueDate: localDate(initial.due_date),
    assignedTo: initial.assigned_to || null,
    notes: initial.notes || "",
  });
  return (
    <Modal title={initial.id ? "Edit project" : "Add project"} onClose={close}>
      <form
        className="rw-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const { budget, spent, ...rest } = v,
            data = {
              ...rest,
              leadId: Number(v.leadId),
              budgetCents:
                budget === "" ? null : Math.round(Number(budget) * 100),
              spentCents: spent === "" ? null : Math.round(Number(spent) * 100),
              startDate: v.startDate || null,
              dueDate: v.dueDate || null,
            };
          const r = await run(
            () =>
              request(
                initial.id
                  ? "/api/crm/projects/" + initial.id
                  : "/api/crm/projects",
                initial.id ? { version: initial.version, data } : data,
                initial.id ? "PATCH" : "POST",
              ),
            "Project saved",
          );
          if (r) close();
        }}
      >
        <Field label="Client / contact">
          <ContactSelect
            value={v.leadId}
            onChange={(leadId) => setV({ ...v, leadId })}
          />
        </Field>
        <Field label="Project name">
          <input
            required
            autoFocus
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </Field>
        <div className="rw-form-grid">
          <Field label="Stage">
            <select
              value={v.stage}
              onChange={(e) => setV({ ...v, stage: e.target.value })}
            >
              {["planning", "in_progress", "on_hold", "complete"].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <OwnerSelect
              value={v.assignedTo}
              onChange={(assignedTo) => setV({ ...v, assignedTo })}
            />
          </Field>
          <Field label="Approved budget ($)">
            <input
              type="number"
              min="0"
              step=".01"
              placeholder="Not entered"
              value={v.budget}
              onChange={(e) => setV({ ...v, budget: e.target.value })}
            />
          </Field>
          <Field label="Recorded spend ($)">
            <input
              type="number"
              min="0"
              step=".01"
              placeholder="Not entered"
              value={v.spent}
              onChange={(e) => setV({ ...v, spent: e.target.value })}
            />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              value={v.startDate}
              onChange={(e) => setV({ ...v, startDate: e.target.value })}
            />
          </Field>
          <Field label="Target completion">
            <input
              type="date"
              min={v.startDate || undefined}
              value={v.dueDate}
              onChange={(e) => setV({ ...v, dueDate: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Scope & notes">
          <textarea
            rows={4}
            value={v.notes}
            onChange={(e) => setV({ ...v, notes: e.target.value })}
          />
        </Field>
        <button disabled={busy} className="rw-button rw-primary">
          Save project
        </button>
      </form>
    </Modal>
  );
}
function ProjectTasks({ project, close }: { project: any; close: () => void }) {
  const { run, busy } = useWork(),
    q = useRows("/api/crm/projects/" + project.id + "/tasks"),
    [adding, setAdding] = useState(false),
    [v, setV] = useState({
      title: "",
      priority: "medium",
      assignedTo: null as number | null,
      dueDate: "",
    }),
    rows = q.data || [];
  return (
    <Modal wide title={project.title + " · Tasks"} onClose={close}>
      <div className="rw-stack">
        <div className="rw-split">
          <p>
            {rows.filter((t: any) => t.status === "complete").length}/
            {rows.length} recorded tasks complete
          </p>
          <button
            className="rw-button rw-primary"
            onClick={() => setAdding(!adding)}
          >
            <Plus size={15} />
            Add task
          </button>
        </div>
        {adding && (
          <form
            className="rw-form rw-inset"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(
                () =>
                  request("/api/crm/projects/" + project.id + "/tasks", {
                    ...v,
                    dueDate: v.dueDate || null,
                  }),
                "Task added",
              );
              if (r) {
                setAdding(false);
                setV({
                  title: "",
                  priority: "medium",
                  assignedTo: null,
                  dueDate: "",
                });
              }
            }}
          >
            <Field label="Task name">
              <input
                autoFocus
                required
                value={v.title}
                onChange={(e) => setV({ ...v, title: e.target.value })}
              />
            </Field>
            <div className="rw-form-grid">
              <Field label="Assigned to">
                <OwnerSelect
                  value={v.assignedTo}
                  onChange={(assignedTo) => setV({ ...v, assignedTo })}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={v.dueDate}
                  onChange={(e) => setV({ ...v, dueDate: e.target.value })}
                />
              </Field>
              <Field label="Priority">
                <select
                  value={v.priority}
                  onChange={(e) => setV({ ...v, priority: e.target.value })}
                >
                  {["low", "medium", "high"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button disabled={busy} className="rw-button rw-primary">
              Save task
            </button>
          </form>
        )}
        {q.isError ? (
          <p role="alert">Tasks could not be loaded.</p>
        ) : rows.length ? (
          <div className="rw-task-list">
            {rows.map((t: any) => (
              <div key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <small>
                    {t.owner_name || "Unassigned"} · {calendarDate(t.due_date)}
                  </small>
                </div>
                <Pill value={t.priority} />
                <select
                  aria-label={"Status for " + t.title}
                  disabled={busy}
                  value={t.status}
                  onChange={(e) =>
                    run(
                      () =>
                        request(
                          "/api/crm/tasks/" + t.id,
                          {
                            version: t.version,
                            data: {
                              title: t.title,
                              priority: t.priority,
                              assignedTo: t.assigned_to,
                              dueDate: localDate(t.due_date) || null,
                              status: e.target.value,
                            },
                          },
                          "PATCH",
                        ),
                      "Task updated",
                    )
                  }
                >
                  {["pending", "in_progress", "complete"].map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Give this project a clear next step"
            detail="Add the tasks that define real progress."
          />
        )}
      </div>
    </Modal>
  );
}

function Proposals() {
  const { focus, contacts, admin, run, busy, go } = useWork(),
    q = useRows("/api/operations/proposals"),
    ctx = useRows("/api/operations/context"),
    measure = useRows("/api/operations/measurements");
  const [editing, setEditing] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [all, setAll] = useState(false),
    [status, setStatus] = useState("all");
  const rows = (q.data || []).filter(
    (p: any) =>
      (!focus || all || p.lead_id === focus) &&
      (status === "all" || p.status === status),
  );
  return (
    <>
      <Head
        eyebrow="CLEAR SCOPE. CONFIDENT PRICING."
        title="Estimates & proposals"
        detail="Build a draft from approved rates, review the scope, then issue it to the customer portal."
      >
        <button className="rw-button rw-primary" onClick={() => setEditing({})}>
          <Plus size={16} />
          Create estimate
        </button>
      </Head>
      <div className="rw-filterbar">
        <select
          aria-label="Proposal status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["all", "draft", "issued", "accepted", "declined", "withdrawn"].map(
            (s) => (
              <option key={s} value={s}>
                {s === "all" ? "All proposals" : label(s)}
              </option>
            ),
          )}
        </select>
        {focus && !all && (
          <button className="rw-text-button" onClick={() => setAll(true)}>
            Showing selected contact · Show all
          </button>
        )}
        <small>{rows.length} documents</small>
      </div>
      {ctx.data && !ctx.data.rates.length && (
        <div className="rw-attention">
          <Ruler size={20} />
          <span>
            <strong>Set your approved service rates first.</strong>
            <small>
              {admin
                ? "Open Measurements → Service pricing to add the rates your estimates will use."
                : "Ask an administrator to approve service pricing before preparing estimates."}
            </small>
          </span>
          <button className="rw-button" onClick={() => go("measurements")}>
            View pricing
          </button>
        </div>
      )}
      {q.isError ? (
        <Empty
          title="Proposals could not be loaded"
          action={
            <button onClick={() => q.refetch()} className="rw-button">
              Retry
            </button>
          }
        />
      ) : rows.length ? (
        <div className="rw-panel">
          {rows.map((p: any) => (
            <article className="rw-proposal-row" key={p.id}>
              <span className="rw-document-icon">
                <FileText size={24} />
              </span>
              <div>
                <h3>{p.document.title}</h3>
                <small>
                  {contacts.find((c: any) => c.id === p.lead_id)?.name ||
                    "Contact #" + p.lead_id}{" "}
                  · #{p.id} · Version {p.version}
                </small>
              </div>
              <Pill value={p.status} />
              <strong>{fullMoney(p.document.totalCents)}</strong>
              <div className="rw-row-actions">
                <button className="rw-button" onClick={() => setPreview(p)}>
                  View
                </button>
                {p.status === "draft" && (
                  <button className="rw-button" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                )}
                {p.status === "draft" && admin && (
                  <button
                    disabled={busy}
                    className="rw-button rw-primary"
                    onClick={() => {
                      if (
                        confirm(
                          "Issue this reviewed proposal to the customer portal?",
                        )
                      )
                        run(
                          () =>
                            request(
                              "/api/operations/proposals/" + p.id + "/issue",
                              { version: p.version },
                            ),
                          "Proposal issued to the customer portal",
                        );
                    }}
                  >
                    Issue proposal
                  </button>
                )}
                {p.status === "issued" && admin && (
                  <button
                    disabled={busy}
                    className="rw-text-button rw-danger"
                    onClick={() => {
                      if (confirm("Withdraw this proposal?"))
                        run(
                          () =>
                            request(
                              "/api/operations/proposals/" + p.id + "/withdraw",
                              { version: p.version },
                            ),
                          "Proposal withdrawn",
                        );
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Your next winning proposal starts here"
          detail="Use approved pricing and verified measurements. Drafts stay private until an administrator issues them."
          action={
            <button className="rw-button" onClick={() => setEditing({})}>
              <Plus size={16} />
              Create estimate
            </button>
          }
        />
      )}
      {editing && (
        <ProposalForm
          initial={editing}
          context={ctx.data}
          measurements={measure.data || []}
          close={() => setEditing(null)}
        />
      )}
      {preview && (
        <Modal wide title="Proposal preview" onClose={() => setPreview(null)}>
          <div className="proposal-print">
            <div className="rw-proposal-brand">
              <strong>REIGN SERVICES</strong>
              <Pill value={preview.status} />
            </div>
            <h2>{preview.document.title}</h2>
            <p>
              Prepared for{" "}
              {contacts.find((c: any) => c.id === preview.lead_id)?.name ||
                "Customer"}{" "}
              · Proposal #{preview.id}
            </p>
            <h3>Scope of work</h3>
            <p className="rw-prewrap">{preview.document.scope}</p>
            <div className="rw-proposal-lines">
              {preview.document.lines.map((l: any, i: number) => (
                <div key={i}>
                  <span>
                    <strong>{l.title}</strong>
                    <small>
                      {l.quantity} {l.unit} × {fullMoney(l.unitPriceCents)}
                      {l.measurementId
                        ? " · Measurement #" + l.measurementId
                        : ""}
                    </small>
                  </span>
                  <strong>{fullMoney(l.totalCents)}</strong>
                </div>
              ))}
            </div>
            <div className="rw-proposal-totals">
              <p>
                Subtotal{" "}
                <strong>{fullMoney(preview.document.subtotalCents)}</strong>
              </p>
              <p>
                Tax ({preview.document.taxBasisPoints / 100}%){" "}
                <strong>{fullMoney(preview.document.taxCents)}</strong>
              </p>
              <h3>
                Total <strong>{fullMoney(preview.document.totalCents)}</strong>
              </h3>
            </div>
            {preview.status === "draft" && (
              <p className="rw-help">
                Draft estimate · Not issued to the customer.
              </p>
            )}
          </div>
          <div className="rw-form-actions">
            <button className="rw-button" onClick={() => window.print()}>
              Print / save PDF
            </button>
            <button
              className="rw-button rw-primary"
              onClick={() => {
                setPreview(null);
                go("contacts", preview.lead_id);
              }}
            >
              Customer & portal
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ProposalForm({
  initial,
  context,
  measurements,
  close,
}: {
  initial: any;
  context: any;
  measurements: any[];
  close: () => void;
}) {
  const { focus, run, busy } = useWork();
  const doc = initial.document;
  const [v, setV] = useState({
    leadId: initial.lead_id || focus || "",
    title: doc?.title || "",
    scope: doc?.scope || "",
    tax: String((doc?.taxBasisPoints || 0) / 100),
  });
  const [lines, setLines] = useState<any[]>(
    doc
      ? doc.lines.map((l: any) => ({
          serviceId: String(l.serviceId),
          quantity: String(l.quantity),
          measurementId: l.measurementId ? String(l.measurementId) : "",
        }))
      : [{ serviceId: "", quantity: "1", measurementId: "" }],
  );
  const change = (i: number, patch: any) =>
    setLines((s) => s.map((l, n) => (i === n ? { ...l, ...patch } : l)));
  const subtotal = lines.reduce((n, l) => {
    const rate = context?.rates.find(
      (r: any) => r.serviceId === Number(l.serviceId),
    );
    return (
      n +
      (rate
        ? Math.max(
            rate.minimumCents,
            Math.round(Number(l.quantity || 0) * rate.unitPriceCents),
          )
        : 0)
    );
  }, 0);
  return (
    <Modal
      wide
      title={initial.id ? "Edit draft estimate" : "Create estimate"}
      onClose={close}
    >
      <form
        className="rw-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = {
            leadId: Number(v.leadId),
            title: v.title,
            scope: v.scope,
            taxBasisPoints: Math.round(Number(v.tax) * 100),
            lines: lines.map((l) => ({
              serviceId: Number(l.serviceId),
              quantity: Number(l.quantity),
              ...(l.measurementId
                ? { measurementId: Number(l.measurementId) }
                : {}),
            })),
          };
          const body = initial.id
            ? {
                type: "proposal.update",
                id: initial.id,
                version: initial.version,
                data,
              }
            : { type: "proposal.create", data };
          const r = await run(
            () => request("/api/operations/actions", body),
            "Draft estimate saved. Review before issuing.",
          );
          if (r) close();
        }}
      >
        <Field label="Customer">
          <ContactSelect
            value={v.leadId}
            onChange={(leadId) => {
              setV({ ...v, leadId });
              setLines((s) => s.map((l) => ({ ...l, measurementId: "" })));
            }}
          />
        </Field>
        <Field label="Estimate title">
          <input
            autoFocus
            required
            value={v.title}
            maxLength={200}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </Field>
        <Field label="Scope of work & terms">
          <textarea
            required
            rows={5}
            maxLength={8000}
            value={v.scope}
            onChange={(e) => setV({ ...v, scope: e.target.value })}
          />
        </Field>
        <div className="rw-split">
          <h3>Service line items</h3>
          <button
            type="button"
            className="rw-text-button"
            disabled={lines.length >= 30}
            onClick={() =>
              setLines([
                ...lines,
                { serviceId: "", quantity: "1", measurementId: "" },
              ])
            }
          >
            <Plus size={14} />
            Add line
          </button>
        </div>
        {lines.map((l, i) => {
          const rate = context?.rates.find(
            (r: any) => r.serviceId === Number(l.serviceId),
          );
          return (
            <div key={i} className="rw-inset rw-form">
              <div className="rw-form-grid">
                <Field label={"Service " + (i + 1)}>
                  <select
                    required
                    value={l.serviceId}
                    onChange={(e) =>
                      change(i, {
                        serviceId: e.target.value,
                        measurementId: "",
                      })
                    }
                  >
                    <option value="">Choose an approved service</option>
                    {context?.services
                      .filter(
                        (s: any) =>
                          s.isActive &&
                          context.rates.some((r: any) => r.serviceId === s.id),
                      )
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label={
                    "Quantity " + (i + 1) + (rate ? " (" + rate.unit + ")" : "")
                  }
                >
                  <input
                    type="number"
                    min=".01"
                    max="1000000"
                    step="any"
                    required
                    value={l.quantity}
                    onChange={(e) =>
                      change(i, { quantity: e.target.value, measurementId: "" })
                    }
                  />
                </Field>
              </div>
              <Field label={"Verified measurement " + (i + 1)}>
                <select
                  value={l.measurementId}
                  onChange={(e) => {
                    const m = measurements.find(
                      (m) => m.id === Number(e.target.value),
                    );
                    change(i, {
                      measurementId: e.target.value,
                      ...(m && rate
                        ? {
                            quantity: String(
                              rate.unit === "sq ft"
                                ? m.area_sq_ft
                                : rate.unit === "linear ft"
                                  ? m.perimeter_ft
                                  : 1,
                            ),
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="">Use entered quantity</option>
                  {measurements
                    .filter(
                      (m) =>
                        m.verified &&
                        m.lead_id === Number(v.leadId) &&
                        ["sq ft", "linear ft"].includes(rate?.unit),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} · {m.label} · {m.area_sq_ft} sq ft /{" "}
                        {m.perimeter_ft} ft
                      </option>
                    ))}
                </select>
              </Field>
              <div className="rw-split">
                <p className="rw-help">
                  {rate
                    ? fullMoney(rate.unitPriceCents) +
                      " / " +
                      rate.unit +
                      " · Minimum " +
                      fullMoney(rate.minimumCents)
                    : "Select a service with approved pricing."}
                </p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="rw-text-button rw-danger"
                    onClick={() => setLines(lines.filter((_, n) => n !== i))}
                  >
                    Remove line
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className="rw-form-grid">
          <Field label="Applicable tax (%)">
            <input
              type="number"
              min="0"
              max="30"
              step=".01"
              required
              value={v.tax}
              onChange={(e) => setV({ ...v, tax: e.target.value })}
            />
          </Field>
          <div className="rw-estimate-total">
            <small>Estimated total · USD</small>
            <strong>
              {fullMoney(
                subtotal + Math.round((subtotal * Number(v.tax)) / 100),
              )}
            </strong>
          </div>
        </div>
        <p className="rw-help">
          The server validates rates, quantities, verified boundaries, and the
          final total. Existing issued proposals keep their frozen pricing.
        </p>
        <button
          disabled={busy || !context?.rates.length}
          className="rw-button rw-primary"
        >
          Save draft estimate
        </button>
      </form>
    </Modal>
  );
}
function Measurements() {
  const { focus, setFocus, run, busy, admin } = useWork(),
    ctx = useRows("/api/operations/context"),
    q = useRows("/api/operations/measurements"),
    [mode, setMode] = useState("aerial"),
    [v, setV] = useState({
      label: "Project boundary",
      length: "",
      width: "",
      points: "",
      source: "",
    }),
    [rate, setRate] = useState({
      serviceId: "",
      price: "",
      minimum: "0",
      unit: "sq ft",
    });
  const rows = (q.data || []).filter((m: any) => !focus || m.lead_id === focus);
  return (
    <>
      <Head
        eyebrow="MEASURE WITH CONFIDENCE"
        title="Measurements & pricing"
        detail="Review aerial site studies, calculate a supplied boundary, and turn verified quantities into estimates."
      />
      <div className="rw-filterbar">
        {[
          ["aerial", "Aerial & AI markup"],
          ["boundary", "Boundary calculator"],
          ["saved", "Saved measurements"],
          ["rates", "Service pricing"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={"rw-button " + (mode === key ? "rw-selected" : "")}
            onClick={() => setMode(key)}
          >
            {title}
          </button>
        ))}
      </div>
      {mode !== "rates" && (
        <section className="rw-panel rw-customer-picker">
          <Field label="Customer / property">
            <ContactSelect value={focus} onChange={setFocus} />
          </Field>
          {focus && (
            <button className="rw-text-button" onClick={() => setFocus(null)}>
              Clear customer
            </button>
          )}
        </section>
      )}
      {mode === "aerial" && (
        <div className="rw-site-tools">
          <SitePlans leadId={focus ? String(focus) : ""} />
        </div>
      )}
      {mode === "boundary" && (
        <section className="rw-panel rw-narrow">
          <div className="rw-panel-head">
            <div>
              <h2>Calculate a boundary</h2>
              <p>Use field dimensions, a survey, or a scaled drawing.</p>
            </div>
          </div>
          <form
            className="rw-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run(() => {
                const points = v.points.trim()
                  ? JSON.parse(v.points)
                  : [
                      [0, 0],
                      [Number(v.length), 0],
                      [Number(v.length), Number(v.width)],
                      [0, Number(v.width)],
                    ];
                return request("/api/operations/measurements", {
                  leadId: Number(focus),
                  label: v.label,
                  points,
                  source: v.source,
                });
              }, "Measurement saved. Verify it before quoting.");
              if (r) setMode("saved");
            }}
          >
            <Field label="Measurement name">
              <input
                required
                value={v.label}
                onChange={(e) => setV({ ...v, label: e.target.value })}
              />
            </Field>
            <div className="rw-form-grid">
              <Field label="Length (feet)">
                <input
                  type="number"
                  step="any"
                  min=".01"
                  value={v.length}
                  onChange={(e) => setV({ ...v, length: e.target.value })}
                />
              </Field>
              <Field label="Width (feet)">
                <input
                  type="number"
                  step="any"
                  min=".01"
                  value={v.width}
                  onChange={(e) => setV({ ...v, width: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Or polygon coordinates in feet">
              <textarea
                placeholder="[[0,0],[30,0],[30,20],[0,20]]"
                value={v.points}
                onChange={(e) => setV({ ...v, points: e.target.value })}
              />
            </Field>
            <Field label="Source / field reference">
              <input
                required
                value={v.source}
                onChange={(e) => setV({ ...v, source: e.target.value })}
              />
            </Field>
            <button
              disabled={
                busy || !focus || (!v.points && (!v.length || !v.width))
              }
              className="rw-button rw-primary"
            >
              Calculate & save
            </button>
          </form>
        </section>
      )}
      {mode === "saved" && (
        <section className="rw-panel">
          {q.isError ? (
            <p role="alert">Measurements could not be loaded.</p>
          ) : rows.length ? (
            rows.map((m: any) => (
              <div className="rw-list-row" key={m.id}>
                <div>
                  <strong>
                    {m.label} · #{m.id}
                  </strong>
                  <small>{m.source}</small>
                </div>
                <div>
                  <strong>{m.area_sq_ft} sq ft</strong>
                  <small>{m.perimeter_ft} linear ft</small>
                </div>
                <Pill value={m.verified ? "verified" : "needs_review"} />
                {!m.verified && (
                  <button
                    disabled={busy}
                    className="rw-button"
                    onClick={() => {
                      if (
                        confirm(
                          "I have checked this boundary and its source for estimating.",
                        )
                      )
                        run(
                          () =>
                            request(
                              "/api/operations/measurements/" +
                                m.id +
                                "/verify",
                              {},
                            ),
                          "Measurement verified",
                        );
                    }}
                  >
                    Verify
                  </button>
                )}
              </div>
            ))
          ) : (
            <Empty
              title="No saved measurements yet"
              detail="Calculate a field boundary or review an aerial site study first."
            />
          )}
        </section>
      )}
      {mode === "rates" && (
        <div className="rw-grid rw-grid-two">
          <section className="rw-panel">
            <div className="rw-panel-head">
              <div>
                <h2>Approved rates</h2>
                <p>
                  Applied to new estimates; issued proposals remain unchanged.
                </p>
              </div>
            </div>
            {ctx.data?.rates.length ? (
              ctx.data.rates.map((r: any) => (
                <div className="rw-summary-row" key={r.serviceId}>
                  <strong>
                    {ctx.data.services.find((s: any) => s.id === r.serviceId)
                      ?.title || "Archived service"}
                  </strong>
                  <span>
                    {fullMoney(r.unitPriceCents)} / {r.unit}
                  </span>
                  <small>Minimum {fullMoney(r.minimumCents)}</small>
                </div>
              ))
            ) : (
              <Empty
                title="No service pricing approved yet"
                detail={
                  admin
                    ? "Add a rate to begin building estimates."
                    : "An administrator can add approved service pricing."
                }
              />
            )}
          </section>
          {admin && (
            <section className="rw-panel">
              <div className="rw-panel-head">
                <h2>Set an approved service rate</h2>
              </div>
              <form
                className="rw-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () =>
                      request("/api/operations/actions", {
                        type: "rates.set",
                        rates: [
                          ...(ctx.data?.rates || []).filter(
                            (r: any) => r.serviceId !== Number(rate.serviceId),
                          ),
                          {
                            serviceId: Number(rate.serviceId),
                            unit: rate.unit,
                            unitPriceCents: Math.round(
                              Number(rate.price) * 100,
                            ),
                            minimumCents: Math.round(
                              Number(rate.minimum) * 100,
                            ),
                          },
                        ],
                      }),
                    "Approved pricing saved",
                  );
                }}
              >
                <Field label="Service">
                  <select
                    required
                    value={rate.serviceId}
                    onChange={(e) => {
                      const r = ctx.data?.rates.find(
                        (r: any) => r.serviceId === Number(e.target.value),
                      );
                      setRate({
                        serviceId: e.target.value,
                        price: r ? String(r.unitPriceCents / 100) : "",
                        minimum: r ? String(r.minimumCents / 100) : "0",
                        unit: r?.unit || "sq ft",
                      });
                    }}
                  >
                    <option value="">Choose a service</option>
                    {ctx.data?.services
                      .filter((s: any) => s.isActive)
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Pricing unit">
                  <select
                    value={rate.unit}
                    onChange={(e) => setRate({ ...rate, unit: e.target.value })}
                  >
                    {["sq ft", "linear ft", "job", "each"].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Unit price ($)">
                  <input
                    required
                    type="number"
                    step=".01"
                    min=".01"
                    value={rate.price}
                    onChange={(e) =>
                      setRate({ ...rate, price: e.target.value })
                    }
                  />
                </Field>
                <Field label="Minimum charge ($)">
                  <input
                    required
                    type="number"
                    step=".01"
                    min="0"
                    value={rate.minimum}
                    onChange={(e) =>
                      setRate({ ...rate, minimum: e.target.value })
                    }
                  />
                </Field>
                <button disabled={busy} className="rw-button rw-primary">
                  Save approved rate
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </>
  );
}
function Assistant() {
  const { user, admin } = useWork();
  return (
    <>
      <Head
        eyebrow="YOUR NATIVE OPERATIONS ASSISTANT"
        title="Ask Reign"
        detail="Grounded in your current services, approved pricing, contacts, deals, and project tasks."
      />
      <div className="rw-assistant-layout">
        <section className="rw-panel rw-assistant">
          <div className="rw-assistant-intro">
            <span>
              <Sparkles size={26} />
            </span>
            <h2>Less admin. More progress.</h2>
            <p>
              Ask a question, understand what needs attention, or prepare a
              draft proposal. You review changes before anything is applied.
            </p>
          </div>
          <AgentConversation staff canManage={admin} />
        </section>
        <aside className="rw-stack">
          <section className="rw-panel rw-assistant-guide">
            <h3>A useful place to start</h3>
            <p>“Which contacts need a follow-up?”</p>
            <p>“Summarize our open opportunities and project deadlines.”</p>
            <p>
              “Prepare a draft estimate for this customer using our approved
              rates.”
            </p>
          </section>
          <section className="rw-panel rw-assistant-guide">
            <h3>You stay in control</h3>
            <p>
              {admin
                ? "Review CMS, pricing, measurement, and draft-proposal actions before confirming."
                : "Employees can prepare draft proposals and measurements. Pricing and CMS changes require an administrator."}
            </p>
            <p>
              Issuing a customer proposal stays an explicit administrator
              action.
            </p>
            <small>
              Free-model availability can vary. A provider error never means an
              action completed.
            </small>
          </section>
        </aside>
      </div>
    </>
  );
}
function IntegrationSetup() {
  const { run, busy, setError } = useWork(),
    q = useRows("/api/crm/integrations"),
    [name, setName] = useState(""),
    [token, setToken] = useState("");
  const endpoint = window.location.origin + "/api/crm/ingest/leads";
  return (
    <section className="rw-panel rw-integration-setup">
      <div className="rw-panel-head">
        <div>
          <h2>Bring contacts into your CRM</h2>
          <p>
            Use Zapier, Make, or another workflow’s HTTP action. Website
            enquiries already appear automatically.
          </p>
        </div>
        <Plug size={22} />
      </div>
      <div className="rw-grid rw-grid-two">
        <form
          className="rw-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              () => request("/api/crm/integrations", { name }),
              "Scoped integration key created",
            );
            if (r) {
              setToken(r.token);
              setName("");
            }
          }}
        >
          <Field label="Workflow connection name">
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Reign website lead workflow"
            />
          </Field>
          <button disabled={busy} className="rw-button rw-primary">
            Create integration key
          </button>
          {token && (
            <div className="rw-inset">
              <p className="rw-help">
                Copy this key now. It will not be shown again. It can only
                create CRM contacts and expires after 90 days.
              </p>
              <input
                aria-label="New CRM integration key"
                type="password"
                readOnly
                value={token}
              />
              <button
                className="rw-button"
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(token);
                  } catch {
                    setError("Select the key and copy it manually.");
                  }
                }}
              >
                Copy key
              </button>
              <button
                type="button"
                className="rw-text-button"
                onClick={() => setToken("")}
              >
                Hide key
              </button>
            </div>
          )}
        </form>
        <div className="rw-inset rw-integration-instructions">
          <strong>HTTP POST</strong>
          <code>{endpoint}</code>
          <p>
            Headers: Content-Type: application/json and Authorization: Bearer
            YOUR_KEY
          </p>
          <pre>
            {JSON.stringify(
              {
                eventId: "unique-source-event-id",
                contact: {
                  name: "Customer name",
                  email: "customer@example.com",
                  phone: "",
                  project: "Patio renovation",
                  contactType: "lead",
                },
              },
              null,
              2,
            )}
          </pre>
          <p className="rw-help">
            Keep the same eventId and contact data when retrying. Identical
            retries return the original contact; changed data with that ID is
            rejected.
          </p>
        </div>
      </div>
      {q.data?.map((k: any) => (
        <div className="rw-summary-row" key={k.id}>
          <strong>{k.name}</strong>
          <span>
            {k.revoked_at ? "Revoked" : "Expires " + date(k.expires_at)}
          </span>
          {!k.revoked_at && (
            <button
              disabled={busy}
              className="rw-text-button rw-danger"
              onClick={() => {
                if (confirm("Revoke this workflow’s CRM key?"))
                  run(
                    () =>
                      request(
                        "/api/crm/integrations/" + k.id,
                        undefined,
                        "DELETE",
                      ),
                    "Integration key revoked",
                  );
              }}
            >
              Revoke
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
