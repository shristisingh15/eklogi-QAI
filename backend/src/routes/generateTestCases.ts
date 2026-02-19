// backend/src/routes/generateTests.ts
import express, { Request, Response } from "express";
import { callOpenAI } from "../lib/openai"; // <-- adjust path if needed

const router = express.Router();

/* ---------- small helpers ---------- */

function extractJsonString(text: string | undefined | null): string | null {
  if (!text || typeof text !== "string") return null;

  // fenced json block ```json ... ```
  const fencedJson = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedJson && fencedJson[1]) return fencedJson[1].trim();

  // any fenced code block ``` ... ```
  const fenced = text.match(/```([\s\S]*?)```/);
  if (fenced && fenced[1]) {
    const candidate = fenced[1].trim();
    if (/^[\[\{]/.test(candidate)) return candidate;
  }

  // first JSON array [...]
  const arrayMatch = text.match(/(\[[\s\S]*\])/);
  if (arrayMatch) return arrayMatch[1];

  // first JSON object {...}
  const objMatch = text.match(/(\{[\s\S]*\})/);
  if (objMatch) return objMatch[1];

  return null;
}

function tryParseJson(candidate: string | null): any | null {
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      // basic cleanups
      const cleaned = candidate
        .replace(/,\s*([}\]])/g, "$1") // remove trailing commas before } or ]
        .replace(/,\s*$/gm, "") // trailing commas at line ends
        .replace(/\t/g, "    ");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

/* ---------- generation helpers ---------- */

/**
 * Generate example test code per scenario (keeps previous behavior).
 * Returns array of { scenarioId, title, code }.
 */
async function generateCodesFromScenarios(scenarios: any[], framework = "JUnit", language = "Java") {
  const codes: Array<{ scenarioId: any; title: string; code: string }> = [];

  for (const s of scenarios) {
    const prompt = `
You are a code generation assistant. Produce a minimal ${framework} ${language} test file (no extra commentary).
Output only the code inside a fenced block with the language tag, e.g. \`\`\`java ... \`\`\`.

Scenario title: ${s.title || "(untitled)"}
Description: ${s.description || ""}
Steps:
${(s.steps || []).map((st: string, i: number) => `${i + 1}. ${st}`).join("\n")}
Expected result: ${s.expected_result || ""}

Produce a short, runnable-looking ${language} JUnit test that follows the steps (use placeholders for selectors/values).
Keep it concise (about ~40-80 lines).
    `;

    try {
      // If your callOpenAI supports options, you can pass temperature:0 as second arg
      const aiRaw = await callOpenAI(prompt as any);
      const rawText = typeof aiRaw === "string" ? aiRaw : JSON.stringify(aiRaw);

      // extract fenced block code if present
      const fencedMatch = rawText.match(/```(?:java)?\s*([\s\S]*?)\s*```/i);
      const codeContent = fencedMatch && fencedMatch[1] ? fencedMatch[1].trim() : rawText;

      codes.push({
        scenarioId: s._id ?? null,
        title: s.title ?? "Test",
        code: codeContent,
      });
    } catch (err) {
      codes.push({
        scenarioId: s._id ?? null,
        title: s.title ?? "Test",
        code: `// Failed to generate code for scenario "${s.title || "untitled"}" - ${String(err)}`,
      });
    }
  }

  return codes;
}

/**
 * Generate strict JSON test cases for scenarios.
 * Returns { testCases: any[], raw: string }.
 */
async function generateTestCasesFromScenarios(scenarios: any[]) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return { testCases: [], raw: "" };
  }

  const scenarioText = scenarios
    .map((s: any, i: number) => {
      const steps = (s.steps || []).map((st: string, idx: number) => `${idx + 1}. ${st}`).join("\n");
      return `Scenario ${i + 1} Title: ${s.title || ""}\nDescription: ${s.description || ""}\nSteps:\n${steps}\nExpected: ${s.expected_result || ""}`;
    })
    .join("\n\n---\n\n");

  const prompt = `
You are a QA test-case generator. Return ONLY valid JSON (no extra commentary).

Generate test cases for the following scenarios (combine all into a single JSON array).

INPUT:
${scenarioText}

OUTPUT EXACT format (must be valid JSON array only):
[
  {
    "title": "<short title>",
    "preconditions": ["<precondition1>", "..."],
    "steps": ["Step 1", "Step 2", "..."],
    "expected_result": "<expected result text>"
  }
  // ...more objects
]

Rules:
- Return ONLY the JSON array (no explanations, no surrounding text).
- If producing test cases for multiple scenarios return a flat array containing all test cases.
- Keep steps concise and actionable.
  `;

  // Call model
  const aiRaw = await callOpenAI(prompt as any);
  const rawText = typeof aiRaw === "string" ? aiRaw : JSON.stringify(aiRaw);

  // Attempt extraction & parse
  const maybeJson = extractJsonString(rawText);
  let parsed = tryParseJson(maybeJson);

  if (!parsed) parsed = tryParseJson(rawText);

  const testCases = Array.isArray(parsed) ? parsed : [];
  return { testCases, raw: rawText };
}

/* ---------- main route ---------- */

/**
 * POST /api/projects/:id/generate-tests
 * Body: { framework, language, scenarios, uploadedFiles }
 */
router.post("/api/projects/:id/generate-tests", async (req: Request, res: Response) => {
  try {
    const {
      framework = "JUnit",
      language = "Java",
      scenarios = [],
      uploadedFiles = [],
    } = req.body || {};

    // Validate scenarios
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return res.status(400).json({ ok: false, error: "No scenarios provided" });
    }

    // 1) generate codes (keep existing behavior)
    let codes: Array<{ scenarioId: any; title: string; code: string }> = [];
    try {
      codes = await generateCodesFromScenarios(scenarios, framework, language);
    } catch (err) {
      console.error("Error generating codes:", err);
      codes = []; // fallback
    }

    // 2) generate structured test cases (strict JSON)
    let testCases: any[] = [];
    let raw: string = "";
    try {
      const result = await generateTestCasesFromScenarios(scenarios);
      testCases = result.testCases || [];
      raw = result.raw || "";
    } catch (err) {
      console.error("Error generating test cases:", err);
      testCases = [];
      raw = String(err ?? "");
    }

    // 3) fallback: if AI failed to produce structured test cases, create simple mapping from scenarios
    if (!Array.isArray(testCases) || testCases.length === 0) {
      const fallback = scenarios.map((s: any, i: number) => ({
        title: s.title || `Scenario ${i + 1}`,
        preconditions: [],
        steps: s.steps || [],
        expected_result: s.expected_result || "",
      }));

      // If testCases empty, use fallback but keep raw for debugging
      if (fallback.length > 0) {
        testCases = fallback;
      }
    }

    // 4) respond (preserve codes for compatibility)
    return res.json({
      ok: true,
      codes,
      testCases,
      raw,
    });
  } catch (err: any) {
    console.error("generate-tests handler error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

export default router;
