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

// GET / — list all categories ordered by sort_order ASC
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST / — create a category
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO categories (name, color) VALUES ($1, $2) RETURNING *`,
      [name.trim(), color || '#3B82F6']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PUT /:id — update a category (dynamic SET clause)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color, sort_order } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(name); }
    if (color !== undefined) { fields.push(`color = $${paramIdx++}`); values.push(color); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${paramIdx++}`); values.push(sort_order); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// DELETE /:id — delete a category
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
