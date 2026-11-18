import * as fs from "fs";

try {
  const inputBuffer = fs.readFileSync(0, "utf-8");
  const event = JSON.parse(inputBuffer);
  const filePath: string =
    event.tool_input?.file_path || event.tool_input?.path || "";

  if (filePath.endsWith(".feature")) {
    console.error(
      `🚨 BLOCKED: "${filePath}" is a human-authored spec and is read-only.`,
    );
    process.exit(2); // Exit code 2 cancels the tool call and feeds stderr back to Claude
  }
  process.exit(0);
} catch (error) {
  process.exit(0);
}
