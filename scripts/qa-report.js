const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "qa-results");
const jsonPath = path.join(reportDir, "last-run.json");
const mdPath = path.join(reportDir, "last-run.md");
const port = Number(process.env.QA_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

const flowNotes = [
  {
    match: /loads to the current plan/i,
    flow: "first app open / new user",
    why: "The app must be usable before sync, AI, or setup.",
    type: "UX/state",
    owner: "app.js renderHome/init"
  },
  {
    match: /new plan onboarding presents clear paths/i,
    flow: "new plan onboarding choice",
    why: "A new user should understand the available plan paths before entering setup.",
    type: "UX",
    owner: "app.js renderPlanStart"
  },
  {
    match: /guided onboarding/i,
    flow: "guided plan onboarding",
    why: "The easiest setup path should stay calm, minimal, and low-decision.",
    type: "UX",
    owner: "app.js renderSetup"
  },
  {
    match: /advanced onboarding/i,
    flow: "advanced plan onboarding",
    why: "Extra plan controls should appear only after the user chooses a detailed setup path.",
    type: "UX",
    owner: "app.js renderSetup"
  },
  {
    match: /backend dependency/i,
    flow: "plan generation backend boundary",
    why: "A user should not discover sync or backend requirements only after committing to plan generation.",
    type: "UX/backend boundary",
    owner: "app.js savePlanSetup/generatePersonalPlan"
  },
  {
    match: /limitations live in settings/i,
    flow: "settings / optional limitations",
    why: "Most users should not see limitation controls unless they choose to manage them.",
    type: "UX/state",
    owner: "app.js renderSettings/renderLimitationsSettings"
  },
  {
    match: /enabled limitations save/i,
    flow: "settings / plan limitations",
    why: "Temporary or indefinite constraints should update future plan previews without cluttering workout mode.",
    type: "state/plan generation boundary",
    owner: "app.js saveLimitationsSettings/generatePlanBias"
  },
  {
    match: /continue directly into today's workout/i,
    flow: "returning user / continue current plan",
    why: "Returning users should land on today's work, not manually choose date/week.",
    type: "UX/state",
    owner: "app.js continueCurrentPlan/date helpers"
  },
  {
    match: /complete an item/i,
    flow: "complete and advance through workout",
    why: "The core gym loop is do the thing, mark done, see the next thing.",
    type: "state/technical",
    owner: "app.js markDone/render"
  },
  {
    match: /menu reaches/i,
    flow: "workout menu recovery paths",
    why: "Less common choices should be reachable without cluttering workout mode.",
    type: "UX",
    owner: "app.js showWorkoutMenu"
  },
  {
    match: /calendar highlights today/i,
    flow: "calendar / today orientation",
    why: "The user should always know what today is.",
    type: "UX/state",
    owner: "app.js calendarDay/date helpers"
  },
  {
    match: /alternatives/i,
    flow: "swap unavailable equipment",
    why: "If equipment does not work, the user needs a simple next-best action.",
    type: "UX/backend boundary",
    owner: "app.js loadAlternatives/renderAlternativesPanel"
  },
  {
    match: /primary action visible/i,
    flow: "mobile workout minimalism",
    why: "Workout mode should stay obvious and uncluttered on a phone.",
    type: "UX",
    owner: "index.html/app.js/style.css"
  },
  {
    match: /does not require sync setup/i,
    flow: "offline/local core workout",
    why: "Backend setup must not block core workout use.",
    type: "state/backend boundary",
    owner: "app.js sync/generation boundaries"
  },
  {
    match: /quick action menu/i,
    flow: "forgiving recovery actions",
    why: "Hidden recovery paths should exist without crowding the page.",
    type: "UX",
    owner: "app.js attachWorkoutHoldMenu/showWorkoutMenu"
  },
  {
    match: /empty workout data/i,
    flow: "missing or empty workout data",
    why: "Bad data should fail softly instead of stranding the user.",
    type: "state/data",
    owner: "app.js init/buildSelectors/getActivePlan"
  }
];

function serveFile(req, res) {
  const urlPath = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.normalize(path.join(root, decodeURIComponent(urlPath)));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {"Content-Type": contentType(filePath)});
    res.end(content);
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".json")) return "application/json";
  return "text/plain";
}

function run(command, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: root,
      env: {...process.env, QA_BASE_URL: baseURL, ...options.env},
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", code => resolve({code, stdout, stderr}));
  });
}

function noteFor(title) {
  return flowNotes.find(note => note.match.test(title)) || {
    flow: "unknown flow",
    why: "This test protects the product goal.",
    type: "unknown",
    owner: "app.js"
  };
}

function flattenSuites(suites, results = []) {
  for (const suite of suites || []) {
    flattenSuites(suite.suites, results);
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = test.results && test.results[0] || {};
        results.push({
          title: spec.title,
          ok: spec.ok,
          status: result.status || (test.ok ? "passed" : "failed"),
          error: result.error && (result.error.message || result.error),
          duration: result.duration || 0
        });
      }
    }
  }
  return results;
}

function writeReport(rawJson, exitCode) {
  fs.mkdirSync(reportDir, {recursive: true});
  fs.writeFileSync(jsonPath, rawJson || "{}");

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    parsed = {suites: []};
  }

  const results = flattenSuites(parsed.suites);
  const passed = results.filter(result => result.ok);
  const failed = results.filter(result => !result.ok);
  const lines = [
    "# QA Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Command: npm run qa`,
    `Result: ${failed.length ? "FAILED" : "PASSED"}`,
    `Passed: ${passed.length}`,
    `Failed: ${failed.length}`,
    ""
  ];

  lines.push("## Passed");
  if (!passed.length) lines.push("", "- None");
  for (const result of passed) {
    const note = noteFor(result.title);
    lines.push("", `- ${result.title}`, `  - Flow: ${note.flow}`, `  - Why it matters: ${note.why}`);
  }

  lines.push("", "## Failed");
  if (!failed.length) lines.push("", "- None");
  for (const result of failed) {
    const note = noteFor(result.title);
    lines.push(
      "",
      `- ${result.title}`,
      `  - Flow: ${note.flow}`,
      `  - Why it matters: ${note.why}`,
      `  - Likely issue type: ${note.type}`,
      `  - Likely file/component: ${note.owner}`,
      `  - Error: ${(result.error || result.status || "Unknown failure").split("\n")[0]}`
    );
  }

  lines.push("", "## Next Review Step");
  lines.push(failed.length
    ? "Start with the highest product-risk failed flow above. Fix only the smallest consistent change, then rerun `npm run qa`."
    : "Use `product/FUTURE_CHANGE_CHECKLIST.md` before the next app edit.");

  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`);
  console.log(`\nQA report written to ${path.relative(root, mdPath)}`);
  process.exit(exitCode);
}

async function main() {
  fs.mkdirSync(reportDir, {recursive: true});
  const server = http.createServer(serveFile);
  await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

  const result = await run("npx", ["playwright", "test", "--reporter=json"]);
  server.close(() => writeReport(result.stdout, result.code));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
