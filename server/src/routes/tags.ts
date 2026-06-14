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

// Get all tags
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tags ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Create tag
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const result = await pool.query(
      'INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *',
      [name.trim(), color || '#cccccc']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Update tag
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    // Build dynamic SET clause to allow setting fields to NULL
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(name); }
    if (color !== undefined) { fields.push(`color = $${paramIndex++}`); values.push(color); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE tags SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Delete tag
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tags WHERE id = $1', [id]);
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
