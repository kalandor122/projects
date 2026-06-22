import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, FolderOpen, Tag, Menu, X, Clock, CheckSquare } from 'lucide-react';
import { useState } from 'react';
import ProjectList from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';
import TagManager from './pages/TagManager';
import TimelineView from './pages/TimelineView';
import DailyDashboard from './pages/daily/DailyDashboard';
import DailyTasks from './pages/daily/DailyTasks';
import DailyTaskDetail from './pages/daily/DailyTaskDetail';
import DailyAnalytics from './pages/daily/DailyAnalytics';
import DailySettings from './pages/daily/DailySettings';

function NavItem({ to, icon: Icon, label, exact, onClick }: { to: string, icon: any, label: string, exact?: boolean, onClick?: () => void }) {
  const location = useLocation();
  const isActive = exact
    ? location.pathname === to
    : location.pathname === to || (to !== '/' && location.pathname.startsWith(to + '/'));

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <Router>
      <div className="flex flex-col md:flex-row min-h-screen bg-gray-100">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-gray-900 text-white shadow-md">
          <div className="flex items-center gap-2">
            <Layout className="text-blue-500" />
            <span className="font-bold text-lg">Projects & Tasks</span>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -mr-2">
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </header>

        {/* Sidebar */}
        <aside className={`
          ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          md:translate-x-0 fixed md:static inset-y-0 right-0 md:left-0 z-50
          w-64 bg-gray-900 text-gray-300 transition-transform duration-300 ease-in-out
          flex flex-col shadow-xl
        `}>

          <div className="md:flex items-center gap-3 p-6 border-b border-gray-800">
            <Layout size={28} className="text-blue-500" />
            <button onClick={() => setIsSidebarOpen(false)} className="font-bold text-xl text-white bg-transparent border-none cursor-pointer p-0">Projects & Tasks</button>
          </div>

          <nav className="flex-1 p-4 space-y-2 mt-4">
            <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Projects</div>
            <NavItem to="/" icon={FolderOpen} label="Projects" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/timeline" icon={Clock} label="Timeline" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/tags" icon={Tag} label="Tags" onClick={() => setIsSidebarOpen(false)} />

            <div className="px-4 py-1 mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Todo</div>
            <NavItem to="/daily" icon={CheckSquare} label="Today" exact onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/daily/tasks" icon={CheckSquare} label="All Tasks" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/daily/analytics" icon={CheckSquare} label="Analytics" onClick={() => setIsSidebarOpen(false)} />
            <NavItem to="/daily/settings" icon={CheckSquare} label="Settings" onClick={() => setIsSidebarOpen(false)} />

          </nav>

          <div className="p-4 border-t border-gray-800 text-xs text-center text-gray-500">
            &copy; 2026 Füvesi Magor
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Routes>
              {/* Projects routes */}
              <Route path="/" element={<ProjectList />} />
              <Route path="/project/:id" element={<ProjectDetail />} />
              <Route path="/timeline" element={<TimelineView />} />
              <Route path="/tags" element={<TagManager />} />

              {/* Daily Todo routes */}
              <Route path="/daily" element={<DailyDashboard />} />
              <Route path="/daily/tasks" element={<DailyTasks />} />
              <Route path="/daily/tasks/:id" element={<DailyTaskDetail />} />
              <Route path="/daily/analytics" element={<DailyAnalytics />} />
              <Route path="/daily/settings" element={<DailySettings />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
