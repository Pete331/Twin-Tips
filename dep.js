const { execSync } = require("child_process");
const fs = require("fs");

const collect = (file, label) => {
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  return Object.keys({ ...p.dependencies, ...p.devDependencies }).map(n => [n, label]);
};

const pkgs = [...collect("package.json", "server"), ...collect("client/package.json", "client")];

for (const [name, where] of pkgs) {
  let out;
  try {
    out = execSync(`npm view ${name} deprecated time.modified version --json`, { encoding: "utf8", stdio: ["ignore","pipe","ignore"] });
  } catch { console.log(`  ${name.padEnd(24)} ${where.padEnd(7)} (lookup failed)`); continue; }
  let d;
  try { d = JSON.parse(out); } catch { d = {}; }
  const dep = d.deprecated ? "DEPRECATED: " + String(d.deprecated).slice(0, 60) : "";
  const modified = d["time.modified"] || d.modified || "";
  const age = modified ? Math.round((Date.now() - new Date(modified)) / 86400000) : "?";
  console.log(`  ${name.padEnd(24)} ${where.padEnd(7)} v${String(d.version || "?").padEnd(10)} last published ${String(age).padStart(5)}d ago  ${dep}`);
}
