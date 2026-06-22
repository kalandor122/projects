import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dailyApi, DailyTask } from '../../services/dailyApi';
import DailyTaskCard from '../../components/daily/DailyTaskCard';
import DailyTaskForm from '../../components/daily/DailyTaskForm';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Filters {
  status: string;
  priority: string;
  search: string;
  [key: string]: string;
}

export default function DailyTasks() {
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    status: '',
    priority: '',
    search: '',
  });

  // Load project tags on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tags');
        if (res.ok) setTags(await res.json());
      } catch (err) {
        console.error('Failed to load tags', err);
      }
    })();
  }, []);

  // Refetch tasks whenever filters change
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await dailyApi.tasks.list(filters);
        if (!cancelled) {
          setTasks(data);
        }
      } catch (err) {
        console.error('Failed to fetch tasks', err);
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filters]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleTaskClick = (task: DailyTask) => {
    navigate(`/daily/tasks/${task.id}`);
  };

  const handleToggle = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus as DailyTask['status'] } : t))
    );
    try {
      await dailyApi.tasks.update(id, { status: newStatus });
    } catch (err) {
      console.error('Failed to toggle task', err);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: task.status } : t))
      );
    }
  };

  const handleTaskSubmit = async (data: {
    name: string;
    description?: string;
    priority: number;
    due_date?: string;
    tags?: string[];
  }) => {
    try {
      await dailyApi.tasks.create(data as unknown as Partial<DailyTask>);
      handleTaskCreated();
    } catch (err) {
      console.error('Failed to create task', err);
    }
  };

  const handleTaskCreated = () => {
    setShowForm(false);
    setFilters((prev) => ({ ...prev }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          + Add Task
        </button>
      </div>

      {/* Inline Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <DailyTaskForm
            tags={tags}
            onSubmit={handleTaskSubmit}
          />
          <div className="mt-3 text-right">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search tasks..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="rolled_over">Rolled Over</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white"
            >
              <option value="">All</option>
              <option value="1">Urgent</option>
              <option value="2">High</option>
              <option value="3">Medium</option>
              <option value="4">Low</option>
            </select>
          </div>
        </div>

        {/* Clear Filters */}
        {(filters.status || filters.priority || filters.search) && (
          <div className="mt-3">
            <button
              onClick={() => setFilters({ status: '', priority: '', search: '' })}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-blue-500 text-sm mt-3">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-xl py-16 text-center">
          <div className="text-gray-400 text-5xl mb-3">📋</div>
          <p className="text-gray-600 font-medium text-lg">No tasks found</p>
          <p className="text-gray-400 text-sm mt-1">
            Try adjusting your filters or create a new task.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            + Add Task
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => handleTaskClick(task)}
              className="cursor-pointer"
            >
              <DailyTaskCard task={task} onToggle={handleToggle} onClick={(id) => navigate(`/daily/tasks/${id}`)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
