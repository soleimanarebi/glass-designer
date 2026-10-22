import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const load = (file: string) => new DOMParser().parseFromString(readFileSync(resolve(root, file), "utf8"), "text/html");
const pages = ["index.html", "privacy.html", "thanks.html"] as const;

describe.each(pages)("%s", (file) => {
  const doc = load(file);
  it("has one h1, a title, a description and a language", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.title.length).toBeGreaterThan(5);
    expect(doc.querySelector('meta[name="description"]')?.getAttribute("content")?.length).toBeGreaterThan(20);
    expect(doc.documentElement.lang).toBe("en-GB");
  });
  it("has a skip link, landmarks and the disclaimer footer", () => {
    expect(doc.querySelector('a.skip[href="#main"]')).not.toBeNull();
    expect(doc.querySelector("main#main")).not.toBeNull();
    expect(doc.querySelector("footer .disclaimer")?.textContent).toMatch(/qualified structural engineer/);
    expect(doc.querySelector('footer a[href="/privacy.html"]')).not.toBeNull();
  });
  it("labels every image", () => {
    for (const img of doc.querySelectorAll("img")) expect(img.getAttribute("alt")).not.toBeNull();
    for (const svg of doc.querySelectorAll("svg")) {
      const labelled = svg.getAttribute("role") === "img" ? svg.getAttribute("aria-labelledby") : svg.getAttribute("aria-hidden");
      expect(labelled).toBeTruthy();
    }
  });
});

describe("landing page", () => {
  const doc = load("index.html");
  it("has every required section", () => {
    for (const id of ["glass", "why", "features", "software", "how", "results", "validation", "roadmap", "about", "contact"]) {
      expect(doc.getElementById(id), id).not.toBeNull();
    }
    expect(doc.querySelectorAll("#how .steps > li")).toHaveLength(3);
  });
  it("in-page links point at real sections", () => {
    for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(doc.getElementById(a.getAttribute("href")!.slice(1)), a.getAttribute("href")!).not.toBeNull();
    }
  });
  it("disclaims affiliation with the standards bodies", () => {
    const text = doc.querySelector("footer .disclaimer")!.textContent!;
    for (const body of ["BSI", "CEN", "IStructE"]) expect(text).toContain(body);
    expect(text).toMatch(/not produced, reviewed\s+or endorsed/);
  });
  it("links the checker through VITE_APP_URL", () => {
    expect(doc.querySelectorAll('a[href="%VITE_APP_URL%"]').length).toBeGreaterThanOrEqual(3);
  });
});

describe("contact form", () => {
  const form = load("index.html").querySelector<HTMLFormElement>('form[name="contact"]')!;
  it("is a Netlify form with a honeypot", () => {
    expect(form.getAttribute("data-netlify")).toBe("true");
    expect(form.getAttribute("method")).toBe("POST");
    const hp = form.getAttribute("netlify-honeypot")!;
    expect(form.querySelector(`input[name="${hp}"]`)).not.toBeNull();
    expect(form.querySelector<HTMLInputElement>('input[name="form-name"]')?.value).toBe("contact");
    expect(form.getAttribute("action")).toBe("/thanks.html");
  });
  it("requires consent that links to the privacy notice", () => {
    const consent = form.querySelector<HTMLInputElement>('input[name="consent"]')!;
    expect(consent.type).toBe("checkbox");
    expect(consent.required).toBe(true);
    expect(form.querySelector('label[for="consent"] a[href="/privacy.html"]')).not.toBeNull();
  });
  it("labels every visible field", () => {
    for (const el of form.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea")) {
      if (el.closest(".hp")) continue;
      expect(form.querySelector(`label[for="${el.id}"]`), el.name).not.toBeNull();
    }
  });
});

describe("palette contrast (WCAG AA)", () => {
  const css = readFileSync(resolve(root, "src/site.css"), "utf8");
  const block = (src: string) => Object.fromEntries([...src.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
  const light = block(css.split("@media")[0]!);
  const dark = { ...light, ...block(css.split("@media (prefers-color-scheme: dark)")[1]!.split(/\n}\n/)[0]!) };
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const pairs = [
    ["ink", "paper"],
    ["ink", "paper-2"],
    ["muted", "paper"],
    ["muted", "paper-2"],
    ["muted", "surface"],
    ["brand", "paper"],
    ["brand", "paper-2"],
    ["brand", "surface"],
    ["brand-ink", "brand"],
  ] as const;
  for (const [name, t] of [["light", light], ["dark", dark]] as const) {
    it.each(pairs)(`${name}: %s on %s is at least 4.5:1`, (fg, bg) => {
      expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
