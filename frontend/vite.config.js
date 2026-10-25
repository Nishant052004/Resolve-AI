import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ARRA_API_URL overrides the backend target:
const apiTarget = process.env.ARRA_API_URL || "https://resolve-ai-wlim.onrender.com";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  detail: `Backend server is not reachable at ${apiTarget}. Please verify the backend service is running.`,
                })
              );
            }
          });
        },
      },
    },
  },
});
