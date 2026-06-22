import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import tagRoutes from './routes/tags';
import worklogRoutes from './routes/worklogs';
import dailyTasksRoutes from './routes/daily/tasks';
import dailyCategoriesRoutes from './routes/daily/categories';
import dailyAnalyticsRoutes from './routes/daily/analytics';
import dailyAiRoutes from './routes/daily/ai';
import dailySettingsRoutes from './routes/daily/settings';
import { connectMQTT, waitForConnection, syncAllToHA } from './services/mqtt';
import { startRolloverJob } from './jobs/rollover';
import pool from './db';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// CORS: allow all by default, restrict via CORS_ORIGINS env var in production
const corsOptions: cors.CorsOptions = { origin: true }; // reflect request origin
if (process.env.CORS_ORIGINS) {
  const allowedOrigins = process.env.CORS_ORIGINS.split(',').map((s: string) => s.trim());
  corsOptions.origin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  };
}
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/worklogs', worklogRoutes);

// Daily Todo routes
app.use('/api/daily/tasks', dailyTasksRoutes);
app.use('/api/daily/categories', dailyCategoriesRoutes);
app.use('/api/daily/analytics', dailyAnalyticsRoutes);
app.use('/api/daily/ai', dailyAiRoutes);
app.use('/api/daily/settings', dailySettingsRoutes);

// Database initialization
const initDB = async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(schema);
    
    // Migration: Add priority column if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='priority') THEN
          ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 3;
        END IF;
      END
      $$;
    `);

    // Migration: Add ease_level column if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='ease_level') THEN
          ALTER TABLE tasks ADD COLUMN ease_level VARCHAR(50) NOT NULL DEFAULT 'Medium';
        END IF;
      END
      $$;
    `);

    // Migration: Add icon column to projects if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='icon') THEN
          ALTER TABLE projects ADD COLUMN icon VARCHAR(50) DEFAULT 'folder';
        END IF;
      END
      $$;
    `);

    // Migration: Create worklogs table if it doesn't exist (handled by schema.sql but double check for existing instances)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS worklogs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log('Database initialized and migrations applied');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
};

// Start Server
const start = async () => {
  await initDB();
  
  let mqttConnected = false;
  try {
    const mqttClient = connectMQTT();
    await waitForConnection(mqttClient);
    mqttConnected = true;
    await syncAllToHA(pool);
  } catch (err) {
    console.warn('MQTT not available - server will run without MQTT features:', (err as Error).message);
  }

  // Start daily rollover cron job
  try {
    startRolloverJob();
  } catch (err) {
    console.warn('Rollover job failed to start:', (err as Error).message);
  }
  
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await pool.end();
        console.log('Database pool closed.');
      } catch (err) {
        console.error('Error closing database pool:', err);
      }
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  console.error('Fatal: Failed to start server:', err);
  process.exit(1);
});
