// Converts shadcn <IconPlaceholder lucide="X" tabler=... /> into direct lucide-react imports.
import { readdir, readFile, writeFile } from "node:fs/promises";
const dir = "src/components/ui";
for (const f of await readdir(dir)) {
  const p = `${dir}/${f}`;
  let s = await readFile(p, "utf8");
  if (!s.includes("IconPlaceholder")) continue;
  const icons = new Set();
  s = s.replace(/<IconPlaceholder([\s\S]*?)\/>/g, (_, attrs) => {
    const name = attrs.match(/lucide="([^"]+)"/)[1];
    icons.add(name);
    const rest = attrs.replace(/\s*(lucide|tabler|hugeicons|phosphor|remixicon)="[^"]*"/g, "");
    return `<${name}${rest.trimEnd() ? rest.replace(/\s+$/, "") + " " : " "}/>`;
  });
  s = s.replace(/import \{ IconPlaceholder \} from "@\/app\/\(create\)\/components\/icon-placeholder"\n/,
    `import { ${[...icons].sort().join(", ")} } from "lucide-react"\n`);
  await writeFile(p, s);
  console.log(f, [...icons].join(","));
}
