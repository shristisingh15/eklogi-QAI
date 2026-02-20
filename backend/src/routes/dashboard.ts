import { Router } from "express";
import { Project } from "../models/Project";
import { ProjectFile } from "../models/ProjectFiles";
import { BusinessProcess } from "../models/BusinessProcess";

export const dashboardRouter = Router();

/** GET /dashboard/projects?limit=12 */
dashboardRouter.get("/projects", async (req, res, next) => {
  try {
    const limit = Math.max(parseInt(String(req.query.limit || "12"), 10), 1);
    const q = String(req.query.q || "").trim();
    const type = String(req.query.type || "").trim();

    const filter: any = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ projectName: rx }, { description: rx }];
    }
    if (type && type.toLowerCase() !== "all types") {
      filter.projectType = type;
    }

    // Project schema has no timestamps, so sorting by _id (indexed) is faster.
    // Select only fields used by UI to reduce payload.
    const [items, total] = await Promise.all([
      Project.find(filter)
        .sort({ _id: -1 })
        .select({ projectName: 1, description: 1, projectType: 1, date: 1, progress: 1 })
        .limit(limit)
        .lean(),
      Project.countDocuments(filter),
    ]);

    res.json({ items, total });
  } catch (e) { next(e); }
});

/** GET /dashboard/overview */
dashboardRouter.get("/overview", async (_req, res, next) => {
  try {
    const [totalProjects, totalDocuments, totalBusinessProcessesAgg] = await Promise.all([
      Project.countDocuments({}),
      ProjectFile.countDocuments({}),
      ProjectFile.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$processCount", 0] } },
          },
        },
      ]),
    ]);

    const totalBusinessProcesses = Number(totalBusinessProcessesAgg?.[0]?.total || 0);

    res.json({
      totalProjects,
      totalDocuments,
      totalBusinessProcesses,
    });
  } catch (e) {
    next(e);
  }
});
