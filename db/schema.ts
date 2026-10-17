// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
});
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  userId: text("user_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  joined: text("joined").notNull(),
});
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  color: text("color").notNull(),
  created: text("created").notNull(),
});
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  assignee: text("assignee").references(() => members.id),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  tags: text("tags").notNull(),
  checklist: text("checklist").notNull(),
  dependsOn: text("depends_on"),
  created: text("created").notNull(),
  updated: text("updated").notNull(),
  version: integer("version").notNull().default(1),
});
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id),
  body: text("body").notNull(),
  created: text("created").notNull(),
});
export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  message: text("message").notNull(),
  created: text("created").notNull(),
});
