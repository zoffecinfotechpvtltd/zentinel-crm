// Stages backend + frontend production builds into desktop/resources/ for
// electron-builder to pick up via its extraResources config. Run this after
// building both (`npm run build` in backend/, `npm run build` in frontend/)
// and before `npm run dist` here. Not run automatically by `dist` since
// backend/frontend live in sibling folders with their own build steps this
// script doesn't own — see RELEASE.md for the full sequence.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const backendSrc = path.join(root, "backend");
const frontendSrc = path.join(root, "frontend", "dist");
const resources = path.join(__dirname, "resources");

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

console.log("Cleaning resources/...");
rmrf(resources);
fs.mkdirSync(path.join(resources, "backend"), { recursive: true });
fs.mkdirSync(path.join(resources, "frontend"), { recursive: true });

console.log("Copying backend dist + migrations...");
fs.cpSync(path.join(backendSrc, "dist"), path.join(resources, "backend", "dist"), { recursive: true });
fs.cpSync(path.join(backendSrc, "migrations"), path.join(resources, "backend", "migrations"), { recursive: true });
fs.copyFileSync(path.join(backendSrc, "package.json"), path.join(resources, "backend", "package.json"));
fs.copyFileSync(path.join(backendSrc, "package-lock.json"), path.join(resources, "backend", "package-lock.json"));

console.log("Installing backend production dependencies into staged copy...");
execSync("npm install --omit=dev --no-audit --no-fund", {
  cwd: path.join(resources, "backend"),
  stdio: "inherit",
});

console.log("Copying frontend build...");
fs.cpSync(frontendSrc, path.join(resources, "frontend"), { recursive: true });

console.log("Resources staged.");
