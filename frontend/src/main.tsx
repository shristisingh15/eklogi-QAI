// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ProjectProvider } from "./pages/ProjectContext";

// main.tsx (add near top)
console.log("VITE_API_BASE at runtime:", import.meta.env.VITE_API_BASE);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </React.StrictMode>
);
