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

function buildProjectIdFilter(projectId: string): any {
  const objId = mongoose.Types.ObjectId.isValid(projectId)
    ? new mongoose.Types.ObjectId(projectId)
    : null;
  return objId ? { $in: [projectId, objId] } : projectId;
}

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

type UploadSourceFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

async function extractTextFromUploadFile(file: UploadSourceFile): Promise<string> {
  const name = file.originalname || "";
  const mimetype = file.mimetype || "";

  if (mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    try {
      const { default: pdfParse } = await import("pdf-parse-fixed");
      const pdf = await pdfParse(file.buffer);
      if (pdf?.text && pdf.text.trim().length > 0) return pdf.text;
    } catch (err) {
      console.warn("⚠️ PDF parse failed, using text fallback:", err);
    }
  } else if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result?.value || "";
  }

  const raw = file.buffer.toString("utf8");
  return raw.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ").slice(0, 200000);
}

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
    console.warn("extractTextFromBuffer: primary extract failed:", (err as Error).message || err);
  }
  const raw = buffer.toString("utf8");
  const cleaned = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ");
  return cleaned.slice(0, 200000);
}

async function generateBusinessProcessesForProject(projectId: string, file: UploadSourceFile) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new Error("Invalid project id");
  }

  const content = await extractTextFromUploadFile(file);
  const docSnippet = content.length > 8000 ? content.slice(0, 8000) : content;
  const prompt = `
You are a senior banking business architect with deep experience in retail banking, corporate banking, payments, lending, treasury, regulatory reporting, and risk management.
 
Your task is to analyze the following Functional Specification document and extract BUSINESS PROCESSES from a bank’s perspective.
 
Important:
- Focus on business processes, not UI screens or technical implementation steps.
- Consolidate related steps into meaningful end-to-end processes.
- Use banking domain language.
- Avoid repeating technical details unless they materially affect business logic.
 
 
In addition, assign a Priority Rating to each business process.
 
Priority must be determined using the following hierarchy of impact:
 
1. End Customer Impact (highest weight)
2. Legal / Regulatory Impact
3. Operational Impact
 
Definitions:
 
- Critical:
    - Direct financial impact to customers
    - Risk of customer harm or regulatory breach
    - Impacts financial postings or customer balances
    - Regulatory reporting or compliance failure risk
    - High reputational risk
 
- High:
    - Significant operational disruption
    - Indirect customer impact
    - Control or risk process failure
    - Impacts multiple downstream systems
 
- Medium:
    - Limited operational impact
    - Internal process inefficiencies
    - No direct customer or regulatory risk
 
- Low:
    - Cosmetic or non-material process updates
    - Reporting or informational processes with no control impact
 
For each identified business process, provide the following structured output:
Return only valid JSON array. Each object must have:
{
  "name": string,
  "description": string,
  "priority": "Critical" | "High" | "Medium" | "Low",
  "processObjective": string,
  "triggerEvent": string,
  "primaryActors": string,
  "keyBusinessSteps": string,
  "businessRules": string,
  "upstreamSystems": string,
  "downstreamSystems": string,
  "regulatoryImpact": string,
  "riskControlConsiderations": string
}

Rules:
- Include only real, testable business processes from the document.
- Do not include UI elements, modules, pages, buttons, or technical implementation details as processes.
- If uncertain, exclude the item.
- Return JSON only.

Document:
"""${docSnippet}"""
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 1500,
  });

  const aiText = response.choices?.[0]?.message?.content || "";
  const parsed = tryParseJson(extractJsonString(aiText)) ?? tryParseJson(aiText) ?? [];
  const rawItems = Array.isArray(parsed) ? parsed : [];
  const allowedPriority = new Set(["Critical", "High", "Medium", "Low"]);
  const normalizedItems = rawItems
    .map((bp: any) => {
      const name = String(bp?.name || "").trim();
      const description = String(bp?.description || "").trim();
      const priority = String(bp?.priority || "Medium").trim();
      const processObjective = String(bp?.processObjective || "").trim();
      const triggerEvent = String(bp?.triggerEvent || "").trim();
      const primaryActors = String(bp?.primaryActors || "").trim();
      const keyBusinessSteps = String(bp?.keyBusinessSteps || "").trim();
      const businessRules = String(bp?.businessRules || "").trim();
      const upstreamSystems = String(bp?.upstreamSystems || "").trim();
      const downstreamSystems = String(bp?.downstreamSystems || "").trim();
      const regulatoryImpact = String(bp?.regulatoryImpact || "").trim();
      const riskControlConsiderations = String(bp?.riskControlConsiderations || "").trim();
      return {
        name,
        description,
        priority,
        processObjective,
        triggerEvent,
        primaryActors,
        keyBusinessSteps,
        businessRules,
        upstreamSystems,
        downstreamSystems,
        regulatoryImpact,
        riskControlConsiderations,
      };
    })
    .filter((bp) => bp.name.length >= 3 && bp.description.length >= 8 && allowedPriority.has(bp.priority))
    .filter((bp, idx, arr) => arr.findIndex((x) => x.name.toLowerCase() === bp.name.toLowerCase()) === idx);

  const projObjId = new mongoose.Types.ObjectId(projectId);
  await BusinessProcess.updateMany({ projectId: projObjId, matched: true }, { $set: { matched: false, selected: false, edited: false } });

  if (normalizedItems.length === 0) return { count: 0, items: [] };

  const docsToInsert = normalizedItems.map((bp) => ({
    projectId: projObjId,
    name: bp.name,
    description: bp.description,
    priority: bp.priority,
    matched: true,
    selected: false,
    edited: false,
    source: "openai_upload",
    processObjective: bp.processObjective || "",
    triggerEvent: bp.triggerEvent || "",
    primaryActors: bp.primaryActors || "",
    keyBusinessSteps: bp.keyBusinessSteps || "",
    businessRules: bp.businessRules || "",
    upstreamSystems: bp.upstreamSystems || "",
    downstreamSystems: bp.downstreamSystems || "",
    regulatoryImpact: bp.regulatoryImpact || "",
    riskControlConsiderations: bp.riskControlConsiderations || "",
    createdAt: new Date(),
  }));

  const inserted = await BusinessProcess.insertMany(docsToInsert);
  return { count: inserted.length, items: inserted };
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
      processCount: 0,
    });

    console.log("✅ File uploaded:", saved.filename, saved.version);

    let generatedCount = 0;
    try {
      const generated = await generateBusinessProcessesForProject(req.params.id, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
      });
      generatedCount = generated.count;
      // New upload invalidates previous downstream artifacts
      await Scenario.deleteMany({ projectId: req.params.id });
      await TestCase.deleteMany({ projectId: req.params.id });
      await ProjectFile.findByIdAndUpdate(saved._id, { $set: { processCount: generatedCount } });
      console.log(`✅ Generated ${generatedCount} business processes from upload`);
    } catch (genErr: any) {
      console.error("❌ Business process generation failed after upload:", genErr);
      return res.status(502).json({
        ok: false,
        message: "File uploaded but failed to generate business processes",
        fileId: saved._id,
        error: String(genErr?.message || genErr),
      });
    }

    return res.status(201).json({
      ok: true,
      fileId: saved._id,
      filename: saved.filename,
      version: saved.version,
      matchedCount: generatedCount,
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
    const files = await ProjectFile.find({ projectId: buildProjectIdFilter(req.params.id) })
      .sort({ uploadedAt: 1 })
      .lean();

    res.json(
      files.map((f) => ({
        _id: f._id,
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size,
        version: f.version,
        processCount: typeof (f as any).processCount === "number" ? (f as any).processCount : 0,
        uploadedAt: f.uploadedAt,
      }))
    );
  } catch (e) {
    next(e);
  }
});

/**
 * GET /projects/:id/overview
 * Returns project-level counts and uploaded files for the exact project.
 */
projectsRouter.get("/:id/overview", async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const projectIdFilter: any = buildProjectIdFilter(projectId);
    const objId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : null;

    const bpFilter = objId
      ? { projectId: { $in: [projectId, objId] } }
      : { projectId };

    const [businessProcessCount, scenarioCount, testCaseCount, testCodeCount, filesRaw] =
      await Promise.all([
        BusinessProcess.countDocuments(bpFilter),
        Scenario.countDocuments({ projectId: projectIdFilter }),
        TestCase.countDocuments({ projectId: projectIdFilter }),
        TestCase.countDocuments({
          projectId: projectIdFilter,
          $or: [{ codeGenerated: true }, { testRunSuccess: true }],
        }),
        ProjectFile.find({ projectId: projectIdFilter }).sort({ uploadedAt: -1 }).lean(),
      ]);

    const files = filesRaw.map((f: any) => ({
      _id: String(f._id),
      filename: f.filename,
      mimetype: f.mimetype,
      size: f.size,
      uploadedAt: f.uploadedAt,
    }));

    return res.json({
      ok: true,
      metrics: {
        businessProcessCount,
        scenarioCount,
        testCaseCount,
        testCodeCount,
      },
      files,
    });
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
      projectId: buildProjectIdFilter(req.params.id),
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
 * PUT /projects/:id/files/:fileId
 * Rename a file for a project
 */
projectsRouter.put("/:id/files/:fileId", async (req, res, next) => {
  try {
    const filename = String(req.body?.filename || "").trim();
    if (!filename) return res.status(400).json({ message: "filename is required" });

    const updated = await ProjectFile.findOneAndUpdate(
      { _id: req.params.fileId, projectId: buildProjectIdFilter(req.params.id) },
      { $set: { filename } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "file not found" });

    res.json({
      _id: updated._id,
      filename: updated.filename,
      mimetype: updated.mimetype,
      size: updated.size,
      version: updated.version,
      uploadedAt: updated.uploadedAt,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /projects/:id/files/:fileId
 * Delete a single file from a project
 */
projectsRouter.delete("/:id/files/:fileId", async (req, res, next) => {
  try {
    const deleted = await ProjectFile.findOneAndDelete({
      _id: req.params.fileId,
      projectId: buildProjectIdFilter(req.params.id),
    }).lean();

    if (!deleted) return res.status(404).json({ message: "file not found" });
    return res.status(204).end();
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
  // keep ObjectId type strict for Mongoose bulk operations
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, message: "Invalid project id" });
  }
  const projObjId = new mongoose.Types.ObjectId(id);

  // clear previous matched documents for this project
  await BusinessProcess.updateMany(
    { projectId: projObjId, matched: true },
    { $set: { matched: false, edited: false } } // keep history but unmark old ones (safer than deleteMany)
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
              edited: false,
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
    const generated = await generateBusinessProcessesForProject(req.params.id, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
    });
    // New upload invalidates previous downstream artifacts
    await Scenario.deleteMany({ projectId: req.params.id });
    await TestCase.deleteMany({ projectId: req.params.id });
    return res.json({ ok: true, count: generated.count, items: generated.items });
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

    const projObjId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;

    // Persist selected BPs for this project so revisiting Flow Analysis shows the chosen set.
    await BusinessProcess.updateMany(
      { projectId: projObjId, matched: true },
      { $set: { selected: false, edited: false } }
    );
    await BusinessProcess.updateMany(
      { projectId: projObjId, _id: { $in: bpIds }, matched: true },
      { $set: { selected: true } }
    );

    // load only the selected business processes from this project
    const bps = await BusinessProcess.find({
      projectId: projObjId,
      _id: { $in: bpIds },
      matched: true,
      selected: true,
    }).lean();
    if (!bps || bps.length === 0) {
      return res.status(400).json({ ok: false, message: "No business processes found for given ids" });
    }

    // load project metadata (for label only)
    const project = await Project.findById(projectId).lean();
    const recentProjectFiles = await ProjectFile.find({ projectId })
      .sort({ uploadedAt: -1 })
      .limit(20)
      .select({ filename: 1, _id: 0 })
      .lean();
    const recentFileNames = recentProjectFiles.map((f: any) => String(f?.filename || "")).filter(Boolean);

    const instructions = [
      "You are an expert QA engineer.",
      "Generate manual test scenarios only for the provided business process.",
      "Use only the provided business process details as source context.",
      "Every scenario must be practical, testable, and aligned to that business process only.",
      "Output JSON array only.",
      'Each item must include: "scenarioId" (string), "title" (string), "description" (string), "steps" (string[]), "expected_result" (string), "persona" (string), "objective" (string), "triggerPrecondition" (string), "scope" (string), "outOfScope" (string), "expectedBusinessOutcome" (string), "customerImpact" (string), "regulatorySensitivity" (string).',
      "Do not include markdown or commentary.",
    ].join("\n");

    // Replace previously generated scenarios for this project so Test Scenarios page
    // always reflects the current BP selections from Flow Analysis.
    await Scenario.deleteMany({ projectId });

    const docsToInsert: any[] = [];
    for (const bp of bps) {
      const promptParts = [
        `Project: ${project?.projectName || projectId}`,
        project?.description ? `Project description: ${project.description}` : undefined,
        "Selected business process (full details):",
        `name="${bp.name || ""}"`,
        `description="${String(bp.description || "").slice(0, 2000)}"`,
        `priority="${String(bp.priority || "Medium")}"`,
        `processObjective="${String(bp.processObjective || "").slice(0, 2000)}"`,
        `triggerEvent="${String(bp.triggerEvent || "").slice(0, 2000)}"`,
        `primaryActors="${String(bp.primaryActors || "").slice(0, 2000)}"`,
        `keyBusinessSteps="${String(bp.keyBusinessSteps || "").slice(0, 3000)}"`,
        `businessRules="${String(bp.businessRules || "").slice(0, 3000)}"`,
        `upstreamSystems="${String(bp.upstreamSystems || "").slice(0, 2000)}"`,
        `downstreamSystems="${String(bp.downstreamSystems || "").slice(0, 2000)}"`,
        `regulatoryImpact="${String(bp.regulatoryImpact || "").slice(0, 2000)}"`,
        `riskControlConsiderations="${String(bp.riskControlConsiderations || "").slice(0, 2000)}"`,
        instructions,
        promptOverride ? `Additional instructions:\n${promptOverride}` : undefined,
      ]
        .filter(Boolean)
        .join("\n\n");

      console.log(
        "generate-scenarios: sending prompt to OpenAI for BP:",
        String(bp._id),
        String(bp.name)
      );

      let aiText2 = "";
      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: promptParts }],
          temperature: 0.1,
          max_tokens: 1800,
        });
        aiText2 = response.choices?.[0]?.message?.content || "";
      } catch (err: any) {
        console.error("generate-scenarios: OpenAI call failed for BP:", bp?._id, err);
        return res.status(502).json({
          ok: false,
          message: "OpenAI call failed while generating scenarios",
          error: String(err?.message || err),
        });
      }

      // Parse JSON robustly
      let parsed: any[] = [];
      try {
        const fenceMatch = aiText2.match(/```json([\s\S]*?)```/i);
        const jsonText = fenceMatch ? fenceMatch[1].trim() : aiText2.trim();
        parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) throw new Error("Parsed value is not an array");
      } catch {
        const start = aiText2.indexOf("[");
        const end = aiText2.lastIndexOf("]");
        if (start >= 0 && end > start) {
          try {
            parsed = JSON.parse(aiText2.slice(start, end + 1));
          } catch (err2) {
            console.warn("generate-scenarios: parse failed for BP", bp?._id, err2);
          }
        }
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(500).json({
          ok: false,
          message: `Failed to parse scenarios from OpenAI for BP: ${bp?.name || bp?._id}`,
          raw: aiText2,
        });
      }

      for (const s of parsed) {
        docsToInsert.push({
          projectId,
          businessProcessId: bp?._id,
          businessProcessName: bp?.name || "",
          scenarioId: s.scenarioId || s.id || "",
          title: s.title || s.name || "Untitled scenario",
          description: s.description || s.summary || "",
          steps: Array.isArray(s.steps) ? s.steps.map(String) : s.steps ? [String(s.steps)] : [],
          expected_result: s.expected_result || s.expectedResult || s.expected || "",
          persona: s.persona || "",
          objective: s.objective || "",
          triggerPrecondition: s.triggerPrecondition || s.trigger_event_pre_condition || "",
          scope: s.scope || "",
          outOfScope: s.outOfScope || s.out_of_scope || "",
          expectedBusinessOutcome: s.expectedBusinessOutcome || s.expected_business_outcome || "",
          customerImpact: s.customerImpact || "",
          regulatorySensitivity: s.regulatorySensitivity || "",
          edited: false,
          source: "ai",
        });
      }
    }

    if (docsToInsert.length === 0) {
      return res.status(500).json({ ok: false, message: "No scenarios generated for selected business processes" });
    }

    const inserted = await Scenario.insertMany(docsToInsert);
    return res.json({
      ok: true,
      count: inserted.length,
      scenarioCount: inserted.length,
      businessProcessCount: bps.length,
      sourceFiles: recentFileNames,
      scenarios: inserted,
    });
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
    const { framework, language, scenarios, uploadedFiles, prompt: promptOverride, mode } = req.body || {};

    if (!framework || !language || !Array.isArray(scenarios) || scenarios.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "framework, language and scenarios are required",
      });
    }

    // Build uploaded-file context for OpenAI from project files in Mongo.
    const projectFiles = await ProjectFile.find({ projectId }).sort({ uploadedAt: -1 }).lean();
    const projectFileNames = projectFiles.map((f) => f.filename).filter(Boolean);

    const MAX_FILES_IN_PROMPT = 4;
    const MAX_CHARS_PER_FILE = 2200;
    const MAX_DOC_CONTEXT_CHARS = 8000;
    const fileContextBlocks: string[] = [];
    let contextChars = 0;

    for (const file of projectFiles.slice(0, MAX_FILES_IN_PROMPT)) {
      if (!file?.data) continue;
      let buffer: Buffer;
      if (file.data instanceof Buffer) {
        buffer = file.data;
      } else if ("buffer" in (file.data as any)) {
        buffer = Buffer.from((file.data as any).buffer);
      } else {
        buffer = Buffer.from(file.data as unknown as Uint8Array);
      }

      const extracted = await extractTextFromBuffer(buffer, file.filename, file.mimetype);
      if (!extracted?.trim()) continue;
      const shortText = extracted.slice(0, MAX_CHARS_PER_FILE);
      const block = `File: ${file.filename}\n"""${shortText}"""`;

      if (contextChars + block.length > MAX_DOC_CONTEXT_CHARS) break;
      fileContextBlocks.push(block);
      contextChars += block.length;
    }

    const uploadedFilesList = (uploadedFiles || [])
      .map((f: any) => f?.filename || f)
      .filter(Boolean)
      .join(", ");

    const isTestCaseMode = String(mode || "").toLowerCase() === "test-cases";

    // 1) generate codes per item (scenario mode or test-case mode)
    const outputs: any[] = [];
    for (const sc of scenarios) {
      const bpName = sc.businessProcessName || "Unknown business process";
      const scenarioTitle = sc.scenarioTitle || sc.title || "Untitled Scenario";
      const testCaseTitle = isTestCaseMode ? (sc.title || "Untitled Test Case") : "";
      const testCaseAction = Array.isArray(sc.steps) ? sc.steps.join(" -> ") : "";
      const testCaseExpected = sc.expected_result || "";
      const testCaseDetailsBlock = isTestCaseMode
        ? `Test Scenario: ${scenarioTitle}
Selected Test Case (full details):
- Test Case ID: ${sc.testCaseId || ""}
- Title: ${sc.title || ""}
- Business Process: ${bpName}
- Description: ${sc.description || ""}
- Persona: ${sc.persona || ""}
- Pre-Requisites: ${sc.preRequisites || sc.preconditions || ""}
- Steps: ${Array.isArray(sc.steps) ? sc.steps.join(" -> ") : ""}
- Expected Result: ${sc.expected_result || ""}
- Criticality: ${sc.criticality || sc.type || ""}
- Blocking Type: ${sc.blockingType || ""}
- Customer Impact: ${sc.customerImpact || ""}
- Regulatory Sensitivity: ${sc.regulatorySensitivity || ""}
Use ONLY the above selected test-case details for code generation. Do NOT use uploaded documents/files.`
        : "";
      const prompt = `
You are an expert QA engineer. Generate runnable test code.

Project ID: ${projectId}
Framework: ${framework}
Language: ${language}
Business Process: ${bpName}
${isTestCaseMode ? testCaseDetailsBlock : `Scenario: ${sc.title}\nDescription: ${sc.description || ""}\nSteps: ${(sc.steps || []).join(" -> ")}\nExpected: ${sc.expected_result || ""}`}
${promptOverride ? `Additional user prompt:\n${promptOverride}` : ""}

Return the generated test code only. Do NOT include commentary.
`;

      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 2000,
        });

        const rawCode = response.choices?.[0]?.message?.content || "";
        const headerLine = `// Business Process: ${bpName || "N/A"}, Test Scenario: ${scenarioTitle || "N/A"}, Test Case: ${isTestCaseMode ? testCaseTitle || "N/A" : "N/A"}`;
        const code = rawCode.trimStart().startsWith("//")
          ? `${headerLine}\n${rawCode}`
          : `${headerLine}\n${rawCode}`;

        outputs.push({
          scenarioId: sc._id || null,
          testCaseId: isTestCaseMode ? sc._id || null : null,
          testCaseTitle: isTestCaseMode ? testCaseTitle : undefined,
          scenarioTitle: scenarioTitle,
          title: isTestCaseMode ? testCaseTitle : sc.title,
          code,
        });
      } catch (err: any) {
        console.error("generate-tests: OpenAI call failed for scenario", sc.title, err);
        outputs.push({
          scenarioId: sc._id || null,
          testCaseId: isTestCaseMode ? sc._id || null : null,
          testCaseTitle: isTestCaseMode ? testCaseTitle : undefined,
          scenarioTitle: scenarioTitle,
          title: isTestCaseMode ? testCaseTitle : sc.title,
          code: null,
          error: String(err?.message || err),
        });
      }
    }

    // Test Cases page flow:
    // user selected concrete test cases -> generate code for each and go to Test page.
    // In this mode, do not regenerate structured test-cases again.
    if (isTestCaseMode) {
      const selectedTestCaseIds = scenarios
        .map((s: any) => String(s?._id || "").trim())
        .filter(Boolean);
      const successfulTestCaseIds = outputs
        .filter((o: any) => !!o?.testCaseId && !!o?.code && !o?.error)
        .map((o: any) => String(o.testCaseId));

      // Reset success for selected test cases first.
      // Only successful generated test cases should turn green and clear edited state.
      await TestCase.updateMany(
        { projectId, _id: { $in: selectedTestCaseIds } },
        { $set: { testRunSuccess: false, codeGenerated: false } }
      );
      if (successfulTestCaseIds.length > 0) {
        await TestCase.updateMany(
          { projectId, _id: { $in: successfulTestCaseIds } },
          { $set: { edited: false, testRunSuccess: true, codeGenerated: true } }
        );
      }

      // Recompute Scenario and Business Process success indicators from test-case success.
      const successfulScenarioIds = await TestCase.distinct("scenarioId", {
        projectId,
        testRunSuccess: true,
        scenarioId: { $ne: null },
      });
      const successfulBusinessProcessIds = await TestCase.distinct("businessProcessId", {
        projectId,
        testRunSuccess: true,
        businessProcessId: { $ne: null },
      });

      const projObjId = mongoose.Types.ObjectId.isValid(projectId)
        ? new mongoose.Types.ObjectId(projectId)
        : projectId;

      await Scenario.updateMany({ projectId }, { $set: { testRunSuccess: false } });
      if (successfulScenarioIds.length > 0) {
        await Scenario.updateMany(
          { projectId, _id: { $in: successfulScenarioIds } },
          { $set: { testRunSuccess: true } }
        );
      }

      await BusinessProcess.updateMany({ projectId: projObjId }, { $set: { testRunSuccess: false } });
      if (successfulBusinessProcessIds.length > 0) {
        await BusinessProcess.updateMany(
          { projectId: projObjId, _id: { $in: successfulBusinessProcessIds } },
          { $set: { testRunSuccess: true } }
        );
      }

      return res.json({
        ok: true,
        mode: "test-cases",
        codes: outputs,
      });
    }

    // 2) Enhanced test-case generation: produce MANY test cases per scenario
    // Build concise scenario block for prompt
    const scenarioText = scenarios
      .map((s: any, i: number) => {
        const steps = (s.steps || []).map((st: string, idx: number) => `${idx + 1}. ${st}`).join("\n");
        return `SCENARIO_INDEX:${i}::SCENARIO_ID:${s._id || ""}::BUSINESS_PROCESS:${(s.businessProcessName || "").replace(/\n/g, " ")}::SCENARIO_CODE:${(s.scenarioId || "").replace(/\n/g, " ")}::TITLE:${(s.title || "").replace(/\n/g, " ")}::DESCRIPTION:${(s.description || "").replace(/\n/g, " ")}::PERSONA:${(s.persona || "").replace(/\n/g, " ")}::OBJECTIVE:${(s.objective || "").replace(/\n/g, " ")}::TRIGGER_PRECONDITION:${(s.triggerPrecondition || "").replace(/\n/g, " ")}::SCOPE:${(s.scope || "").replace(/\n/g, " ")}::OUT_OF_SCOPE:${(s.outOfScope || "").replace(/\n/g, " ")}::EXPECTED_BUSINESS_OUTCOME:${(s.expectedBusinessOutcome || "").replace(/\n/g, " ")}::CUSTOMER_IMPACT:${(s.customerImpact || "").replace(/\n/g, " ")}::REGULATORY_SENSITIVITY:${(s.regulatorySensitivity || "").replace(/\n/g, " ")}::STEPS:${steps}::EXPECTED:${(s.expected_result || "").replace(/\n/g, " ")}`;
      })
      .join("\n\n---\n\n");

    const tcPrompt = `
You are a senior banking QA specialist.

You will receive structured input containing:
1. A Business Process object
2. One or more Business Scenarios derived from that process

Your task is to generate structured, human-readable, business-focused test cases from the provided business scenarios strictly based on the provided.

CRITICAL CONSTRAINTS:
- Use only information explicitly provided in the Process and Scenario input.
- Do NOT assume missing rules.
- Do NOT introduce new business flows.
- Do NOT reference UI elements, APIs, databases, or technical implementation.
- Use clear business language only.
- If a validation rule is not provided, do not invent one.
- Each step must represent one clear business action.
- Keep wording precise and professional.

RETURN ONLY valid JSON.
Output must be a single flat JSON array.
Do NOT include markdown, commentary, or extra text.

Each test case object MUST follow this exact schema:

{
  "testCaseId": "<unique id>",
  "scenarioIndex": <number>,
  "scenarioId": "<string-or-empty>",
  "scenarioTitle": "<original scenario title>",
  "businessProcess": "<BUSINESS_PROCESS value>",
  "persona": "<business role>",
  "title": "<short business-focused title>",
  "description": "<brief explanation of what is being validated>",
  "preRequisites": ["<business precondition>", "..."],
  "testSteps": ["Step 1", "Step 2", "..."],
  "expectedResult": "<clear business outcome including financial or state impact>",
  "criticality": "Critical | High | Medium | Low",
  "blocking": "Blocking | Non-Blocking",
  "customerImpact": "<Yes/No with short explanation>",
  "regulatorySensitivity": "<Yes/No with short explanation>"
}

COVERAGE RULES:
- Minimum 4 test cases per scenario.
- Maximum 10 test cases per scenario.
- Include varied scenario-relevant coverage without using labels such as
  "happy path", "validation case", or "invalid input case" in test case titles.
- Include at least one standard successful-flow case where applicable.
- Include exception/negative coverage only when supported by provided business rules.
- Include boundary coverage only when limits or thresholds are provided.
- Generate Security or Performance cases only if explicitly implied in input.
- Do not fabricate compliance checks unless Regulatory Impact is specified.

ALIGNMENT RULES:
- All test cases must strictly align with the scenario's BUSINESS_PROCESS.
- Do not introduce new business functionality.
- Derive validations only from the scenario's stated rules.
- Ensure expectedResult reflects business impact (balance change, approval trigger, status change, notification, compliance action, etc.).

FORMATTING RULES:
- Each string must be <= 200 characters.
- Steps must be action-oriented and sequential.
- No trailing commas.
- No additional fields.
- Output must be valid parsable JSON.

INPUT SCENARIOS:
${scenarioText}

${promptOverride ? `ADDITIONAL USER INSTRUCTIONS:\n${promptOverride}` : ""}
`;

    let rawTC = "";
    let parsedTCs: any[] = [];
    const normalizeCaseTitle = (title: any, scenarioTitle: any) => {
      const raw = String(title || "").trim();
      const cleaned = raw
        .replace(/^(happy\s*path|validation|invalid\s*input|edge\s*case|security|performance)\s*[-:]\s*/i, "")
        .trim();
      if (cleaned) return cleaned;
      const s = String(scenarioTitle || "Business test case").trim();
      return `${s} case`;
    };

    try {
      const tcResponse = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: tcPrompt }],
        temperature: 0,
        max_tokens: 8000,
      });

      rawTC = tcResponse.choices?.[0]?.message?.content || "";

      const maybeJson = extractJsonString(rawTC);
      let parsed = tryParseJson(maybeJson);
      if (!parsed) parsed = tryParseJson(rawTC);

      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedTCs = parsed.map((tc: any) => ({
          testCaseId: String(tc?.testCaseId || "").trim(),
          scenarioIndex: Number(tc?.scenarioIndex ?? -1),
          scenarioId: String(tc?.scenarioId || ""),
          scenarioTitle: String(tc?.scenarioTitle || tc?.scenarioTitle || ""),
          businessProcess: String(tc?.businessProcess || tc?.businessProcessName || ""),
          persona: String(tc?.persona || ""),
          title: normalizeCaseTitle(tc?.title, tc?.scenarioTitle),
          description: String(tc?.description || ""),
          preRequisites: Array.isArray(tc?.preRequisites)
            ? tc.preRequisites.map(String)
            : Array.isArray(tc?.preconditions)
            ? tc.preconditions.map(String)
            : [],
          testSteps: Array.isArray(tc?.testSteps)
            ? tc.testSteps.map(String)
            : Array.isArray(tc?.steps)
            ? tc.steps.map(String)
            : [],
          expectedResult: String(tc?.expectedResult || tc?.expected_result || ""),
          criticality: String(tc?.criticality || "Medium"),
          blocking: String(tc?.blocking || "Non-Blocking"),
          customerImpact: String(tc?.customerImpact || ""),
          regulatorySensitivity: String(tc?.regulatorySensitivity || ""),
        }));
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

        fallback.push({
          testCaseId: "",
          scenarioIndex: i,
          scenarioId: s._id || "",
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          businessProcess: s.businessProcessName || "",
          persona: s.persona || "",
          title: `${s.title || `Scenario ${i + 1}`} - standard business flow`,
          description: "Validate end-to-end flow with valid business inputs.",
          preRequisites: [],
          testSteps: baseSteps.length > 0 ? baseSteps : ["Perform the main user flow described in the scenario"],
          expectedResult: s.expected_result || "Expected business outcome occurs.",
          criticality: "High",
          blocking: "Blocking",
          customerImpact: "Yes - impacts customer transaction outcome.",
          regulatorySensitivity: "No - not explicitly specified.",
        });

        fallback.push({
          testCaseId: "",
          scenarioIndex: i,
          scenarioId: s._id || "",
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          businessProcess: s.businessProcessName || "",
          persona: s.persona || "",
          title: `${s.title || `Scenario ${i + 1}`} - missing mandatory information`,
          description: "Validate business rejection when required information is missing.",
          preRequisites: [],
          testSteps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Leave required business information empty", "Submit for processing"]),
          expectedResult: "Business validation fails and processing is prevented.",
          criticality: "High",
          blocking: "Blocking",
          customerImpact: "Yes - request cannot proceed.",
          regulatorySensitivity: "No - not explicitly specified.",
        });

        fallback.push({
          testCaseId: "",
          scenarioIndex: i,
          scenarioId: s._id || "",
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          businessProcess: s.businessProcessName || "",
          persona: s.persona || "",
          title: `${s.title || `Scenario ${i + 1}`} - malformed business input`,
          description: "Validate rejection of malformed business input values.",
          preRequisites: [],
          testSteps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Provide malformed business data", "Submit for processing"]),
          expectedResult: "Request is rejected and no business state change occurs.",
          criticality: "Medium",
          blocking: "Non-Blocking",
          customerImpact: "Yes - request is rejected.",
          regulatorySensitivity: "No - not explicitly specified.",
        });

        fallback.push({
          testCaseId: "",
          scenarioIndex: i,
          scenarioId: s._id || "",
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          businessProcess: s.businessProcessName || "",
          persona: s.persona || "",
          title: `${s.title || `Scenario ${i + 1}`} - boundary business limits`,
          description: "Validate correct handling of boundary business limits.",
          preRequisites: [],
          testSteps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Use boundary business values", "Submit for processing"]),
          expectedResult: "Boundary values are handled as per business rules.",
          criticality: "Medium",
          blocking: "Non-Blocking",
          customerImpact: "Yes - may affect transaction acceptance.",
          regulatorySensitivity: "No - not explicitly specified.",
        });

        fallback.push({
          testCaseId: "",
          scenarioIndex: i,
          scenarioId: s._id || "",
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          businessProcess: s.businessProcessName || "",
          persona: s.persona || "",
          title: `${s.title || `Scenario ${i + 1}`} - unauthorized attempt`,
          description: "Validate business controls for unauthorized attempt.",
          preRequisites: ["Actor is not authorized for this process."],
          testSteps: ["Attempt to perform the business action without required authorization."],
          expectedResult: "Action is denied and no business state changes.",
          criticality: "High",
          blocking: "Blocking",
          customerImpact: "No - unauthorized request is blocked.",
          regulatorySensitivity: "Yes - control enforcement may be required.",
        });

        fallback.push({
          testCaseId: "",
          scenarioIndex: i,
          scenarioId: s._id || "",
          scenarioTitle: s.title || `Scenario ${i + 1}`,
          businessProcess: s.businessProcessName || "",
          persona: s.persona || "",
          title: `${s.title || `Scenario ${i + 1}`} - repeated execution stability`,
          description: "Validate business continuity under repeated valid requests.",
          preRequisites: [],
          testSteps: ["Perform the core business action repeatedly within a short interval."],
          expectedResult: "Business outcomes remain consistent without processing failure.",
          criticality: "Medium",
          blocking: "Non-Blocking",
          customerImpact: "Yes - poor performance can affect customer outcomes.",
          regulatorySensitivity: "No - not explicitly specified.",
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
              title: `${s.title || `Scenario ${i + 1}`} - standard business flow`,
              steps: baseSteps.length > 0 ? baseSteps : ["Perform the main user flow described in the scenario"],
              expected_result: s.expected_result || "Expected outcome occurs",
            },
            {
              title: `${s.title || `Scenario ${i + 1}`} - missing mandatory information`,
              steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Leave a required field empty", "Submit the form"]),
              expected_result: "Validation error shown and submission prevented",
            },
            {
              title: `${s.title || `Scenario ${i + 1}`} - malformed business input`,
              steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Enter malformed/invalid data", "Submit"]),
              expected_result: "Appropriate error message shown and no success condition",
            },
            {
              title: `${s.title || `Scenario ${i + 1}`} - boundary business limits`,
              steps: (baseSteps.length > 0 ? baseSteps.slice(0, Math.max(1, baseSteps.length - 1)) : ["Start the flow"]).concat(["Enter maximum length values or boundary numbers", "Submit"]),
              expected_result: "System handles boundary values without error",
            },
          ];

          for (let k = 0; k < needed; k++) {
            const t = synthTemplates[k % synthTemplates.length];
            additional.push({
              testCaseId: "",
              scenarioIndex: i,
              scenarioId: s._id || "",
              scenarioTitle: s.title || `Scenario ${i + 1}`,
              businessProcess: s.businessProcessName || "",
              persona: s.persona || "",
              title: normalizeCaseTitle(t.title, s.title),
              description: "Additional coverage case generated for minimum scenario completeness.",
              preRequisites: [],
              testSteps: t.steps,
              expectedResult: t.expected_result,
              criticality: "Medium",
              blocking: "Non-Blocking",
              customerImpact: "Yes - impacts business flow result.",
              regulatorySensitivity: "No - not explicitly specified.",
            });
          }
        }
      }
      parsedTCs = parsedTCs.concat(additional);
    }
   // Save test cases into Mongo with scenario references.
   // IMPORTANT: bind each generated test-case strictly to selected scenarios.
let inserted: any[] = [];
try {
  const normalizeId = (v: any) => String(v || "").trim();
  const scenarioById = new Map<string, any>();
  for (const s of Array.isArray(scenarios) ? scenarios : []) {
    const key = normalizeId((s as any)?._id);
    if (key) scenarioById.set(key, s);
  }

  const resolveParentScenario = (tc: any) => {
    const byId = scenarioById.get(normalizeId(tc?.scenarioId));
    if (byId) return byId;
    const idx = Number(tc?.scenarioIndex ?? -1);
    if (Number.isInteger(idx) && idx >= 0 && idx < scenarios.length) {
      return scenarios[idx];
    }
    return null;
  };

  // Keep only latest generated test-cases for this project.
  await TestCase.deleteMany({ projectId });

  inserted = await TestCase.insertMany(
    parsedTCs
      .map((tc) => {
        const parentScenario = resolveParentScenario(tc);
        if (!parentScenario?._id) return null;

        return {
          businessProcessId: parentScenario?.businessProcessId || tc.businessProcessId || null,
          businessProcessName: parentScenario?.businessProcessName || tc.businessProcessName || "",
          projectId,
          scenarioId: parentScenario?._id,
          // Always use selected scenario title to avoid AI-created extra scenario buckets.
          scenarioTitle: parentScenario?.title || "",
          title: tc.title,
          testCaseId: tc.testCaseId || "",
          description: tc.description || "",
          persona: tc.persona || "",
          preRequisites: Array.isArray(tc.preRequisites) ? tc.preRequisites.join("; ") : "",
          steps: Array.isArray(tc.testSteps) ? tc.testSteps : Array.isArray(tc.steps) ? tc.steps : [],
          expected_result: tc.expectedResult || tc.expected_result || "",
          criticality: tc.criticality || "",
          blockingType: tc.blocking || "",
          customerImpact: tc.customerImpact || "",
          regulatorySensitivity: tc.regulatorySensitivity || "",
          edited: false,
          testRunSuccess: false,
          codeGenerated: false,
          source: "ai",
        };
      })
      .filter(Boolean) as any[]
  );
} catch (err: any) {
  console.error("❌ Failed to save test cases:", err);
}

    // 4) Return results
    // Selected scenarios are now regenerated into latest test cases, so clear edited lock.
    await Scenario.updateMany({ projectId }, { $set: { edited: false, testRunSuccess: false } });
    const projObjId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;
    await BusinessProcess.updateMany({ projectId: projObjId }, { $set: { testRunSuccess: false } });
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

// PUT /projects/:id/business-processes/:bpId
projectsRouter.put("/:id/business-processes/:bpId", async (req, res) => {
  try {
    const projectId = req.params.id;
    const bpId = req.params.bpId;
    const {
      name,
      description,
      priority,
      processObjective,
      triggerEvent,
      primaryActors,
      keyBusinessSteps,
      businessRules,
      upstreamSystems,
      downstreamSystems,
      regulatoryImpact,
      riskControlConsiderations,
      processNameGuidance,
      processObjectiveGuidance,
      triggerEventGuidance,
      primaryActorsGuidance,
      keyBusinessStepsGuidance,
      businessRulesGuidance,
      upstreamSystemsGuidance,
      downstreamSystemsGuidance,
      regulatoryImpactGuidance,
      riskControlConsiderationsGuidance,
    } = req.body || {};

    const update: any = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = String(description);
    if (priority !== undefined) update.priority = String(priority);
    if (processObjective !== undefined) update.processObjective = String(processObjective);
    if (triggerEvent !== undefined) update.triggerEvent = String(triggerEvent);
    if (primaryActors !== undefined) update.primaryActors = String(primaryActors);
    if (keyBusinessSteps !== undefined) update.keyBusinessSteps = String(keyBusinessSteps);
    if (businessRules !== undefined) update.businessRules = String(businessRules);
    if (upstreamSystems !== undefined) update.upstreamSystems = String(upstreamSystems);
    if (downstreamSystems !== undefined) update.downstreamSystems = String(downstreamSystems);
    if (regulatoryImpact !== undefined) update.regulatoryImpact = String(regulatoryImpact);
    if (riskControlConsiderations !== undefined) update.riskControlConsiderations = String(riskControlConsiderations);
    if (processNameGuidance !== undefined) update.processNameGuidance = String(processNameGuidance);
    if (processObjectiveGuidance !== undefined) update.processObjectiveGuidance = String(processObjectiveGuidance);
    if (triggerEventGuidance !== undefined) update.triggerEventGuidance = String(triggerEventGuidance);
    if (primaryActorsGuidance !== undefined) update.primaryActorsGuidance = String(primaryActorsGuidance);
    if (keyBusinessStepsGuidance !== undefined) update.keyBusinessStepsGuidance = String(keyBusinessStepsGuidance);
    if (businessRulesGuidance !== undefined) update.businessRulesGuidance = String(businessRulesGuidance);
    if (upstreamSystemsGuidance !== undefined) update.upstreamSystemsGuidance = String(upstreamSystemsGuidance);
    if (downstreamSystemsGuidance !== undefined) update.downstreamSystemsGuidance = String(downstreamSystemsGuidance);
    if (regulatoryImpactGuidance !== undefined) update.regulatoryImpactGuidance = String(regulatoryImpactGuidance);
    if (riskControlConsiderationsGuidance !== undefined) update.riskControlConsiderationsGuidance = String(riskControlConsiderationsGuidance);
    update.edited = true;
    update.testRunSuccess = false;
    update.updatedAt = new Date();

    if (Object.keys(update).length === 1 && update.updatedAt) {
      return res.status(400).json({ ok: false, message: "No fields provided to update" });
    }

    const projObjId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;

    const updated = await BusinessProcess.findOneAndUpdate(
      { _id: bpId, projectId: projObjId },
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ ok: false, message: "Business process not found" });

    // keep denormalized scenario/test-case names in sync when BP name changes
    if (update.name) {
      await Scenario.updateMany(
        { projectId, businessProcessId: updated._id },
        { $set: { businessProcessName: update.name, testRunSuccess: false } }
      );
      await TestCase.updateMany(
        { projectId, businessProcessId: updated._id },
        { $set: { businessProcessName: update.name, testRunSuccess: false } }
      );
    } else {
      await Scenario.updateMany(
        { projectId, businessProcessId: updated._id },
        { $set: { testRunSuccess: false } }
      );
      await TestCase.updateMany(
        { projectId, businessProcessId: updated._id },
        { $set: { testRunSuccess: false } }
      );
    }

    return res.json({ ok: true, item: updated });
  } catch (err: any) {
    console.error("update business process failed:", err);
    return res.status(500).json({ ok: false, message: "Failed to update business process", error: String(err?.message || err) });
  }
});

// PUT /projects/:id/scenarios/:scenarioId
projectsRouter.put("/:id/scenarios/:scenarioId", async (req, res) => {
  try {
    const projectId = req.params.id;
    const scenarioId = req.params.scenarioId;
    const {
      title,
      description,
      steps,
      expected_result,
      scenarioId: scenarioRefId,
      businessProcessName,
      persona,
      objective,
      triggerPrecondition,
      scope,
      outOfScope,
      expectedBusinessOutcome,
      customerImpact,
      regulatorySensitivity,
      scenarioIdWhyItMatters,
      scenarioTitleWhyItMatters,
      businessProcessRefWhyItMatters,
      personaWhyItMatters,
      objectiveWhyItMatters,
      triggerPreconditionWhyItMatters,
      scopeWhyItMatters,
      outOfScopeWhyItMatters,
      expectedBusinessOutcomeWhyItMatters,
      customerImpactWhyItMatters,
      regulatorySensitivityWhyItMatters,
    } = req.body || {};

    const update: any = {};
    if (title !== undefined) update.title = String(title).trim();
    if (description !== undefined) update.description = String(description);
    if (steps !== undefined) update.steps = Array.isArray(steps) ? steps.map(String) : [String(steps)];
    if (expected_result !== undefined) update.expected_result = String(expected_result);
    if (scenarioRefId !== undefined) update.scenarioId = String(scenarioRefId);
    if (businessProcessName !== undefined) update.businessProcessName = String(businessProcessName);
    if (persona !== undefined) update.persona = String(persona);
    if (objective !== undefined) update.objective = String(objective);
    if (triggerPrecondition !== undefined) update.triggerPrecondition = String(triggerPrecondition);
    if (scope !== undefined) update.scope = String(scope);
    if (outOfScope !== undefined) update.outOfScope = String(outOfScope);
    if (expectedBusinessOutcome !== undefined) update.expectedBusinessOutcome = String(expectedBusinessOutcome);
    if (customerImpact !== undefined) update.customerImpact = String(customerImpact);
    if (regulatorySensitivity !== undefined) update.regulatorySensitivity = String(regulatorySensitivity);
    if (scenarioIdWhyItMatters !== undefined) update.scenarioIdWhyItMatters = String(scenarioIdWhyItMatters);
    if (scenarioTitleWhyItMatters !== undefined) update.scenarioTitleWhyItMatters = String(scenarioTitleWhyItMatters);
    if (businessProcessRefWhyItMatters !== undefined) update.businessProcessRefWhyItMatters = String(businessProcessRefWhyItMatters);
    if (personaWhyItMatters !== undefined) update.personaWhyItMatters = String(personaWhyItMatters);
    if (objectiveWhyItMatters !== undefined) update.objectiveWhyItMatters = String(objectiveWhyItMatters);
    if (triggerPreconditionWhyItMatters !== undefined) update.triggerPreconditionWhyItMatters = String(triggerPreconditionWhyItMatters);
    if (scopeWhyItMatters !== undefined) update.scopeWhyItMatters = String(scopeWhyItMatters);
    if (outOfScopeWhyItMatters !== undefined) update.outOfScopeWhyItMatters = String(outOfScopeWhyItMatters);
    if (expectedBusinessOutcomeWhyItMatters !== undefined) update.expectedBusinessOutcomeWhyItMatters = String(expectedBusinessOutcomeWhyItMatters);
    if (customerImpactWhyItMatters !== undefined) update.customerImpactWhyItMatters = String(customerImpactWhyItMatters);
    if (regulatorySensitivityWhyItMatters !== undefined) update.regulatorySensitivityWhyItMatters = String(regulatorySensitivityWhyItMatters);
    update.edited = true;
    update.testRunSuccess = false;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, message: "No fields provided to update" });
    }

    const updated = await Scenario.findOneAndUpdate(
      { _id: scenarioId, projectId },
      { $set: update },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ ok: false, message: "Scenario not found" });

    if (update.title) {
      await TestCase.updateMany(
        { projectId, scenarioId },
        { $set: { scenarioTitle: update.title, testRunSuccess: false } }
      );
    } else {
      await TestCase.updateMany(
        { projectId, scenarioId },
        { $set: { testRunSuccess: false } }
      );
    }

    if ((updated as any)?.businessProcessId) {
      await BusinessProcess.updateMany(
        { _id: (updated as any).businessProcessId },
        { $set: { testRunSuccess: false } }
      );
    }

    return res.json({ ok: true, item: updated });
  } catch (err: any) {
    console.error("update scenario failed:", err);
    return res.status(500).json({ ok: false, message: "Failed to update scenario", error: String(err?.message || err) });
  }
});

// PUT /projects/:id/test-cases/:testCaseId
projectsRouter.put("/:id/test-cases/:testCaseId", async (req, res) => {
  try {
    const projectId = req.params.id;
    const testCaseId = req.params.testCaseId;
    const {
      title,
      description,
      steps,
      expected_result,
      testCaseId: testCaseRefId,
      businessProcessName,
      persona,
      preRequisites,
      criticality,
      blockingType,
      customerImpact,
      regulatorySensitivity,
    } = req.body || {};

    const update: any = {};
    if (title !== undefined) update.title = String(title).trim();
    if (description !== undefined) update.description = String(description);
    if (steps !== undefined) update.steps = Array.isArray(steps) ? steps.map(String) : [String(steps)];
    if (expected_result !== undefined) update.expected_result = String(expected_result);
    if (testCaseRefId !== undefined) update.testCaseId = String(testCaseRefId);
    if (businessProcessName !== undefined) update.businessProcessName = String(businessProcessName);
    if (persona !== undefined) update.persona = String(persona);
    if (preRequisites !== undefined) update.preRequisites = String(preRequisites);
    if (criticality !== undefined) update.criticality = String(criticality);
    if (blockingType !== undefined) update.blockingType = String(blockingType);
    if (customerImpact !== undefined) update.customerImpact = String(customerImpact);
    if (regulatorySensitivity !== undefined) update.regulatorySensitivity = String(regulatorySensitivity);
    update.edited = true;
    update.testRunSuccess = false;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, message: "No fields provided to update" });
    }

    const updated = await TestCase.findOneAndUpdate(
      { _id: testCaseId, projectId },
      { $set: update },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ ok: false, message: "Test case not found" });

    if ((updated as any)?.scenarioId) {
      await Scenario.updateMany(
        { _id: (updated as any).scenarioId, projectId },
        { $set: { testRunSuccess: false } }
      );
    }
    if ((updated as any)?.businessProcessId) {
      await BusinessProcess.updateMany(
        { _id: (updated as any).businessProcessId },
        { $set: { testRunSuccess: false } }
      );
    }

    return res.json({ ok: true, item: updated });
  } catch (err: any) {
    console.error("update test case failed:", err);
    return res.status(500).json({ ok: false, message: "Failed to update test case", error: String(err?.message || err) });
  }
});

// GET /projects/:id/test-cases
projectsRouter.get("/:id/test-cases", async (req, res) => {
  try {
    const items = await TestCase.find({ projectId: req.params.id }).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (err: any) {
    console.error("get test-cases error:", err);
    return res.status(500).json({ ok: false, message: "Failed to load test cases", error: String(err?.message || err) });
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
