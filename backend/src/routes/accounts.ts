import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { savingsAccount } from "../data";

export const accountsRouter = Router();

// GET /accounts/{id}/balance
accountsRouter.get("/:id/balance", requireAuth, (req, res) => {
  if (req.params.id !== savingsAccount.id) {
    return res.status(503).json({ code: "E003", message: "Service is temporarily unavailable. Please try again." });
  }
  res.json({
    accountId: savingsAccount.id,
    available: savingsAccount.available,
    ledger: savingsAccount.ledger,
    recent: savingsAccount.recent
  });
});

// (keep your POST /accounts/transfer here if you added it)
