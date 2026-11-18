import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAX_RETRIES = 7;

interface AgentConfig {
  role: string;
  systemPrompt: string;
  allowedTools: string[];
  maxTurns: number;
}

const AGENT_DEFINITIONS: Record<string, AgentConfig> = {
  coder: {
    role: "Coder Agent",
    systemPrompt:
      "You are an automated code generator. Read the target Gherkin spec. Implement the React components in src/, Tailwind styling, and Vitest unit tests immediately. Adhere strictly to CLAUDE.md guidelines. Do not modify .feature files. Proactively log what you are currently working on and what tools/commands you are executing in the console.",
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash(npx vitest:*)",
      "Bash(npx tsc:*)",
    ],
    maxTurns: 25,
  },
  cleaner: {
    role: "Cleaner Agent",
    systemPrompt:
      "You are a refactoring specialist. Refactor React components and TypeScript logic to reduce cyclomatic complexity and lower CRAP scores below 15. Ensure all Vitest tests remain green. Proactively log what files you are refactoring and what commands you are running.",
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash(npx vitest:*)",
      "Bash(npx crap4ts:*)",
    ],
    maxTurns: 10,
  },
  hardener: {
    role: "Hardener Agent",
    systemPrompt:
      "You are a mutation testing expert. Analyze Stryker mutation test reports, identify surviving mutants in React hooks or utility functions, and write boundary unit test assertions to kill them. Announce what test files you are modifying.",
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
  const cleanEnv = { ...process.env };
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

function executeStageWithRetry(
  agentKey: keyof typeof AGENT_DEFINITIONS,
  specPath: string,
  gateName: string,
  gateCommand: string,
  preGateCommand?: string,
): boolean {
  const agent = AGENT_DEFINITIONS[agentKey];
  let lastErrorDetails = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const startTime = new Date().toISOString();
    console.log(`\n==================================================`);
    console.log(
      `🤖 [${startTime}] Spawning ${agent.role} (Attempt ${attempt}/${MAX_RETRIES})`,
    );
    console.log(`==================================================`);

    let fullPrompt = `${agent.systemPrompt}\nTarget Specification: ${specPath}`;
    if (attempt > 1 && lastErrorDetails) {
      console.log(
        `\n🔍 [Feedback Loop] Feeding factual error report from previous attempt into ${agent.role}...`,
      );
      fullPrompt += `\n\n⚠️ PREVIOUS ATTEMPT FAILED verification gate "${gateName}".\nHere is the exact factual error output from the test runner that you must fix:\n\`\`\`\n${lastErrorDetails}\n\`\`\`\nAnalyze this factual error, inspect your code, apply fixes, and re-run verification.`;
    }

    const allowedToolsArgs = agent.allowedTools.map((t) => `"${t}"`).join(" ");

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

    if (agentCode !== 0) {
      console.log(
        `\n⚠️ [${new Date().toISOString()}] ${agent.role} finished with non-zero exit code ${agentCode} in ${agentDuration}s.`,
      );
      lastErrorDetails = `Agent process exited with code ${agentCode} (reached max turns or encountered an unhandled tool exception).`;
      continue;
    }

    console.log(
      `\n✓ [${new Date().toISOString()}] ${agent.role} completed working session in ${agentDuration}s.`,
    );

    if (preGateCommand) {
      console.log(`\n--------------------------------------------------`);
      console.log(`⚙️ Running pre-gate command: ${preGateCommand}`);
      console.log(`--------------------------------------------------`);
      const preStart = Date.now();
      const preRes = runCommand(preGateCommand);
      const preDuration = ((Date.now() - preStart) / 1000).toFixed(2);

      if (preRes.code !== 0) {
        lastErrorDetails = preRes.stderr || preRes.stdout;
        console.error(`❌ Pre-gate failed in ${preDuration}s.`);
        console.error(`Factual Error Output:\n${lastErrorDetails}`);
        continue;
      }
      console.log(`✓ Pre-gate passed successfully in ${preDuration}s.`);
    }

    console.log(`\n--------------------------------------------------`);
    console.log(`🛡️ Running verification gate: ${gateName}`);
    console.log(`Command: ${gateCommand}`);
    console.log(`--------------------------------------------------`);

    const gateStart = Date.now();
    const gateRes = runCommand(gateCommand);
    const gateDuration = ((Date.now() - gateStart) / 1000).toFixed(2);

    if (gateRes.code === 0) {
      console.log(
        `\n🎉 [${new Date().toISOString()}] Verification Gate "${gateName}" PASSED successfully in ${gateDuration}s.`,
      );
      return true;
    }

    lastErrorDetails = gateRes.stderr || gateRes.stdout;
    console.error(
      `\n❌ [${new Date().toISOString()}] Verification Gate "${gateName}" FAILED in ${gateDuration}s.`,
    );
    console.error(`---------------- Factual Error Report ----------------`);
    console.error(lastErrorDetails.trim());
    console.error(`------------------------------------------------------`);
  }

  console.error(
    `\n❌ Fatal: Stage "${agent.role}" failed after maximum ${MAX_RETRIES} retries.`,
  );
  return false;
}

function main() {
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
  if (runCommand(`git diff --cached --quiet`).code !== 0) {
    runCommand(
      `git commit -m "docs(spec): lock human-authored baseline for ${path.basename(specPath)}"`,
    );
    console.log(`✓ Committed spec baseline.`);
  }

  try {
    console.log(
      `\n--- Starting Agent Gauntlet Pipeline (Max Retries: ${MAX_RETRIES}) ---`,
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
      `git add . && git commit -m "feat(coder): implement feature and unit tests for ${path.basename(specPath)}"`,
    );

    // STAGE 2: CLEANER
    if (
      !executeStageWithRetry(
        "cleaner",
        specPath,
        "CRAP4TS Analysis",
        "npx crap4ts --threshold 15",
        "npx vitest run --coverage",
      )
    ) {
      process.exit(1);
    }
    runCommand(
      `git add . && git commit -m "refactor(clean): optimize complexity and reduce CRAP score"`,
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
      `git add . && git commit -m "test(qa): pass BDD acceptance scenarios for ${path.basename(specPath)}"`,
    );

    console.log(`\n-> Running final Vite production build check...`);
    const buildRes = runCommand("npm run build");
    if (buildRes.code !== 0) {
      console.error(
        `❌ Final Vite production build failed:\n${buildRes.stderr}`,
      );
      process.exit(1);
    }

    console.log(
      `\n🎉 Deterministic agent gauntlet completed successfully! Ready for Vercel deployment.`,
    );
  } finally {
    if (computeFileHash(specPath) !== initialHash) {
      console.error(
        "\n🚨 SECURITY ERROR: Spec file was modified! Reverting...",
      );
      runCommand(`git checkout "${specPath}"`);
      process.exit(1);
    }
    console.log("✓ Spec integrity verified: Human source-of-truth untouched.");
  }
}

main();
