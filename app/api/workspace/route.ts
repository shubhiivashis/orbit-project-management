import { env } from "cloudflare:workers";
import { getUser } from "../../auth";
import { z } from "zod";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  )
  .nullable();
const taskInput = z
  .object({
    project_id: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20000).default(""),
    status: z
      .enum(["backlog", "progress", "review", "done"])
      .default("backlog"),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    assignee: z.string().nullable().default(null),
    start_date: date.default(null),
    due_date: date.default(null),
    tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
    checklist: z
      .array(
        z.object({
          id: z.string(),
          text: z.string().trim().min(1).max(300),
          done: z.boolean(),
        }),
      )
      .max(100)
      .default([]),
    depends_on: z.string().nullable().default(null),
  })
  .refine(
    (t) => !t.start_date || !t.due_date || t.start_date <= t.due_date,
    "Due date must follow the start date",
  );
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function access() {
  const user = await getUser();
  if (!user) throw new Error("401:Sign in to continue.");
  if (!env.DB) throw new Error("503:The workspace database is not connected.");
  const db = env.DB;
  const member = await db
    .prepare("SELECT * FROM members WHERE user_id=? AND role!='removed'")
    .bind(user.userId)
    .first<any>();
  if (member) return { db, user, member };
  const invited = await db
    .prepare(
      "SELECT * FROM members WHERE email=? AND user_id IS NULL AND role!='removed'",
    )
    .bind(user.email.toLowerCase())
    .first<any>();
  if (invited) {
    await db
      .prepare("UPDATE members SET user_id=? WHERE id=? AND user_id IS NULL")
      .bind(user.userId, invited.id)
      .run();
    const joined = await db
      .prepare("SELECT * FROM members WHERE id=? AND user_id=?")
      .bind(invited.id, user.userId)
      .first<any>();
    if (joined) return { db, user, member: joined };
  }
  if (await db.prepare("SELECT id FROM workspace LIMIT 1").first())
    throw new Error(
      "403:Ask the workspace owner to add your email to the team.",
    );
  const ownerEmail =
    env.ORBIT_OWNER_EMAIL?.trim().toLowerCase() ||
    (import.meta.env.DEV ? "owner@orbit.local" : "");
  if (!ownerEmail)
    throw new Error(
      "503:The owner must configure ORBIT_OWNER_EMAIL before creating the workspace.",
    );
  if (user.email.toLowerCase() !== ownerEmail)
    throw new Error(
      "403:The configured owner must create this workspace first.",
    );
  return { db, user, member: null };
}
function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return json({ error: e.issues.map((x) => x.message).join("; ") }, 400);
  const message = e instanceof Error ? e.message : "Unexpected error";
  const match = message.match(/^(\d{3}):([\s\S]*)$/);
  if (match) return json({ error: match[2] }, Number(match[1]));
  console.error("Workspace request failed", message);
  return json(
    { error: "Could not save this change. Please refresh and try again." },
    500,
  );
}
export async function GET() {
  try {
    const { db, member } = await access();
    if (!member) return json({ onboarding: true });
    const [w, m, p, t, c, a] = await Promise.all([
      db.prepare("SELECT * FROM workspace LIMIT 1").first(),
      db
        .prepare(
          "SELECT id,name,email,role,(user_id IS NOT NULL AND role!='removed') AS active FROM members ORDER BY joined",
        )
        .all(),
      db.prepare("SELECT * FROM projects ORDER BY created").all(),
      db.prepare("SELECT * FROM tasks ORDER BY created").all(),
      db.prepare("SELECT * FROM comments ORDER BY created").all(),
      db.prepare("SELECT * FROM activity ORDER BY created DESC LIMIT 60").all(),
    ]);
    return json({
      workspace: w,
      me: member.id,
      members: m.results,
      projects: p.results,
      tasks: t.results.map((x: any) => ({
        ...x,
        tags: JSON.parse(x.tags),
        checklist: JSON.parse(x.checklist),
      })),
      comments: c.results,
      activity: a.results,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Invalid request origin" }, 403);
    if (Number(request.headers.get("content-length") || 0) > 100000)
      return json({ error: "Request too large" }, 413);
    const raw = await request.text();
    if (raw.length > 100000) return json({ error: "Request too large" }, 413);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const { db, user, member } = await access();
    if (body.action === "bootstrap") {
      if (member) return json({ ok: true });
      const name = z.string().trim().min(1).max(80).parse(body.name);
      await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO workspace (id,name,owner_id) VALUES ('team',?,?)",
          )
          .bind(name, user.userId),
        db
          .prepare(
            "INSERT OR IGNORE INTO members (id,user_id,email,name,role,joined) SELECT ?,?,?,?,'owner',? WHERE EXISTS (SELECT 1 FROM workspace WHERE owner_id=?)",
          )
          .bind(
            id(),
            user.userId,
            user.email.toLowerCase(),
            user.fullName ?? user.email.split("@")[0],
            now(),
            user.userId,
          ),
      ]);
      return json({ ok: true });
    }
    if (!member) return json({ error: "Create your workspace first." }, 403);
    const log = (message: string) =>
      db
        .prepare(
          "INSERT INTO activity (id,member_id,message,created) VALUES (?,?,?,?)",
        )
        .bind(id(), member.id, message, now());
    const owner = () => {
      if (member.role !== "owner")
        throw new Error("403:Only the workspace owner can manage team access.");
    };
    if (body.action === "project.create") {
      const p = z
        .object({
          name: z.string().trim().min(1).max(100),
          description: z.string().max(2000).default(""),
          color: z
            .enum(["green", "blue", "purple", "orange", "pink"])
            .default("green"),
        })
        .parse(body);
      await db.batch([
        db
          .prepare(
            "INSERT INTO projects (id,name,description,color,created) VALUES (?,?,?,?,?)",
          )
          .bind(id(), p.name, p.description, p.color, now()),
        log(`created project “${p.name}”`),
      ]);
    } else if (body.action === "project.update") {
      const p = z
        .object({
          id: z.string(),
          name: z.string().trim().min(1).max(100),
          description: z.string().max(2000),
          color: z.enum(["green", "blue", "purple", "orange", "pink"]),
        })
        .parse(body);
      const result = await db
        .prepare("UPDATE projects SET name=?,description=?,color=? WHERE id=?")
        .bind(p.name, p.description, p.color, p.id)
        .run();
      if (!result.meta.changes) throw new Error("404:Project not found.");
      await log(`updated project “${p.name}”`).run();
    } else if (body.action === "project.delete") {
      owner();
      const pid = z.string().parse(body.id);
      const p = await db
        .prepare("SELECT name FROM projects WHERE id=?")
        .bind(pid)
        .first<any>();
      if (!p) throw new Error("404:Project not found.");
      if (body.confirm !== p.name)
        throw new Error("400:Type the project name to confirm deletion.");
      await db.batch([
        db
          .prepare(
            "DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)",
          )
          .bind(pid),
        db
          .prepare(
            "UPDATE tasks SET depends_on=NULL,version=version+1 WHERE depends_on IN (SELECT id FROM tasks WHERE project_id=?)",
          )
          .bind(pid),
        db.prepare("DELETE FROM tasks WHERE project_id=?").bind(pid),
        db.prepare("DELETE FROM projects WHERE id=?").bind(pid),
        log(`deleted project “${p.name}”`),
      ]);
    } else if (body.action === "task.create" || body.action === "task.update") {
      const t = taskInput.parse(body.task);
      const tid =
        body.action === "task.create" ? id() : z.string().parse(body.id);
      if (
        !(await db
          .prepare("SELECT id FROM projects WHERE id=?")
          .bind(t.project_id)
          .first())
      )
        throw new Error("400:Project not found.");
      if (
        t.assignee &&
        !(await db
          .prepare("SELECT id FROM members WHERE id=? AND role!='removed'")
          .bind(t.assignee)
          .first())
      )
        throw new Error("400:Assignee not found.");
      if (t.depends_on) {
        if (t.depends_on === tid)
          throw new Error("400:A task cannot depend on itself.");
        const dep = await db
          .prepare("SELECT * FROM tasks WHERE id=? AND project_id=?")
          .bind(t.depends_on, t.project_id)
          .first<any>();
        if (!dep)
          throw new Error("400:Dependency must belong to the same project.");
        if (t.status === "done" && dep.status !== "done")
          throw new Error(
            "400:Complete the dependency before completing this task.",
          );
        const visited = new Set([tid]);
        let cursor: any = dep;
        while (cursor) {
          if (visited.has(cursor.id))
            throw new Error("400:Dependencies cannot form a cycle.");
          visited.add(cursor.id);
          cursor = cursor.depends_on
            ? await db
                .prepare("SELECT id,depends_on FROM tasks WHERE id=?")
                .bind(cursor.depends_on)
                .first()
            : null;
        }
      }
      const values = [
        t.project_id,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.assignee,
        t.start_date,
        t.due_date,
        JSON.stringify(t.tags),
        JSON.stringify(t.checklist),
        t.depends_on,
        now(),
      ];
      if (body.action === "task.create")
        await db.batch([
          db
            .prepare(
              "INSERT INTO tasks (project_id,title,description,status,priority,assignee,start_date,due_date,tags,checklist,depends_on,updated,id,created,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
            )
            .bind(...values, tid, now()),
          log(`added “${t.title}”`),
        ]);
      else {
        const version = z.number().int().positive().parse(body.version);
        const result = await db
          .prepare(
            "UPDATE tasks SET project_id=?,title=?,description=?,status=?,priority=?,assignee=?,start_date=?,due_date=?,tags=?,checklist=?,depends_on=?,updated=?,version=version+1 WHERE id=? AND version=?",
          )
          .bind(...values, tid, version)
          .run();
        if (!result.meta.changes)
          throw new Error(
            "409:This task changed since you opened it. Close and reopen it to load the latest version.",
          );
        await log(`updated “${t.title}”`).run();
      }
    } else if (body.action === "task.delete") {
      const tid = z.string().parse(body.id);
      const t = await db
        .prepare("SELECT title FROM tasks WHERE id=?")
        .bind(tid)
        .first<any>();
      if (!t) throw new Error("404:Task no longer exists.");
      await db.batch([
        db.prepare("DELETE FROM comments WHERE task_id=?").bind(tid),
        db
          .prepare(
            "UPDATE tasks SET depends_on=NULL,version=version+1 WHERE depends_on=?",
          )
          .bind(tid),
        db.prepare("DELETE FROM tasks WHERE id=?").bind(tid),
        log(`deleted “${t.title}”`),
      ]);
    } else if (body.action === "comment.create") {
      const c = z
        .object({
          task_id: z.string(),
          body: z.string().trim().min(1).max(5000),
        })
        .parse(body);
      if (
        !(await db
          .prepare("SELECT id FROM tasks WHERE id=?")
          .bind(c.task_id)
          .first())
      )
        throw new Error("404:Task not found.");
      await db.batch([
        db
          .prepare(
            "INSERT INTO comments (id,task_id,member_id,body,created) VALUES (?,?,?,?,?)",
          )
          .bind(id(), c.task_id, member.id, c.body, now()),
        log("added a task comment"),
      ]);
    } else if (body.action === "member.add") {
      owner();
      const m = z
        .object({
          name: z.string().trim().min(1).max(80),
          email: z.string().trim().email().max(250),
        })
        .parse(body);
      const email = m.email.toLowerCase();
      const existing = await db
        .prepare("SELECT id,role FROM members WHERE email=?")
        .bind(email)
        .first<any>();
      if (existing) {
        if (existing.role !== "removed")
          throw new Error("400:This email is already on your team.");
        await db.batch([
          db
            .prepare("UPDATE members SET role='member',name=? WHERE id=?")
            .bind(m.name, existing.id),
          log(`restored ${m.name} to the team`),
        ]);
        return json({ ok: true });
      }
      await db.batch([
        db
          .prepare(
            "INSERT INTO members (id,user_id,email,name,role,joined) VALUES (?,NULL,?,?,'member',?)",
          )
          .bind(id(), email, m.name, now()),
        log(`added ${m.name} to the team`),
      ]);
    } else if (body.action === "member.remove") {
      owner();
      const mid = z.string().parse(body.id);
      if (mid === member.id)
        throw new Error("400:The owner cannot be removed.");
      await db.batch([
        db
          .prepare(
            "UPDATE tasks SET assignee=NULL,version=version+1 WHERE assignee=?",
          )
          .bind(mid),
        db
          .prepare(
            "UPDATE members SET role='removed' WHERE id=? AND role!='owner'",
          )
          .bind(mid),
        log("removed a team member"),
      ]);
    } else if (body.action === "workspace.rename") {
      owner();
      await db
        .prepare("UPDATE workspace SET name=? WHERE id='team'")
        .bind(z.string().trim().min(1).max(80).parse(body.name))
        .run();
    } else if (body.action === "sample") {
      owner();
      if (await db.prepare("SELECT id FROM projects LIMIT 1").first())
        throw new Error(
          "400:Sample data is only available for an empty workspace.",
        );
      const pid = id();
      const today = new Date();
      const d = (offset: number) => {
        const x = new Date(today);
        x.setDate(x.getDate() + offset);
        return x.toISOString().slice(0, 10);
      };
      const samples = [
        ["Define project goals", "done", "high", "Strategy", -5, -2],
        ["Map the customer journey", "done", "medium", "Research", -4, -1],
        ["Explore visual directions", "progress", "high", "Design", -2, 2],
        [
          "Build the component library",
          "progress",
          "high",
          "Development",
          -1,
          5,
        ],
        ["Review homepage concepts", "review", "medium", "Design", -1, 1],
        ["Write product messaging", "backlog", "medium", "Content", 1, 6],
        ["Run usability testing", "backlog", "high", "Research", 4, 9],
        ["Launch checklist & handoff", "backlog", "low", "Launch", 8, 12],
      ];
      await db.batch([
        db
          .prepare(
            "INSERT INTO projects (id,name,description,color,created) VALUES (?,?,?,?,?)",
          )
          .bind(
            pid,
            "Website redesign",
            "A fresh experience for our customers. From first ideas to the final launch.",
            "green",
            now(),
          ),
        ...samples.map(([title, status, priority, tag, start, end]) =>
          db
            .prepare(
              "INSERT INTO tasks (id,project_id,title,description,status,priority,assignee,start_date,due_date,tags,checklist,created,updated,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
            )
            .bind(
              id(),
              pid,
              title,
              "Sample task — edit this to make it your own.",
              status,
              priority,
              member.id,
              d(Number(start)),
              d(Number(end)),
              JSON.stringify([tag]),
              "[]",
              now(),
              now(),
            ),
        ),
        log("created the sample website redesign project"),
      ]);
    } else throw new Error("400:Unknown action.");
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
