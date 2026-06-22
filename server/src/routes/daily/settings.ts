import { Router, Request, Response } from 'express';
import pool from '../../db';

const router = Router();

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

// GET /api/daily/settings — get all settings as key-value object
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings: Record<string, any> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PUT /api/daily/settings — bulk update settings
router.put('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      res.status(400).json({ error: 'Body must be a JSON object of key-value pairs' });
      return;
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      for (const [key, value] of Object.entries(data)) {
        await db.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, JSON.stringify(value)]
        );
      }

      await db.query('COMMIT');
      res.json({ updated: true });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
