import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAX_RETRIES = 25;

const CRAP_REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/crap-report.json",
);

const CLEANER_BASELINE_PATH = path.resolve(
  process.cwd(),
  "reports/cleaner/baseline-crap-report.json",
);

interface AgentConfig {
  role: string;
  systemPrompt: string;
  allowedTools: string[];
  maxTurns: number;
  model: string;
}

const AGENT_DEFINITIONS: Record<string, AgentConfig> = {
  coder: {
    role: "Coder Agent",
    model: "sonnet",
    systemPrompt:
      "You are an isolated code generator. Implement React components in src/, Tailwind styling, and Vitest unit tests for the target spec. Do not modify .feature files.",
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash(npx vitest:*)",
      "Bash(npx tsc:*)",
    ],
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
    allowedTools: ["Read", "Edit", "Write", "Bash(npm run test:crap)"],
    maxTurns: 25,
  },
  hardener: {
    role: "Hardener Agent",
    model: "sonnet",
    systemPrompt:
      "You are a mutation testing expert. Analyze Stryker mutation test reports and write boundary unit test assertions to kill surviving mutants.",
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash(npx vitest:*)",
      "Bash(npx stryker:*)",
    ],
    maxTurns: 12,
  },
  qa: {
    role: "QA Acceptance Agent",
    model: "sonnet",
    systemPrompt:
      "You are a QA verification agent. Execute BDD acceptance tests against the implementation to verify full adherence to the Gherkin specification.",
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash(npx cucumber-js:*)",
      "Bash(npx playwright:*)",
    ],
    maxTurns: 8,
  },
};

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

function runCommand(command: string): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv,
    });

    return { code: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    const err = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      code: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
    };
  }
}

function runAgentCommand(command: string): number {
  const cleanEnv = {
    ...process.env,
    CLAUDE_NO_SESSION_CACHE: "1",
  };
  delete cleanEnv.CLAUDECODE;

  try {
    execSync(command, {
      encoding: "utf8",
      stdio: "inherit",
      env: cleanEnv,
    });

    return 0;
  } catch (error: unknown) {
    const err = error as { status?: number };
    return err.status ?? 1;
  }
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

function executeStageWithRetry(
  agentKey: keyof typeof AGENT_DEFINITIONS,
  specPath: string,
  gateName: string,
  gateCommand: string,
  preGateCommand?: string,
  additionalContext?: string,
): boolean {
  const agent = AGENT_DEFINITIONS[agentKey];
  let lastErrorDetails = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    purgeWorkspaceCache();

    const startTime = new Date().toISOString();
    console.log("\n==================================================");
    console.log(
      `🤖 [${startTime}] Spawning ${agent.role} (Attempt ${attempt}/${MAX_RETRIES}) [Isolated Context]`,
    );
    console.log("==================================================");

    // Construct the prompt from the agent instructions and Gherkin specification.
    const specContent = fs.readFileSync(specPath, "utf8");
    let fullPrompt = `${agent.systemPrompt}\n\nSPECIFICATION (${path.basename(specPath)}):\n\`\`\`gherkin\n${specContent}\n\`\`\``;

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

    const allowedToolsArgs = agent.allowedTools
      .map((tool) => `"${tool}"`)
      .join(" ");

    const cmd = [
      "npx",
      "@anthropic-ai/claude-code",
      "-p",
      JSON.stringify(fullPrompt),
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      allowedToolsArgs,
      "--max-turns",
      agent.maxTurns.toString(),
    ].join(" ");

    const agentStart = Date.now();
    const agentCode = runAgentCommand(cmd);
    const agentDuration = ((Date.now() - agentStart) / 1000).toFixed(2);

    const estimatedOutputTokens = agent.maxTurns * 150;
    console.log(
      `📊 [Token Telemetry] Session Summary: Duration: ${agentDuration}s | Max Turn Budget: ${agent.maxTurns} | Est. Total Session Tokens: ~${estimatedInputTokens + estimatedOutputTokens}`,
    );

    if (agentCode !== 0) {
      console.log(
        `\n⚠️ [${new Date().toISOString()}] ${agent.role} finished with non-zero exit code ${agentCode}.`,
      );
      lastErrorDetails = `Agent process exited with code ${agentCode} (reached max turns or unhandled exception).`;
      continue;
    }

    if (preGateCommand) {
      console.log(`\n⚙️ Running pre-gate command: ${preGateCommand}`);
      const preStart = Date.now();
      const preRes = runCommand(preGateCommand);
      const preDuration = ((Date.now() - preStart) / 1000).toFixed(2);

      if (preRes.code !== 0) {
        lastErrorDetails = preRes.stderr || preRes.stdout;
        console.error(`❌ Pre-gate failed in ${preDuration}s.`);
        continue;
      }
    }

    console.log(`\n🛡️ Running verification gate: ${gateName} (${gateCommand})`);
    const gateStart = Date.now();
    const gateRes = runCommand(gateCommand);
    const gateDuration = ((Date.now() - gateStart) / 1000).toFixed(2);

    if (gateRes.code === 0) {
      console.log(
        `\n🎉 [${new Date().toISOString()}] Verification Gate "${gateName}" PASSED in ${gateDuration}s.`,
      );
      return true;
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
  return false;
}

function main(): void {
  const args = process.argv.slice(2);
  const specIndex = args.indexOf("--spec");

  if (specIndex === -1 || !args[specIndex + 1]) {
    console.error("✗ Error: Provide a spec file using --spec <path>");
    process.exit(1);
  }

  const specPath = path.resolve(args[specIndex + 1]);

  if (!fs.existsSync(specPath)) {
    console.error(`✗ Error: Spec not found at ${specPath}`);
    process.exit(1);
  }

  console.log(`✓ Loading spec: ${path.basename(specPath)}`);
  const initialHash = computeFileHash(specPath);

  runCommand(`git add "${specPath}"`);
  if (runCommand("git diff --cached --quiet").code !== 0) {
    runCommand(
      `git commit -m "docs(spec): lock human-authored baseline for ${path.basename(specPath)}"`,
    );
    console.log("✓ Committed spec baseline.");
  }

  try {
    console.log(
      "\n--- Starting Optimized Isolated Agent Gauntlet Pipeline ---",
    );

    // STAGE 1: CODER
    if (
      !executeStageWithRetry(
        "coder",
        specPath,
        "TypeCheck & Vitest Unit Tests",
        "npx tsc --noEmit && npx vitest run",
      )
    ) {
      process.exit(1);
    }

    runCommand(
      `git add . && git commit -m "feat(coder): implement feature and unit tests"`,
    );

    // STAGE 2: CLEANER
    // Generate the report after Coder finishes, before Cleaner is spawned.
    const cleanerBaseline = generateCleanerBaseline();

    const cleanerContext = `
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

    if (
      !executeStageWithRetry(
        "cleaner",
        specPath,
        "CRAP4TS Analysis",
        "npm run test:crap",
        undefined,
        cleanerContext,
      )
    ) {
      process.exit(1);
    }

    runCommand(
      `git add . && git commit -m "refactor(clean): optimize complexity"`,
    );

    // STAGE 3: HARDENER
    if (
      !executeStageWithRetry(
        "hardener",
        specPath,
        "Stryker Mutation Testing",
        "npx stryker run",
      )
    ) {
      process.exit(1);
    }

    runCommand(
      `git add . && git commit -m "test(hardener): pass mutation score thresholds"`,
    );

    // STAGE 4: QA
    if (
      !executeStageWithRetry(
        "qa",
        specPath,
        "BDD Acceptance Tests",
        `npx cucumber-js "${specPath}"`,
      )
    ) {
      process.exit(1);
    }

    runCommand(
      `git add . && git commit -m "test(qa): pass BDD acceptance scenarios"`,
    );

    console.log("\n-> Running final Vite production build check...");
    const buildRes = runCommand("npm run build");

    if (buildRes.code !== 0) {
      console.error(
        `❌ Final Vite production build failed:\n${buildRes.stderr}`,
      );
      process.exit(1);
    }

    console.log(
      "\n🎉 Deterministic agent gauntlet completed successfully! Ready for Vercel.",
    );
  } finally {
    if (computeFileHash(specPath) !== initialHash) {
      console.error(
        "\n🚨 SECURITY ERROR: Spec file was modified! Reverting...",
      );
      runCommand(`git checkout "${specPath}"`);
      process.exit(1);
    }

    console.log("✓ Spec integrity verified.");
  }
}

main();
