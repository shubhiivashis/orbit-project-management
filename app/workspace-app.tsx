"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  Clock3,
  Columns3,
  Download,
  Folder,
  FolderKanban,
  LayoutDashboard,
  List,
  ListTodo,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Users,
  Workflow,
  X,
} from "lucide-react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: number;
};
type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  created: string;
};
type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  start_date: string | null;
  due_date: string | null;
  tags: string[];
  checklist: { id: string; text: string; done: boolean }[];
  depends_on: string | null;
  version: number;
  created: string;
  updated: string;
};
type Comment = {
  id: string;
  task_id: string;
  member_id: string;
  body: string;
  created: string;
};
type State = {
  onboarding?: boolean;
  workspace: { name: string; owner_id: string };
  me: string;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  activity: {
    id: string;
    member_id: string;
    message: string;
    created: string;
  }[];
};
const statuses = [
  { id: "backlog", name: "To do", color: "#9a9da5" },
  { id: "progress", name: "In progress", color: "#d6a453" },
  { id: "review", name: "In review", color: "#8e82bf" },
  { id: "done", name: "Completed", color: "#4b8e72" },
];
const priorities = ["low", "medium", "high", "urgent"];
const colors = ["green", "blue", "purple", "orange", "pink"];
function shortDate(s: string | null) {
  return s
    ? new Date(s + "T12:00:00").toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      })
    : "No due date";
}
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function Avatar({ member, size = "" }: { member?: Member; size?: string }) {
  return (
    <span
      title={member?.name ?? "Unassigned"}
      className={`avatar ${size} tone-${member ? member.name.charCodeAt(0) % 5 : 0}`}
    >
      {member ? initials(member.name) : <Users size={12} />}
    </span>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <span className="progress">
      <span style={{ width: `${value}%` }} />
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,button,textarea,select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const items = [
          ...el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export default function WorkspaceApp({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState("overview"),
    [projectId, setProjectId] = useState("all"),
    [view, setView] = useState("board"),
    [search, setSearch] = useState(""),
    [priority, setPriority] = useState("all"),
    [assignee, setAssignee] = useState("all"),
    [sort, setSort] = useState("default"),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<null | "project" | "member" | "task">(null),
    [editing, setEditing] = useState<Task | null>(null),
    [newStatus, setNewStatus] = useState("backlog"),
    [month, setMonth] = useState(() => new Date()),
    [filters, setFilters] = useState(false),
    [projectEditing, setProjectEditing] = useState<Project | null>(null),
    [projectDelete, setProjectDelete] = useState(false),
    [removingMember, setRemovingMember] = useState<Member | null>(null),
    [onboard, setOnboard] = useState(`${user.name}'s workspace`);
  const searchRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/workspace", { cache: "no-store" });
    const result: any = await r.json();
    if (!r.ok) throw new Error(result.error);
    setData(result);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const interval = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const mutate = useCallback(
    async (payload: unknown) => {
      setBusy(true);
      setError("");
      try {
        const r = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result: any = await r.json();
        if (!r.ok) throw new Error(result.error);
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  const openTask = useCallback(
    (task: Task | null = null, status = "backlog") => {
      setEditing(task);
      setNewStatus(status);
      setModal("task");
    },
    [],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
        el.isContentEditable ||
        modal
      )
        return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && data?.projects?.length) openTask();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [modal, data, openTask]);
  const go = (next: string, pid = "all") => {
    setPage(next);
    setProjectId(pid);
    setSearch("");
    setMobile(false);
  };
  const members = data?.members ?? [],
    projects = data?.projects ?? [],
    allTasks = data?.tasks ?? [],
    me = members.find((m) => m.id === data?.me),
    selected = projects.find((p) => p.id === projectId),
    isOwner = me?.role === "owner";
  const tasks = useMemo(() => {
    let t = allTasks.filter(
      (t) =>
        (projectId === "all" || t.project_id === projectId) &&
        (page !== "mytasks" || t.assignee === data?.me) &&
        (!search ||
          `${t.title} ${t.description} ${t.tags.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (priority === "all" || t.priority === priority) &&
        (assignee === "all" ||
          (assignee === "none" ? !t.assignee : t.assignee === assignee)),
    );
    if (sort === "due")
      t = [...t].sort((a, b) =>
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      );
    if (sort === "priority")
      t = [...t].sort(
        (a, b) =>
          priorities.indexOf(b.priority) - priorities.indexOf(a.priority),
      );
    return t;
  }, [allTasks, projectId, page, data?.me, search, priority, assignee, sort]);
  const complete = allTasks.filter((t) => t.status === "done").length,
    overdue = allTasks.filter(
      (t) => t.status !== "done" && t.due_date && t.due_date < dayKey(),
    ).length;
  const close = useCallback(() => {
    setModal(null);
    setEditing(null);
    setProjectEditing(null);
    setProjectDelete(false);
  }, []);
  const saveTask = async (task: Partial<Task>) => {
    const ok = await mutate({
      action: editing ? "task.update" : "task.create",
      id: editing?.id,
      version: editing?.version,
      task,
    });
    if (ok) {
      close();
      setNotice(editing ? "Task updated" : "Task created");
    }
  };
  const moveTask = async (task: Task, status: string) => {
    if (task.status === status) return;
    const ok = await mutate({
      action: "task.update",
      id: task.id,
      version: task.version,
      task: { ...task, status },
    });
    if (ok)
      setNotice(`Moved to ${statuses.find((s) => s.id === status)?.name}`);
  };
  const exportData = (csv = false) => {
    const rows = [
      [
        "Task",
        "Project",
        "Status",
        "Priority",
        "Assignee",
        "Start date",
        "Due date",
      ],
      ...allTasks.map((t) => [
        t.title,
        projects.find((p) => p.id === t.project_id)?.name ?? "",
        t.status,
        t.priority,
        members.find((m) => m.id === t.assignee)?.name ?? "",
        t.start_date ?? "",
        t.due_date ?? "",
      ]),
    ];
    const content = csv
      ? rows
          .map((row) =>
            row
              .map(
                (v) =>
                  `"${(/^[=+@-]/.test(v) ? "'" : "") + v.replaceAll('"', '""')}"`,
              )
              .join(","),
          )
          .join("\r\n")
      : JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
      new Blob([content], { type: csv ? "text/csv" : "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit-${dayKey()}.${csv ? "csv" : "json"}`;
    a.click();
    URL.revokeObjectURL(url);
  };
  if (!data)
    return (
      <main className="loading-screen">
        <span className="brand-mark">o</span>
        <h1>Getting your workspace ready</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="btn primary"
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
            >
              Try again
            </button>
            <a href="/auth/logout" target="_top">
              Switch account
            </a>
          </>
        ) : (
          <Loader2 className="spin" />
        )}
      </main>
    );
  if (data.onboarding)
    return (
      <main className="onboarding">
        <div className="onboarding-art">
          <span className="brand">
            <span className="brand-mark">o</span> orbit
          </span>
          <div>
            <span className="eyebrow">
              A LITTLE LESS CHAOS. A LOT MORE CLARITY.
            </span>
            <h1>
              Great work
              <br />
              starts together.
            </h1>
            <p>
              A shared space for every idea, every task,
              <br />
              and everyone who makes it happen.
            </p>
            <div className="orbit-art">
              <span />
              <span />
              <span />
              <Target size={70} />
            </div>
          </div>
          <small>Make room for your best work.</small>
        </div>
        <div className="onboarding-form">
          <span className="tag green">YOUR NEXT CHAPTER</span>
          <h2>Welcome to Orbit, {user.name}.</h2>
          <p>Let’s create a home for your team’s work.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await mutate({ action: "bootstrap", name: onboard });
            }}
          >
            <label>
              Workspace name
              <input
                required
                maxLength={80}
                value={onboard}
                onChange={(e) => setOnboard(e.target.value)}
              />
            </label>
            <p className="muted">Signed in as {user.email}</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="btn primary">
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <ArrowUpRight size={16} />
              )}
              Create workspace
            </button>
          </form>
          <div className="setup-note">
            <CheckCircle2 size={18} />
            <span>
              Projects, tasks, and conversations. All in one place.
              <br />
              Add your team after creating the workspace.
            </span>
          </div>
        </div>
      </main>
    );
  const card = (t: Task) => (
    <button
      key={t.id}
      draggable={!busy}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
      className={`task-card ${t.status === "done" ? "completed" : ""}`}
      onClick={() => openTask(t)}
    >
      <div className="task-tags">
        {t.tags.slice(0, 2).map((tag, i) => (
          <span
            className={`tag ${["green", "purple", "orange"][i % 3]}`}
            key={tag}
          >
            {tag}
          </span>
        ))}
        <span className="task-more">
          <MoreHorizontal size={17} />
        </span>
      </div>
      <h4>{t.title}</h4>
      {t.description && <p>{t.description}</p>}
      {t.checklist.length > 0 && (
        <div className="checklist-preview">
          <ListTodo size={13} />
          {t.checklist.filter((c) => c.done).length}/{t.checklist.length}{" "}
          subtasks
        </div>
      )}
      <footer>
        <span className={`priority ${t.priority}`}>
          <i />
          {t.priority}
        </span>
        <Avatar member={members.find((m) => m.id === t.assignee)} />
      </footer>
      <div className="task-meta">
        <span
          className={
            t.due_date && t.due_date < dayKey() && t.status !== "done"
              ? "overdue"
              : ""
          }
        >
          <CalendarDays size={12} />
          {shortDate(t.due_date)}
        </span>
        <span>
          {t.depends_on && <Workflow size={13} />}
          <MessageSquare size={12} />
          {data.comments.filter((c) => c.task_id === t.id).length}
        </span>
      </div>
    </button>
  );
  const taskList = (items: Task[]) => (
    <div className="task-table">
      <div className="table-head">
        <span>Task name</span>
        <span>Assignee</span>
        <span>Due date</span>
        <span>Priority</span>
        <span>Status</span>
      </div>
      {items.length ? (
        items.map((t) => (
          <div className="task-row" key={t.id}>
            <button className="task-name" onClick={() => openTask(t)}>
              {t.status === "done" ? (
                <CheckCircle2 size={17} className="text-green" />
              ) : (
                <Circle size={17} />
              )}
              <span>
                {t.title}
                <small>
                  {projects.find((p) => p.id === t.project_id)?.name}
                </small>
              </span>
            </button>
            <span className="row-member">
              <Avatar member={members.find((m) => m.id === t.assignee)} />
              <small>
                {members.find((m) => m.id === t.assignee)?.name ?? "Unassigned"}
              </small>
            </span>
            <span
              className={
                t.due_date && t.due_date < dayKey() && t.status !== "done"
                  ? "overdue"
                  : ""
              }
            >
              {shortDate(t.due_date)}
            </span>
            <span className={`priority ${t.priority}`}>
              <i />
              {t.priority}
            </span>
            <select
              aria-label={`Status of ${t.title}`}
              value={t.status}
              disabled={busy}
              onChange={(e) => moveTask(t, e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ))
      ) : (
        <div className="empty-inline">
          No tasks here yet. A fresh start looks good.
        </div>
      )}
    </div>
  );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <button
          className="sidebar-close icon-btn"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        >
          <X size={18} />
        </button>
        <button className="brand" onClick={() => go("overview")}>
          <span className="brand-mark">o</span>orbit
          <span className="brand-dot">®</span>
        </button>
        <button className="workspace-switch" onClick={() => go("settings")}>
          <span className="workspace-avatar">
            {initials(data.workspace.name)}
          </span>
          <span>
            {data.workspace.name}
            <small>Team workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {[
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "mytasks", label: "My tasks", icon: CheckCircle2 },
            { id: "projects", label: "All projects", icon: FolderKanban },
            { id: "activity", label: "Activity", icon: Bell },
            { id: "team", label: "Team members", icon: Users },
          ].map((n) => (
            <button
              key={n.id}
              className={page === n.id && projectId === "all" ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "mytasks" && (
                <em>
                  {
                    allTasks.filter(
                      (t) => t.assignee === data.me && t.status !== "done",
                    ).length
                  }
                </em>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-caption project-caption">
          YOUR PROJECTS
          <button
            aria-label="Create project"
            onClick={() => setModal("project")}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="project-nav">
          {projects.map((p) => (
            <button
              key={p.id}
              className={projectId === p.id ? "active" : ""}
              onClick={() => go("projects", p.id)}
            >
              <span className={`project-dot ${p.color}`} />
              <span>{p.name}</span>
            </button>
          ))}
          {!projects.length && <small>Your next big idea goes here.</small>}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={19} />
            <strong>Good things take teamwork.</strong>
            <p>Give every project a clear path forward.</p>
            <button onClick={() => setModal("project")}>
              Start a project <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => go("settings")}
          >
            <Settings size={18} />
            Workspace settings
          </button>
          <button className="profile" onClick={() => go("team")}>
            <Avatar member={me} size="large" />
            <span>
              {user.name}
              <small>{isOwner ? "Workspace owner" : "Team member"}</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              aria-label="Toggle menu"
              className="icon-btn mobile-toggle"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {selected?.name ??
                (
                  {
                    overview: "Overview",
                    mytasks: "My tasks",
                    projects: "All projects",
                    team: "Team members",
                    activity: "Activity",
                    settings: "Settings",
                  } as Record<string, string>
                )[page]}
            </strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!["projects", "mytasks"].includes(page)) {
                    setPage("projects");
                    setProjectId("all");
                  }
                }}
              />
              <kbd>/</kbd>
            </label>
            <button
              className="icon-btn"
              aria-label="View activity"
              onClick={() => go("activity")}
            >
              <Bell size={19} />
            </button>
            <span className="topbar-divider" />
            <Avatar member={me} />
          </div>
        </header>
        <main className="content">
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {page === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">LET’S MAKE THINGS HAPPEN</p>
                  <h1>
                    Welcome back, {user.name.split(" ")[0]}{" "}
                    <span className="wave">✳</span>
                  </h1>
                  <p>Here’s what’s happening with your team today.</p>
                </div>
                <button
                  className="btn primary"
                  onClick={() =>
                    projects.length ? openTask() : setModal("project")
                  }
                >
                  <Plus size={17} />
                  Create {projects.length ? "task" : "project"}
                </button>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label: "Total projects",
                    value: projects.length,
                    icon: FolderKanban,
                    note: "Your ideas, taking shape",
                    color: "green",
                  },
                  {
                    label: "Tasks in progress",
                    value: allTasks.filter((t) => t.status === "progress")
                      .length,
                    icon: Clock3,
                    note: "A little closer every day",
                    color: "orange",
                  },
                  {
                    label: "Completed tasks",
                    value: complete,
                    icon: CheckCircle2,
                    note: `${allTasks.length ? Math.round((complete / allTasks.length) * 100) : 0}% of all tasks completed`,
                    color: "purple",
                  },
                  {
                    label: "Overdue tasks",
                    value: overdue,
                    icon: CalendarDays,
                    note: overdue
                      ? "A few things need your attention"
                      : "Looking good. Right on track.",
                    color: "pink",
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <span className={`stat-icon ${s.color}`}>
                      <s.icon size={19} />
                    </span>
                    <p>{s.label}</p>
                    <strong>
                      {s.value}
                      <span>
                        {s.label === "Completed tasks" && complete > 0 ? (
                          <ArrowUpRight size={18} />
                        ) : null}
                      </span>
                    </strong>
                    <small>{s.note}</small>
                  </div>
                ))}
              </div>
              <div className="section-heading">
                <div>
                  <h2>
                    Your projects <span>{projects.length}</span>
                  </h2>
                  <p>Big ideas. Clear next steps.</p>
                </div>
                <button className="text-btn" onClick={() => go("projects")}>
                  View all projects <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="project-grid">
                {projects.slice(0, 5).map((p) => {
                  const pt = allTasks.filter((t) => t.project_id === p.id),
                    done = pt.filter((t) => t.status === "done").length,
                    percent = pt.length
                      ? Math.round((done / pt.length) * 100)
                      : 0;
                  return (
                    <button
                      className="project-card"
                      key={p.id}
                      onClick={() => go("projects", p.id)}
                    >
                      <div className="project-card-top">
                        <span className={`project-icon ${p.color}`}>
                          <FolderKanban size={23} />
                        </span>
                        <span className="tag green">
                          {percent === 100 && pt.length
                            ? "Completed"
                            : "Active"}
                        </span>
                        <MoreHorizontal size={19} />
                      </div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.description ||
                          "Every great project starts with a plan."}
                      </p>
                      <div className="progress-label">
                        <span>Progress</span>
                        <strong>{percent}%</strong>
                      </div>
                      <Progress value={percent} />
                      <footer>
                        <span>
                          <CheckCircle2 size={14} />
                          {done}/{pt.length} tasks
                        </span>
                        <span className="avatar-stack">
                          {[
                            ...new Set(
                              pt.map((t) => t.assignee).filter(Boolean),
                            ),
                          ]
                            .slice(0, 3)
                            .map((mid) => (
                              <Avatar
                                key={mid}
                                member={members.find((m) => m.id === mid)}
                              />
                            ))}
                        </span>
                      </footer>
                    </button>
                  );
                })}
                <button
                  className="new-project-card"
                  onClick={() => setModal("project")}
                >
                  <span>
                    <Plus size={23} />
                  </span>
                  <strong>Create a new project</strong>
                  <p>Make space for your next big thing.</p>
                </button>
              </div>
              {!projects.length && (
                <div className="sample-banner">
                  <Sparkles size={19} />
                  <div>
                    <strong>Want to see how it all comes together?</strong>
                    <p>
                      Add a sample website redesign project. You can edit every
                      task.
                    </p>
                  </div>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={async () => {
                      if (await mutate({ action: "sample" }))
                        setNotice("Sample project added");
                    }}
                  >
                    Explore a sample
                  </button>
                </div>
              )}
              <div className="overview-bottom">
                <section className="panel">
                  <div className="section-heading">
                    <h2>My upcoming tasks</h2>
                    <button className="text-btn" onClick={() => go("mytasks")}>
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {allTasks
                    .filter(
                      (t) => t.assignee === data.me && t.status !== "done",
                    )
                    .sort((a, b) =>
                      (a.due_date ?? "9999").localeCompare(
                        b.due_date ?? "9999",
                      ),
                    )
                    .slice(0, 5)
                    .map((t) => (
                      <button
                        className="upcoming-row"
                        key={t.id}
                        onClick={() => openTask(t)}
                      >
                        <Circle size={17} />
                        <span>
                          <strong>{t.title}</strong>
                          <small>
                            {projects.find((p) => p.id === t.project_id)?.name}
                          </small>
                        </span>
                        <em
                          className={
                            t.due_date && t.due_date < dayKey() ? "overdue" : ""
                          }
                        >
                          {shortDate(t.due_date)}
                        </em>
                      </button>
                    ))}
                  {!allTasks.some(
                    (t) => t.assignee === data.me && t.status !== "done",
                  ) && (
                    <div className="empty-inline">
                      <CheckCircle2 size={28} />
                      <p>You’re all caught up.</p>
                      <small>Your assigned tasks will appear here.</small>
                    </div>
                  )}
                </section>
                <section className="panel pulse-panel">
                  <div className="section-heading">
                    <h2>Team pulse</h2>
                    <span className="tag green">Live workspace</span>
                  </div>
                  <div
                    className="donut"
                    style={
                      {
                        "--percent": `${allTasks.length ? (complete / allTasks.length) * 100 : 0}%`,
                      } as React.CSSProperties
                    }
                  >
                    <div>
                      <strong>{complete}</strong>
                      <small>tasks completed</small>
                    </div>
                  </div>
                  <div className="pulse-legend">
                    {statuses.map((s) => (
                      <span key={s.id}>
                        <i style={{ background: s.color }} />
                        {s.name}
                        <strong>
                          {allTasks.filter((t) => t.status === s.id).length}
                        </strong>
                      </span>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
          {["projects", "mytasks"].includes(page) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="project-heading">
                    <span
                      className={`project-icon ${selected?.color ?? "green"}`}
                    >
                      <FolderKanban size={24} />
                    </span>
                    <h1>
                      {page === "mytasks"
                        ? "My tasks"
                        : (selected?.name ?? "All projects")}
                    </h1>
                    <span className="tag green">
                      {page === "mytasks" ? "Personal view" : "Team workspace"}
                    </span>
                  </div>
                  <p>
                    {selected?.description ??
                      (page === "mytasks"
                        ? "Your priorities, your pace. Keep the important things moving."
                        : "One place for every project and every next step.")}
                  </p>
                </div>
                <div className="heading-actions">
                  <button className="btn" onClick={() => go("team")}>
                    <Users size={15} />
                    Team
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      projects.length ? openTask() : setModal("project")
                    }
                  >
                    <Plus size={17} />
                    {projects.length ? "Add task" : "New project"}
                  </button>
                </div>
              </div>
              <div className="project-toolbar">
                <div className="view-tabs">
                  {[
                    { id: "board", label: "Board", icon: Columns3 },
                    { id: "list", label: "List", icon: List },
                    { id: "timeline", label: "Timeline", icon: Workflow },
                    { id: "calendar", label: "Calendar", icon: CalendarDays },
                  ].map((v) => (
                    <button
                      className={view === v.id ? "active" : ""}
                      key={v.id}
                      onClick={() => setView(v.id)}
                    >
                      <v.icon size={16} />
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="toolbar-right">
                  {selected && (
                    <button
                      className="icon-btn"
                      aria-label="Edit project"
                      title="Edit project"
                      onClick={() => {
                        setProjectEditing(selected);
                        setModal("project");
                      }}
                    >
                      <Settings size={16} />
                    </button>
                  )}
                  <select
                    aria-label="Select project"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="all">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`btn small ${filters ? "selected" : ""}`}
                    onClick={() => setFilters(!filters)}
                  >
                    <SlidersHorizontal size={14} />
                    Filter
                  </button>
                  <button
                    className="icon-btn"
                    title="Export tasks to CSV"
                    aria-label="Export tasks to CSV"
                    onClick={() => exportData(true)}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
              {filters && (
                <div className="filter-bar">
                  <label>
                    Priority
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="all">All priorities</option>
                      {priorities.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Assignee
                    <select
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    >
                      <option value="all">Everyone</option>
                      <option value="none">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sort by
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="default">Created date</option>
                      <option value="due">Due date</option>
                      <option value="priority">Priority</option>
                    </select>
                  </label>
                  <button
                    className="text-btn"
                    onClick={() => {
                      setAssignee("all");
                      setPriority("all");
                      setSort("default");
                      setSearch("");
                    }}
                  >
                    Reset filters
                  </button>
                  <small>{tasks.length} tasks</small>
                </div>
              )}
              {!projects.length ? (
                <div className="large-empty">
                  <FolderKanban size={45} />
                  <h2>A clear path starts with a project.</h2>
                  <p>
                    Create your first project, then break it into achievable
                    tasks.
                  </p>
                  <button
                    className="btn primary"
                    onClick={() => setModal("project")}
                  >
                    <Plus size={16} />
                    Create project
                  </button>
                </div>
              ) : view === "board" ? (
                <div className="board">
                  {statuses.map((s) => (
                    <section
                      className="board-column"
                      key={s.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const task = allTasks.find(
                          (t) => t.id === e.dataTransfer.getData("text/plain"),
                        );
                        if (task && !busy) moveTask(task, s.id);
                      }}
                    >
                      <div className="column-heading">
                        <i style={{ background: s.color }} />
                        <h3>{s.name}</h3>
                        <span>
                          {tasks.filter((t) => t.status === s.id).length}
                        </span>
                        <button
                          aria-label={`Add task to ${s.name}`}
                          onClick={() => openTask(null, s.id)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="column-cards">
                        {tasks.filter((t) => t.status === s.id).map(card)}
                      </div>
                      <button
                        className="add-column-task"
                        onClick={() => openTask(null, s.id)}
                      >
                        <Plus size={16} />
                        Add task
                      </button>
                    </section>
                  ))}
                </div>
              ) : view === "list" ? (
                taskList(tasks)
              ) : view === "calendar" ? (
                <CalendarView
                  tasks={tasks}
                  month={month}
                  setMonth={setMonth}
                  openTask={openTask}
                />
              ) : (
                <Timeline tasks={tasks} openTask={openTask} />
              )}
              <div className="view-footnote">
                <span>
                  <span className="live-dot" />
                  Shared with your team · refreshes every 30 seconds
                </span>
                <span>
                  {view === "board"
                    ? "Drag tasks between columns, or open a task to change its status."
                    : `${tasks.length} tasks in this view`}
                </span>
              </div>
            </>
          )}
          {page === "team" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">BETTER, TOGETHER</p>
                  <h1>Your people. Your momentum.</h1>
                  <p>A shared purpose starts with a connected team.</p>
                </div>
                {isOwner && (
                  <button
                    className="btn primary"
                    onClick={() => setModal("member")}
                  >
                    <Plus size={16} />
                    Add team member
                  </button>
                )}
              </div>
              <div className="team-grid">
                {members.map((m) => (
                  <div className="member-card" key={m.id}>
                    <Avatar member={m} size="xlarge" />
                    <h3>
                      {m.name}
                      {m.id === data.me && <small> (you)</small>}
                    </h3>
                    <p>{m.email}</p>
                    <span
                      className={`tag ${m.role === "owner" ? "purple" : "green"}`}
                    >
                      {m.role === "removed"
                        ? "Access removed"
                        : m.role === "owner"
                          ? "Workspace owner"
                          : m.active
                            ? "Team member"
                            : "Ready to join"}
                    </span>
                    <div className="member-stats">
                      <span>
                        <strong>
                          {
                            allTasks.filter(
                              (t) => t.assignee === m.id && t.status !== "done",
                            ).length
                          }
                        </strong>
                        Active tasks
                      </span>
                      <span>
                        <strong>
                          {
                            allTasks.filter(
                              (t) => t.assignee === m.id && t.status === "done",
                            ).length
                          }
                        </strong>
                        Completed
                      </span>
                    </div>
                    {isOwner && m.role !== "owner" && (
                      <button
                        className="text-btn member-access"
                        onClick={async () => {
                          if (m.role === "removed") {
                            if (
                              await mutate({
                                action: "member.add",
                                name: m.name,
                                email: m.email,
                              })
                            )
                              setNotice("Team access restored");
                          } else setRemovingMember(m);
                        }}
                      >
                        {m.role === "removed"
                          ? "Restore access"
                          : "Remove access"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="info-panel">
                <Users size={22} />
                <div>
                  <h3>Bring your team into the workspace</h3>
                  <p>
                    Add each person’s sign-in email here, then grant them access
                    through the Cloudflare Access policy. They’ll join this
                    workspace when they sign in with that email. Adding a member
                    does not send an email invitation.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "activity" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">THE WORK, AS IT HAPPENS</p>
                  <h1>Team activity</h1>
                  <p>A little visibility goes a long way.</p>
                </div>
              </div>
              <section className="activity-panel">
                {data.activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <Avatar
                      member={members.find((m) => m.id === a.member_id)}
                    />
                    <div>
                      <p>
                        <strong>
                          {members.find((m) => m.id === a.member_id)?.name ??
                            "Former member"}
                        </strong>{" "}
                        {a.message}
                      </p>
                      <small>
                        {new Date(a.created).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </small>
                    </div>
                    <span className="activity-check">
                      <Check size={14} />
                    </span>
                  </div>
                ))}
                {!data.activity.length && (
                  <div className="large-empty">
                    <Bell size={36} />
                    <h2>Your story starts here.</h2>
                    <p>
                      Project updates and team activity will appear as work gets
                      done.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
          {page === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">MAKE YOURSELF AT HOME</p>
                  <h1>Workspace settings</h1>
                  <p>The details that make this space yours.</p>
                </div>
              </div>
              <section className="settings-panel">
                <h2>General</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const values = new FormData(e.currentTarget);
                    if (
                      await mutate({
                        action: "workspace.rename",
                        name: values.get("name"),
                      })
                    )
                      setNotice("Workspace updated");
                  }}
                >
                  <label>
                    Workspace name
                    <input
                      name="name"
                      defaultValue={data.workspace.name}
                      required
                      maxLength={80}
                      disabled={!isOwner}
                    />
                  </label>
                  <label>
                    Your account
                    <input value={user.email} disabled readOnly />
                  </label>
                  {isOwner && (
                    <button className="btn primary" disabled={busy}>
                      Save changes
                    </button>
                  )}
                </form>
                <hr />
                <h2>Keep a copy of your work</h2>
                <p>
                  Download projects, tasks, team details, and comments as JSON,
                  or export your task list as CSV.
                </p>
                <div className="heading-actions">
                  <button className="btn" onClick={() => exportData()}>
                    <Download size={16} />
                    Download workspace
                  </button>
                  <button className="btn" onClick={() => exportData(true)}>
                    Export tasks CSV
                  </button>
                </div>
                <hr />
                <h2>Account</h2>
                <a className="btn" href="/auth/logout" target="_top">
                  Sign out
                </a>
              </section>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            orbit <i>·</i> A little clarity. A lot of possibility.
          </span>
          <span>
            Made for moving forward <ArrowUpRight size={12} />
          </span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {busy && (
        <div className="saving" role="status">
          <Loader2 size={13} className="spin" />
          Saving changes
        </div>
      )}
      {removingMember && (
        <Modal
          title="Remove team access"
          onClose={() => setRemovingMember(null)}
        >
          <div className="member-confirm">
            <p>
              Remove <strong>{removingMember.name}</strong> from this workspace?
              Their comments and activity will be kept, and their tasks will
              become unassigned.
            </p>
            <p className="muted">
              You can restore access later. Also remove their access in Site
              sharing if needed.
            </p>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setRemovingMember(null)}>
                Keep access
              </button>
              <button
                className="btn danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await mutate({
                      action: "member.remove",
                      id: removingMember.id,
                    })
                  ) {
                    setRemovingMember(null);
                    setNotice("Team access removed");
                  }
                }}
              >
                Remove access
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal === "project" && (
        <Modal
          title={projectEditing ? "Project settings" : "Start something great"}
          onClose={close}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate({
                  action: projectEditing ? "project.update" : "project.create",
                  id: projectEditing?.id,
                  name: f.get("name"),
                  description: f.get("description"),
                  color: f.get("color"),
                })
              ) {
                close();
                setNotice(
                  projectEditing ? "Project updated" : "Project created",
                );
              }
            }}
          >
            <p className="form-intro">
              Give your next big idea a place to grow.
            </p>
            <label>
              Project name
              <input
                name="name"
                defaultValue={projectEditing?.name}
                placeholder="e.g. Website redesign"
                required
                maxLength={100}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={projectEditing?.description}
                placeholder="What are we working toward?"
                rows={3}
                maxLength={2000}
              />
            </label>
            <label>
              Project color
              <select
                name="color"
                defaultValue={projectEditing?.color ?? "green"}
              >
                {colors.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                <Plus size={15} />
                {projectEditing ? "Save project" : "Create project"}
              </button>
            </div>
          </form>
          {projectEditing && isOwner && (
            <div className="project-danger">
              <button
                className="text-btn danger"
                onClick={() => setProjectDelete(!projectDelete)}
              >
                <Trash2 size={14} />
                Delete project
              </button>
              {projectDelete && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      await mutate({
                        action: "project.delete",
                        id: projectEditing.id,
                        confirm: f.get("confirm"),
                      })
                    ) {
                      close();
                      go("projects");
                      setNotice("Project deleted");
                    }
                  }}
                >
                  <p>
                    This permanently deletes this project, its tasks, and their
                    comments. Type <strong>{projectEditing.name}</strong> to
                    confirm.
                  </p>
                  <input
                    name="confirm"
                    required
                    aria-label="Confirm project name"
                  />
                  <button className="btn danger" disabled={busy}>
                    Delete project and tasks
                  </button>
                </form>
              )}
            </div>
          )}
        </Modal>
      )}
      {modal === "member" && (
        <Modal title="Add a teammate" onClose={close}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate({
                  action: "member.add",
                  name: f.get("name"),
                  email: f.get("email"),
                })
              ) {
                close();
                setNotice(
                  "Teammate added. Grant Cloudflare Access permission to let them join.",
                );
              }
            }}
          >
            <p className="form-intro">
              Make room for the people who make things happen.
            </p>
            <label>
              Name
              <input
                name="name"
                required
                maxLength={80}
                placeholder="Their full name"
              />
            </label>
            <label>
              Sign-in email
              <input
                name="email"
                type="email"
                required
                maxLength={250}
                placeholder="teammate@company.com"
              />
            </label>
            <p className="muted">
              Also grant access in Cloudflare Access. No email is sent by this
              form.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button disabled={busy} className="btn primary">
                Add to team
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "task" && (
        <TaskEditor
          task={editing}
          defaultProject={projectId === "all" ? projects[0]?.id : projectId}
          defaultStatus={newStatus}
          data={data}
          close={close}
          save={saveTask}
          busy={busy}
          error={error}
          mutate={mutate}
        />
      )}
    </div>
  );
}
function TaskEditor({
  task,
  defaultProject,
  defaultStatus,
  data,
  close,
  save,
  busy,
  error,
  mutate,
}: {
  task: Task | null;
  defaultProject: string;
  defaultStatus: string;
  data: State;
  close: () => void;
  save: (t: Partial<Task>) => void;
  busy: boolean;
  error: string;
  mutate: (p: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<Task>>(
      task
        ? structuredClone(task)
        : {
            project_id: defaultProject,
            title: "",
            description: "",
            status: defaultStatus,
            priority: "medium",
            assignee: null,
            start_date: null,
            due_date: null,
            tags: [],
            checklist: [],
            depends_on: null,
          },
    ),
    [tags, setTags] = useState(task?.tags.join(", ") ?? ""),
    [subtask, setSubtask] = useState(""),
    [comment, setComment] = useState(""),
    [deleting, setDeleting] = useState(false);
  const set = (key: keyof Task, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const notes = data.comments.filter((c) => c.task_id === task?.id);
  return (
    <Modal title={task ? "Task details" : "Create a task"} onClose={close} wide>
      <div className="task-editor-layout">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({
              ...draft,
              tags: tags
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            });
          }}
        >
          <label>
            Task name
            <input
              className="title-input"
              required
              maxLength={200}
              placeholder="What needs to happen?"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Project
              <select
                value={draft.project_id}
                onChange={(e) => {
                  set("project_id", e.target.value);
                  set("depends_on", null);
                }}
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select
                value={draft.assignee ?? ""}
                onChange={(e) => set("assignee", e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {data.members
                  .filter((m) => m.role !== "removed")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={draft.priority}
                onChange={(e) => set("priority", e.target.value)}
              >
                {priorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={draft.start_date ?? ""}
                onChange={(e) => set("start_date", e.target.value || null)}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={draft.due_date ?? ""}
                min={draft.start_date ?? undefined}
                onChange={(e) => set("due_date", e.target.value || null)}
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={4}
              maxLength={20000}
              placeholder="Add context, links, or a little inspiration..."
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
          <label>
            Tags <small>Separate with commas</small>
            <input
              value={tags}
              placeholder="Design, Research, Launch"
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <label>
            Depends on
            <select
              value={draft.depends_on ?? ""}
              onChange={(e) => set("depends_on", e.target.value || null)}
            >
              <option value="">No dependency</option>
              {data.tasks
                .filter(
                  (t) => t.project_id === draft.project_id && t.id !== task?.id,
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          <label>Subtasks</label>
          <div className="subtasks">
            {draft.checklist?.map((c) => (
              <div key={c.id}>
                <input
                  type="checkbox"
                  checked={c.done}
                  aria-label={`Complete ${c.text}`}
                  onChange={(e) =>
                    set(
                      "checklist",
                      draft.checklist?.map((x) =>
                        x.id === c.id ? { ...x, done: e.target.checked } : x,
                      ),
                    )
                  }
                />
                <span className={c.done ? "struck" : ""}>{c.text}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${c.text}`}
                  onClick={() =>
                    set(
                      "checklist",
                      draft.checklist?.filter((x) => x.id !== c.id),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="inline-form">
            <input
              value={subtask}
              placeholder="Add a subtask"
              maxLength={300}
              onChange={(e) => setSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (subtask.trim()) {
                    set("checklist", [
                      ...(draft.checklist ?? []),
                      {
                        id: crypto.randomUUID(),
                        text: subtask.trim(),
                        done: false,
                      },
                    ]);
                    setSubtask("");
                  }
                }
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={!subtask.trim()}
              onClick={() => {
                set("checklist", [
                  ...(draft.checklist ?? []),
                  {
                    id: crypto.randomUUID(),
                    text: subtask.trim(),
                    done: false,
                  },
                ]);
                setSubtask("");
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {task && !deleting && (
              <button
                type="button"
                className="icon-btn danger"
                aria-label="Delete task"
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={17} />
              </button>
            )}
            {deleting && (
              <>
                <span className="muted">Delete this task?</span>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={async () => {
                    if (await mutate({ action: "task.delete", id: task?.id }))
                      close();
                  }}
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setDeleting(false)}
                >
                  Keep it
                </button>
              </>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving..." : task ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
        <aside className="comments-panel">
          <h3>
            <MessageSquare size={17} />
            Conversation <span>{notes.length}</span>
          </h3>
          {task ? (
            <>
              <div className="comments-list">
                {notes.map((c) => (
                  <div className="comment" key={c.id}>
                    <Avatar
                      member={data.members.find((m) => m.id === c.member_id)}
                    />
                    <div>
                      <strong>
                        {data.members.find((m) => m.id === c.member_id)?.name ??
                          "Former member"}
                      </strong>
                      <small>
                        {new Date(c.created).toLocaleString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </small>
                      <p>{c.body}</p>
                    </div>
                  </div>
                ))}
                {!notes.length && (
                  <div className="empty-inline">
                    <MessageSquare size={25} />
                    <p>Keep the conversation close to the work.</p>
                    <small>Add the first comment below.</small>
                  </div>
                )}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await mutate({
                      action: "comment.create",
                      task_id: task.id,
                      body: comment,
                    })
                  )
                    setComment("");
                }}
              >
                <textarea
                  aria-label="Comment"
                  rows={3}
                  maxLength={5000}
                  placeholder="Share an update or ask a question..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  className="btn primary small"
                  disabled={busy || !comment.trim()}
                >
                  Post comment <ArrowUpRight size={13} />
                </button>
              </form>
              <p className="muted">
                Changes in the task form are saved with “Save changes”. Comments
                post immediately.
              </p>
            </>
          ) : (
            <div className="empty-inline">
              <MessageSquare size={26} />
              <p>First, create your task.</p>
              <small>Then bring the team into the conversation.</small>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
function CalendarView({
  tasks,
  month,
  setMonth,
  openTask,
}: {
  tasks: Task[];
  month: Date;
  setMonth: (d: Date) => void;
  openTask: (t: Task) => void;
}) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(start);
  gridStart.setDate(1 - start.getDay());
  return (
    <div className="calendar">
      <div className="calendar-heading">
        <h2>
          {month.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div>
          <button className="btn small" onClick={() => setMonth(new Date())}>
            Today
          </button>
          <button
            className="icon-btn"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-btn"
            aria-label="Next month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div className="day-label" key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const d = new Date(gridStart);
          d.setDate(d.getDate() + i);
          const key = dayKey(d);
          return (
            <div
              className={`calendar-day ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${key === dayKey() ? "today" : ""}`}
              key={key}
            >
              <span>{d.getDate()}</span>
              {tasks
                .filter((t) => t.due_date === key)
                .map((t) => (
                  <button
                    key={t.id}
                    className={`calendar-task ${t.status}`}
                    onClick={() => openTask(t)}
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      <p className="muted calendar-note">
        {tasks.filter((t) => !t.due_date).length} tasks without a due date
        aren’t shown on the calendar.
      </p>
    </div>
  );
}
function Timeline({
  tasks,
  openTask,
}: {
  tasks: Task[];
  openTask: (t: Task) => void;
}) {
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() - 3);
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <div className="timeline">
      <div className="timeline-inner">
        <div className="timeline-label-head">TASK / NEXT 4 WEEKS</div>
        <div className="timeline-dates">
          {days.map((d) => (
            <span
              className={dayKey(d) === dayKey() ? "current" : ""}
              key={dayKey(d)}
            >
              <small>
                {d.toLocaleDateString("en-IN", { weekday: "narrow" })}
              </small>
              {d.getDate()}
            </span>
          ))}
        </div>
        {dated.map((t) => {
          const start = new Date((t.start_date ?? t.due_date) + "T12:00:00"),
            end = new Date((t.due_date ?? t.start_date) + "T12:00:00");
          const a = Math.floor((start.getTime() - base.getTime()) / 86400000),
            b = Math.floor((end.getTime() - base.getTime()) / 86400000);
          const left = Math.max(0, a),
            right = Math.min(27, b),
            visible = right >= left;
          return (
            <div className="timeline-line" key={t.id}>
              <button
                className="timeline-task-name"
                onClick={() => openTask(t)}
              >
                {t.title}
                <small>
                  {shortDate(t.start_date)} — {shortDate(t.due_date)}
                </small>
              </button>
              <div className="timeline-track">
                {visible ? (
                  <button
                    title={`${t.title}: ${shortDate(t.start_date)} to ${shortDate(t.due_date)}`}
                    className={`timeline-bar ${t.status}`}
                    style={{
                      left: `${(left / 28) * 100}%`,
                      width: `${((right - left + 1) / 28) * 100}%`,
                    }}
                    onClick={() => openTask(t)}
                  >
                    {t.title}
                  </button>
                ) : (
                  <small className="outside-timeline">
                    Outside this 4-week window
                  </small>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!dated.length && (
        <div className="large-empty">
          <Workflow size={32} />
          <h2>See the bigger picture.</h2>
          <p>
            Add start or due dates to your tasks to see them on the timeline.
          </p>
        </div>
      )}
      <p className="muted calendar-note">
        {tasks.length - dated.length} tasks without dates aren’t shown. Timeline
        covers the next four weeks, starting three days ago.
      </p>
    </div>
  );
}
