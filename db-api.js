// db-api.js
// This is the database API script that interacts with the PostgreSQL database.
// It uses the 'pg' module for Node.js to connect and query the DB.
// Assumptions:
// - This is a Node.js module; the app needs a backend/server to use it (e.g., Express or Vercel serverless).
// - Connection details: Use environment variables for security (e.g., process.env.DATABASE_URL).
// - All functions are async and return Promises.
// - Error handling: Throws errors for failures; callers should catch.
// - Uses Pool for connection management.
// - For production: Add transactions where needed (e.g., addProject with columns).
// - Note: For browser integration, store.js will need to use fetch to call API endpoints wrapping these functions.

const { Pool } = require('pg');

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // e.g., 'postgresql://user:pass@localhost:5432/dbname'
  ssl: { rejectUnauthorized: false } // For production, configure properly
});

// Helper: Execute query with params
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Load all projects
async function loadProjects() {
  const res = await query('SELECT * FROM projects ORDER BY created_at DESC', []);
  return res.rows;
}

// Save projects (bulk upsert; but since it's array, assume replace all - not efficient, use for migration)
async function saveProjects(projects) {
  // For production, better to use individual upserts, but to match localStorage, truncate and insert
  await query('TRUNCATE projects CASCADE', []); // Caution: Deletes all!
  for (const proj of projects) {
    await addProject(proj); // Use add to handle nested
  }
}

// Add a single project (and its nested columns/tasks/updates/flowchart)
async function addProject(projectData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert project
    const projRes = await client.query(
      `INSERT INTO projects (id, name, status, start_date, target_date, description, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [projectData.id || uuid.v4(), projectData.name, projectData.status, projectData.startDate, projectData.targetDate, projectData.description, projectData.user_id || null]
    );
    const projId = projRes.rows[0].id;

    // Insert columns
    for (let pos = 0; pos < projectData.columns.length; pos++) {
      const col = projectData.columns[pos];
      const colRes = await client.query(
        `INSERT INTO project_columns (project_id, title, position)
         VALUES ($1, $2, $3) RETURNING id`,
        [projId, col.title, pos]
      );
      const colId = colRes.rows[0].id;

      // Insert tasks
      for (const task of col.tasks || []) {
        await client.query(
          `INSERT INTO tasks (column_id, title, done, created_at)
           VALUES ($1, $2, $3, $4)`,
          [colId, task.title, task.done, task.createdAt || new Date()]
        );
      }
    }

    // Insert updates
    for (const update of projectData.updates || []) {
      await client.query(
        `INSERT INTO project_updates (project_id, actor_id, message, time)
         VALUES ($1, $2, $3, $4)`,
        [projId, update.actor_id || null, update.message || update.action, update.time || new Date()]
      );
    }

    // Insert flowchart nodes and connections
    for (const node of projectData.flowchart?.nodes || []) {
      const nodeRes = await client.query(
        `INSERT INTO flowchart_nodes (project_id, type, position, data)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [projId, node.type, node.position, node.data]
      );
      // Edges would need mapping, assume projectData.flowchart.edges have source/target ids
      // For simplicity, skip if not present; add logic if needed
    }
    for (const conn of projectData.flowchart?.edges || []) {
      await client.query(
        `INSERT INTO flowchart_connections (project_id, from_node_id, from_position, to_node_id, to_position)
         VALUES ($1, $2, $3, $4, $5)`,
        [projId, conn.from_node_id, conn.from_position, conn.to_node_id, conn.to_position]
      );
    }

    await client.query('COMMIT');
    return projId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Update project
async function updateProject(projectId, updates) {
  // Partial update
  const setClauses = [];
  const params = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue; // Can't update ID
    setClauses.push(`${key} = $${paramIdx++}`);
    params.push(value);
  }

  params.push(projectId);
  await query(
    `UPDATE projects SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIdx}`,
    params
  );
}

// Delete project
async function deleteProject(projectId) {
  await query('DELETE FROM projects WHERE id = $1', [projectId]); // CASCADE handles children
}

// Add task to column
async function addTaskToColumn(projectId, columnIndex, title) {
  // First, find column by project and position (assuming position = index)
  const colRes = await query(
    'SELECT id FROM project_columns WHERE project_id = $1 AND position = $2',
    [projectId, columnIndex]
  );
  if (colRes.rows.length === 0) throw new Error('Column not found');
  const colId = colRes.rows[0].id;

  await query(
    'INSERT INTO tasks (column_id, title) VALUES ($1, $2)',
    [colId, title]
  );
}

// Toggle task done
async function toggleTaskDone(taskId) {
  await query(
    'UPDATE tasks SET done = NOT done, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [taskId]
  );
}

// Delete task
async function deleteTask(taskId) {
  await query('DELETE FROM tasks WHERE id = $1', [taskId]);
}

// Similar functions for other entities...
// Load backlog tasks
async function loadBacklogTasks() {
  const res = await query('SELECT * FROM backlog_tasks ORDER BY created_at DESC', []);
  return res.rows;
}

// Add backlog task
async function addBacklogTask(taskData) {
  const res = await query(
    `INSERT INTO backlog_tasks (title, status, priority, assignee_id, due_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [taskData.title, taskData.status, taskData.priority, taskData.assignee_id || null, taskData.dueDate]
  );
  return res.rows[0];
}

// Update backlog task
async function updateBacklogTask(taskId, updates) {
  // Similar to updateProject
  const setClauses = [];
  const params = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = $${paramIdx++}`);
    params.push(value);
  }

  params.push(taskId);
  await query(
    `UPDATE backlog_tasks SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIdx}`,
    params
  );
}

// Delete backlog task
async function deleteBacklogTask(taskId) {
  await query('DELETE FROM backlog_tasks WHERE id = $1', [taskId]);
}

// Load issues
async function loadIssues() {
  const res = await query('SELECT * FROM issues ORDER BY created_at DESC', []);
  return res.rows;
}

// Add issue
async function addIssue(issueData) {
  const res = await query(
    `INSERT INTO issues (id, title, status, priority, assignee_id, reporter_id, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [issueData.id, issueData.title, issueData.status, issueData.priority, issueData.assignee_id || null, issueData.reporter_id || null, issueData.description]
  );
  return res.rows[0];
}

// Update issue
async function updateIssue(issueId, updates) {
  // Similar update logic
  const setClauses = [];
  const params = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue;
    setClauses.push(`${key} = $${paramIdx++}`);
    params.push(value);
  }

  params.push(issueId);
  await query(
    `UPDATE issues SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIdx}`,
    params
  );
}

// Delete issue
async function deleteIssue(issueId) {
  await query('DELETE FROM issues WHERE id = $1', [issueId]);
}

// Load calendar events
async function loadCalendarEvents() {
  const res = await query('SELECT * FROM calendar_events ORDER BY date ASC', []);
  return res.rows;
}

// Add calendar event
async function addCalendarEvent(eventData) {
  const res = await query(
    `INSERT INTO calendar_events (title, date, time, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [eventData.title, eventData.date, eventData.time, eventData.description]
  );
  return res.rows[0];
}

// Toggle event completed
async function toggleEventCompleted(eventId) {
  await query(
    'UPDATE calendar_events SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [eventId]
  );
}

// Delete calendar event
async function deleteCalendarEvent(eventId) {
  await query('DELETE FROM calendar_events WHERE id = $1', [eventId]);
}

// Load docs
async function loadDocs() {
  const res = await query('SELECT * FROM documents ORDER BY updated_at DESC', []);
  return res.rows;
}

// Save doc
async function saveDoc(docId, content) {
  await query(
    'UPDATE documents SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [content, docId]
  );
}

// Add doc
async function addDoc(docData) {
  const res = await query(
    `INSERT INTO documents (title, content) VALUES ($1, $2) RETURNING *`,
    [docData.title, docData.content || '']
  );
  return res.rows[0];
}

// Delete doc
async function deleteDoc(docId) {
  await query('DELETE FROM documents WHERE id = $1', [docId]);
}

// Load excels
async function loadExcels() {
  const res = await query('SELECT * FROM excels ORDER BY updated_at DESC', []);
  return res.rows;
}

// Add excel
async function addExcel(excelData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const excelRes = await client.query(
      `INSERT INTO excels (title) VALUES ($1) RETURNING id`,
      [excelData.title]
    );
    const excelId = excelRes.rows[0].id;

    // Insert sheets
    for (const sheet of excelData.sheets || []) {
      await client.query(
        `INSERT INTO excel_sheets (excel_id, name, grid_data)
         VALUES ($1, $2, $3)`,
        [excelId, sheet.name, sheet.rows || []] // JSONB
      );
    }

    await client.query('COMMIT');
    return excelId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Save excel grid
async function saveExcelGrid(excelId, sheetIndex, grid) {
  // Find sheet by excel and assume name or position; for simplicity, assume one sheet or query
  const sheetRes = await query(
    'SELECT id FROM excel_sheets WHERE excel_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2',
    [excelId, sheetIndex]
  );
  if (sheetRes.rows.length === 0) throw new Error('Sheet not found');
  const sheetId = sheetRes.rows[0].id;

  await query(
    'UPDATE excel_sheets SET grid_data = $1 WHERE id = $2',
    [grid, sheetId]
  );
}

// Delete excel
async function deleteExcel(excelId) {
  await query('DELETE FROM excels WHERE id = $1', [excelId]);
}

// Load assignments
async function loadAssignments() {
  const res = await query('SELECT * FROM assignments ORDER BY due_date ASC', []);
  return res.rows;
}

// Add assignment
async function addAssignment(assignData) {
  const res = await query(
    `INSERT INTO assignments (title, status, priority, assignee_id, due_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [assignData.title, assignData.status, assignData.priority, assignData.assignee_id || null, assignData.dueDate]
  );
  return res.rows[0];
}

// Update assignment
async function updateAssignment(assignId, updates) {
  // Similar update
  const setClauses = [];
  const params = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = $${paramIdx++}`);
    params.push(value);
  }

  params.push(assignId);
  await query(
    `UPDATE assignments SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIdx}`,
    params
  );
}

// Delete assignment
async function deleteAssignment(assignId) {
  await query('DELETE FROM assignments WHERE id = $1', [assignId]);
}

// Add project update
async function addProjectUpdate(projectId, message, actorId = null) {
  await query(
    'INSERT INTO project_updates (project_id, actor_id, message) VALUES ($1, $2, $3)',
    [projectId, actorId, message]
  );
}

// Load project updates
async function loadProjectUpdates(projectId) {
  const res = await query(
    'SELECT * FROM project_updates WHERE project_id = $1 ORDER BY time DESC',
    [projectId]
  );
  return res.rows;
}

// Attachments: Add (binary data)
async function addAttachment(entityType, entityId, file) {
  // file: {name, type, size, data: Buffer}
  await query(
    `INSERT INTO attachments (entity_type, entity_id, name, mime_type, size, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, file.name, file.type, file.size, file.data]
  );
}

// Load attachments for entity
async function loadAttachments(entityType, entityId) {
  const res = await query(
    'SELECT id, name, mime_type AS type, size, uploaded_at FROM attachments WHERE entity_type = $1 AND entity_id = $2',
    [entityType, entityId]
  );
  // Data not loaded; fetch separately if needed
  return res.rows;
}

// Get attachment data
async function getAttachmentData(attachId) {
  const res = await query('SELECT data FROM attachments WHERE id = $1', [attachId]);
  return res.rows[0]?.data;
}

// Delete attachment
async function deleteAttachment(attachId) {
  await query('DELETE FROM attachments WHERE id = $1', [attachId]);
}

// Export all functions
module.exports = {
  loadProjects,
  saveProjects,
  addProject,
  updateProject,
  deleteProject,
  addTaskToColumn,
  toggleTaskDone,
  deleteTask,
  loadBacklogTasks,
  addBacklogTask,
  updateBacklogTask,
  deleteBacklogTask,
  loadIssues,
  addIssue,
  updateIssue,
  deleteIssue,
  loadCalendarEvents,
  addCalendarEvent,
  toggleEventCompleted,
  deleteCalendarEvent,
  loadDocs,
  saveDoc,
  addDoc,
  deleteDoc,
  loadExcels,
  addExcel,
  saveExcelGrid,
  deleteExcel,
  loadAssignments,
  addAssignment,
  updateAssignment,
  deleteAssignment,
  addProjectUpdate,
  loadProjectUpdates,
  addAttachment,
  loadAttachments,
  getAttachmentData,
  deleteAttachment,
  // Add more as needed for full coverage
};
