import { Router } from "express";
import mongoose from "mongoose";
import { BusinessProcess } from "../models/BusinessProcess";

export const businessRouter = Router();

/**
 * GET /api/business
 * Query:
 *   q     - optional text search (name/description)
 *   limit - optional, default 10, hard-capped at 10
 *
 * Always returns ONLY from the "businessProcesses" collection.
 */
businessRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const limitReq = parseInt(String(req.query.limit || "10"), 10);
    const limit = Math.min(Math.max(isNaN(limitReq) ? 10 : limitReq, 1), 10);

    const filter = q
      ? {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const items = await BusinessProcess.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // respond with exactly items.length (<=10)
    res.json({ items, total: items.length, source: "businessProcesses" });
  } catch (e) {
    next(e);
  }
});

businessRouter.post("/", async (req, res, next) => {
  try {
    const { name, description, priority, projectId } = req.body || {};
    if (!name) return res.status(400).json({ message: "name is required" });
    const doc = await BusinessProcess.create({
      name,
      description: description ?? "",
      priority: priority ?? "Medium",
      ...(projectId ? { projectId } : {}),
    });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
});

// ✅ NEW: GET /api/business/matched/:projectId
businessRouter.get("/matched/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const projObjId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;

    const items = await BusinessProcess.find({
      projectId: projObjId,
      matched: true,
    })
      .sort({ score: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    return res.json({ items, total: items.length });
  } catch (err: any) {
    console.error("❌ GET /api/business/matched/:projectId error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to load matched business processes",
      error: String(err?.message || err),
    });
  }
});

businessRouter.get("/selected/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const projObjId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;

    const items = await BusinessProcess.find({
      projectId: projObjId,
      matched: true,
      selected: true,
    })
      .sort({ score: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    return res.json({ items, total: items.length });
  } catch (err: any) {
    console.error("❌ GET /api/business/selected/:projectId error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to load selected business processes",
      error: String(err?.message || err),
    });
  }
});

businessRouter.get("/project/:projectId", async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const projObjId = mongoose.Types.ObjectId.isValid(projectId)
      ? new mongoose.Types.ObjectId(projectId)
      : projectId;

    const items = await BusinessProcess.find({ projectId: projObjId })
      .sort({ score: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    res.json({ items, total: items.length });
  } catch (e) {
    next(e);
  }
});

businessRouter.get("/:id", async (req, res, next) => {
  try {
    const item = await BusinessProcess.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ message: "not found" });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// PUT /api/business/:id  -> update a business process
businessRouter.put("/:id", async (req, res, next) => {
  try {
    const { name, description, priority } = req.body || {};
    const update: Record<string, any> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (priority !== undefined) update.priority = priority;

    const doc = await BusinessProcess.findByIdAndUpdate(req.params.id, update, {
      new: true,
    }).lean();

    if (!doc) return res.status(404).json({ message: "not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

businessRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await BusinessProcess.findByIdAndDelete(req.params.id).lean();
    if (!deleted) return res.status(404).json({ message: "not found" });
    return res.status(204).end();
  } catch (e) {
    next(e);
  }
});
