import mongoose from "mongoose";
import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import mammoth from "mammoth";
import { Project } from "../models/Project";
import { ProjectFile } from "../models/ProjectFiles";
import { BusinessProcess } from "../models/BusinessProcess";
import { Scenario } from "../models/Scenario";
import { TestCase } from "../models/TestCase"; // adjust the path if needed


export const projectsRouter = Router();

// OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

/** Convert DB project doc -> UI shape */
function toUI(p: any) {
  return {
    _id: String(p._id),
    name: p.projectName,
    description: p.description ?? "",
    type: p.projectType ?? "Web",
    date: p.date ?? "",
    step: typeof p.progress === "number" ? `${p.progress}%` : "0%",
  };
}

/* ---------- helpers for robust JSON extraction (for test-cases / regenerate flows) ---------- */

function extractJsonString(text: string | undefined | null): string | null {
  if (!text || typeof text !== "string") return null;

  // 1) fenced json block ```json ... ```
  const fencedJson = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedJson && fencedJson[1]) return fencedJson[1].trim();

  // 2) any fenced code block ``` ... ```
  const fenced = text.match(/```([\s\S]*?)```/);
  if (fenced && fenced[1]) {
    const candidate = fenced[1].trim();
    if (/^[\[\{]/.test(candidate)) return candidate;
  }

  // 3) first JSON array [...]
  const arrayMatch = text.match(/(\[[\s\S]*\])/);
  if (arrayMatch) return arrayMatch[1];

  // 4) first JSON object {...}
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
      // basic cleanup attempts to handle trailing commas, etc.
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

/* ---------- ROUTES (existing) ---------- */

/**
 * GET /projects
 */
projectsRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.max(Number(req.query.limit || 12), 1);

    const filter = q
      ? {
          $or: [
            { projectName: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const raw = await Project.find(filter).sort({ _id: -1 }).limit(limit).lean();
    res.json({ items: raw.map(toUI), total: raw.length });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /projects/:id
 */
projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const doc = await Project.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "not found" });
    res.json(toUI(doc));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /projects
 */
projectsRouter.post("/", async (req, res, next) => {
  try {
    const { name, description, type, date, step } = req.body || {};
    if (!name) return res.status(400).json({ message: "name is required" });

    const progress =
      typeof step === "string" ? Number(step.match(/\d+/)?.[0] || 0) : 0;

    const created = await Project.create({
      projectName: name,
      description: description ?? "",
      projectType: type ?? "Web",
      date: date ?? new Date().toISOString().split("T")[0],
      progress,
    });

    res.status(201).json(toUI(created));
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /projects/:id
 */
projectsRouter.put("/:id", async (req, res, next) => {
  try {
    const { name, description, type, date, step } = req.body || {};

    const update: Record<string, any> = {};
    if (name !== undefined) update.projectName = name;
    if (description !== undefined) update.description = description;
    if (type !== undefined) update.projectType = type;
    if (date !== undefined) update.date = date;
    if (step !== undefined) {
      update.progress =
        typeof step === "string" ? Number(step.match(/\d+/)?.[0] || 0) : 0;
    }

    const updated = await Project.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!updated) return res.status(404).json({ message: "not found" });

    res.json(toUI(updated));
  } catch (e) {
    next(e);
  }
});

/**
 * POST /projects/:id/upload
 */
projectsRouter.post("/:id/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "file is required" });

    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ message: "project not found" });

    const count = await ProjectFile.countDocuments({ projectId: req.params.id });
    const version = `v${count + 1}.0`;

    const saved = await ProjectFile.create({
      projectId: req.params.id,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
      uploadedAt: new Date(),
      version,
    });

    console.log("✅ File uploaded:", saved.filename, saved.version);

    return res.status(201).json({
      ok: true,
      fileId: saved._id,
      filename: saved.filename,
      version: saved.version,
    });
  } catch (err: any) {
    console.error("❌ Upload failed:", err);
    return res.status(500).json({ message: "Upload failed", error: String(err.message || err) });
  }
});

/**
 * GET /projects/:id/files
 */
projectsRouter.get("/:id/files", async (req, res, next) => {
  try {
    const files = await ProjectFile.find({ projectId: req.params.id })
      .sort({ uploadedAt: 1 })
      .lean();

    res.json(
      files.map((f) => ({
        _id: f._id,
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size,
        version: f.version,
        uploadedAt: f.uploadedAt,
      }))
    );
  } catch (e) {
    next(e);
  }
});

/**
 * GET /projects/:id/files/:fileId
 */
projectsRouter.get("/:id/files/:fileId", async (req, res, next) => {
  try {
    const file = await ProjectFile.findOne({
      _id: req.params.fileId,
      projectId: req.params.id,
    });

    if (!file) return res.status(404).json({ message: "file not found" });

    res.set({
      "Content-Type": file.mimetype,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    });
    res.send(file.data);
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /projects/:id
 */
projectsRouter.delete("/:id", async (req, res, next) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    await ProjectFile.deleteMany({ projectId: req.params.id });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/**
 * POST /projects/:id/regenerate
 */
projectsRouter.post("/:id/regenerate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "file is required" });
    }
    console.log("📂 Regenerate triggered with file:", req.file.originalname, "mimetype:", req.file.mimetype);

    // ---- Extraction helper ----
    async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
      try {
        const { default: pdfParse } = await import("pdf-parse-fixed");
        const pdf = await pdfParse(buffer);
        if (pdf?.text && pdf.text.trim().length > 0) {
          console.log("📄 extracted via pdf-parse-fixed, length:", pdf.text.length);
          return pdf.text;
        }
      } catch (err: any) {
        console.warn("⚠️ pdf-parse-fixed failed:", err?.message || err);
      }
      // fallback
      const raw = buffer.toString("utf8");
      const cleaned = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ");
      return cleaned.slice(0, 200000);
    }

    // ---- Extract content ----
    let content = "";
    const name = req.file.originalname || "";
    const mimetype = req.file.mimetype || "";

    if (mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      content = await extractTextFromPdfBuffer(req.file.buffer);
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.toLowerCase().endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      content = result?.value || "";
    } else {
      content = req.file.buffer.toString("utf8");
    }

    console.log("📄 Extracted content length:", content.length);

    // ---- Candidate processes from Mongo ----
    const id = req.params.id;
    let processes: any[] = await BusinessProcess.find({
      $or: [{ projectId: id }, { applicationId: id }, { processId: id }],
    }).lean();

    if (!processes || processes.length === 0) {
      processes = await BusinessProcess.find({}).limit(200).lean();
      console.warn("⚠️ Falling back to ALL business processes. Count:", processes.length);
    }

    if (processes.length === 0) {
      return res.json({ ok: true, matchedCount: 0, items: [], note: "No business processes found" });
    }

    // ---- Local scorer ----
    const tokenize = (text: string) =>
      Array.from(
        new Set(
          (text || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2)
        )
      );

    const docTokens = tokenize(content);

    function scoreOverlap(bpText: string) {
      const bpTokens = tokenize(bpText);
      let common = 0;
      const bpSet = new Set(bpTokens);
      for (const t of docTokens) if (bpSet.has(t)) common++;
      return common / Math.max(1, bpTokens.length);
    }

    // ---- Build LLM prompt ----
    const bpListStr = processes
      .map((bp, i) => `${i + 1}. id=${bp._id} name="${bp.name}" desc="${(bp.description || "").slice(0, 200)}" priority=${bp.priority || "Medium"}`)
      .join("\n");

    const docSnippet = content.length > 9000 ? content.slice(0, 9000) : content;
    const prompt = `You are a precise assistant. Given the document below and a list of BUSINESS PROCESSES, RETURN A JSON ARRAY OF THE RELEVANT PROCESSES (by id).

Rules:
- Strict JSON only.
- Each object: "_id", "name", "description", "priority".
- If none clearly match, return top 3 likely matches instead.

DOCUMENT:
"""${docSnippet}"""

BUSINESS PROCESSES:
${bpListStr}
`;

    console.log("🤖 Sending prompt to OpenAI…");

    // ---- Call OpenAI ----
    let aiText = "";
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 1500,
      });
      aiText = response.choices?.[0]?.message?.content || "";
      console.log("🔹 Raw OpenAI output (trim):", aiText.slice(0, 400));
    } catch (err: any) {
      console.error("❌ OpenAI call failed:", err);
    }

    // ---- Parse JSON ----
    let items: any[] = [];
    let parsed = false;
    if (aiText) {
      try {
        const fenceMatch = aiText.match(/```json([\s\S]*?)```/i);
        const jsonText = fenceMatch ? fenceMatch[1].trim() : aiText.trim();
        items = JSON.parse(jsonText || "[]");
        parsed = true;
      } catch (err) {
        console.warn("⚠️ JSON parse failed:", err);
      }
    }

    // ---- Combine with local scores ----
    const scoredAll = processes.map((bp) => {
      const text = `${bp.name} ${bp.description || ""}`;
      return { bp, score: scoreOverlap(text) };
    });

    const aiIds = new Set<string>();
    const mappedAiItems: any[] = [];
    if (parsed && Array.isArray(items)) {
      for (const it of items) {
        let p = processes.find((bp) => String(bp._id) === String(it._id));
        if (!p && it.name) {
          p = processes.find((bp) => (bp.name || "").toLowerCase() === String(it.name).toLowerCase());
        }
        if (p) {
          aiIds.add(String(p._id));
          const s = scoredAll.find((x) => String(x.bp._id) === String(p._id));
          mappedAiItems.push({
            _id: String(p._id),
            name: p.name,
            description: p.description,
            priority: p.priority || "Medium",
            _score: s ? s.score : 0,
            _filledFrom: "openai",
          });
        } else {
          mappedAiItems.push({ ...it, _filledFrom: "openai_unmapped" });
        }
      }
    }

    const remaining = scoredAll
      .filter((s) => !aiIds.has(String(s.bp._id)) && s.score > 0)
      .map((s) => ({
        _id: String(s.bp._id),
        name: s.bp.name,
        description: s.bp.description,
        priority: s.bp.priority || "Medium",
        _score: s.score,
        _filledFrom: "local_score",
      }));

    const finalItems = [...mappedAiItems, ...remaining].sort((a: any, b: any) => {
      const sa = typeof a._score === "number" ? a._score : 0;
      const sb = typeof b._score === "number" ? b._score : 0;
      return sb - sa;
    });

    const branch = parsed ? "openai_plus_local" : "local_only";

    // === Persist matched results into Mongo ===
try {
  // cast project id to ObjectId
  const projObjId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

  // clear previous matched documents for this project
  await BusinessProcess.updateMany(
    { projectId: projObjId, matched: true },
    { $set: { matched: false } } // keep history but unmark old ones (safer than deleteMany)
  );

  if (finalItems.length > 0) {
    // Upsert each final item to preserve other fields if needed (avoid duplicates)
    const bulkOps = finalItems.map((bp) => {
      return {
        updateOne: {
          filter: { projectId: projObjId, name: bp.name }, // match by project + name (adjust if you prefer _id)
          update: {
            $set: {
              projectId: projObjId,
              name: bp.name,
              description: bp.description || "",
              priority: bp.priority || "Medium",
              matched: true,
              score: typeof bp._score === "number" ? bp._score : 0,
              source: bp._filledFrom || "openai_local",
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) {
      await BusinessProcess.bulkWrite(bulkOps);
    }
  }
} catch (persistErr: any) {
  console.error("❌ Failed to persist matched processes:", persistErr);
}


    console.log(`✅ Branch used: ${branch}, count: ${finalItems.length}`);
    return res.json({ ok: true, branch, matchedCount: finalItems.length });
  } catch (e: any) {
    console.error("❌ Regenerate failed:", e);
    return res.status(500).json({ ok: false, message: "Regenerate failed", error: String(e.message || e) });
  }
});

/**
 * POST /projects/:id/generate-bp
 * Uploads a file, asks OpenAI to generate business processes, saves them to Mongo, returns them.
 */
projectsRouter.post("/:id/generate-bp", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "file is required" });

    const projectId = req.params.id;

    // ---- Extract text from file ----
    let content = "";
    const name = req.file.originalname || "";
    const mimetype = req.file.mimetype || "";
    if (mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      const { default: pdfParse } = await import("pdf-parse-fixed");
      const pdf = await pdfParse(req.file.buffer);
      content = pdf.text || "";
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.toLowerCase().endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      content = result?.value || "";
    } else {
      content = req.file.buffer.toString("utf8");
    }

    // ---- Build prompt ----
    const docSnippet = content.length > 8000 ? content.slice(0, 8000) : content;
    const prompt = `
You are a business analyst. From the following document, extract 5–10 **Business Processes**.
Return only valid JSON array. Each object must have:
{ "name": string, "description": string, "priority": "Critical" | "High" | "Medium" | "Low" }

Document:
"""${docSnippet}"""
`;

    // ---- Call OpenAI ----
    let aiText = "";
try {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 1500,
  });
  aiText = response.choices?.[0]?.message?.content || "";
  console.log("🔹 Raw OpenAI output:", aiText.slice(0, 200));
} catch (err: any) {
  console.error("❌ OpenAI call failed:", err);
  return res.status(502).json({ ok: false, message: "OpenAI call failed", error: String(err.message || err) });
}

    // ---- Parse JSON ----
let items: any[] = [];
let parsed = false;

if (aiText) {
  try {
    // strip ```json ... ``` fences if present
    const fenceMatch = aiText.match(/```json([\s\S]*?)```/i);
    const jsonText = fenceMatch ? fenceMatch[1].trim() : aiText.trim();

    items = JSON.parse(jsonText || "[]");
    parsed = true;
  } catch (err) {
    console.warn("⚠️ JSON parse failed:", err);
    items = [];
  }
}

    // ---- Save to Mongo ----
    await BusinessProcess.deleteMany({ projectId, matched: true });
    const docsToInsert = items.map((bp) => ({
      projectId,
      name: bp.name || "Untitled",
      description: bp.description || "",
      priority: bp.priority || "Medium",
      matched: true,
      createdAt: new Date(),
    }));
    const inserted = await BusinessProcess.insertMany(docsToInsert);

    return res.json({ ok: true, count: inserted.length, items: inserted });
  } catch (err: any) {
    console.error("generate-bp failed:", err);
    return res.status(500).json({ ok: false, message: "generate-bp failed", error: String(err.message || err) });
  }
});

// POST /projects/:id/generate-scenarios
// - body: { bpIds: string[], prompt?: string }
// - returns: saved scenario docs
//
projectsRouter.post("/:id/generate-scenarios", upload.none(), async (req, res) => {
  try {
    const projectId = req.params.id;
    const { bpIds, prompt: promptOverride } = req.body || {};

    if (!projectId) return res.status(400).json({ ok: false, message: "projectId required" });
    if (!Array.isArray(bpIds) || bpIds.length === 0) {
      return res.status(400).json({ ok: false, message: "bpIds array required" });
    }

    // load the selected business processes
    const bps = await BusinessProcess.find({ _id: { $in: bpIds } }).lean();
    if (!bps || bps.length === 0) {
      return res.status(400).json({ ok: false, message: "No business processes found for given ids" });
    }

    // load project and most recent uploaded file (if any)
    const project = await Project.findById(projectId).lean();
    const latestFile = await ProjectFile.findOne({ projectId }).sort({ uploadedAt: -1 }).lean();

    // helper: extract text from a buffer (reuse approach from regenerate)
    async function extractTextFromBuffer(buffer: Buffer, filename = "", mimetype = ""): Promise<string> {
      try {
        if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
          const { default: pdfParse } = await import("pdf-parse-fixed");
          const pdf = await pdfParse(buffer);
          if (pdf?.text && pdf.text.trim().length > 0) return pdf.text;
        } else if (
          mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          filename.toLowerCase().endsWith(".docx")
        ) {
          const result = await mammoth.extractRawText({ buffer });
          if (result?.value) return result.value;
        }
      } catch (err) {
        console.warn("extractTextFromBuffer helper: primary extract failed:", (err as Error).message || err);
      }
      const raw = buffer.toString("utf8");
      const cleaned = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ");
      return cleaned.slice(0, 200000);
    }

    let buffer: Buffer | undefined;

    if (latestFile?.data) {
      if (latestFile.data instanceof Buffer) {
        buffer = latestFile.data;
      } else if ("buffer" in latestFile.data) {
        buffer = Buffer.from(latestFile.data.buffer);
      } else {
        buffer = Buffer.from(latestFile.data as Uint8Array);
      }
    }

    const docText = buffer && latestFile
      ? await extractTextFromBuffer(buffer, latestFile.filename, latestFile.mimetype)
      : "";

    // build LLM prompt
    const bpLines = bps
      .map((b, i) => `${i + 1}. id=${b._id} name="${b.name}" desc="${(b.description || "").slice(0, 300)}"`)
      .join("\n");

    const docSnippet = docText ? (docText.length > 8000 ? docText.slice(0, 8000) : docText) : "";

    const instructions = [
      `You are an expert QA engineer. Given the project info as documents and a list of selected BUSINESS PROCESSES, generate at least 5 testable manual test scenarios.`,
      `Output: a JSON array only. Each element must be an object with keys: "title" (string), "description" (string), "steps" (array of strings), "expected_result" (string).`,
      `Do not include any commentary; return valid JSON only.`,
    ].join("\n\n");

    const promptParts = [
      `Project: ${project?.projectName || projectId}`,
      project?.description ? `Project description: ${project.description}` : undefined,
      docSnippet ? `Document excerpt:\n"""${docSnippet}"""` : undefined,
      "Selected business processes:",
      bpLines,
      instructions,
      promptOverride ? `Additional instructions:\n${promptOverride}` : undefined,
    ].filter(Boolean).join("\n\n");

    console.log("generate-scenarios: sending prompt to OpenAI (preview):", promptParts.slice(0, 800));

    // call OpenAI
    let aiText2 = "";
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptParts }],
        temperature: 0.1,
        max_tokens: 1500,
      });
      aiText2 = response.choices?.[0]?.message?.content || "";
      console.log("generate-scenarios: raw AI output length:", aiText2.length);
    } catch (err: any) {
      console.error("generate-scenarios: OpenAI call failed:", err);
      return res.status(502).json({ ok: false, message: "OpenAI call failed", error: String(err?.message || err) });
    }

    // try parsing JSON robustly
    let parsed: any[] = [];
    try {
      const fenceMatch = aiText2.match(/```json([\s\S]*?)```/i);
      const jsonText = fenceMatch ? fenceMatch[1].trim() : aiText2.trim();
      parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Parsed value is not an array");
    } catch (err) {
      const start = aiText2.indexOf("[");
      const end = aiText2.lastIndexOf("]");
      if (start >= 0 && end > start) {
        try {
          const sub = aiText2.slice(start, end + 1);
          parsed = JSON.parse(sub);
        } catch (err2) {
          console.warn("generate-scenarios: secondary JSON parse failed:", err2);
        }
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn("generate-scenarios: failed to parse scenarios from AI. Returning AI raw output for debugging.");
      return res.status(500).json({ ok: false, message: "Failed to parse scenarios from OpenAI", raw: aiText2 });
    }

    // sanitize and expand for each business process
    const docsToInsert: any[] = [];
    bps.forEach((bp) => {
      parsed.forEach((s: any) => {
        docsToInsert.push({
          projectId,
          businessProcessId: bp?._id,
          businessProcessName: bp?.name || "",
          title: s.title || s.name || "Untitled scenario",
          description: s.description || s.summary || "",
          steps: Array.isArray(s.steps) ? s.steps.map(String) : (s.steps ? [String(s.steps)] : []),
          expected_result: s.expected_result || s.expectedResult || s.expected || "",
          source: "ai",
        });
      });
    });

    const inserted = await Scenario.insertMany(docsToInsert);

    return res.json({ ok: true, count: inserted.length, scenarios: inserted });
  } catch (err: any) {
    console.error("generate-scenarios: unexpected error:", err);
    return res.status(500).json({ ok: false, message: "Internal server error", error: String(err?.message || err) });
  }
});


// ---------- REPLACED/ENHANCED: POST /projects/:id/generate-tests ----------
//
// This handler keeps your previous behavior (returns codes array) AND
// generates structured multi test cases per scenario.
// Response: { ok: true, codes, testCases, raw }
//
projectsRouter.post("/:id/generate-tests", async (req, res) => {
  try {
    const projectId = req.params.id;
    const { framework, language, scenarios, uploadedFiles } = req.body || {};

    if (!framework || !language || !Array.isArray(scenarios) || scenarios.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "framework, language and scenarios are required",
      });
    }

    // 1) generate codes per scenario (existing behavior)
    const outputs: any[] = [];
    for (const sc of scenarios) {
      const prompt = `
You are an expert QA engineer. Generate runnable test code.

Project ID: ${projectId}
Framework: ${framework}
Language: ${language}

Uploaded files: ${(uploadedFiles || [])
        .map((f: any) => f.filename || f)
        .join(", ")}

Scenario: ${sc.title}
Description: ${sc.description || ""}
Steps: ${(sc.steps || []).join(" -> ")}
Expected: ${sc.expected_result || ""}

Return the generated test code only. Do NOT include commentary.
`;

      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 2000,
        });

        const code = response.choices?.[0]?.message?.content || "";

        outputs.push({
          scenarioId: sc._id || null,
          title: sc.title,
          code,
        });
      } catch (err: any) {
        console.error("generate-tests: OpenAI call failed for scenario", sc.title, err);
        outputs.push({
          scenarioId: sc._id || null,
          title: sc.title,
          code: null,
          error: String(err?.message || err),
        });
      }
    }

    // 2) Enhanced test-case generation: produce MANY test cases per scenario
    // Build concise scenario block for prompt
    const scenarioText = scenarios
      .map((s: any, i: number) => {
        const steps = (s.steps || []).map((st: string, idx: number) => `${idx + 1}. ${st}`).join("\n");
        return `SCENARIO_INDEX:${i}::SCENARIO_ID:${s._id || ""}::TITLE:${(s.title || "").replace(/\n/g, " ")}::DESCRIPTION:${(s.description || "").replace(/\n/g, " ")}::STEPS:${steps}::EXPECTED:${(s.expected_result || "").replace(/\n/g, " ")}`;
      })
      .join("\n\n---\n\n");

    const tcPrompt = `
You are a senior QA engineer. For each input scenario below, generate a comprehensive set of test cases covering multiple perspectives:
- Happy path / Positive cases
- Negative / validation / invalid input cases
- Edge and boundary cases
- Security checks (authentication/authorization/inputs) where applicable
- Performance or concurrency cases (if relevant)
- Usability or accessibility checks (if relevant)

RETURN ONLY valid JSON — a single flat array of test case objects. Do NOT output any commentary.

Each test case object MUST have these fields:
{
  "scenarioIndex": <number>,          // index of the scenario in the input array (0-based)
  "scenarioId": "<id-or-empty-string>",
  "scenarioTitle": "<original scenario title>",
  "title": "<short test case title>",
  "type": "<Positive|Negative|Edge|Security|Performance|Usability|Other>",
  "preconditions": ["..."],
  "steps": ["Step 1", "Step 2", "..."],
  "expected_result": "<expected result text>"
}

REQUIREMENTS:
- For each scenario, produce at least 4 test cases and up to 12 where applicable.
- Make steps concrete and actionable (one action per step).
- Keep strings short (<= 200 characters each) but complete.
- Ensure the overall output is a valid JSON array (no trailing commas, no surrounding markdown).
- Use scenarioIndex to map test cases to input scenarios.

INPUT SCENARIOS:
${scenarioText}
`;

    let rawTC = "";
    let parsedTCs: any[] = [];

    try {
      const tcResponse = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: tcPrompt }],
        temperature: 0,
        max_tokens: 2000,
      });

      rawTC = tcResponse.choices?.[0]?.message?.content || "";

      const maybeJson = extractJsonString(rawTC);
      let parsed = tryParseJson(maybeJson);
      if (!parsed) parsed = tryParseJson(rawTC);

      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedTCs = parsed;
      } else {
        parsedTCs = [];
      }
    } catch (err: any) {
      console.error("generate-tests: failed to generate structured multi test-cases:", err);
      parsedTCs = [];
      rawTC = String(err?.message || err);
    }

    // 3) Fallback / augmentation: ensure many cases per scenario
    if (!Array.isArray(parsedTCs) || parsedTCs.length === 0) {
      const fallback: any[] = [];
      for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        const baseSteps = s.steps || [];

        // Happy path
        fallback.push({
          scenarioIndex: i,
          scenarioId: s._id || null,
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          title: "Happy path - valid inputs",
          type: "Positive",
          preconditions: [],
          steps: baseSteps.length > 0 ? baseSteps : ["Perform the main user flow described in the scenario"],
          expected_result: s.expected_result || "Expected outcome occurs",
        });

        // Validation negative case
        fallback.push({
          scenarioIndex: i,
          scenarioId: s._id || null,
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          title: "Validation - missing required field",
          type: "Negative",
          preconditions: [],
          steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Leave a required field empty", "Submit the form"]),
          expected_result: "Validation error shown and submission prevented",
        });

        // Invalid input
        fallback.push({
          scenarioIndex: i,
          scenarioId: s._id || null,
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          title: "Invalid input - malformed data",
          type: "Negative",
          preconditions: [],
          steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Enter malformed/invalid data", "Submit"]),
          expected_result: "Appropriate error message shown and no success condition",
        });

        // Edge / boundary
        fallback.push({
          scenarioIndex: i,
          scenarioId: s._id || null,
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          title: "Edge case - boundary values",
          type: "Edge",
          preconditions: [],
          steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Enter maximum length values or boundary numbers", "Submit"]),
          expected_result: "System handles boundary values without error",
        });

        // Security basic
        fallback.push({
          scenarioIndex: i,
          scenarioId: s._id || null,
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          title: "Security - unauthorized access",
          type: "Security",
          preconditions: ["User not authenticated"],
          steps: ["Attempt to perform the scenario action while not logged in"],
          expected_result: "Access is denied and user is redirected to login",
        });

        // Performance placeholder
        fallback.push({
          scenarioIndex: i,
          scenarioId: s._id || null,
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          title: "Performance - repeated actions",
          type: "Performance",
          preconditions: [],
          steps: ["Perform the main action repeatedly (e.g., 50 times)"],
          expected_result: "System response time stays within acceptable thresholds and no failures",
        });
      }

      parsedTCs = fallback;
    } else {
      // If model returned some test cases but too few per scenario, augment with simple synthesized ones
      const minPerScenario = 4;
      const groupedCount: Record<number, number> = {};
      for (const tc of parsedTCs) {
        const idx = Number(tc?.scenarioIndex ?? -1);
        if (!Number.isNaN(idx)) groupedCount[idx] = (groupedCount[idx] || 0) + 1;
      }
      const additional: any[] = [];
      for (let i = 0; i < scenarios.length; i++) {
        const have = groupedCount[i] || 0;
        if (have < minPerScenario) {
          const s = scenarios[i];
          const needed = minPerScenario - have;
          const baseSteps = s.steps || [];

          const synthTemplates = [
            {
              title: "Happy path - valid inputs",
              type: "Positive",
              steps: baseSteps.length > 0 ? baseSteps : ["Perform the main user flow described in the scenario"],
              expected_result: s.expected_result || "Expected outcome occurs",
            },
            {
              title: "Validation - missing required field",
              type: "Negative",
              steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Leave a required field empty", "Submit the form"]),
              expected_result: "Validation error shown and submission prevented",
            },
            {
              title: "Invalid input - malformed data",
              type: "Negative",
              steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Enter malformed/invalid data", "Submit"]),
              expected_result: "Appropriate error message shown and no success condition",
            },
            {
              title: "Edge case - boundary values",
              type: "Edge",
              steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Enter maximum length values or boundary numbers", "Submit"]),
              expected_result: "System handles boundary values without error",
            },
          ];

          for (let k = 0; k < needed; k++) {
            const t = synthTemplates[k % synthTemplates.length];
            additional.push({
              scenarioIndex: i,
              scenarioId: s._id || null,
              scenarioTitle: s.title || `Scenario ${i + 1}`,
              title: t.title,
              type: t.type,
              preconditions: [],
              steps: t.steps,
              expected_result: t.expected_result,
            });
          }
        }
      }
      parsedTCs = parsedTCs.concat(additional);
    }
   // Save test cases into Mongo with scenario references
let inserted: any[] = [];
try {
  inserted = await TestCase.insertMany(parsedTCs.map(tc => ({
    projectId,
    scenarioId: tc.scenarioId || null,       // 🔹 link back to scenario
    scenarioTitle: tc.scenarioTitle || "",   // 🔹 for grouping
    title: tc.title,
    description: tc.description || "",
    steps: Array.isArray(tc.steps) ? tc.steps : [],
    expected_result: tc.expected_result || "",
    source: "ai",
  })));
} catch (err: any) {
  console.error("❌ Failed to save test cases:", err);
}

    // 4) Return results
    return res.json({
  ok: true,
  codes: outputs,
  testCases: inserted.length > 0 ? inserted : parsedTCs,
  raw: rawTC,
});

  } catch (err: any) {
    console.error("generate-tests failed:", err);
    return res.status(500).json({
      ok: false,
      message: "generate-tests failed",
      error: String(err?.message || err),
    });
  }
});

//
// GET /projects/:id/scenarios
//
projectsRouter.get("/:id/scenarios", async (req, res) => {
  try {
    const items = await Scenario.find({ projectId: req.params.id }).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (err: any) {
    console.error("get scenarios error:", err);
    return res.status(500).json({ ok: false, message: "Failed to load scenarios", error: String(err?.message || err) });
  }
});


/**
 * GET /projects/test/openai
 */
projectsRouter.get("/test/openai", async (req, res) => {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello from backend" }],
    });
    res.json({ ok: true, reply: response.choices[0]?.message?.content || "No reply" });
  } catch (err: any) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
// POST /projects/:id/run
projectsRouter.post("/:id/run", async (req, res) => {
  try {
    const { framework, language, scenarios, code } = req.body || {};
    console.log("▶️ run-tests called:", { framework, language, scenarioCount: scenarios?.length });

    // For now just mock results
    const results = (scenarios || []).map((s: any, i: number) => ({
      _id: String(i),
      title: s.title || `Scenario ${i + 1}`,
      passed: Math.random() > 0.3, // random pass/fail
      durationMs: 120 + Math.floor(Math.random() * 300),
      details: `Executed ${s.steps?.length || 0} steps.`,
    }));

    return res.json({ ok: true, results });
  } catch (err: any) {
    console.error("run-tests failed:", err);
    return res.status(500).json({ ok: false, message: "run-tests failed", error: String(err.message || err) });
  }
});
/**
 * GET /projects/:id/matched-processes
 */
projectsRouter.get("/:id/matched-processes", async (req, res) => {
  try {
    const id = req.params.id;
    const items = await BusinessProcess.find({ projectId: id, matched: true })
      .sort({ score: -1 })
      .lean();

    return res.json({ items });
  } catch (err: any) {
    console.error("❌ get matched-processes error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to load matched processes",
      error: String(err?.message || err),
    });
  }
});

export default projectsRouter;
