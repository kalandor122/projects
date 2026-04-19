import express from 'express';
import pool from '../db';

const router = express.Router();

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
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create worklog entry
router.post('/', async (req, res) => {
  try {
    const { project_id, date, title, description } = req.body;
    const result = await pool.query(
      'INSERT INTO worklogs (project_id, date, title, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [project_id, date, title, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update worklog entry
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, title, description } = req.body;
    const result = await pool.query(
      'UPDATE worklogs SET date = COALESCE($1, date), title = COALESCE($2, title), description = COALESCE($3, description) WHERE id = $4 RETURNING *',
      [date, title, description, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worklog entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
