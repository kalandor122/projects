import { Router, Request, Response } from 'express';
import pool from '../../db';

const router = Router();

// Sanitize error messages before sending to the client
function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return message
    .replace(/password:.*@/g, 'password:***@')
    .replace(/FATAL:\s*/gi, '')
    .replace(/ERROR:\s*/gi, '')
    .replace(/\n/g, ' ')
    .substring(0, 200);
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'miniMax/MiniMax-M1';
const SETTINGS_KEY = 'openrouter_api_key';

/**
 * Resolve the OpenRouter API key from the environment first, then fall back to
 * the `settings` table (JSONB value stored under key "openrouter_api_key").
 */
async function resolveApiKey(): Promise<string | null> {
  // 1. Environment variable takes precedence
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }

  // 2. Fall back to the settings table
  try {
    const result = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      [SETTINGS_KEY]
    );
    if (result.rows.length === 0) return null;

    const raw = result.rows[0].value;
    // JSONB can store a plain string ("sk-..."), a number, or an object
    if (typeof raw === 'string') return raw.trim() || null;
    if (raw && typeof raw === 'object') {
      const fromObj = (raw as Record<string, string>).api_key ?? (raw as Record<string, string>).key;
      if (typeof fromObj === 'string' && fromObj.trim().length > 0) {
        return fromObj.trim();
      }
    }
    return null;
  } catch {
    // settings table may not exist yet — treat as "no key"
    return null;
  }
}

/**
 * Parse the AI response content into a list of subtask names.
 * Accepts (in priority order):
 *   1. A JSON array of strings, possibly wrapped in ```json fences
 *   2. Bullet-point lines ("- " or "* ")
 *   3. Numbered lines ("1. ", "2. ", …)
 */
function parseSubtasks(content: string): string[] {
  const trimmed = content.trim();

  // Strip Markdown code fences if present (```json ... ``` or ``` ... ```)
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Attempt 1: JSON array
  try {
    const parsed = JSON.parse(inner);
    if (Array.isArray(parsed)) {
      const names = parsed
        .map((item) => (typeof item === 'string' ? item : item?.name ?? item?.title ?? ''))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (names.length > 0) return names;
    }
  } catch {
    // not JSON — fall through
  }

  // Attempt 2 & 3: line-based parsing (bullets or numbered)
  const lines = inner.split('\n');
  const names: string[] = [];
  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    // Bullet point: - item  /  * item
    const bulletMatch = cleaned.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      const name = bulletMatch[1].trim();
      if (name.length > 0) names.push(name);
      continue;
    }

    // Numbered: 1. item  /  2) item
    const numberedMatch = cleaned.match(/^\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      const name = numberedMatch[1].trim();
      if (name.length > 0) names.push(name);
      continue;
    }
  }

  return names;
}

/**
 * POST /api/daily/ai/:taskId/break-down
 *
 * Given a daily task ID (project_id IS NULL), calls the OpenRouter API to
 * generate actionable subtasks, inserts them into the `subtasks` table, marks
 * the task as `is_ai_generated = TRUE`, and returns the created subtasks.
 */
router.post('/:taskId/break-down', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    // 1. Fetch the task — only daily tasks (project_id IS NULL) are eligible
    const taskResult = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND project_id IS NULL',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      res.status(404).json({ error: 'Daily task not found' });
      return;
    }

    const task = taskResult.rows[0];

    // 2. Resolve the OpenRouter API key
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      res.status(500).json({
        error: 'OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or store it in the settings table.',
      });
      return;
    }

    // 3. Call the OpenRouter chat completions API
    const aiResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You break down tasks into small, actionable subtasks. ' +
              'Return ONLY a JSON array of short subtask name strings (max 120 chars each). ' +
              'Do not include any explanation, markdown, or commentary — just the JSON array.',
          },
          {
            role: 'user',
            content: `Break down this task: ${task.name}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => '');
      console.error('OpenRouter API error:', aiResponse.status, errText);
      res.status(502).json({
        error: `OpenRouter API returned status ${aiResponse.status}`,
      });
      return;
    }

    const aiData = await aiResponse.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = aiData.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      res.status(502).json({ error: 'OpenRouter returned an empty response' });
      return;
    }

    // 4. Parse the response into subtask names
    const subtaskNames = parseSubtasks(content);

    if (subtaskNames.length === 0) {
      res.status(502).json({
        error: 'Could not parse subtasks from AI response',
        raw: content.substring(0, 500),
      });
      return;
    }

    // 5. Insert subtasks + mark the task as AI-generated (transactional)
    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      const insertPromises = subtaskNames.map((name) =>
        db.query(
          'INSERT INTO subtasks (task_id, name) VALUES ($1, $2) RETURNING *',
          [taskId, name.substring(0, 255)]
        )
      );
      const insertResults = await Promise.all(insertPromises);
      const createdSubtasks = insertResults.map((r) => r.rows[0]);

      await db.query(
        'UPDATE tasks SET is_ai_generated = TRUE, updated_at = NOW() WHERE id = $1',
        [taskId]
      );

      await db.query('COMMIT');

      // 6. Return the created subtasks
      res.status(201).json({
        task_id: taskId,
        is_ai_generated: true,
        subtasks: createdSubtasks,
      });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error('Error in AI task breakdown:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
