// src/auth.ts
export const auth = {
  isLoggedIn: () => localStorage.getItem("isAuthenticated") === "true",
  login: (email?: string) => {
    localStorage.setItem("isAuthenticated", "true");
    if (email) localStorage.setItem("userEmail", email);
  },
  logout: () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userEmail");
  },
  getUserEmail: () => localStorage.getItem("userEmail") || "",
};
