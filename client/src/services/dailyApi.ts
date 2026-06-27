const BASE = '/api/daily';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface DailyTask {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'completed' | 'rolled_over';
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  category_id: string | null;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_color?: string;
  tags?: { id: string; name: string; color: string }[];
  subtasks?: { id: string; name: string; completed: boolean; created_at: string }[];
}

export interface DailyCategory {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface DailyStats {
  total: number;
  completed: number;
  pending: number;
  rolled_over: number;
  streak: number;
}

export interface DailyLog {
  date: string;
  tasks_completed: number;
  tasks_pending: number;
  tasks_rolled: number;
}

export const dailyApi = {
  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<DailyTask[]>(`/tasks${qs}`);
    },
    get: (id: string) => request<DailyTask>(`/tasks/${id}`),
    create: (data: Partial<DailyTask>) =>
      request<DailyTask>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<DailyTask>) =>
      request<DailyTask>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ deleted: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
    schedule: (days = 7) =>
      request<{ scheduled: number; results: { id: string; name: string; due_date: string }[] }>(
        '/schedule',
        { method: 'POST', body: JSON.stringify({ days }) }
      ),
    breakDown: (id: string) =>
      request<{ task_id: string; subtasks: DailyTask['subtasks'] }>(`/ai/${id}/break-down`, { method: 'POST' }),
  },
  categories: {
    list: () => request<DailyCategory[]>('/categories'),
    create: (data: Partial<DailyCategory>) =>
      request<DailyCategory>('/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<DailyCategory>) =>
      request<DailyCategory>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ deleted: boolean }>(`/categories/${id}`, { method: 'DELETE' }),
  },
  analytics: {
    stats: () => request<DailyStats>('/analytics/stats'),
    heatmap: () => request<{ date: string; tasks_completed: number }[]>('/analytics/heatmap'),
    daily: (days = 30) => request<DailyLog[]>(`/analytics/daily?days=${days}`),
  },
  settings: {
    get: () => request<Record<string, any>>('/settings'),
    update: (data: Record<string, any>) =>
      request<{ updated: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
};
