import assert from "node:assert/strict";
const origin = process.env.ORBIT_TEST_URL ?? "http://localhost:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Smoke tests only run against a local preview.");
const cookie = { Cookie: "__orbit_local_auth=1" };
async function req(method, body, auth = cookie) {
  const r = await fetch(origin + "/api/workspace", {
    method,
    headers: {
      ...auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const owner = cookie;
let project;
try {
  assert.equal((await req("GET", null, {})).status, 401);
  console.log("PASS unauthenticated requests rejected");
  let state = (await req("GET", null, owner)).data;
  if (state.onboarding) {
    assert.equal(
      (
        await req(
          "POST",
          { action: "bootstrap", name: "Local test workspace" },
          owner,
        )
      ).status,
      200,
    );
    state = (await req("GET", null, owner)).data;
  }
  const title = "Smoke test " + Date.now();
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "project.create",
          name: title,
          description: "Disposable local verification",
          color: "green",
        },
        owner,
      )
    ).status,
    200,
  );
  state = (await req("GET", null, owner)).data;
  project = state.projects.find((p) => p.name === title);
  assert.ok(project);
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "project.update",
          ...project,
          description: "Updated test project",
        },
        owner,
      )
    ).status,
    200,
  );
  console.log("PASS project create, read, and update");
  const base = {
    project_id: project.id,
    title: "First task",
    description: "Task persistence",
    status: "backlog",
    priority: "high",
    assignee: state.me,
    start_date: "2026-10-18",
    due_date: "2026-10-22",
    tags: ["QA"],
    checklist: [{ id: "sub", text: "Verify persistence", done: false }],
    depends_on: null,
  };
  for (const name of ["First task", "Second task"])
    assert.equal(
      (
        await req(
          "POST",
          { action: "task.create", task: { ...base, title: name } },
          owner,
        )
      ).status,
      200,
    );
  state = (await req("GET", null, owner)).data;
  const task = state.tasks.find(
      (t) => t.project_id === project.id && t.title === "First task",
    ),
    dep = state.tasks.find(
      (t) => t.project_id === project.id && t.title === "Second task",
    );
  assert.equal(task.checklist[0].done, false);
  assert.equal(task.assignee, state.me);
  console.log("PASS task persistence, assignments, tags, and subtasks");
  assert.equal(
    (
      await req(
        "POST",
        { action: "comment.create", task_id: task.id, body: "Test comment" },
        owner,
      )
    ).status,
    200,
  );
  assert.ok(
    (await req("GET", null, owner)).data.comments.some(
      (c) => c.task_id === task.id && c.body === "Test comment",
    ),
  );
  console.log("PASS comments persist");
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "task.update",
          id: task.id,
          version: task.version,
          task: { ...task, status: "progress" },
        },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "task.update",
          id: task.id,
          version: task.version,
          task: { ...task, title: "stale overwrite" },
        },
        owner,
      )
    ).status,
    409,
  );
  console.log("PASS stale changes cannot overwrite a teammate");
  state = (await req("GET", null, owner)).data;
  const updated = state.tasks.find((t) => t.id === task.id);
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "task.update",
          id: task.id,
          version: updated.version,
          task: { ...updated, status: "done", depends_on: dep.id },
        },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "task.update",
          id: task.id,
          version: updated.version,
          task: { ...updated, depends_on: dep.id },
        },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "POST",
        {
          action: "task.update",
          id: dep.id,
          version: dep.version,
          task: { ...dep, depends_on: task.id },
        },
        owner,
      )
    ).status,
    400,
  );
  console.log("PASS unfinished dependencies and cycles rejected");
  assert.equal(
    (
      await req(
        "POST",
        { action: "task.create", task: { ...base, title: "" } },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "POST",
        { action: "task.create", task: { ...base, due_date: "2026-02-31" } },
        owner,
      )
    ).status,
    400,
  );
  console.log("PASS invalid input and impossible dates rejected");
  {
    const outsider = { Cookie: "__orbit_local_auth=outsider" };
    assert.equal((await req("GET", null, outsider)).status, 403);
    const email = "teammate@orbit.local";
    assert.equal(
      (
        await req(
          "POST",
          { action: "member.add", name: "Test teammate", email },
          owner,
        )
      ).status,
      200,
    );
    const teammate = { Cookie: "__orbit_local_auth=teammate" };
    const joined = await req("GET", null, teammate);
    assert.equal(joined.status, 200);
    const mid = joined.data.me;
    assert.equal(
      (
        await req(
          "POST",
          { action: "workspace.rename", name: "not authorized" },
          teammate,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "POST",
          {
            action: "member.add",
            name: "Not permitted",
            email: "not-permitted@orbit.test",
          },
          teammate,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "POST",
          { action: "project.delete", id: project.id, confirm: title },
          teammate,
        )
      ).status,
      403,
    );
    assert.equal(
      (await req("POST", { action: "member.remove", id: mid }, owner)).status,
      200,
    );
    assert.equal((await req("GET", null, teammate)).status, 403);
    console.log(
      "PASS non-members blocked, email membership join, owner-only actions, and removal",
    );
  }
  assert.equal(
    (
      await req(
        "POST",
        { action: "project.delete", id: project.id, confirm: "incorrect" },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (await req("POST", { action: "task.delete", id: task.id }, owner)).status,
    200,
  );
  state = (await req("GET", null, owner)).data;
  assert.ok(!state.comments.some((c) => c.task_id === task.id));
  console.log("PASS deletion confirmation and task cleanup");
  console.log("ALL LOCAL CHECKS PASSED");
} finally {
  if (project) {
    const result = await req(
      "POST",
      { action: "project.delete", id: project.id, confirm: project.name },
      owner,
    );
    assert.equal(result.status, 200);
    console.log("Temporary test project cleaned up");
  }
}
