-- PostgreSQL Data Model for Layer App
-- Version: 1.0
-- Description: Production-ready schema based on app's entities and relationships.
-- Assumes PostgreSQL 14+ for features like generated columns if needed.
-- Key decisions:
-- - Use UUID for primary keys to allow distributed generation.
-- - Enums for constrained fields (statuses, priorities).
-- - JSONB for flexible, semi-structured data (e.g., positions, flowchart data, excel grids).
-- - Timestamps for auditing (created_at, updated_at).
-- - Foreign keys with CASCADE deletes for hierarchies.
-- - Indexes on frequent query fields (e.g., status, dates, assignees).
-- - Users table for multi-user support (assignees, actors, reporters).
-- - Attachments as polymorphic (entity_type enum) with BYTEA for binary data.
-- - Whiteboard elements (from grip-diagram.js) normalized under projects.

-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum Types
CREATE TYPE project_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'backlog');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE entity_type AS ENUM ('project', 'document', 'excel', 'issue', 'assignment');
CREATE TYPE flowchart_node_type AS ENUM ('flowNode', 'cell', 'textBox', 'image');  -- Expanded from app's types
CREATE TYPE connection_position AS ENUM ('top', 'bottom', 'left', 'right');

-- Users Table (for assignees, actors, reporters; single-user initially, but scalable)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_update_timestamp
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Projects Table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    status project_status NOT NULL DEFAULT 'todo',
    start_date DATE NOT NULL,
    target_date DATE,
    description TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Owner/creator
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER projects_update_timestamp
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_dates ON projects(start_date, target_date);

-- Columns Table (Kanban columns per project)
CREATE TABLE project_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,  -- For ordering
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER project_columns_update_timestamp
BEFORE UPDATE ON project_columns
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Unique constraint for title per project
ALTER TABLE project_columns ADD CONSTRAINT unique_column_title_per_project UNIQUE (project_id, title);

-- Indexes
CREATE INDEX idx_project_columns_project_id ON project_columns(project_id);

-- Tasks Table (Embedded in columns)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    column_id UUID NOT NULL REFERENCES project_columns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    done BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tasks_update_timestamp
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_tasks_column_id ON tasks(column_id);
CREATE INDEX idx_tasks_done ON tasks(done);

-- Updates Table (Comments/activities per project)
CREATE TABLE project_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_project_updates_project_id ON project_updates(project_id);
CREATE INDEX idx_project_updates_time ON project_updates(time);

-- Flowchart/Whiteboard Elements
-- Nodes (cells, textboxes, images, etc.)
CREATE TABLE flowchart_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type flowchart_node_type NOT NULL,
    position JSONB NOT NULL,  -- e.g., {"x": 50, "y": 50}
    data JSONB NOT NULL,  -- e.g., {"label": "text", "headerColor": "#89b4fa", "width": 200, "height": 120}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER flowchart_nodes_update_timestamp
BEFORE UPDATE ON flowchart_nodes
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_flowchart_nodes_project_id ON flowchart_nodes(project_id);
CREATE INDEX idx_flowchart_nodes_type ON flowchart_nodes(type);

-- Connections/Edges
CREATE TABLE flowchart_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_node_id UUID NOT NULL REFERENCES flowchart_nodes(id) ON DELETE CASCADE,
    from_position connection_position,
    to_node_id UUID NOT NULL REFERENCES flowchart_nodes(id) ON DELETE CASCADE,
    to_position connection_position,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_flowchart_connections_project_id ON flowchart_connections(project_id);
CREATE INDEX idx_flowchart_connections_from_node ON flowchart_connections(from_node_id);
CREATE INDEX idx_flowchart_connections_to_node ON flowchart_connections(to_node_id);

-- Backlog Tasks (Global)
CREATE TABLE backlog_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    status task_status NOT NULL DEFAULT 'todo',
    priority priority_level NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER backlog_tasks_update_timestamp
BEFORE UPDATE ON backlog_tasks
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_backlog_tasks_status ON backlog_tasks(status);
CREATE INDEX idx_backlog_tasks_priority ON backlog_tasks(priority);
CREATE INDEX idx_backlog_tasks_assignee ON backlog_tasks(assignee_id);
CREATE INDEX idx_backlog_tasks_due_date ON backlog_tasks(due_date);

-- Issues (Global)
CREATE TABLE issues (
    id VARCHAR(50) PRIMARY KEY,  -- e.g., 'LAYER-XXXX'
    title VARCHAR(255) NOT NULL,
    status project_status NOT NULL DEFAULT 'todo',
    priority priority_level NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

CREATE TRIGGER issues_update_timestamp
BEFORE UPDATE ON issues
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_priority ON issues(priority);
CREATE INDEX idx_issues_assignee ON issues(assignee_id);
CREATE INDEX idx_issues_reporter ON issues(reporter_id);

-- Calendar Events (Global)
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(50),  -- e.g., '14:30'
    description TEXT,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER calendar_events_update_timestamp
BEFORE UPDATE ON calendar_events
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_calendar_events_completed ON calendar_events(completed);

-- Documents (Global)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    content TEXT NOT NULL,  -- HTML content
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER documents_update_timestamp
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Excels (Global)
CREATE TABLE excels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER excels_update_timestamp
BEFORE UPDATE ON excels
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Sheets (Per Excel)
CREATE TABLE excel_sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    excel_id UUID NOT NULL REFERENCES excels(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    grid_data JSONB NOT NULL,  -- Array of arrays for rows/cells, e.g., [["A1", "B1"], ["A2", "B2"]]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER excel_sheets_update_timestamp
BEFORE UPDATE ON excel_sheets
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_excel_sheets_excel_id ON excel_sheets(excel_id);

-- Assignments (Global)
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    status project_status NOT NULL DEFAULT 'todo',
    priority priority_level NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER assignments_update_timestamp
BEFORE UPDATE ON assignments
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Indexes
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_priority ON assignments(priority);
CREATE INDEX idx_assignments_assignee ON assignments(assignee_id);
CREATE INDEX idx_assignments_due_date ON assignments(due_date);

-- Attachments (Polymorphic for projects, docs, excels, etc.)
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type entity_type NOT NULL,
    entity_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,  -- e.g., 'image/png'
    size BIGINT NOT NULL,
    data BYTEA NOT NULL,  -- Binary storage
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Composite index for polymorphic queries
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

-- Themes (Per user, for personalization; global in app but user-scoped here)
CREATE TABLE user_themes (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme_name VARCHAR(50) NOT NULL DEFAULT 'dark',
    theme_mode VARCHAR(50) NOT NULL DEFAULT 'dark',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER user_themes_update_timestamp
BEFORE UPDATE ON user_themes
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- End of Schema
