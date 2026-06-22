import React, { useState, useEffect } from 'react';
import { dailyApi, DailyStats, DailyLog } from '../../services/dailyApi';

interface HeatmapEntry {
  date: string;
  tasks_completed: number;
}

interface HeatmapCell {
  date: string;
  count: number;
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  month: number;
}

function getIntensityClass(count: number): string {
  if (count === 0) return 'bg-gray-100';
  if (count <= 2) return 'bg-green-200';
  if (count <= 5) return 'bg-green-400';
  return 'bg-green-600';
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildHeatmapGrid(entries: HeatmapEntry[]): {
  weeks: HeatmapCell[][];
  monthLabels: { weekIndex: number; label: string }[];
} {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.date, e.tasks_completed);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from 365 days ago
  const start = new Date(today);
  start.setDate(start.getDate() - 364);

  // Align to Monday
  const startDay = start.getDay(); // 0=Sun
  const daysFromMonday = startDay === 0 ? 6 : startDay - 1;
  const firstWeekStart = new Date(start);
  firstWeekStart.setDate(firstWeekStart.getDate() - daysFromMonday);

  const weeks: HeatmapCell[][] = [];
  let current = new Date(firstWeekStart);
  const monthLabels: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;

  let weekIdx = 0;
  while (current <= today) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(current);
      const dateStr = cellDate.toISOString().slice(0, 10);
      const count = map.get(dateStr) ?? 0;
      const month = cellDate.getMonth();
      const isInRange = cellDate >= start && cellDate <= today;

      week.push({
        date: dateStr,
        count: isInRange ? count : -1,
        dayOfWeek: d,
        month,
      });

      // Month label on first Monday of new month
      if (d === 0 && isInRange && month !== lastMonth) {
        monthLabels.push({ weekIndex: weekIdx, label: MONTH_LABELS[month] });
        lastMonth = month;
      }

      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    weekIdx++;
  }

  return { weeks, monthLabels };
}

const DailyAnalytics: React.FC = () => {
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, heatmapRes, logsRes] = await Promise.all([
          dailyApi.analytics.stats(),
          dailyApi.analytics.heatmap(),
          dailyApi.analytics.daily(30),
        ]);
        if (!mounted) return;
        setStats(statsRes);
        setHeatmap(Array.isArray(heatmapRes) ? heatmapRes : []);
        setDailyLogs(Array.isArray(logsRes) ? logsRes : []);
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-red-500 text-lg font-semibold mb-2">⚠️ Error</p>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const maxCompleted = dailyLogs.reduce(
    (max, log) => Math.max(max, log.tasks_completed ?? 0),
    0,
  );

  const { weeks, monthLabels } = buildHeatmapGrid(heatmap);

  const statCards = [
    { label: 'Total', value: stats?.total ?? 0, color: 'bg-blue-500', textColor: 'text-blue-500' },
    { label: 'Completed', value: stats?.completed ?? 0, color: 'bg-green-500', textColor: 'text-green-500' },
    { label: 'Pending', value: stats?.pending ?? 0, color: 'bg-amber-500', textColor: 'text-amber-500' },
    { label: 'Rolled Over', value: stats?.rolled_over ?? 0, color: 'bg-purple-500', textColor: 'text-purple-500' },
    { label: 'Streak', value: `${stats?.streak ?? 0} 🔥`, color: 'bg-orange-500', textColor: 'text-orange-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl shadow-lg shadow-blue-200">
          📈
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Analytics</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
          >
            <div className={`w-3 h-3 rounded-full ${card.color}`} />
            <div className={`text-3xl font-bold ${card.textColor}`}>{card.value}</div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bar Chart — Last 30 Days */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Tasks Completed — Last 30 Days</h2>
        <p className="text-sm text-gray-400 mb-2">Daily completion count</p>

        {dailyLogs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No daily logs yet — complete some tasks to see data here.
          </div>
        ) : (
          <>
            {/* Y-axis max label */}
            <div className="flex items-end gap-1 overflow-x-auto pb-0" style={{ height: '24px' }}>
              <div className="text-[10px] text-gray-400 font-mono whitespace-nowrap min-w-[28px] text-right pr-1">
                {maxCompleted}
              </div>
            </div>
            {/* Bars */}
            <div className="flex items-end gap-1 overflow-x-auto pb-2 border-b border-gray-100" style={{ height: '120px' }}>
              {dailyLogs.map((log, i) => {
                const completed = log.tasks_completed ?? 0;
                const h = maxCompleted > 0 ? Math.max(4, Math.round((completed / maxCompleted) * 110)) : 4;
                const dateStr = log.date ?? '';
                const dayLabel = dateStr.length >= 10 ? dateStr.slice(8) : dateStr;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-0.5 group relative shrink-0"
                    style={{ minWidth: '28px' }}
                  >
                    {/* Count label — always visible */}
                    <span className={`text-[10px] font-semibold ${completed > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                      {completed}
                    </span>
                    {/* Bar */}
                    <div
                      className="w-5 rounded-t-md bg-gradient-to-t from-blue-400 to-blue-600 transition-all group-hover:from-blue-500 group-hover:to-blue-700"
                      style={{ height: `${h}px`, minHeight: completed > 0 ? '4px' : '1px' }}
                    />
                    {/* Date label */}
                    <span className="text-[9px] text-gray-400 font-mono mt-0.5">{dayLabel}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Heatmap — 365 Days */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Activity Heatmap — Last 365 Days</h2>
        <p className="text-sm text-gray-400 mb-4">Each square is a day. Hover for details.</p>

        <div className="overflow-x-auto pb-2">
          {/* Day labels row (Mon–Sun) */}
          <div className="flex gap-1 mb-0.5 ml-0">
            {/* Month labels row */}
            <div className="flex gap-1">
              {weeks.map((_, weekIdx) => {
                const monthLabel = monthLabels.find((m) => m.weekIndex === weekIdx);
                return (
                  <div key={weekIdx} className="w-3 text-[9px] text-gray-400 leading-3">
                    {monthLabel ? monthLabel.label : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid rows: one row per day of week */}
          {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-1 mb-1">
              {/* Day label */}
              <div className="w-8 text-[9px] text-gray-400 text-right pr-1 leading-3">
                {dayIdx % 2 === 0 ? DAY_NAMES[dayIdx] : ''}
              </div>
              {/* Week cells for this day */}
              {weeks.map((week, weekIdx) => {
                const cell = week[dayIdx];
                if (!cell || cell.count === -1) {
                  return <div key={`${weekIdx}-${dayIdx}`} className="w-3 h-3 rounded-sm bg-transparent" />;
                }
                return (
                  <div
                    key={`${weekIdx}-${dayIdx}`}
                    className={`w-3 h-3 rounded-sm ${getIntensityClass(cell.count)} cursor-pointer transition-transform hover:scale-125 hover:ring-1 hover:ring-blue-400`}
                    title={`${cell.date}: ${cell.count} tasks completed`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-100" />
            <div className="w-3 h-3 rounded-sm bg-green-200" />
            <div className="w-3 h-3 rounded-sm bg-green-400" />
            <div className="w-3 h-3 rounded-sm bg-green-600" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

export default DailyAnalytics;
