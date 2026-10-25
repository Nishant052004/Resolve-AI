import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ARRA_API_URL overrides the backend target, e.g. when port 8000 is taken:
//   ARRA_API_URL=http://127.0.0.1:8001 npm run dev
const apiTarget = process.env.ARRA_API_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  detail: `Backend server is not running on ${apiTarget}. Please start the backend service (python run_backend.py).`,
                })
              );
            }
          });
        },
      },
    },
  },
});
