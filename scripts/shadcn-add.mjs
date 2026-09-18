// Sandbox-safe replacement for `shadcn add`: fetches registry items and writes them with project aliases.
// Usage: node scripts/shadcn-add.mjs button card ...
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const STYLE = "radix-nova";
const BASE = `https://ui.shadcn.com/r/styles/${STYLE}`;
const seen = new Set();
const deps = new Set();

const dest = (file) => {
  const name = path.basename(file.path);
  if (file.type === "registry:hook") return `src/hooks/${name}`;
  if (file.type === "registry:lib") return `src/lib/${name}`;
  return `src/components/ui/${name}`;
};

const rewrite = (src) =>
  src
    .replace(/from "cn"/g, 'from "@/lib/utils"')
    .replace(/@\/registry\/[^/]+\/ui\//g, "@/components/ui/")
    .replace(/@\/registry\/[^/]+\/hooks\//g, "@/hooks/")
    .replace(/@\/registry\/[^/]+\/lib\//g, "@/lib/");

async function add(name) {
  if (seen.has(name) || name === "utils") return;
  seen.add(name);
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const item = await res.json();
  (item.dependencies ?? []).filter((d) => d !== "cn").forEach((d) => deps.add(d));
  for (const f of item.files ?? []) {
    const out = dest(f);
    const force = process.argv.includes("--force");
    if (!force) { try { await access(out); console.log("skip", out); continue; } catch {} }
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, rewrite(f.content));
    console.log("wrote", out);
  }
  for (const d of item.registryDependencies ?? []) await add(d.replace(/^.*\/(.+?)(\.json)?$/, "$1"));
}

for (const n of process.argv.slice(2).filter((a) => !a.startsWith("--"))) await add(n);
console.log("npm deps:", [...deps].join(" "));
