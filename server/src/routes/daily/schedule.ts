import { Router, Request, Response } from 'express';
import pool from '../../db';

const router = Router();

interface UnscheduledTask {
  id: string;
  name: string;
  priority: number;
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

// POST /api/daily/schedule — distribute unscheduled tasks across upcoming days
router.post('/', async (req: Request, res: Response) => {
  try {
    const days = Math.max(1, Math.min(90, Number(req.body.days) || 7));

    // Fetch all unscheduled pending tasks ordered by priority
    const tasksResult = await pool.query<UnscheduledTask>(
      `SELECT id, name, priority FROM tasks
       WHERE project_id IS NULL
         AND status = 'pending'
         AND due_date IS NULL
       ORDER BY priority ASC, created_at ASC`
    );

    const tasks = tasksResult.rows;
    if (tasks.length === 0) {
      res.json({ scheduled: 0, results: [] });
      return;
    }

    const today = new Date();
    const results: { id: string; name: string; due_date: string }[] = [];

    // Distribute tasks evenly across the day window by priority:
    // Priority 1 (Urgent): days 0..1
    // Priority 2 (High):   days 1..3
    // Priority 3 (Medium): days 3..5
    // Priority 4 (Low):    days 5..days
    const bandStart: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 5 };
    const bandEnd: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: days };

    // Group tasks by priority
    const byPriority: Record<number, UnscheduledTask[]> = {};
    for (const t of tasks) {
      if (!byPriority[t.priority]) byPriority[t.priority] = [];
      byPriority[t.priority].push(t);
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      for (let p = 1; p <= 4; p++) {
        const group = byPriority[p];
        if (!group || group.length === 0) continue;

        const start = bandStart[p];
        const end = bandEnd[p];
        const bandDays = end - start;

        for (let i = 0; i < group.length; i++) {
          const offset = bandDays > 0
            ? Math.floor((i / group.length) * bandDays)
            : 0;
          const targetDay = start + offset;

          const dueDate = new Date(today);
          dueDate.setDate(today.getDate() + targetDay);
          const dateStr = dueDate.toISOString().split('T')[0];

          await db.query(
            `UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2`,
            [dateStr, group[i].id]
          );

          results.push({
            id: group[i].id,
            name: group[i].name,
            due_date: dateStr,
          });
        }
      }

      await db.query('COMMIT');
      res.json({ scheduled: results.length, results });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error('Error scheduling tasks:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
