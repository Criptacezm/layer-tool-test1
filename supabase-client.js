/* ============================================
   Layer - Supabase Client Configuration
   ============================================ */

const SUPABASE_URL = 'https://uqfnadlyrbprzxgjkvtc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZm5hZGx5cmJwcnp4Z2prdnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzkxNzAsImV4cCI6MjA4Mjk1NTE3MH0.12PfMd0vnsWvCXSNdkc3E02KDn46xi9XTyZ8rXNiVHs';

// Initialize Supabase client (using window.supabase from CDN)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current user state
let currentUser = null;
let currentSession = null;

// ============================================
// Authentication Functions
// ============================================

async function initAuth() {
  // Set up auth state listener
  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    currentUser = session?.user ?? null;
    
    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('authStateChanged', { 
      detail: { user: currentUser, session: currentSession, event } 
    }));
  });

  // Get initial session
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentSession = session;
  currentUser = session?.user ?? null;
  
  return { user: currentUser, session: currentSession };
}

async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + '/layer.html'
    }
  });
  
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
  currentUser = null;
  currentSession = null;
}

function getCurrentUser() {
  return currentUser;
}

function isAuthenticated() {
  return !!currentUser;
}

// ============================================
// User Profile Functions
// ============================================

async function getProfile() {
  if (!currentUser) return null;
  
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function updateProfile(updates) {
  if (!currentUser) throw new Error('Not authenticated');
  
  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentUser.id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// User Preferences Functions
// ============================================

async function getUserPreferences() {
  if (!currentUser) {
    // Fall back to localStorage for unauthenticated users
    return {
      theme: localStorage.getItem('layerTheme') || 'dark',
      left_panel_width: parseInt(localStorage.getItem('layerLeftPanelWidth')) || 280
    };
  }
  
  const { data, error } = await supabaseClient
    .from('user_preferences')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();
  
  if (error && error.code === 'PGRST116') {
    // No preferences yet, create default
    const { data: newData, error: insertError } = await supabaseClient
      .from('user_preferences')
      .insert({ user_id: currentUser.id })
      .select()
      .single();
    
    if (insertError) throw insertError;
    return newData;
  }
  
  if (error) throw error;
  return data;
}

async function saveUserPreferences(prefs) {
  if (!currentUser) {
    // Fall back to localStorage for unauthenticated users
    if (prefs.theme) localStorage.setItem('layerTheme', prefs.theme);
    if (prefs.left_panel_width) localStorage.setItem('layerLeftPanelWidth', prefs.left_panel_width);
    return prefs;
  }
  
  const { data, error } = await supabaseClient
    .from('user_preferences')
    .upsert({ 
      user_id: currentUser.id,
      ...prefs 
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// Projects Functions
// ============================================

async function loadProjectsFromDB() {
  if (!currentUser) {
    // Fall back to localStorage
    return loadProjects();
  }
  
  const { data, error } = await supabaseClient
    .from('projects')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  // Transform to match existing format
  return data.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    startDate: p.start_date,
    targetDate: p.target_date,
    flowchart: p.flowchart,
    columns: p.columns,
    updates: p.updates
  }));
}

async function saveProjectToDB(projectData) {
  if (!currentUser) {
    // Fall back to localStorage
    return addProject(projectData);
  }
  
  const { data, error } = await supabaseClient
    .from('projects')
    .insert({
      user_id: currentUser.id,
      name: projectData.name,
      description: projectData.description || '',
      status: projectData.status || 'todo',
      start_date: projectData.startDate || new Date().toISOString().split('T')[0],
      target_date: projectData.targetDate,
      flowchart: projectData.flowchart || { nodes: [], edges: [] },
      columns: projectData.columns || [
        { title: 'To Do', tasks: [] },
        { title: 'In Progress', tasks: [] },
        { title: 'Done', tasks: [] }
      ],
      updates: [{ actor: 'You', action: 'Project created', time: 'just now' }]
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function updateProjectInDB(projectId, updates) {
  if (!currentUser) {
    // Fall back to localStorage
    const projects = loadProjects();
    const index = projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
      return updateProject(index, updates);
    }
    return projects;
  }
  
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.targetDate !== undefined) dbUpdates.target_date = updates.targetDate;
  if (updates.flowchart !== undefined) dbUpdates.flowchart = updates.flowchart;
  if (updates.columns !== undefined) dbUpdates.columns = updates.columns;
  if (updates.updates !== undefined) dbUpdates.updates = updates.updates;
  
  const { data, error } = await supabaseClient
    .from('projects')
    .update(dbUpdates)
    .eq('id', projectId)
    .eq('user_id', currentUser.id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function deleteProjectFromDB(projectId) {
  if (!currentUser) {
    // Fall back to localStorage
    const projects = loadProjects();
    const index = projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
      return deleteProject(index);
    }
    return projects;
  }
  
  const { error } = await supabaseClient
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadProjectsFromDB();
}

// ============================================
// Backlog Tasks Functions
// ============================================

async function loadBacklogTasksFromDB() {
  if (!currentUser) {
    return loadBacklogTasks();
  }
  
  const { data, error } = await supabaseClient
    .from('backlog_tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  return data.map(t => ({
    id: t.id,
    title: t.title,
    done: t.done,
    createdAt: t.created_at
  }));
}

async function addBacklogTaskToDB(title) {
  if (!currentUser) {
    return addBacklogTask(title);
  }
  
  const { data, error } = await supabaseClient
    .from('backlog_tasks')
    .insert({
      user_id: currentUser.id,
      title: title
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadBacklogTasksFromDB();
}

async function toggleBacklogTaskInDB(taskId) {
  if (!currentUser) {
    const tasks = loadBacklogTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) return toggleBacklogTask(index);
    return tasks;
  }
  
  // Get current state
  const { data: task } = await supabaseClient
    .from('backlog_tasks')
    .select('done')
    .eq('id', taskId)
    .single();
  
  const { error } = await supabaseClient
    .from('backlog_tasks')
    .update({ done: !task.done })
    .eq('id', taskId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadBacklogTasksFromDB();
}

async function updateBacklogTaskInDB(taskId, title) {
  if (!currentUser) {
    const tasks = loadBacklogTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) return updateBacklogTask(index, title);
    return tasks;
  }
  
  const { error } = await supabaseClient
    .from('backlog_tasks')
    .update({ title })
    .eq('id', taskId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadBacklogTasksFromDB();
}

async function deleteBacklogTaskFromDB(taskId) {
  if (!currentUser) {
    const tasks = loadBacklogTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index !== -1) return deleteBacklogTask(index);
    return tasks;
  }
  
  const { error } = await supabaseClient
    .from('backlog_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadBacklogTasksFromDB();
}

// ============================================
// Issues Functions
// ============================================

async function loadIssuesFromDB() {
  if (!currentUser) {
    return loadIssues();
  }
  
  const { data, error } = await supabaseClient
    .from('issues')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  return data.map(i => ({
    id: i.issue_id,
    dbId: i.id,
    title: i.title,
    description: i.description,
    status: i.status,
    priority: i.priority,
    assignee: i.assignee,
    dueDate: i.due_date,
    updated: formatTimeAgo(i.updated_at)
  }));
}

async function addIssueToDB(issueData) {
  if (!currentUser) {
    return addIssue(issueData);
  }
  
  const { data, error } = await supabaseClient
    .from('issues')
    .insert({
      user_id: currentUser.id,
      issue_id: generateIssueId(),
      title: issueData.title,
      description: issueData.description || '',
      status: issueData.status || 'todo',
      priority: issueData.priority || 'medium',
      assignee: issueData.assignee || '',
      due_date: issueData.dueDate
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadIssuesFromDB();
}

async function updateIssueInDB(issueDbId, updates) {
  if (!currentUser) {
    const issues = loadIssues();
    const index = issues.findIndex(i => i.id === issueDbId);
    if (index !== -1) {
      issues[index] = { ...issues[index], ...updates };
      saveIssues(issues);
    }
    return issues;
  }
  
  const dbUpdates = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.assignee !== undefined) dbUpdates.assignee = updates.assignee;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  
  const { error } = await supabaseClient
    .from('issues')
    .update(dbUpdates)
    .eq('id', issueDbId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadIssuesFromDB();
}

async function deleteIssueFromDB(issueDbId) {
  if (!currentUser) {
    const issues = loadIssues();
    const index = issues.findIndex(i => i.id === issueDbId);
    if (index !== -1) {
      issues.splice(index, 1);
      saveIssues(issues);
    }
    return issues;
  }
  
  const { error } = await supabaseClient
    .from('issues')
    .delete()
    .eq('id', issueDbId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadIssuesFromDB();
}

// ============================================
// Calendar Events Functions
// ============================================

async function loadCalendarEventsFromDB() {
  if (!currentUser) {
    // Fall back to localStorage
    try { return JSON.parse(localStorage.getItem('layerCalendarEvents')) || []; }
    catch { return []; }
  }
  
  const { data, error } = await supabaseClient
    .from('calendar_events')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: true });
  
  if (error) {
    console.error('Error loading calendar events:', error);
    // Fall back to localStorage
    try { return JSON.parse(localStorage.getItem('layerCalendarEvents')) || []; }
    catch { return []; }
  }
  
  return data.map(e => ({
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.time,
    endTime: e.end_time,
    duration: e.duration,
    completed: e.completed,
    color: e.color,
    recurringId: e.recurring_id,
    isRecurringInstance: e.is_recurring_instance,
    notes: e.notes,
    priority: e.priority,
    category: e.category
  }));
}

async function saveCalendarEventToDB(eventData) {
  if (!currentUser) {
    // Fall back to localStorage
    let events = [];
    try { events = JSON.parse(localStorage.getItem('layerCalendarEvents')) || []; }
    catch { events = []; }
    events.push(eventData);
    localStorage.setItem('layerCalendarEvents', JSON.stringify(events));
    return events;
  }
  
  const { data, error } = await supabaseClient
    .from('calendar_events')
    .insert({
      user_id: currentUser.id,
      title: eventData.title,
      date: eventData.date,
      time: eventData.time || null,
      end_time: eventData.endTime || null,
      duration: eventData.duration || null,
      completed: eventData.completed || false,
      color: eventData.color || null,
      recurring_id: eventData.recurringId || null,
      is_recurring_instance: eventData.isRecurringInstance || false,
      notes: eventData.notes || null,
      priority: eventData.priority || 'medium',
      category: eventData.category || null
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadCalendarEventsFromDB();
}

async function updateCalendarEventInDB(eventId, updates) {
  if (!currentUser) {
    let events = [];
    try { events = JSON.parse(localStorage.getItem('layerCalendarEvents')) || []; }
    catch { events = []; }
    const index = events.findIndex(e => e.id == eventId);
    if (index !== -1) {
      events[index] = { ...events[index], ...updates };
      localStorage.setItem('layerCalendarEvents', JSON.stringify(events));
    }
    return events;
  }
  
  const dbUpdates = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.date !== undefined) dbUpdates.date = updates.date;
  if (updates.time !== undefined) dbUpdates.time = updates.time;
  if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
  if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
  if (updates.completed !== undefined) dbUpdates.completed = updates.completed;
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  
  const { error } = await supabaseClient
    .from('calendar_events')
    .update(dbUpdates)
    .eq('id', eventId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadCalendarEventsFromDB();
}

async function deleteCalendarEventFromDB(eventId) {
  if (!currentUser) {
    let events = [];
    try { events = JSON.parse(localStorage.getItem('layerCalendarEvents')) || []; }
    catch { events = []; }
    events = events.filter(e => e.id != eventId);
    localStorage.setItem('layerCalendarEvents', JSON.stringify(events));
    return events;
  }
  
  const { error } = await supabaseClient
    .from('calendar_events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadCalendarEventsFromDB();
}

async function saveAllCalendarEventsToDB(events) {
  if (!currentUser) {
    localStorage.setItem('layerCalendarEvents', JSON.stringify(events));
    return events;
  }
  
  // Delete all existing events for user first
  await supabaseClient
    .from('calendar_events')
    .delete()
    .eq('user_id', currentUser.id);
  
  // Insert all events
  if (events.length > 0) {
    const dbEvents = events.map(e => ({
      user_id: currentUser.id,
      title: e.title,
      date: e.date,
      time: e.time || null,
      end_time: e.endTime || null,
      duration: e.duration || null,
      completed: e.completed || false,
      color: e.color || null,
      recurring_id: e.recurringId || null,
      is_recurring_instance: e.isRecurringInstance || false,
      notes: e.notes || null,
      priority: e.priority || 'medium',
      category: e.category || null
    }));
    
    const { error } = await supabaseClient
      .from('calendar_events')
      .insert(dbEvents);
    
    if (error) throw error;
  }
  
  return await loadCalendarEventsFromDB();
}

// ============================================
// Docs Functions
// ============================================

async function loadDocsFromDB() {
  if (!currentUser) {
    try { return JSON.parse(localStorage.getItem('layerDocs')) || []; }
    catch { return []; }
  }
  
  const { data, error } = await supabaseClient
    .from('docs')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });
  
  if (error) {
    console.error('Error loading docs:', error);
    try { return JSON.parse(localStorage.getItem('layerDocs')) || []; }
    catch { return []; }
  }
  
  return data.map(d => ({
    id: d.id,
    title: d.title,
    content: d.content,
    spaceId: d.space_id,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  }));
}

async function saveDocToDB(docData) {
  if (!currentUser) {
    let docs = [];
    try { docs = JSON.parse(localStorage.getItem('layerDocs')) || []; }
    catch { docs = []; }
    const newDoc = {
      id: docData.id || `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...docData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    docs.push(newDoc);
    localStorage.setItem('layerDocs', JSON.stringify(docs));
    return docs;
  }
  
  const { data, error } = await supabaseClient
    .from('docs')
    .insert({
      user_id: currentUser.id,
      title: docData.title || 'Untitled',
      content: docData.content || '',
      space_id: docData.spaceId || null
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadDocsFromDB();
}

async function updateDocInDB(docId, updates) {
  if (!currentUser) {
    let docs = [];
    try { docs = JSON.parse(localStorage.getItem('layerDocs')) || []; }
    catch { docs = []; }
    const index = docs.findIndex(d => d.id === docId);
    if (index !== -1) {
      docs[index] = { ...docs[index], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem('layerDocs', JSON.stringify(docs));
    }
    return docs;
  }
  
  const dbUpdates = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.spaceId !== undefined) dbUpdates.space_id = updates.spaceId;
  
  const { error } = await supabaseClient
    .from('docs')
    .update(dbUpdates)
    .eq('id', docId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadDocsFromDB();
}

async function deleteDocFromDB(docId) {
  if (!currentUser) {
    let docs = [];
    try { docs = JSON.parse(localStorage.getItem('layerDocs')) || []; }
    catch { docs = []; }
    docs = docs.filter(d => d.id !== docId);
    localStorage.setItem('layerDocs', JSON.stringify(docs));
    return docs;
  }
  
  const { error } = await supabaseClient
    .from('docs')
    .delete()
    .eq('id', docId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadDocsFromDB();
}

// ============================================
// Excels/Sheets Functions
// ============================================

async function loadExcelsFromDB() {
  if (!currentUser) {
    try { return JSON.parse(localStorage.getItem('layerExcels')) || []; }
    catch { return []; }
  }
  
  const { data, error } = await supabaseClient
    .from('excels')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false });
  
  if (error) {
    console.error('Error loading excels:', error);
    try { return JSON.parse(localStorage.getItem('layerExcels')) || []; }
    catch { return []; }
  }
  
  return data.map(e => ({
    id: e.id,
    title: e.title,
    data: e.data,
    spaceId: e.space_id,
    createdAt: e.created_at,
    updatedAt: e.updated_at
  }));
}

async function saveExcelToDB(excelData) {
  if (!currentUser) {
    let excels = [];
    try { excels = JSON.parse(localStorage.getItem('layerExcels')) || []; }
    catch { excels = []; }
    const newExcel = {
      id: excelData.id || `EXCEL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...excelData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    excels.push(newExcel);
    localStorage.setItem('layerExcels', JSON.stringify(excels));
    return excels;
  }
  
  const { data, error } = await supabaseClient
    .from('excels')
    .insert({
      user_id: currentUser.id,
      title: excelData.title || 'Untitled Sheet',
      data: excelData.data || [],
      space_id: excelData.spaceId || null
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadExcelsFromDB();
}

async function updateExcelInDB(excelId, updates) {
  if (!currentUser) {
    let excels = [];
    try { excels = JSON.parse(localStorage.getItem('layerExcels')) || []; }
    catch { excels = []; }
    const index = excels.findIndex(e => e.id === excelId);
    if (index !== -1) {
      excels[index] = { ...excels[index], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem('layerExcels', JSON.stringify(excels));
    }
    return excels;
  }
  
  const dbUpdates = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.data !== undefined) dbUpdates.data = updates.data;
  if (updates.spaceId !== undefined) dbUpdates.space_id = updates.spaceId;
  
  const { error } = await supabaseClient
    .from('excels')
    .update(dbUpdates)
    .eq('id', excelId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadExcelsFromDB();
}

async function deleteExcelFromDB(excelId) {
  if (!currentUser) {
    let excels = [];
    try { excels = JSON.parse(localStorage.getItem('layerExcels')) || []; }
    catch { excels = []; }
    excels = excels.filter(e => e.id !== excelId);
    localStorage.setItem('layerExcels', JSON.stringify(excels));
    return excels;
  }
  
  const { error } = await supabaseClient
    .from('excels')
    .delete()
    .eq('id', excelId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadExcelsFromDB();
}

// ============================================
// Spaces Functions
// ============================================

async function loadSpacesFromDB() {
  if (!currentUser) {
    try { return JSON.parse(localStorage.getItem('layerSpaces')) || []; }
    catch { return []; }
  }
  
  const { data, error } = await supabaseClient
    .from('spaces')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error loading spaces:', error);
    try { return JSON.parse(localStorage.getItem('layerSpaces')) || []; }
    catch { return []; }
  }
  
  return data.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    createdAt: s.created_at
  }));
}

async function saveSpaceToDB(spaceData) {
  if (!currentUser) {
    let spaces = [];
    try { spaces = JSON.parse(localStorage.getItem('layerSpaces')) || []; }
    catch { spaces = []; }
    const newSpace = {
      id: spaceData.id || `SPACE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...spaceData,
      createdAt: new Date().toISOString()
    };
    spaces.push(newSpace);
    localStorage.setItem('layerSpaces', JSON.stringify(spaces));
    return spaces;
  }
  
  const { data, error } = await supabaseClient
    .from('spaces')
    .insert({
      user_id: currentUser.id,
      name: spaceData.name || 'New Space',
      color: spaceData.color || '#3b82f6',
      icon: spaceData.icon || 'folder'
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadSpacesFromDB();
}

async function updateSpaceInDB(spaceId, updates) {
  if (!currentUser) {
    let spaces = [];
    try { spaces = JSON.parse(localStorage.getItem('layerSpaces')) || []; }
    catch { spaces = []; }
    const index = spaces.findIndex(s => s.id === spaceId);
    if (index !== -1) {
      spaces[index] = { ...spaces[index], ...updates };
      localStorage.setItem('layerSpaces', JSON.stringify(spaces));
    }
    return spaces;
  }
  
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
  
  const { error } = await supabaseClient
    .from('spaces')
    .update(dbUpdates)
    .eq('id', spaceId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadSpacesFromDB();
}

async function deleteSpaceFromDB(spaceId) {
  if (!currentUser) {
    let spaces = [];
    try { spaces = JSON.parse(localStorage.getItem('layerSpaces')) || []; }
    catch { spaces = []; }
    spaces = spaces.filter(s => s.id !== spaceId);
    localStorage.setItem('layerSpaces', JSON.stringify(spaces));
    return spaces;
  }
  
  const { error } = await supabaseClient
    .from('spaces')
    .delete()
    .eq('id', spaceId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadSpacesFromDB();
}

// ============================================
// Recurring Tasks Functions
// ============================================

async function loadRecurringTasksFromDB() {
  if (!currentUser) {
    try { return JSON.parse(localStorage.getItem('layerRecurringTasks')) || []; }
    catch { return []; }
  }
  
  const { data, error } = await supabaseClient
    .from('recurring_tasks')
    .select('*')
    .eq('user_id', currentUser.id);
  
  if (error) {
    console.error('Error loading recurring tasks:', error);
    try { return JSON.parse(localStorage.getItem('layerRecurringTasks')) || []; }
    catch { return []; }
  }
  
  return data.map(t => ({
    id: t.id,
    title: t.title,
    time: t.time,
    frequency: t.frequency,
    daysOfWeek: t.days_of_week,
    color: t.color,
    startDate: t.start_date,
    endDate: t.end_date
  }));
}

async function saveRecurringTaskToDB(taskData) {
  if (!currentUser) {
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('layerRecurringTasks')) || []; }
    catch { tasks = []; }
    const newTask = {
      id: taskData.id || `REC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...taskData
    };
    tasks.push(newTask);
    localStorage.setItem('layerRecurringTasks', JSON.stringify(tasks));
    return tasks;
  }
  
  const { data, error } = await supabaseClient
    .from('recurring_tasks')
    .insert({
      user_id: currentUser.id,
      title: taskData.title,
      time: taskData.time || null,
      frequency: taskData.frequency || 'daily',
      days_of_week: taskData.daysOfWeek || null,
      color: taskData.color || null,
      start_date: taskData.startDate || null,
      end_date: taskData.endDate || null
    })
    .select()
    .single();
  
  if (error) throw error;
  return await loadRecurringTasksFromDB();
}

async function deleteRecurringTaskFromDB(taskId) {
  if (!currentUser) {
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('layerRecurringTasks')) || []; }
    catch { tasks = []; }
    tasks = tasks.filter(t => t.id !== taskId);
    localStorage.setItem('layerRecurringTasks', JSON.stringify(tasks));
    return tasks;
  }
  
  const { error } = await supabaseClient
    .from('recurring_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', currentUser.id);
  
  if (error) throw error;
  return await loadRecurringTasksFromDB();
}

// ============================================
// Data Migration (localStorage to Supabase)
// ============================================

async function migrateLocalDataToSupabase() {
  if (!currentUser) {
    console.warn('Cannot migrate: user not authenticated');
    return;
  }
  
  try {
    // Migrate projects
    const localProjects = loadProjects();
    for (const project of localProjects) {
      await saveProjectToDB(project);
    }
    
    // Migrate backlog tasks
    const localBacklog = loadBacklogTasks();
    for (const task of localBacklog) {
      await addBacklogTaskToDB(task.title);
    }
    
    // Migrate issues
    const localIssues = loadIssues();
    for (const issue of localIssues) {
      await addIssueToDB(issue);
    }
    
    // Migrate calendar events
    let localEvents = [];
    try { localEvents = JSON.parse(localStorage.getItem('layerCalendarEvents')) || []; }
    catch { localEvents = []; }
    for (const event of localEvents) {
      await saveCalendarEventToDB(event);
    }
    
    // Migrate docs
    let localDocs = [];
    try { localDocs = JSON.parse(localStorage.getItem('layerDocs')) || []; }
    catch { localDocs = []; }
    for (const doc of localDocs) {
      await saveDocToDB(doc);
    }
    
    // Migrate excels
    let localExcels = [];
    try { localExcels = JSON.parse(localStorage.getItem('layerExcels')) || []; }
    catch { localExcels = []; }
    for (const excel of localExcels) {
      await saveExcelToDB(excel);
    }
    
    // Migrate spaces
    let localSpaces = [];
    try { localSpaces = JSON.parse(localStorage.getItem('layerSpaces')) || []; }
    catch { localSpaces = []; }
    for (const space of localSpaces) {
      await saveSpaceToDB(space);
    }
    
    // Migrate preferences
    const theme = localStorage.getItem('layerTheme');
    const panelWidth = localStorage.getItem('layerLeftPanelWidth');
    if (theme || panelWidth) {
      await saveUserPreferences({
        theme: theme || 'dark',
        left_panel_width: parseInt(panelWidth) || 280
      });
    }
    
    console.log('Migration complete!');
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Export for use in other files
window.LayerDB = {
  // Auth
  initAuth,
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  isAuthenticated,
  
  // Profile
  getProfile,
  updateProfile,
  
  // Preferences
  getUserPreferences,
  saveUserPreferences,
  
  // Projects
  loadProjects: loadProjectsFromDB,
  saveProject: saveProjectToDB,
  updateProject: updateProjectInDB,
  deleteProject: deleteProjectFromDB,
  
  // Backlog
  loadBacklogTasks: loadBacklogTasksFromDB,
  addBacklogTask: addBacklogTaskToDB,
  toggleBacklogTask: toggleBacklogTaskInDB,
  updateBacklogTask: updateBacklogTaskInDB,
  deleteBacklogTask: deleteBacklogTaskFromDB,
  
  // Issues
  loadIssues: loadIssuesFromDB,
  addIssue: addIssueToDB,
  updateIssue: updateIssueInDB,
  deleteIssue: deleteIssueFromDB,
  
  // Calendar Events
  loadCalendarEvents: loadCalendarEventsFromDB,
  saveCalendarEvent: saveCalendarEventToDB,
  updateCalendarEvent: updateCalendarEventInDB,
  deleteCalendarEvent: deleteCalendarEventFromDB,
  saveAllCalendarEvents: saveAllCalendarEventsToDB,
  
  // Docs
  loadDocs: loadDocsFromDB,
  saveDoc: saveDocToDB,
  updateDoc: updateDocInDB,
  deleteDoc: deleteDocFromDB,
  
  // Excels
  loadExcels: loadExcelsFromDB,
  saveExcel: saveExcelToDB,
  updateExcel: updateExcelInDB,
  deleteExcel: deleteExcelFromDB,
  
  // Spaces
  loadSpaces: loadSpacesFromDB,
  saveSpace: saveSpaceToDB,
  updateSpace: updateSpaceInDB,
  deleteSpace: deleteSpaceFromDB,
  
  // Recurring Tasks
  loadRecurringTasks: loadRecurringTasksFromDB,
  saveRecurringTask: saveRecurringTaskToDB,
  deleteRecurringTask: deleteRecurringTaskFromDB,
  
  // Migration
  migrateLocalDataToSupabase,
  
  // Direct Supabase access
  supabase: supabaseClient
};
