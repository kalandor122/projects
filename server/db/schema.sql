-- Initial Schema for Task Project Management (merged with Daily Todo)
-- Projects & Tasks — unified Life OS app

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tags table (shared between projects and daily tasks)
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#cccccc'
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    icon VARCHAR(50) DEFAULT 'folder',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project-Tags junction
CREATE TABLE IF NOT EXISTS project_tags (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, tag_id)
);

-- Categories table (for daily todo categorization)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks table (project tasks + daily todos)
-- project_id NULL = daily todo; project_id set = project task
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    due_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'TODO',
    ease_level VARCHAR(50) NOT NULL DEFAULT 'Medium',
    priority INTEGER NOT NULL DEFAULT 3,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT tasks_status_check CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'pending', 'completed', 'rolled_over'))
);

-- Task-Tags junction
CREATE TABLE IF NOT EXISTS task_tags (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

-- Worklogs table (for project documentation)
CREATE TABLE IF NOT EXISTS worklogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subtasks table (shared: project task subtasks + daily todo subtasks)
CREATE TABLE IF NOT EXISTS subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily logs (for analytics: streak tracking, daily stats)
CREATE TABLE IF NOT EXISTS daily_logs (
    date DATE NOT NULL PRIMARY KEY,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    tasks_pending INTEGER NOT NULL DEFAULT 0,
    tasks_rolled INTEGER NOT NULL DEFAULT 0
);

-- Settings (key-value store for app config)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL PRIMARY KEY,
    value JSONB NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_ai ON tasks(is_ai_generated) WHERE is_ai_generated = TRUE;
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(date);
