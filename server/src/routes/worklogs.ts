import express from 'express';
import pool from '../db';

const router = express.Router();

// Sanitize PostgreSQL error messages
function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

// Get worklogs for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      'SELECT * FROM worklogs WHERE project_id = $1 ORDER BY date DESC, created_at DESC',
      [projectId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Create worklog entry
router.post('/', async (req, res) => {
  try {
    const { project_id, date, title, description } = req.body;

    if (!project_id || typeof project_id !== 'string') {
      return res.status(400).json({ error: 'project_id is required' });
    }
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'date is required' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'title is required' });
    }

    const result = await pool.query(
      'INSERT INTO worklogs (project_id, date, title, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [project_id, date, title.trim(), description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Update worklog entry
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, title, description } = req.body;

    // Build dynamic SET clause to allow setting fields to NULL
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (date !== undefined) { fields.push(`date = $${paramIndex++}`); values.push(date); }
    if (title !== undefined) { fields.push(`title = $${paramIndex++}`); values.push(title); }
    if (description !== undefined) { fields.push(`description = $${paramIndex++}`); values.push(description); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE worklogs SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worklog entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Delete worklog entry
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM worklogs WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worklog entry not found' });
    res.json({ message: 'Worklog entry deleted' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
