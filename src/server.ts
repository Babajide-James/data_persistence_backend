import express from 'express';
import cors from 'cors';
import path from 'path';
import { getDb } from './database';
import profileRoutes from './routes/profileRoutes';

const app = express();

// CORS
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.json());

// Routes
app.use('/api/profiles', profileRoutes);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Not Found' });
});

const PORT = process.env.PORT || 3000;

// Resolve seed file path — works both locally (from dist/ or src/) and on Vercel
const SEED_FILE = path.join(__dirname, '..', 'seed_profiles.json');

// Bootstrap: initialize DB + seed, then start listening
const db = getDb();
db.seedFromFile(SEED_FILE);

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
