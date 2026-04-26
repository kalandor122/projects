import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  format, 
  startOfDay, 
  addDays, 
  differenceInCalendarDays, 
  min, 
  max, 
  startOfMonth, 
  eachDayOfInterval, 
  eachMonthOfInterval, 
  endOfMonth, 
  isToday 
} from 'date-fns';
import { ChevronRight, ChevronDown, List } from 'lucide-react';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Task {
  id: string;
  project_id: string;
  name: string;
  description: string;
  deadline: string;
  created_at: string;
  status: string;
  tags: Tag[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  created_at: string;
  status: string;
  tags: Tag[];
}

export default function TimelineView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Responsive constants
  const DAY_WIDTH = isMobile ? 30 : 40;
  const SIDEBAR_WIDTH = isMobile ? 100 : 256;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = async () => {
    try {
      const [projRes, tasksRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/tasks')
      ]);
      const allProjects: Project[] = await projRes.json();
      setProjects(allProjects.filter(p => p.status !== 'Completed'));
      setTasks(await tasksRes.json());
    } catch (err) {
      console.error('Failed to fetch timeline data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const timelineRange = useMemo(() => {
    const today = startOfDay(new Date());
    if (projects.length === 0) {
      return { start: startOfMonth(addDays(today, -7)), end: endOfMonth(addDays(today, 30)) };
    }

    const allDates = [
      ...projects.map(p => new Date(p.created_at)),
      ...projects.filter(p => p.deadline).map(p => new Date(p.deadline)),
      ...tasks.map(t => new Date(t.created_at)),
      ...tasks.filter(t => t.deadline).map(t => new Date(t.deadline)),
      today
    ];

    const start = startOfMonth(addDays(min(allDates), -7));
    const end = endOfMonth(addDays(max(allDates), 30));

    return { start, end };
  }, [projects, tasks]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: timelineRange.start, end: timelineRange.end });
  }, [timelineRange]);

  const months = useMemo(() => {
    return eachMonthOfInterval({ start: timelineRange.start, end: timelineRange.end });
  }, [timelineRange]);

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      const today = startOfDay(new Date());
      const offset = differenceInCalendarDays(today, timelineRange.start) * DAY_WIDTH;
      scrollContainerRef.current.scrollLeft = offset - (isMobile ? 50 : 200);
    }
  }, [loading, timelineRange, isMobile]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  const totalWidth = days.length * DAY_WIDTH + SIDEBAR_WIDTH;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-100px)] animate-fadeIn overflow-hidden">
      <div className="mb-4 md:mb-6 shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Timeline</h1>
        <p className="text-xs md:text-sm text-gray-500 mt-1">Synced project roadmap.</p>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 bg-white rounded-xl md:rounded-2xl shadow-sm border border-gray-200 overflow-auto relative custom-scrollbar touch-auto overscroll-contain"
      >
        <div style={{ width: totalWidth }} className="relative min-h-full flex flex-col">
          
          {/* STICKY HEADER */}
          <div className="sticky top-0 z-40 flex h-16 md:h-20 bg-gray-50 border-b border-gray-200">
            <div 
              style={{ width: SIDEBAR_WIDTH }} 
              className="sticky left-0 z-50 bg-gray-50 border-r border-gray-200 p-2 md:p-4 font-black text-[10px] md:text-xs text-gray-400 uppercase tracking-widest flex items-center shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
            >
              {isMobile ? <List size={16}/> : 'Project / Task'}
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              {/* Months */}
              <div className="flex h-8 md:h-10 border-b border-gray-200">
                {months.map(month => {
                  const monthStart = max([startOfMonth(month), timelineRange.start]);
                  const monthEnd = min([endOfMonth(month), timelineRange.end]);
                  const daysInMonth = differenceInCalendarDays(monthEnd, monthStart) + 1;
                  return (
                    <div 
                      key={month.toISOString()} 
                      style={{ width: daysInMonth * DAY_WIDTH }}
                      className="border-r border-gray-200 px-2 md:px-3 text-[8px] md:text-[10px] font-black uppercase tracking-tighter text-gray-500 flex items-center shrink-0 truncate"
                    >
                      {format(month, isMobile ? 'MMM yy' : 'MMMM yyyy')}
                    </div>
                  );
                })}
              </div>
              {/* Days */}
              <div className="flex h-8 md:h-10">
                {days.map(day => (
                  <div 
                    key={day.toISOString()} 
                    style={{ width: DAY_WIDTH }}
                    className={`border-r border-gray-100 text-[8px] md:text-[10px] font-bold flex flex-col items-center justify-center shrink-0 ${
                      isToday(day) ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400'
                    }`}
                  >
                    <span>{format(day, 'd')}</span>
                    <span className="opacity-70 text-[6px] md:text-[8px] uppercase">{format(day, isMobile ? 'EE' : 'EEE')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* GRID CONTENT */}
          <div className="flex-1 relative flex flex-col">
            <div className="absolute inset-0 flex pointer-events-none" style={{ left: SIDEBAR_WIDTH }}>
              {days.map(day => (
                <div 
                  key={day.toISOString()} 
                  style={{ width: DAY_WIDTH }} 
                  className={`border-r border-gray-100 h-full shrink-0 ${isToday(day) ? 'bg-blue-50/20' : ''}`}
                />
              ))}
            </div>

            <div className="flex flex-col">
              {projects.map(project => (
                <div key={project.id} className="flex flex-col">
                  {/* PROJECT ROW */}
                  <div className="flex h-12 md:h-14 border-b border-gray-100 group">
                    <div 
                      style={{ width: SIDEBAR_WIDTH }}
                      className="sticky left-0 z-30 bg-white border-r border-gray-200 px-2 md:px-4 flex items-center gap-1 md:gap-2 cursor-pointer hover:bg-gray-50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)] overflow-hidden"
                      onClick={() => toggleProject(project.id)}
                    >
                      <div className="shrink-0 text-gray-400">
                        {expandedProjects.includes(project.id) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      </div>
                      <span className="font-bold text-[10px] md:text-sm text-gray-800 truncate">{project.name}</span>
                    </div>
                    
                    <div className="flex-1 relative flex items-center">
                      {(() => {
                        const start = startOfDay(new Date(project.created_at));
                        const end = project.deadline ? startOfDay(new Date(project.deadline)) : addDays(start, 7);
                        const left = differenceInCalendarDays(start, timelineRange.start) * DAY_WIDTH;
                        const width = (differenceInCalendarDays(end, start) + 1) * DAY_WIDTH;
                        return (
                          <div 
                            className="absolute h-6 md:h-8 bg-blue-500/10 border-2 border-blue-500 rounded-lg flex items-center px-2 md:px-4 z-10 hover:shadow-lg transition-all cursor-default"
                            style={{ left, width }}
                            title={`${project.name}: ${format(start, 'MMM d')} - ${format(end, 'MMM d')}`}
                          >
                            <span className="text-[8px] md:text-xs font-black text-blue-700 truncate">{project.name}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* TASK ROWS */}
                  {expandedProjects.includes(project.id) && tasks.filter(t => t.project_id === project.id).map(task => (
                    <div key={task.id} className="flex h-10 md:h-12 border-b border-gray-50 group bg-gray-50/20">
                      <div 
                        style={{ width: SIDEBAR_WIDTH }}
                        className="sticky left-0 z-30 bg-gray-50/80 backdrop-blur-sm border-r border-gray-200 pl-6 md:pl-10 pr-2 flex items-center shadow-[2px_0_5px_rgba(0,0,0,0.02)] overflow-hidden"
                      >
                        <span className="text-[9px] md:text-xs font-medium text-gray-500 truncate">{task.name}</span>
                      </div>
                      
                      <div className="flex-1 relative flex items-center">
                        {(() => {
                          const start = startOfDay(new Date(task.created_at));
                          const end = task.deadline ? startOfDay(new Date(task.deadline)) : start;
                          const left = differenceInCalendarDays(start, timelineRange.start) * DAY_WIDTH;
                          const width = (differenceInCalendarDays(end, start) + 1) * DAY_WIDTH;
                          const color = task.status === 'DONE' ? 'bg-green-500 border-green-600' : 
                                        task.status === 'IN_PROGRESS' ? 'bg-blue-400 border-blue-500' : 'bg-gray-400 border-gray-500';
                          return (
                            <div 
                              className={`absolute h-4 md:h-5 ${color} bg-opacity-20 border rounded-full flex items-center px-1 md:px-2 z-10 hover:scale-105 transition-transform`}
                              style={{ left, width }}
                              title={`${task.name}: ${format(start, 'MMM d')} - ${format(end, 'MMM d')}`}
                            >
                              <span className={`text-[7px] md:text-[9px] font-bold text-gray-700 truncate ${width < 25 ? 'hidden' : ''}`}>{task.name}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
