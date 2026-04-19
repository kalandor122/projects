import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import tagRoutes from './routes/tags';
import worklogRoutes from './routes/worklogs';
import { connectMQTT } from './services/mqtt';
import pool from './db';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/worklogs', worklogRoutes);

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
  }
};

// Start Server
const start = async () => {
  await initDB();
  connectMQTT();
  
  // Wait a bit for MQTT to connect then sync
  setTimeout(() => {
    import('./services/mqtt').then(mqtt => mqtt.syncAllToHA(pool));
  }, 2000);
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
