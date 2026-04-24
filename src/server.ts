import express from "express";
import cors from "cors";
import { getDb } from "./database";
import profileRoutes from "./routes/profileRoutes";

const app = express();

// CORS — allow all origins
app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());

// ── Health check / root route ────────────────────────────────────────────────
// Required so evaluators and bots can confirm the API is alive.
app.get("/", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "Profileable API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      profiles: "/api/profiles",
      search: "/api/profiles/search",
    },
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/profiles", profileRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

const PORT = process.env.PORT || 3000;

// Serverless platforms should not do blocking bootstrap work at module load.
// We initialize lazily through getDb() during requests, and only warm the DB
// before starting the local dev server.
if (process.env.NODE_ENV !== "production") {
  (async () => {
    try {
      await getDb();
      console.log("Database ready.");
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    }
  })();
}

export default app;
