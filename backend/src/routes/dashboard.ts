import { Router } from "express";
import { Project } from "../models/Project";

export const dashboardRouter = Router();

/** GET /dashboard/projects?limit=12 */
dashboardRouter.get("/projects", async (req, res, next) => {
  try {
    const limit = Math.max(parseInt(String(req.query.limit || "12"), 10), 1);
    const items = await Project.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
});
