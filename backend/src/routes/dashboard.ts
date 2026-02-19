import { Router } from "express";
import { Project } from "../models/Project";
import { ProjectFile } from "../models/ProjectFiles";
import { BusinessProcess } from "../models/BusinessProcess";

export const dashboardRouter = Router();

/** GET /dashboard/projects?limit=12 */
dashboardRouter.get("/projects", async (req, res, next) => {
  try {
    const limit = Math.max(parseInt(String(req.query.limit || "12"), 10), 1);
    const items = await Project.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
});

/** GET /dashboard/overview */
dashboardRouter.get("/overview", async (_req, res, next) => {
  try {
    const [totalProjects, totalDocuments, totalBusinessProcesses] = await Promise.all([
      Project.countDocuments({}),
      ProjectFile.countDocuments({}),
      BusinessProcess.countDocuments({}),
    ]);

    res.json({
      totalProjects,
      totalDocuments,
      totalBusinessProcesses,
    });
  } catch (e) {
    next(e);
  }
});
