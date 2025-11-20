// src/auth.ts
export const auth = {
  isLoggedIn: () => localStorage.getItem("isAuthenticated") === "true",
  login: () => localStorage.setItem("isAuthenticated", "true"),
  logout: () => localStorage.removeItem("isAuthenticated"),
};

