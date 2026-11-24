import { sql, type SQL } from "drizzle-orm";

export type DatabaseDump = { takenAt: string; tables: Record<string, Record<string, unknown>[]> };

/**
 * Restores a dump into `target`, replacing everything that is there. Rows go back in foreign-key order
 * (parents first), which is derived from the live schema rather than hard-coded, so a new table cannot be
 * forgotten here. Truncate + insert runs in one transaction: a failed restore leaves the target untouched.
 */
/** Structural: both the Neon (production) and PGlite (tests, local) drizzle clients satisfy it. */
export type RestoreTarget = {
  execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
  transaction: <T>(fn: (tx: RestoreTarget) => Promise<T>) => Promise<T>;
};

/** Quotes a Postgres identifier (doubling any embedded quote), so a name can never end the identifier early. */
export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function restoreDatabase(target: RestoreTarget, dump: DatabaseDump) {
  const present = (await target.execute(sql`select tablename from pg_tables where schemaname = 'public'`)).rows.map((r) => String(r.tablename));
  const deps = (
    await target.execute(sql`
      select tc.table_name as child, ccu.table_name as parent
      from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)
  ).rows.map((r) => ({ child: String(r.child), parent: String(r.parent) }));

  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, path: Set<string>) => {
    if (seen.has(t) || path.has(t)) return; // self-references and cycles: insert after the parents we can order
    path.add(t);
    for (const d of deps.filter((d) => d.child === t && d.parent !== t)) visit(d.parent, path);
    path.delete(t);
    seen.add(t);
    order.push(t);
  };
  for (const t of present) visit(t, new Set());

  // jsonb columns must be handed to the driver as JSON text: a JS array would otherwise be sent as a
  // Postgres array literal ({a,b}) and rejected by the json parser.
  const jsonColumns = new Map<string, Set<string>>();
  // Column names in a dump come from a file, not from this database. Only columns that really exist in the
  // live table may reach the SQL text, so a tampered backup cannot inject SQL through a crafted column name.
  const liveColumns = new Map<string, Set<string>>();
  for (const r of (
    await target.execute(sql`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`)
  ).rows) {
    const t = String(r.table_name), c = String(r.column_name);
    if (!liveColumns.has(t)) liveColumns.set(t, new Set());
    liveColumns.get(t)!.add(c);
    if (r.data_type !== "json" && r.data_type !== "jsonb") continue;
    if (!jsonColumns.has(t)) jsonColumns.set(t, new Set());
    jsonColumns.get(t)!.add(c);
  }

  const restored: Record<string, number> = {};
  await target.transaction(async (tx) => {
    await tx.execute(sql.raw(`truncate table ${present.map(ident).join(", ")} cascade`));
    for (const table of order) {
      const rows = dump.tables[table] ?? [];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const known = liveColumns.get(table) ?? new Set<string>();
      const unknown = columns.filter((c) => !known.has(c));
      if (unknown.length) throw new Error(`Backup has columns that ${table} does not have: ${unknown.join(", ")}`);
      const jsonCols = jsonColumns.get(table) ?? new Set<string>();
      const bind = (row: Record<string, unknown>, column: string) => {
        const value = row[column];
        if (value === undefined) return null;
        return jsonCols.has(column) && value !== null && typeof value === "object" ? JSON.stringify(value) : value;
      };
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        // sql.param keeps arrays (gallery, ship_weekdays) and jsonb objects as ONE bind parameter each
        const values = batch.map((r) => sql`(${sql.join(columns.map((c) => sql`${sql.param(bind(r, c))}`), sql`, `)})`);
        await tx.execute(sql`insert into ${sql.raw(ident(table))} (${sql.raw(columns.map(ident).join(", "))}) values ${sql.join(values, sql`, `)}`);
      }
      restored[table] = rows.length;
    }
  });
  return restored;
}
