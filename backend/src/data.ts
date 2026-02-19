// Spec-like mock data
export const savingsAccount = {
  id: "acc_savings_001",
  currency: "INR",
  available: 84520.75,
  ledger: 85120.75,
  recent: [
    { id: "txn_001", date: new Date().toISOString(), type: "CREDIT", amount: 15000, desc: "Salary" },
    { id: "txn_002", date: new Date(Date.now() - 864e5).toISOString(), type: "DEBIT", amount: 899, desc: "Groceries" }
  ]
};

export const creditCard = {
  id: "cc_9876",
  last4: "9876",
  product: "Platinum",
  months: Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    return {
      month: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
      statementId: `st_${d.getFullYear()}_${d.getMonth() + 1}`,
      format: ["PDF","HTML"],
      cycleStart: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      cycleEnd: new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString(),
      dueAmount: i === 0 ? 5240.25 : Math.max(0, 1200 - i * 50),
    };
  })
};
