import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Fase 7A: dev fixo em http://localhost:5173 para bater
// certo com o CORS do backend (AGENT_FRONTEND_ORIGIN).
export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
});
