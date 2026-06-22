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

// GET /api/daily/analytics/stats — aggregate counts + current streak
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tasks WHERE project_id IS NULL) AS total,
        (SELECT COUNT(*) FROM tasks WHERE project_id IS NULL AND status = 'completed') AS completed,
        (SELECT COUNT(*) FROM tasks WHERE project_id IS NULL AND status = 'pending') AS pending,
        (SELECT COUNT(*) FROM tasks WHERE project_id IS NULL AND status = 'rolled_over') AS rolled_over
    `);

    // Streak: count consecutive days backwards from today where tasks_completed > 0
    const streakResult = await pool.query(
      `SELECT date FROM daily_logs
       WHERE tasks_completed > 0 AND date <= CURRENT_DATE
       ORDER BY date DESC`
    );

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const row of streakResult.rows) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - streak);
      const rowDate = new Date(row.date);
      rowDate.setHours(0, 0, 0, 0);
      if (rowDate.getTime() === expected.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    const row = statsResult.rows[0];
    res.json({
      total: parseInt(row.total, 10),
      completed: parseInt(row.completed, 10),
      pending: parseInt(row.pending, 10),
      rolled_over: parseInt(row.rolled_over, 10),
      streak,
    });
  } catch (err) {
    console.error('Error fetching daily stats:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/daily/analytics/heatmap — last 365 days of completion activity
router.get('/heatmap', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT date::text AS date, tasks_completed
       FROM daily_logs
       WHERE date >= CURRENT_DATE - INTERVAL '365 days'
       ORDER BY date`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching heatmap:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/daily/analytics/daily?days=30 — daily trends for recent N days
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days as string, 10) || 30));
    const result = await pool.query(
      `SELECT date::text AS date, tasks_completed, tasks_pending, tasks_rolled
       FROM daily_logs
       WHERE date >= CURRENT_DATE - $1::integer
       ORDER BY date ASC`,
      [days]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching daily trends:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
