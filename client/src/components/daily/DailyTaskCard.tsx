import { useState } from 'react';
import type { DailyTask } from '../../services/dailyApi';

interface Props {
  task: DailyTask;
  onToggle: (id: string) => void;
  onClick: (id: string) => void;
}

export default function DailyTaskCard({ task, onToggle, onClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = task.status === 'completed';
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const completedSubtasks = hasSubtasks ? task.subtasks!.filter(s => s.completed).length : 0;

  const priorityLabels: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
  const priorityColors: Record<number, string> = {
    1: 'bg-red-50 text-red-700 border-red-100',
    2: 'bg-orange-50 text-orange-700 border-orange-100',
    3: 'bg-blue-50 text-blue-700 border-blue-100',
    4: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  const isToday = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  };

  const isOverdue = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date(new Date().toDateString());
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      <div
        className={`flex items-start gap-3 p-4 cursor-pointer ${
          isCompleted ? 'opacity-60' : ''
        }`}
        onClick={() => onClick(task.id)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
            isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-500'
          }`}
          aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
        >
          {isCompleted && (
            <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-medium truncate ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.name}
            </h3>
            {task.is_ai_generated && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md shrink-0">AI</span>
            )}
            {hasSubtasks && (
              <span className="text-xs text-gray-400 ml-auto shrink-0">
                {completedSubtasks}/{task.subtasks!.length}
              </span>
            )}
          </div>

          {task.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-1">{task.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColors[task.priority] || priorityColors[3]}`}>
              {priorityLabels[task.priority] || 'Medium'}
            </span>

            {task.due_date && !isToday(task.due_date) && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isOverdue(task.due_date) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}

            {task.category_name && (
              <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: task.category_color || '#3B82F6' }}>
                {task.category_name}
              </span>
            )}
          </div>

          {task.tags && task.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {task.tags.map(tag => (
                <span key={tag.id} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {hasSubtasks && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 mt-1 text-gray-400 hover:text-gray-600"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Subtasks */}
      {hasSubtasks && expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50 rounded-b-xl">
          {task.subtasks!.map(sub => (
            <div
              key={sub.id}
              className={`flex items-center gap-2.5 py-1.5 px-3 rounded-xl cursor-pointer hover:bg-white transition-colors ${sub.completed ? 'opacity-60' : ''}`}
              onClick={() => onClick(task.id)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(sub.id); }}
                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                  sub.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-500'
                }`}
              >
                {sub.completed && (
                  <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </button>
              <span className={`text-sm flex-1 ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {sub.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
