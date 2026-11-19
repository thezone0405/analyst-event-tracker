import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  changedSince,
  commitPaths,
  isInScope,
  listDirtyPaths,
  restorePaths,
  runCommand,
  snapshotWorkspace,
} from "./workspace.ts";

const MAX_RETRIES = 25;

const CRAP_REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/crap-report.json",
);

const CLEANER_BASELINE_PATH = path.resolve(
  process.cwd(),
  "reports/cleaner/baseline-crap-report.json",
);

/** Rework loops allowed after QA reports a defect or the final build fails. */
const MAX_REWORK_CYCLES = 3;

/** Where QA writes a defect report to hand an application bug to the Coder. */
const QA_DEFECT_REPORT = "reports/qa/defect-report.md";

interface AgentConfig {
  role: string;
  systemPrompt: string;
  /**
   * Repo-relative globs this agent may create, modify or delete. Enforced twice:
   * up front as Claude Code `Edit(<glob>)` permission rules (which cover every
   * file-editing tool), and after each attempt by diffing the working tree —
   * anything changed outside the scope is reverted and the attempt fails.
   * Configuration, package files, specs and scripts are in no agent's scope.
   */
  writeScope: string[];
  /** Additional Edit-only paths for git-ignored artifacts (e.g. reports). */
  artifactScope?: string[];
  /**
   * The only shell commands the agent may run: npm scripts from package.json,
   * which no agent can modify, so the checks cannot be tampered with.
   */
  scripts: AgentScript[];
  maxTurns: number;
  model: string;
}

interface AgentScript {
  /** npm script name, run as `npm run <name>`. */
  name: string;
  /** If set, extra arguments may follow `--`; the text describes them (e.g. a test file). */
  args?: string;
  purpose: string;
}

/**
 * Built-in Claude Code tools every harness agent gets (passed via `--tools`).
 * Everything else — web access, subagents, notebooks — is unavailable. What an
 * agent may edit and run is narrowed further by its permission rules.
 */
const AGENT_TOOLS = ["Read", "Glob", "Grep", "Edit", "Write", "Bash"];

/** The stage's verification gate; agents can run it to check their own work. */
function gateScript(agentKey: string): AgentScript {
  return {
    name: `gate:${agentKey}`,
    purpose: "the exact check the harness runs to judge your work; run it before finishing",
  };
}

const UNIT_TESTS: AgentScript = {
  name: "test:unit",
  args: "<test file or name filter>",
  purpose: "run Vitest unit tests (all, or only the given files)",
};
const TYPECHECK: AgentScript = { name: "typecheck", purpose: "TypeScript type check (tsc -b)" };

const AGENT_DEFINITIONS: Record<string, AgentConfig> = {
  coder: {
    role: "Coder Agent",
    model: "sonnet",
    systemPrompt: `You are an isolated code generator. Implement React components in src/, Tailwind styling, and Vitest unit tests for the target spec.

BOUNDARIES: You may only create, modify or delete files under src/. Do not modify specs (.feature files), tests/, scripts/, configuration files (vite, vitest, tsconfig, eslint, stryker, cucumber, .claude) or package files. Changes outside src/ are automatically reverted and fail your attempt.`,
    writeScope: ["src/**"],
    scripts: [TYPECHECK, UNIT_TESTS, gateScript("coder")],
    maxTurns: 15,
  },
  cleaner: {
    role: "Cleaner Agent",
    model: "sonnet",
    systemPrompt: `
You are a Senior TypeScript Refactoring Specialist.

Your responsibility is to reduce CRAP scores while preserving existing behavior,
architecture, and public interfaces.

You are provided with a baseline CRAP4TS JSON report in your prompt. The complete
baseline is also preserved at reports/cleaner/baseline-crap-report.json.

OBJECTIVES:
1. Analyze the baseline report.
2. Identify functions with CRAP scores greater than 7.
3. Prioritize functions with the highest CRAP scores.
4. Refactor those functions to reduce cyclomatic complexity and improve test
   coverage where appropriate.
5. Preserve existing behavior, public interfaces, and architectural boundaries.
6. Do not remove tests, weaken assertions, or modify tests solely to make the
   CRAP score pass.
7. Do not modify coverage configuration or CRAP thresholds.
8. You may only create, modify or delete files under src/. Configuration files,
   package files, specs, tests/ and scripts/ are off-limits; changes there are
   automatically reverted and fail your attempt.
9. Keep \`npm run typecheck\` and the unit tests passing.

WORKFLOW:
1. Read and analyze the baseline CRAP report provided in the prompt.
2. Inspect the source files containing the highest-scoring functions.
3. Refactor incrementally, prioritizing the highest-risk functions.
4. Run npm run test:crap after meaningful changes.
5. Read reports/crap-report.json to inspect the latest results.
6. Compare the latest results against the original baseline.
7. Continue until all targeted functions meet the threshold or reasonable
   refactoring options have been exhausted.

FINAL RESPONSE:
- Functions refactored.
- Original and final CRAP scores.
- Changes in cyclomatic complexity.
- Changes in test coverage, where available.
- Remaining functions above threshold.
- Any behavior or architectural concerns.
`,
    writeScope: ["src/**"],
    scripts: [
      TYPECHECK,
      UNIT_TESTS,
      {
        name: "test:crap",
        purpose: "coverage + CRAP analysis; writes reports/crap-report.json",
      },
      gateScript("cleaner"),
    ],
    maxTurns: 25,
  },
  hardener: {
    role: "Hardener Agent",
    model: "sonnet",
    systemPrompt: `You are a mutation testing expert. Analyze Stryker mutation test reports and write boundary unit test assertions to kill surviving mutants.

BOUNDARIES: You may only create or modify unit test files (src/**/*.test.ts, src/**/*.test.tsx) and shared test helpers in src/test/. Do not change application code, configuration (including stryker.config.json and its thresholds), package files, specs, tests/ or scripts/. Changes outside your scope are automatically reverted and fail your attempt. Keep \`npm run typecheck\` passing.

Mutation testing is slow: use \`npm run test:mutation -- --mutate <file>\` to focus on one source file while iterating. The surviving mutants of the last run are in reports/mutation/mutation.json.`,
    writeScope: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**"],
    scripts: [
      TYPECHECK,
      UNIT_TESTS,
      {
        name: "test:mutation",
        args: "--mutate <source file>",
        purpose: "Stryker mutation testing (all of src/services, or only the given file)",
      },
      gateScript("hardener"),
    ],
    maxTurns: 12,
  },
  qa: {
    role: "QA Acceptance Agent",
    model: "sonnet",
    systemPrompt: `You are a QA verification agent. Prove the application satisfies the target Gherkin specification, and act as a regression check for EVERY specification in specs/features/.

BOUNDARIES: You may only create or modify files under tests/ (step definitions and support code), plus the defect report at ${QA_DEFECT_REPORT}. You must NOT modify application code (src/), specs, configuration or package files. Changes outside your scope are automatically reverted and fail your attempt.

WORKFLOW:
1. Write or update step definitions in tests/step-definitions/ for the target spec.
2. Run the FULL acceptance suite: npm run test:bdd (all specs, not only the target).
3. If a scenario fails because a step definition is missing or wrong, fix the step definition. Never weaken an assertion just to make a scenario pass.
4. If a scenario fails because the application behaves differently from its spec (a defect in src/), do NOT work around it. Write ${QA_DEFECT_REPORT} listing, for each defect: the feature file and scenario, the failing step, expected vs. actual behavior, and the source file(s) you suspect. Then stop. The harness hands the report to the Coder agent and re-runs the pipeline.`,
    writeScope: ["tests/**"],
    artifactScope: ["reports/qa/**"],
    scripts: [
      {
        name: "test:bdd",
        args: '--name "<scenario name regex>"',
        purpose: "Cucumber + Playwright acceptance suite for all specs (or only matching scenarios)",
      },
      gateScript("qa"),
    ],
    maxTurns: 8,
  },
};

/**
 * Claude Code permission rules for an agent: read/search anywhere, edit only in
 * scope, and run only its own npm scripts.
 */
function allowedToolsFor(agent: AgentConfig): string[] {
  const editable = [...agent.writeScope, ...(agent.artifactScope ?? [])];
  const commands = agent.scripts.flatMap((script) => [
    `Bash(npm run ${script.name})`,
    ...(script.args ? [`Bash(npm run ${script.name} -- *)`] : []),
  ]);
  // `Edit(path)` rules cover Write too; a `Write(path)` rule is ignored by Claude Code.
  return ["Read", "Glob", "Grep", ...editable.map((glob) => `Edit(${glob})`), ...commands];
}

/** Prompt section telling the agent exactly which commands it has. */
function describeScripts(agent: AgentConfig): string {
  const lines = agent.scripts.map((script) => {
    const usage = script.args
      ? `npm run ${script.name} [-- ${script.args}]`
      : `npm run ${script.name}`;
    return `- \`${usage}\`: ${script.purpose}`;
  });
  return [
    "COMMANDS YOU CAN RUN (no other shell commands are permitted):",
    ...lines,
  ].join("\n");
}

function computeFileHash(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

// Preserve reports between attempts. They are agent inputs, not disposable caches.
function purgeWorkspaceCache(): void {
  const cacheDirs = ["coverage", ".vitest", ".stryker-tmp"];

  for (const dir of cacheDirs) {
    const fullPath = path.resolve(process.cwd(), dir);

    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

interface AgentRunResult {
  code: number;
  summary: string;
  logPath: string;
}

/**
 * Summarizes a `--output-format stream-json --verbose` transcript: prints each
 * tool call as it appeared and returns the final result event's details.
 */
function summarizeAgentTranscript(stdout: string): string {
  const lines: string[] = [];

  for (const raw of stdout.split(/\r?\n/)) {
    if (!raw.trim()) continue;

    let event: {
      type?: string;
      subtype?: string;
      result?: string;
      num_turns?: number;
      total_cost_usd?: number;
      is_error?: boolean;
      message?: {
        content?: Array<{ type: string; name?: string; input?: unknown }>;
      };
    };
    try {
      event = JSON.parse(raw);
    } catch {
      lines.push(raw); // Non-JSON output (e.g. CLI errors) is shown verbatim.
      continue;
    }

    if (event.type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use") {
          lines.push(
            `  🔧 ${block.name} ${JSON.stringify(block.input).slice(0, 160)}`,
          );
        }
      }
    } else if (event.type === "result") {
      lines.push(
        `  ▶ result: ${event.subtype} | turns: ${event.num_turns} | cost: $${event.total_cost_usd?.toFixed(4) ?? "?"} | is_error: ${event.is_error}`,
      );
      if (event.result) lines.push(`\n${event.result}`);
    }
  }

  return lines.join("\n");
}

/**
 * Runs a headless Claude Code agent. The prompt is piped through stdin rather
 * than passed as a CLI argument: on Windows, cmd.exe rejects command lines over
 * 8,191 characters, which made large prompts (e.g. the Cleaner's embedded CRAP
 * baseline) fail instantly with "The command line is too long."
 */
function runAgentCommand(
  command: string,
  prompt: string,
  logPath: string,
): AgentRunResult {
  const cleanEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_NO_SESSION_CACHE: "1",
  };
  delete cleanEnv.CLAUDECODE;

  let code = 0;
  let stdout = "";
  let stderr = "";

  try {
    stdout = execSync(command, {
      encoding: "utf8",
      input: prompt,
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error: unknown) {
    const err = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    code = err.status ?? 1;
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? err.message ?? "";
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `${stdout}\n--- STDERR ---\n${stderr}`);

  const summary = [summarizeAgentTranscript(stdout), stderr.trim()]
    .filter(Boolean)
    .join("\n");

  return { code, summary, logPath };
}

/**
 * Runs coverage + CRAP analysis before Cleaner starts, validates the generated
 * JSON, and copies it to an immutable baseline location for comparisons.
 *
 * A non-zero analyzer exit code is logged but does not automatically abort here:
 * some CRAP CLI versions use a non-zero code when the threshold is exceeded.
 * A missing or malformed report always aborts the Cleaner stage.
 */
function generateCleanerBaseline(): string {
  fs.mkdirSync(path.dirname(CRAP_REPORT_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(CLEANER_BASELINE_PATH), { recursive: true });

  // Avoid accidentally accepting a stale report from an earlier run.
  fs.rmSync(CRAP_REPORT_PATH, { force: true });
  fs.rmSync(CLEANER_BASELINE_PATH, { force: true });

  console.log("\n📊 Generating Cleaner baseline CRAP report...");
  const result = runCommand("npm run test:crap");

  if (!fs.existsSync(CRAP_REPORT_PATH)) {
    throw new Error(
      [
        "CRAP report was not generated at reports/crap-report.json.",
        result.stderr,
        result.stdout,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const report = fs.readFileSync(CRAP_REPORT_PATH, "utf8");

  try {
    JSON.parse(report);
  } catch {
    throw new Error(
      "reports/crap-report.json exists but does not contain valid JSON.",
    );
  }

  fs.copyFileSync(CRAP_REPORT_PATH, CLEANER_BASELINE_PATH);
  console.log(`✓ Baseline saved: ${CLEANER_BASELINE_PATH}`);

  if (result.code !== 0) {
    console.warn(
      `⚠️ Baseline command exited with code ${result.code}. The JSON report is valid, so Cleaner will receive it; inspect the command output if this was not an expected threshold failure.`,
    );
    if (result.stderr) console.warn(result.stderr);
    if (result.stdout) console.warn(result.stdout);
  }

  return report;
}

function readLatestCrapReport(): string {
  if (!fs.existsSync(CRAP_REPORT_PATH)) {
    return "Latest CRAP report was not found at reports/crap-report.json.";
  }

  return fs.readFileSync(CRAP_REPORT_PATH, "utf8");
}

function tail(text: string, max: number): string {
  return text.length > max ? `…(truncated)\n${text.slice(-max)}` : text;
}

type StageResult =
  | { outcome: "passed" }
  | { outcome: "failed" }
  /** The agent filed a defect report that belongs to another agent (QA → Coder). */
  | { outcome: "handoff"; report: string };

function executeStageWithRetry(
  stage: StageDefinition,
  specPath: string,
  cycle: number,
  additionalContext?: string,
): StageResult {
  const { agentKey, gateName, handoffReportPath } = stage;
  const gateCommand = stage.gateCommand(specPath);
  const agent = AGENT_DEFINITIONS[agentKey];
  let lastErrorDetails = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    purgeWorkspaceCache();
    // A defect report must come from this attempt, never from an earlier one.
    if (handoffReportPath) fs.rmSync(handoffReportPath, { force: true });

    const startTime = new Date().toISOString();
    console.log("\n==================================================");
    console.log(
      `🤖 [${startTime}] Spawning ${agent.role} (Attempt ${attempt}/${MAX_RETRIES}) [Isolated Context]`,
    );
    console.log("==================================================");

    // Construct the prompt from the agent instructions and Gherkin specification.
    const specContent = fs.readFileSync(specPath, "utf8");
    let fullPrompt = `${agent.systemPrompt}\n\n${describeScripts(agent)}\n\nSPECIFICATION (${path.basename(specPath)}):\n\`\`\`gherkin\n${specContent}\n\`\`\``;

    if (additionalContext) {
      fullPrompt += `\n\nADDITIONAL CONTEXT:\n${additionalContext}\n`;
    }

    if (attempt > 1 && lastErrorDetails) {
      console.log(
        "\n🔍 [Minimal Feedback] Appending exact factual error report to prompt...",
      );
      fullPrompt += `\n\nFACTUAL ERROR FROM PREVIOUS ATTEMPT (${gateName}):\n\`\`\`\n${lastErrorDetails}\n\`\`\``;
    }

    const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
    console.log(
      `📊 [Token Telemetry] Estimated Input Prompt: ~${estimatedInputTokens} tokens (${fullPrompt.length} chars)`,
    );

    const allowedToolsArgs = allowedToolsFor(agent)
      .map((tool) => `"${tool}"`)
      .join(" ");

    // The prompt is sent via stdin (see runAgentCommand), not as an argument.
    const cmd = [
      "npx",
      "@anthropic-ai/claude-code",
      "-p",
      "--model",
      agent.model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      // Project settings only: keeps the spec-protection and Stop hooks, but
      // no personal (user/local) allow rules can widen this agent's permissions.
      "--setting-sources",
      "project",
      "--tools",
      AGENT_TOOLS.join(","),
      "--allowedTools",
      allowedToolsArgs,
      "--max-turns",
      agent.maxTurns.toString(),
    ].join(" ");

    const logName =
      cycle > 0
        ? `${agentKey}-rework-${cycle}-attempt-${attempt}`
        : `${agentKey}-attempt-${attempt}`;
    const logPath = path.resolve(process.cwd(), `reports/agents/${logName}.jsonl`);

    const attemptSnapshot = snapshotWorkspace();
    const agentStart = Date.now();
    const agentRun = runAgentCommand(cmd, fullPrompt, logPath);
    const agentCode = agentRun.code;
    const agentDuration = ((Date.now() - agentStart) / 1000).toFixed(2);

    console.log(
      `\n📝 ${agent.role} transcript (full log: ${agentRun.logPath}):`,
    );
    console.log(agentRun.summary || "  (no output)");

    const estimatedOutputTokens = agent.maxTurns * 150;
    console.log(
      `📊 [Token Telemetry] Session Summary: Duration: ${agentDuration}s | Max Turn Budget: ${agent.maxTurns} | Est. Total Session Tokens: ~${estimatedInputTokens + estimatedOutputTokens}`,
    );

    // Boundary enforcement: undo anything the agent changed outside its scope.
    const outOfScope = changedSince(attemptSnapshot).filter(
      (p) => !isInScope(p, agent.writeScope),
    );
    if (outOfScope.length > 0) {
      restorePaths(outOfScope, attemptSnapshot);
      lastErrorDetails = [
        "BOUNDARY VIOLATION: you changed files outside your responsibility.",
        `Your allowed paths are: ${agent.writeScope.join(", ")}`,
        "These changes were reverted:",
        ...outOfScope.map((p) => `- ${p}`),
        "Only modify files within your allowed paths.",
      ].join("\n");
      console.error(`\n🚧 ${agent.role} went out of bounds:\n${lastErrorDetails}`);
      continue;
    }

    if (agentCode !== 0) {
      console.log(
        `\n⚠️ [${new Date().toISOString()}] ${agent.role} finished with non-zero exit code ${agentCode}.`,
      );
      lastErrorDetails = `Agent process exited with code ${agentCode} (reached max turns or unhandled exception).\n${agentRun.summary.slice(-4000)}`;
      continue;
    }

    console.log(`\n🛡️ Running verification gate: ${gateName} (${gateCommand})`);
    const gateStart = Date.now();
    const gateRes = runCommand(gateCommand);
    const gateDuration = ((Date.now() - gateStart) / 1000).toFixed(2);

    if (gateRes.code === 0) {
      console.log(
        `\n🎉 [${new Date().toISOString()}] Verification Gate "${gateName}" PASSED in ${gateDuration}s.`,
      );
      return { outcome: "passed" };
    }

    if (handoffReportPath && fs.existsSync(handoffReportPath)) {
      console.log(
        `\n📨 ${agent.role} filed a defect report (${handoffReportPath}); handing off to the Coder agent.`,
      );
      return {
        outcome: "handoff",
        report: [
          fs.readFileSync(handoffReportPath, "utf8"),
          `FAILING GATE OUTPUT (${gateName}, tail):`,
          tail([gateRes.stderr, gateRes.stdout].filter(Boolean).join("\n"), 8000),
        ].join("\n\n"),
      };
    }

    lastErrorDetails = [
      gateRes.stderr,
      gateRes.stdout,
      agentKey === "cleaner"
        ? `LATEST CRAP REPORT:\n${readLatestCrapReport()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    console.error(
      `\n❌ [${new Date().toISOString()}] Verification Gate "${gateName}" FAILED in ${gateDuration}s.`,
    );
    console.error("---------------- Factual Error Report ----------------");
    console.error(lastErrorDetails.trim());
    console.error("------------------------------------------------------");
  }

  console.error(
    `\n❌ Fatal: Stage "${agent.role}" failed after maximum ${MAX_RETRIES} retries.`,
  );
  return { outcome: "failed" };
}

interface StageDefinition {
  agentKey: keyof typeof AGENT_DEFINITIONS;
  gateName: string;
  gateCommand: (specPath: string) => string;
  commitMessage: string;
  /** Runs before the agent is spawned; returns additional prompt context. */
  prepare?: () => string;
  /**
   * If the gate fails and the agent wrote this file, the stage hands the report
   * to the Coder and the pipeline re-runs from the Coder stage.
   */
  handoffReportPath?: string;
}

function buildCleanerContext(): string {
  // Generate the report from the current code, before Cleaner is spawned.
  const cleanerBaseline = generateCleanerBaseline();

  return `
BASELINE CRAP4TS REPORT

The following JSON is the original CRAP analysis generated after the Coder stage
and before any Cleaner modifications.

Baseline file: ${CLEANER_BASELINE_PATH}
Latest report file: ${CRAP_REPORT_PATH}

Treat the baseline file and the JSON below as immutable reference data. Do not
overwrite the baseline. Run npm run test:crap to regenerate the latest report.
Compare each subsequent report against this baseline.

\`\`\`json
${cleanerBaseline}
\`\`\`
`;
}

const PIPELINE: StageDefinition[] = [
  {
    agentKey: "coder",
    gateName: "TypeCheck, Unit Tests & Production Build",
    // Gates are npm scripts in package.json (gate:<agent>), which no agent may
    // edit; agents are allowed to run the same script to check their own work.
    gateCommand: () => "npm run gate:coder",
    commitMessage: "feat(coder): implement feature and unit tests",
  },
  {
    agentKey: "cleaner",
    gateName: "TypeCheck & CRAP4TS Analysis",
    gateCommand: () => "npm run gate:cleaner",
    commitMessage: "refactor(clean): optimize complexity",
    prepare: buildCleanerContext,
  },
  {
    agentKey: "hardener",
    gateName: "TypeCheck & Stryker Mutation Testing",
    gateCommand: () => "npm run gate:hardener",
    commitMessage: "test(hardener): pass mutation score thresholds",
  },
  {
    agentKey: "qa",
    gateName: "BDD Acceptance & Regression Suite (all specs)",
    // Every spec, not only the target: a change for one spec must not break another.
    gateCommand: () => "npm run gate:qa",
    commitMessage: "test(qa): pass BDD acceptance scenarios",
    handoffReportPath: QA_DEFECT_REPORT,
  },
];

/**
 * Parses `--stage a,b` (or `--stage=a,b`) into pipeline stages, preserving
 * pipeline order. Returns the full pipeline when the flag is absent.
 */
function selectStages(args: string[]): StageDefinition[] {
  const validKeys = PIPELINE.map((stage) => stage.agentKey);
  const inline = args.find((arg) => arg.startsWith("--stage="));
  const flagIndex = args.indexOf("--stage");

  let raw: string | undefined;
  if (inline) {
    raw = inline.slice("--stage=".length);
  } else if (flagIndex !== -1) {
    raw = args[flagIndex + 1];
  } else {
    return PIPELINE;
  }

  const requested = (raw ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    console.error(
      `✗ Error: --stage requires one or more of: ${validKeys.join(", ")}`,
    );
    process.exit(1);
  }

  const unknown = requested.filter((name) => !validKeys.includes(name));
  if (unknown.length > 0) {
    console.error(
      `✗ Error: Unknown stage(s): ${unknown.join(", ")}. Valid stages: ${validKeys.join(", ")}`,
    );
    process.exit(1);
  }

  return PIPELINE.filter((stage) => requested.includes(stage.agentKey));
}

type PassOutcome =
  | { kind: "completed" }
  | { kind: "failed" }
  | { kind: "rework"; context: string };

function reworkContext(cycle: number, source: string, details: string): string {
  return `
REWORK REQUEST (cycle ${cycle} of ${MAX_REWORK_CYCLES}), raised by: ${source}

A later stage of the pipeline found a problem that must be fixed in the
application code under src/. It may relate to any spec in specs/features/, not
only the one above; read the relevant spec there. Fix the root cause in src/ and
keep or extend the unit tests. Your changes will then be re-checked by the
Cleaner, Hardener and QA stages.

${details}
`;
}

/** Runs `stages` once, committing each stage's own changes as it passes. */
function runPass(
  stages: StageDefinition[],
  specPath: string,
  shouldCommit: boolean,
  cycle: number,
  rework?: string,
): PassOutcome {
  const suffix = cycle > 0 ? ` (rework cycle ${cycle})` : "";

  for (const stage of stages) {
    const stageSnapshot = snapshotWorkspace();
    const context =
      [stage.prepare?.(), stage.agentKey === "coder" ? rework : undefined]
        .filter(Boolean)
        .join("\n\n") || undefined;

    const result = executeStageWithRetry(stage, specPath, cycle, context);
    if (result.outcome === "failed") return { kind: "failed" };

    if (shouldCommit) {
      const message =
        result.outcome === "handoff"
          ? "test(qa): hand off defect report to coder"
          : stage.commitMessage;
      commitPaths(changedSince(stageSnapshot), message + suffix);
    }

    if (result.outcome === "handoff") {
      return {
        kind: "rework",
        context: reworkContext(
          cycle + 1,
          "QA acceptance/regression tests",
          `QA DEFECT REPORT:\n\`\`\`\n${result.report}\n\`\`\``,
        ),
      };
    }
  }
  return { kind: "completed" };
}

/**
 * Runs the selected stages, then the production build. A QA defect report or a
 * failed build sends the work back to the Coder, after which the FULL pipeline
 * (Coder → Cleaner → Hardener → QA → build) runs again, so every Coder change is
 * re-checked by every downstream stage. Gives up after MAX_REWORK_CYCLES.
 */
function runPipeline(
  selected: StageDefinition[],
  specPath: string,
  shouldCommit: boolean,
): boolean {
  let stages = selected;
  let rework: string | undefined;

  for (let cycle = 0; cycle <= MAX_REWORK_CYCLES; cycle++) {
    if (cycle > 0) {
      stages = PIPELINE;
      console.log("\n##################################################");
      console.log(
        `🔁 Rework cycle ${cycle}/${MAX_REWORK_CYCLES}: Coder → Cleaner → Hardener → QA → build`,
      );
      console.log("##################################################");
    }

    const pass = runPass(stages, specPath, shouldCommit, cycle, rework);
    if (pass.kind === "failed") return false;
    if (pass.kind === "rework") {
      rework = pass.context;
      continue;
    }

    console.log("\n-> Running final Vite production build check...");
    const build = runCommand("npm run gate:final");
    if (build.code === 0) return true;

    // tsc reports type errors on stdout, so include both streams.
    const output = [build.stderr, build.stdout].filter(Boolean).join("\n");
    console.error(`❌ Final Vite production build failed:\n${output}`);
    rework = reworkContext(
      cycle + 1,
      "final production build (npm run build)",
      `BUILD OUTPUT:\n\`\`\`\n${tail(output, 8000)}\n\`\`\``,
    );
  }

  console.error(
    `\n❌ Fatal: pipeline still failing after ${MAX_REWORK_CYCLES} rework cycle(s).`,
  );
  return false;
}

function main(): number {
  const args = process.argv.slice(2);
  const specIndex = args.indexOf("--spec");

  if (specIndex === -1 || !args[specIndex + 1]) {
    console.error(
      "✗ Error: Provide a spec file using --spec <path> [--stage coder,cleaner,hardener,qa] [--no-commit]",
    );
    process.exit(1);
  }

  const stages = selectStages(args);
  const shouldCommit = !args.includes("--no-commit");

  const specPath = path.resolve(args[specIndex + 1]);

  if (!fs.existsSync(specPath)) {
    console.error(`✗ Error: Spec not found at ${specPath}`);
    process.exit(1);
  }

  console.log(`✓ Loading spec: ${path.basename(specPath)}`);
  const initialHash = computeFileHash(specPath);

  // Commit only the spec, never anything else that happens to be staged.
  const specRelPath = path.relative(process.cwd(), specPath).split(path.sep).join("/");
  if (listDirtyPaths().includes(specRelPath)) {
    commitPaths(
      [specRelPath],
      `docs(spec): lock human-authored baseline for ${path.basename(specPath)}`,
    );
  }

  let succeeded = false;
  try {
    const stageNames = stages.map((stage) => stage.agentKey).join(" → ");
    console.log(
      `\n--- Starting Optimized Isolated Agent Gauntlet Pipeline (${stageNames}) ---`,
    );
    if (!shouldCommit) {
      console.log("ℹ️ --no-commit: stage results will be left uncommitted.");
    }

    succeeded = runPipeline(stages, specPath, shouldCommit);

    if (succeeded) {
      console.log(
        "\n🎉 Deterministic agent gauntlet completed successfully! Ready for Vercel.",
      );
    }
  } finally {
    // Runs on success, failure and exceptions alike (no process.exit in the try).
    if (computeFileHash(specPath) !== initialHash) {
      console.error(
        "\n🚨 SECURITY ERROR: Spec file was modified! Reverting...",
      );
      runCommand(`git checkout HEAD -- "${specPath}"`);
      succeeded = false;
    } else {
      console.log("✓ Spec integrity verified.");
    }
  }

  return succeeded ? 0 : 1;
}

process.exit(main());
