import express from 'express';
import cors from 'cors';
import { getDb } from './database';
import profileRoutes from './routes/profileRoutes';

const app = express();

app.use(cors());

// To enforce the specific header as per requirements without relying entirely on generic cors setup
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.json());

// Routes
app.use('/api/profiles', profileRoutes);

// Catch all for 404
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Not Found' });
});

const PORT = process.env.PORT || 3000;

// Initialize app only after DB ensures it's readable
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server starting on port ${PORT}`);
  });
}).catch(err => {
  console.error("Failed to start server due to DB error:", err);
});
