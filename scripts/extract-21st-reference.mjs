import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const references = {
  flavor: "https://cdn.21st.dev/kedhareswer/rotating-flavor-slider/default/bundle.1793812996479-0b4360c0-b23c-4679-8ec5-a3290f9aa59a.html",
  disc: "https://cdn.21st.dev/kedhareswer/disc-cascade-carousel/default/bundle.1791295291105-479bce0f-29d3-4350-bbff-40bfb0c760dc.html",
  logo: "https://cdn.21st.dev/shepovalovdenis/liquid-glass-logo-reveal/default/bundle.1793117048366-f46f1069-4f78-4ae9-bd0e-38bec25eb136.html",
};
for (const [name, url] of Object.entries(references)) {
  const root = `research/21st-public/${name}`;
  const bytes = await readFile(`${root}/demo.html`);
  const html = bytes.toString("utf8");
  const modules = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>/type\s*=\s*["']module["']/i.test(m[1]) && m[2].length>10000);
  if(modules.length!==1) throw new Error(`Expected one inline module for ${name}`);
  const source = modules[0][2];
  await writeFile(`${root}/bundle.js`,source);
  await writeFile(`${root}/SOURCE.json`,JSON.stringify({url,inspectedOn:"2026-11-13 Asia/Jakarta",htmlSha256:createHash("sha256").update(bytes).digest("hex"),scriptSha256:createHash("sha256").update(source).digest("hex"),scriptOffsetInHtml:html.indexOf(source),scriptCharacters:source.length,note:"Public shipped browser artifact. Downloaded for user-requested inspection. Not account-gated authoring source; never executed by the extractor."},null,2));
}
