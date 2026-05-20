import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In-memory token relay — phone submits, TV polls and picks up.
// Token expires after 5 min automatically.
function tokenRelayPlugin() {
  let pending = null;
  let clearTimer = null;

  function middleware(req, res, next) {
    const url = req.url.split("?")[0];

    if (url === "/api/token-status" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ token: pending }));
      return;
    }

    if (url === "/api/submit-token" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { token } = JSON.parse(body);
          pending = token || null;
          if (clearTimer) clearTimeout(clearTimer);
          clearTimer = setTimeout(() => { pending = null; }, 300_000);
        } catch {}
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    next();
  }

  return {
    name: "token-relay",
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [react(), tokenRelayPlugin()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          home: ["./src/pages/HomePage"],
          movie: ["./src/pages/MoviePage"],
          tv: ["./src/pages/TVPage"],
        },
      },
    },
  },
});
