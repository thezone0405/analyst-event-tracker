/// <reference types="vitest" />
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const COVERAGE_FILE = resolve(process.cwd(), "coverage","coverage-final.json");

/**
 * crap4ts normalizes its cwd prefix to forward slashes but compares it against
 * the raw Istanbul `path` field. On Windows those paths use backslashes, so no
 * file matches and every function is scored at 0% coverage. Rewriting the JSON
 * to POSIX separators after Vitest writes it keeps CRAP analysis accurate.
 */
function toPosixCoveragePaths(): void {
  if (!existsSync(COVERAGE_FILE)) return;
  const raw = JSON.parse(readFileSync(COVERAGE_FILE, "utf-8")) as Record<
    string,
    { path: string }
  >;
  const fixed = Object.fromEntries(
    Object.values(raw).map((entry) => {
      const path = entry.path.replace(/\\/g, "/");
      return [path, { ...entry, path }];
    }),
  );
  writeFileSync(COVERAGE_FILE, JSON.stringify(fixed));
}

const posixCoverageReporter = {
  onInit() {},
  onFinishedReportCoverage: toPosixCoveragePaths,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    reporters: ["default", posixCoverageReporter],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "**/*.d.ts"],
    },
  },
});
