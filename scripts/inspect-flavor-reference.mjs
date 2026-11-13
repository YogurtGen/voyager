import { chromium } from "playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("research/21st-public/flavor");
const html = await readFile(path.join(root, "demo.html"), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("https://reference.voyager.test/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://reference.voyager.test/");
  await page.locator(".rfs-cake").waitFor();
  await page.waitForFunction(() => document.querySelector(".rfs-cake img")?.complete);
  const sample = () => page.evaluate(() => ({
    scrollY,
    wheel: getComputedStyle(document.querySelector(".rfs-cake")).transform,
    photos: [...document.querySelectorAll(".rfs-cake img")].map(el => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })),
    text: [...document.querySelectorAll(".rfs-txt")].map(el => ({ opacity: el.style.opacity, transform: el.style.transform, visibility: el.style.visibility })),
    bounds: (() => {const r=document.querySelector(".rfs-cake").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
  }));
  const before = await sample();
  await page.screenshot({ path: path.join(root, "runtime-start.png") });
  await page.getByRole("button", {name:"Next flavour",exact:true}).click();
  await page.waitForTimeout(150);
  const during = await sample();
  await page.screenshot({ path: path.join(root, "runtime-mid.png") });
  await page.waitForTimeout(1100);
  const after = await sample();
  await page.screenshot({ path: path.join(root, "runtime-next.png") });
  await writeFile(path.join(root, "runtime.json"),JSON.stringify({ observation:"Playwright executing the supplied public bundle in an isolated page, then clicking Next flavour",before,during,after},null,2));
  console.log(JSON.stringify({before,during,after}));
} finally { await browser.close(); }
