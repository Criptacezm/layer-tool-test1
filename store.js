/* ============================================
   Layer - Data Store & Persistence (Supabase version)
   ============================================ */

// ============================================
// Theme (still localStorage)
// ============================================
const THEME_KEY = 'layerTheme';

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

// ============================================
// ID Generation (only needed for client-side temp IDs if any)
// Supabase now generates real UUIDs
// ============================================
function generateTempId(prefix = 'TEMP') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// Projects
// ============================================
async function loadProjects() {
  if (!currentUser?.id) {
    console.warn('No authenticated user — cannot load projects');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Apply defaults / migrations if fields are missing
    return (data || []).map(project => ({
      ...project,
      flowchart: project.flowchart || { nodes: [], edges: [] },
      columns: project.columns || [
        { title: 'To Do', tasks: [] },
        { title: 'In Progress', tasks: [] },
        { title: 'Done', tasks: [] }
      ],
      updates: project.updates || []
    }));
  } catch (err) {
    console.error('Failed to load projects from Supabase:', err.message);
    return [];
  }
}

async function addProject(projectData) {
  if (!currentUser?.id) throw new Error('User not authenticated');

  const newProject = {
    user_id: currentUser.id,
    name: projectData.name || 'Untitled Project',
    description: projectData.description || '',
    status: projectData.status || 'todo',
    start_date: projectData.startDate || new Date().toISOString().split('T')[0],
    target_date: projectData.targetDate || null,
    flowchart: projectData.flowchart || { nodes: [], edges: [] },
    columns: projectData.columns || [
      { title: 'To Do', tasks: [] },
      { title: 'In Progress', tasks: [] },
      { title: 'Done', tasks: [] }
    ],
    updates: [{
      actor: currentUser.email || currentUser.id || 'You',
      message: 'Project created',
      time: new Date().toISOString()
    }],
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('projects')
    .insert([newProject])
    .select()
    .single();

  if (error) {
    console.error('Failed to add project:', error.message);
    throw error;
  }

  return data;
}

async function updateProject(projectId, updates) {
  if (!currentUser?.id) throw new Error('User not authenticated');

  const { error } = await supabase
    .from('projects')
    .update({
      ...updates,
      updated_at: new Date().toISOString()  // if you add updated_at column later
    })
    .eq('id', projectId)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Failed to update project:', error.message);
    throw error;
  }
}

async function deleteProject(projectId) {
  if (!currentUser?.id) throw new Error('User not authenticated');

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Failed to delete project:', error.message);
    throw error;
  }
}

// ============================================
// Backlog Tasks
// ============================================
async function loadBacklogTasks() {
  if (!currentUser?.id) return [];

  try {
    const { data, error } = await supabase
      .from('backlog_tasks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load backlog tasks:', err.message);
    return [];
  }
}

async function addBacklogTask(taskData) {
  if (!currentUser?.id) throw new Error('Not authenticated');

  const newTask = {
    user_id: currentUser.id,
    title: taskData.title,
    done: false,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('backlog_tasks')
    .insert([newTask])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function toggleBacklogTask(taskId, done) {
  const { error } = await supabase
    .from('backlog_tasks')
    .update({ done })
    .eq('id', taskId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

async function deleteBacklogTask(taskId) {
  const { error } = await supabase
    .from('backlog_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

// ============================================
// Issues
// ============================================
async function loadIssues() {
  if (!currentUser?.id) return [];

  try {
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load issues:', err.message);
    return [];
  }
}

async function addIssue(issueData) {
  if (!currentUser?.id) throw new Error('Not authenticated');

  const newIssue = {
    user_id: currentUser.id,
    title: issueData.title,
    description: issueData.description || '',
    status: issueData.status || 'todo',
    priority: issueData.priority || 'medium',
    assignee: issueData.assignee || '',
    due_date: issueData.dueDate || null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('issues')
    .insert([newIssue])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// (add updateIssue / deleteIssue similarly if needed)

// ============================================
// Assignments
// ============================================
async function loadAssignments() {
  if (!currentUser?.id) return [];

  try {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load assignments:', err.message);
    return [];
  }
}

async function addAssignment(assignmentData) {
  if (!currentUser?.id) throw new Error('Not authenticated');

  const newAssignment = {
    user_id: currentUser.id,
    title: assignmentData.title,
    notes: assignmentData.notes || '',
    files: assignmentData.files || [],
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('assignments')
    .insert([newAssignment])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// (add deleteAssignment / updateAssignment as needed)

// ============================================
// Project Updates (append-only for now)
// ============================================
async function addProjectUpdate(projectId, message) {
  if (!currentUser?.id) throw new Error('Not authenticated');

  const updateEntry = {
    actor: currentUser.email || 'You',
    message: message.trim(),
    time: new Date().toISOString()
  };

  // Get current updates array
  const { data: project } = await supabase
    .from('projects')
    .select('updates')
    .eq('id', projectId)
    .eq('user_id', currentUser.id)
    .single();

  if (!project) throw new Error('Project not found');

  const currentUpdates = project.updates || [];
  const newUpdates = [updateEntry, ...currentUpdates];

  const { error } = await supabase
    .from('projects')
    .update({ updates: newUpdates })
    .eq('id', projectId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

async function loadProjectUpdates(projectId) {
  const { data } = await supabase
    .from('projects')
    .select('updates')
    .eq('id', projectId)
    .eq('user_id', currentUser.id)
    .single();

  return data?.updates || [];
}

async function getProjectStatus(projectId) {
  const { data } = await supabase
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .eq('user_id', currentUser.id)
    .single();

  return data?.status || 'todo';
}

// ============================================
// Export
// ============================================
window.LayerStore = {
  loadTheme,
  saveTheme,

  loadProjects,
  addProject,
  updateProject,
  deleteProject,

  loadBacklogTasks,
  addBacklogTask,
  toggleBacklogTask,
  deleteBacklogTask,

  loadIssues,
  addIssue,

  loadAssignments,
  addAssignment,

  addProjectUpdate,
  loadProjectUpdates,
  getProjectStatus
};