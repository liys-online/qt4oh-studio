/**
 * 数据库抽象层
 *
 * 通过环境变量切换后端：
 *   DATABASE_PROVIDER=sqlite      (默认，无需额外服务)
 *   DATABASE_PROVIDER=mysql       需同时设置 DATABASE_URL=mysql://user:pass@host:3306/dbname
 *   DATABASE_PROVIDER=postgresql  需同时设置 DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *
 * SQLite 时 DATABASE_URL 也可指定文件路径，默认为 <APP_DATA_DIR>/qt4oh.db
 */

import Knex from "knex";
import * as path from "path";
import * as fs from "fs";
import { APP_DATA_DIR } from "./paths";

// ─── Knex 实例（单例）───────────────────────────────────────────────────────
let _db: Knex.Knex | null = null;

function buildConfig(): Knex.Knex.Config {
  const provider = (process.env.DATABASE_PROVIDER ?? "sqlite").toLowerCase();

  if (provider === "sqlite") {
    const dbPath = process.env.DATABASE_URL ?? path.join(APP_DATA_DIR, "qt4oh.db");
    // 确保目录存在
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    return {
      client: "better-sqlite3",
      connection: { filename: dbPath },
      useNullAsDefault: true,
    };
  }

  if (provider === "mysql") {
    const url = process.env.DATABASE_URL ?? "mysql://root:@localhost:3306/qt4oh";
    return { client: "mysql2", connection: url };
  }

  if (
    provider === "postgresql" ||
    provider === "postgres" ||
    provider === "pgsql"
  ) {
    const url =
      process.env.DATABASE_URL ?? "postgresql://postgres:@localhost:5432/qt4oh";
    return { client: "pg", connection: url };
  }

  throw new Error(
    `不支持的 DATABASE_PROVIDER: "${provider}"，可选值：sqlite / mysql / postgresql`
  );
}

export function getDb(): Knex.Knex {
  if (!_db) _db = Knex(buildConfig());
  return _db;
}

// ─── 迁移：建表（幂等，仅在表不存在时创建）──────────────────────────────────
export async function runMigrations(): Promise<void> {
  const db = getDb();

  // sessions 表
  if (!(await db.schema.hasTable("sessions"))) {
    await db.schema.createTable("sessions", (t) => {
      t.string("id").primary();
      t.string("device_id").notNullable();
      t.string("hap_file").notNullable();
      t.string("hap_file_path").nullable();
      t.string("package_name").notNullable();
      t.string("ability_name").notNullable();
      t.string("filter_arch").nullable();
      t.text("filter_module").nullable();   // JSON string
      t.string("filter_pattern").nullable();
      t.integer("timeout").notNullable();
      t.string("status").notNullable();     // running | completed | stopped
      t.string("start_time").notNullable();
      t.string("end_time").nullable();
      t.text("summary").nullable();         // JSON string
    });
  }

  // test_results 表
  if (!(await db.schema.hasTable("test_results"))) {
    await db.schema.createTable("test_results", (t) => {
      t.string("id").primary();
      t.string("session_id").notNullable();
      t.foreign("session_id").references("id").inTable("sessions").onDelete("CASCADE");
      t.string("arch").notNullable();
      t.text("path").notNullable();
      t.string("name").notNullable();
      t.string("module").notNullable();
      t.string("status").notNullable();
      t.string("start_time").nullable();
      t.string("end_time").nullable();
      t.text("crash_logs").nullable();      // JSON: {name,content}[]
      t.string("report_file").nullable();    // 展示标签（相对路径）
      t.text("report_content").nullable();  // XML 原始内容
      t.text("output").nullable();
      t.integer("sort_order").notNullable().defaultTo(0); // 保持原始顺序
    });
  } else {
    // 增量迁移：为已存在的表补充缺失列
    if (!(await db.schema.hasColumn("test_results", "report_content"))) {
      await db.schema.alterTable("test_results", (t) => {
        t.text("report_content").nullable();
      });
    }
    if (!(await db.schema.hasColumn("test_results", "crash_logs"))) {
      await db.schema.alterTable("test_results", (t) => {
        t.text("crash_logs").nullable();
      });
    }
    if (!(await db.schema.hasColumn("test_results", "sort_order"))) {
      await db.schema.alterTable("test_results", (t) => {
        t.integer("sort_order").notNullable().defaultTo(0);
      });
    }
  }

  // users 表（用于登录认证）
  if (!(await db.schema.hasTable("users"))) {
    await db.schema.createTable("users", (t) => {
      t.increments("id").primary();
      t.string("username").notNullable().unique();
      t.string("password_hash").notNullable();  // bcryptjs hash
      t.string("display_name").notNullable();
      t.string("role").notNullable().defaultTo("user"); // admin | user
      t.string("created_at").notNullable();
    });
    // 写入默认管理员账号 admin / admin123
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("admin123", 10);
    await db("users").insert({
      username:      "admin",
      password_hash: hash,
      display_name:  "管理员",
      role:          "admin",
      created_at:    new Date().toISOString(),
    });
  }

  // oauth_accounts 表（第三方登录绑定）
  if (!(await db.schema.hasTable("oauth_accounts"))) {
    await db.schema.createTable("oauth_accounts", (t) => {
      t.increments("id").primary();
      t.integer("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
      t.string("provider").notNullable();           // github | gitcode | huawei
      t.string("provider_user_id").notNullable();   // 平台侧 UID
      t.string("username").nullable();
      t.string("display_name").nullable();
      t.string("avatar_url").nullable();
      t.string("created_at").notNullable();
      t.unique(["provider", "provider_user_id"]);
    });
  }
}

// ─── 迁移状态（防止在同一进程中重复运行）────────────────────────────────────
let _migrated = false;

export async function ensureMigrated(): Promise<void> {
  if (_migrated) return;
  await runMigrations();
  _migrated = true;
}