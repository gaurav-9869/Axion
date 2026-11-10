import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Dedicated PWA asset routes (ensures sw.js and manifest never return text/html in dev or prod)
  app.get("/sw.js", (req, res, next) => {
    const swPath = path.join(process.cwd(), "dist", "sw.js");
    if (fs.existsSync(swPath)) {
      res.setHeader("Content-Type", "application/javascript");
      return res.sendFile(swPath);
    }
    // Development fallback service worker with immediate skipWaiting & activation
    res.setHeader("Content-Type", "application/javascript");
    res.send(`
      self.addEventListener('install', (e) => self.skipWaiting());
      self.addEventListener('activate', (e) => self.clients.claim());
      self.addEventListener('fetch', (e) => {
        // Dev passthrough
      });
    `);
  });

  app.get("/manifest.webmanifest", (req, res, next) => {
    const manifestPath = path.join(process.cwd(), "dist", "manifest.webmanifest");
    if (fs.existsSync(manifestPath)) {
      res.setHeader("Content-Type", "application/manifest+json");
      return res.sendFile(manifestPath);
    }
    next();
  });

  app.get("/workbox-:hash.js", (req, res, next) => {
    const filePath = path.join(process.cwd(), "dist", req.path);
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "application/javascript");
      return res.sendFile(filePath);
    }
    next();
  });

  function isValidKey(k: string | undefined | null): boolean {
    if (!k) return false;
    const clean = k.replace(/^["']|["']$/g, "").trim();
    if (!clean || clean === 'dummy' || clean === 'AIzaSyDsb-a9P56U_nUE9JnT63madlOcjvqIZDg' || clean.startsWith('AIzaSyDsb-a9P56U_')) {
      return false;
    }
    return clean.length > 10;
  }

  function getResolvedApiKey(req: express.Request): string {
    const headerKey = req.headers['x-gemini-api-key'] as string | undefined;
    if (isValidKey(headerKey)) {
      return headerKey!.replace(/^["']|["']$/g, "").trim();
    }
    const bodyKey = req.body?.apiKey as string | undefined;
    if (isValidKey(bodyKey)) {
      return bodyKey!.replace(/^["']|["']$/g, "").trim();
    }
    try {
      if (fs.existsSync('/app/.dev.env.json')) {
        const devEnv = JSON.parse(fs.readFileSync('/app/.dev.env.json', 'utf8'));
        const cand = devEnv.GEMINI_API_KEY || devEnv.GOOGLE_API_KEY || devEnv.API_KEY;
        if (isValidKey(cand)) {
          return String(cand).trim();
        }
      }
    } catch {}
    try {
      const localEnvPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(localEnvPath)) {
        const envContent = fs.readFileSync(localEnvPath, 'utf8');
        const match = envContent.match(/GEMINI_API_KEY=(.+)/);
        if (match && isValidKey(match[1])) {
          return match[1].replace(/^["']|["']$/g, "").trim();
        }
      }
    } catch {}

    const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || "";
    if (isValidKey(envKey)) {
      return envKey.replace(/^["']|["']$/g, "").trim();
    }
    return "";
  }

  app.post("/api/gemini/verify", async (req, res) => {
    try {
      const apiKey = getResolvedApiKey(req);
      if (!apiKey || apiKey === "dummy") {
        return res.status(401).json({
          valid: false,
          error: "API key is not configured or is empty."
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: "ping",
      });

      res.json({ valid: true });
    } catch (error: any) {
      res.status(401).json({
        valid: false,
        error: error.message || "Failed to verify Gemini API key"
      });
    }
  });

  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const apiKey = getResolvedApiKey(req);
      if (!apiKey || apiKey === "dummy") {
        return res.status(401).json({
          error: "Your Gemini API key can be found in the Settings > Secrets panel or entered in Settings."
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });
      res.json({ text: response.text });
    } catch (error: any) {
      const msg = error?.message || "";
      if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
        return res.status(401).json({
          error: "Your Gemini API key can be found in the Settings > Secrets panel or entered in Settings."
        });
      }
      res.status(500).json({ error: msg || "Failed to generate content" });
    }
  });

  // Server-side streaming endpoint via Server-Sent Events (SSE)
  app.post("/api/gemini/stream", async (req, res) => {
    try {
      const apiKey = getResolvedApiKey(req);
      if (!apiKey || apiKey === "dummy") {
        return res.status(401).json({
          error: "Your Gemini API key can be found in the Settings > Secrets panel or entered in Settings."
        });
      }

      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      const msg = error?.message || "";
      if (!res.headersSent) {
        res.status(500).json({ error: msg || "Streaming failed" });
      } else {
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
