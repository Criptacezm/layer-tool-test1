/* ============================================
   Layer - Data Store & Persistence with Supabase
   ============================================ */

// Supabase Configuration
const SUPABASE_URL = 'https://uqfnadlyrbprzxgjkvtc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZm5hZGx5cmJwcnp4Z2prdnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzkxNzAsImV4cCI6MjA4Mjk1NTE3MH0.12PfMd0vnsWvCXSNdkc3E02KDn46xi9XTyZ8rXNiVHs';

// Local cache for data (to reduce API calls and enable offline functionality)
let projectsCache = null;
let issuesCache = null;
let backlogTasksCache = null;
let calendarEventsCache = null;
let docsCache = null;
let excelsCache = null;
let spacesCache = null;
let assignmentsCache = null;

// Storage keys for fallback localStorage (offline mode)
const PROJECTS_KEY = 'layerProjectsData';
const BACKLOG_KEY = 'layerBacklogTasks';
const ISSUES_KEY = 'layerMyIssues';
const THEME_KEY = 'layerTheme';
const ASSIGNMENTS_KEY = 'layerAssignments';
const CALENDAR_KEY = 'layerCalendarEvents';
const DOCS_KEY = 'layerDocs';
const EXCELS_KEY = 'layerExcels';
const SPACES_KEY = 'layerSpaces';

// Supabase client initialization
let supabaseClient = null;

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;
    console.log('Supabase client initialized');
    return supabaseClient;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    return null;
  }
}

// Initialize Supabase on load
getSupabaseClient();

// ============================================
// ID Generation
// ============================================
function generateId(prefix = 'ID') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateIssueId() {
  return `LAYER-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ============================================
// Projects - Supabase with localStorage fallback
// ============================================
async function loadProjectsAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform and cache
      projectsCache = (data || []).map(project => ({
        ...project,
        columns: project.columns || [
          { title: 'To Do', tasks: [] },
          { title: 'In Progress', tasks: [] },
          { title: 'Done', tasks: [] },
        ],
        flowchart: project.flowchart || { nodes: [], edges: [] },
        updates: project.updates || []
      }));
      
      // Also save to localStorage as backup
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projectsCache));
      return projectsCache;
    }
  } catch (error) {
    console.error('Supabase error loading projects:', error);
  }
  
  // Fallback to localStorage
  return loadProjectsFromLocalStorage();
}

function loadProjectsFromLocalStorage() {
  try {
    const data = localStorage.getItem(PROJECTS_KEY);
    if (data) {
      const projects = JSON.parse(data);
      return projects.map(project => {
        if (!project.flowchart) {
          project.flowchart = { nodes: [], edges: [] };
          if (project.description && project.description.trim()) {
            project.flowchart.nodes.push({
              id: 'migrated-text',
              type: 'flowNode',
              position: { x: 50, y: 50 },
              data: { label: project.description.trim(), headerColor: '#89b4fa' }
            });
          }
        }
        project.columns = project.columns || [
          { title: 'To Do', tasks: [] },
          { title: 'In Progress', tasks: [] },
          { title: 'Done', tasks: [] },
        ];
        return project;
      });
    }
  } catch (e) {
    console.error('Failed to load projects from localStorage:', e);
  }
  return [];
}

// Sync function - loads from cache if available, otherwise from Supabase/localStorage
function loadProjects() {
  if (projectsCache !== null) {
    return projectsCache;
  }
  // Load from localStorage first (sync), then trigger async update
  projectsCache = loadProjectsFromLocalStorage();
  loadProjectsAsync().then(data => {
    projectsCache = data;
  });
  return projectsCache;
}

async function saveProjectsAsync(projects) {
  projectsCache = projects;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      // Upsert all projects
      for (const project of projects) {
        const { error } = await supabase
          .from('projects')
          .upsert({
            id: project.id,
            name: project.name,
            status: project.status,
            start_date: project.startDate,
            target_date: project.targetDate,
            description: project.description,
            columns: project.columns,
            flowchart: project.flowchart,
            updates: project.updates,
            linked_space_id: project.linkedSpaceId
          }, { onConflict: 'id' });
        
        if (error) console.error('Error saving project:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving projects:', error);
  }
}

function saveProjects(projects) {
  projectsCache = projects;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  saveProjectsAsync(projects);
}

function addProject(projectData) {
  const projects = loadProjects();
  const newProject = {
    id: generateId('PROJ'),
    name: projectData.name,
    status: projectData.status || 'todo',
    startDate: projectData.startDate || new Date().toISOString().split('T')[0],
    targetDate: projectData.targetDate,
    description: projectData.description || '',
    columns: [
      { title: 'To Do', tasks: [] },
      { title: 'In Progress', tasks: [] },
      { title: 'Done', tasks: [] },
    ],
    updates: [
      {
        actor: 'You',
        action: 'Project created',
        time: 'just now'
      }
    ]
  };
  projects.push(newProject);
  saveProjects(projects);
  return newProject;
}

function updateProject(index, updates) {
  const projects = loadProjects();
  if (projects[index]) {
    projects[index] = { ...projects[index], ...updates };
    saveProjects(projects);
  }
  return projects;
}

async function deleteProjectAsync(projectId) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      
      if (error) console.error('Error deleting project from Supabase:', error);
    }
  } catch (error) {
    console.error('Supabase error deleting project:', error);
  }
}

function deleteProject(index) {
  const projects = loadProjects();
  const deletedProject = projects[index];
  projects.splice(index, 1);
  saveProjects(projects);
  if (deletedProject) {
    deleteProjectAsync(deletedProject.id);
  }
  return projects;
}

// ============================================
// Project Tasks
// ============================================
function addTaskToColumn(projectIndex, columnIndex, title) {
  const projects = loadProjects();
  if (projects[projectIndex] && projects[projectIndex].columns[columnIndex]) {
    projects[projectIndex].columns[columnIndex].tasks.push({
      id: generateId('TASK'),
      title: title,
      done: false,
      createdAt: new Date().toISOString()
    });
    saveProjects(projects);
  }
  return projects;
}

function toggleTaskDone(projectIndex, columnIndex, taskIndex) {
  const projects = loadProjects();
  const task = projects[projectIndex]?.columns[columnIndex]?.tasks[taskIndex];
  if (task) {
    task.done = !task.done;
    saveProjects(projects);
  }
  return projects;
}

function deleteTask(projectIndex, columnIndex, taskIndex) {
  const projects = loadProjects();
  if (projects[projectIndex]?.columns[columnIndex]?.tasks[taskIndex]) {
    projects[projectIndex].columns[columnIndex].tasks.splice(taskIndex, 1);
    saveProjects(projects);
  }
  return projects;
}

// ============================================
// Column Management
// ============================================
function addColumnToProject(projectIndex, title) {
  const projects = loadProjects();
  if (projects[projectIndex]) {
    projects[projectIndex].columns.push({
      title: title,
      tasks: []
    });
    saveProjects(projects);
  }
  return projects;
}

function deleteColumnFromProject(projectIndex, columnIndex) {
  const projects = loadProjects();
  if (projects[projectIndex]?.columns[columnIndex]) {
    projects[projectIndex].columns.splice(columnIndex, 1);
    saveProjects(projects);
  }
  return projects;
}

function renameColumn(projectIndex, columnIndex, newTitle) {
  const projects = loadProjects();
  if (projects[projectIndex]?.columns[columnIndex]) {
    projects[projectIndex].columns[columnIndex].title = newTitle;
    saveProjects(projects);
  }
  return projects;
}

// ============================================
// Backlog Tasks
// ============================================
async function loadBacklogTasksAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('backlog_tasks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      backlogTasksCache = data || [];
      localStorage.setItem(BACKLOG_KEY, JSON.stringify(backlogTasksCache));
      return backlogTasksCache;
    }
  } catch (error) {
    console.error('Supabase error loading backlog tasks:', error);
  }
  return loadBacklogTasksFromLocalStorage();
}

function loadBacklogTasksFromLocalStorage() {
  try {
    const data = localStorage.getItem(BACKLOG_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load backlog tasks:', e);
  }
  return [];
}

function loadBacklogTasks() {
  if (backlogTasksCache !== null) return backlogTasksCache;
  backlogTasksCache = loadBacklogTasksFromLocalStorage();
  loadBacklogTasksAsync().then(data => { backlogTasksCache = data; });
  return backlogTasksCache;
}

async function saveBacklogTasksAsync(tasks) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      for (const task of tasks) {
        const { error } = await supabase
          .from('backlog_tasks')
          .upsert({
            id: task.id,
            title: task.title,
            done: task.done,
            created_at: task.createdAt
          }, { onConflict: 'id' });
        if (error) console.error('Error saving backlog task:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving backlog tasks:', error);
  }
}

function saveBacklogTasks(tasks) {
  backlogTasksCache = tasks;
  localStorage.setItem(BACKLOG_KEY, JSON.stringify(tasks));
  saveBacklogTasksAsync(tasks);
}

function addBacklogTask(title) {
  const tasks = loadBacklogTasks();
  const newTask = {
    id: generateId('BACKLOG'),
    title: title,
    done: false,
    createdAt: new Date().toISOString()
  };
  tasks.push(newTask);
  saveBacklogTasks(tasks);
  return tasks;
}

function toggleBacklogTask(index) {
  const tasks = loadBacklogTasks();
  if (tasks[index]) {
    tasks[index].done = !tasks[index].done;
    saveBacklogTasks(tasks);
  }
  return tasks;
}

function updateBacklogTask(index, title) {
  const tasks = loadBacklogTasks();
  if (tasks[index]) {
    tasks[index].title = title;
    saveBacklogTasks(tasks);
  }
  return tasks;
}

async function deleteBacklogTaskAsync(taskId) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from('backlog_tasks')
        .delete()
        .eq('id', taskId);
      if (error) console.error('Error deleting backlog task:', error);
    }
  } catch (error) {
    console.error('Supabase error deleting backlog task:', error);
  }
}

function deleteBacklogTask(index) {
  const tasks = loadBacklogTasks();
  const deleted = tasks[index];
  tasks.splice(index, 1);
  saveBacklogTasks(tasks);
  if (deleted) deleteBacklogTaskAsync(deleted.id);
  return tasks;
}

// ============================================
// Issues
// ============================================
async function loadIssuesAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      issuesCache = data || [];
      localStorage.setItem(ISSUES_KEY, JSON.stringify(issuesCache));
      return issuesCache;
    }
  } catch (error) {
    console.error('Supabase error loading issues:', error);
  }
  return loadIssuesFromLocalStorage();
}

function loadIssuesFromLocalStorage() {
  try {
    const data = localStorage.getItem(ISSUES_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load issues:', e);
  }
  return [];
}

function loadIssues() {
  if (issuesCache !== null) return issuesCache;
  issuesCache = loadIssuesFromLocalStorage();
  loadIssuesAsync().then(data => { issuesCache = data; });
  return issuesCache;
}

async function saveIssuesAsync(issues) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      for (const issue of issues) {
        const { error } = await supabase
          .from('issues')
          .upsert({
            id: issue.id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            due_date: issue.dueDate,
            updated: issue.updated
          }, { onConflict: 'id' });
        if (error) console.error('Error saving issue:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving issues:', error);
  }
}

function saveIssues(issues) {
  issuesCache = issues;
  localStorage.setItem(ISSUES_KEY, JSON.stringify(issues));
  saveIssuesAsync(issues);
}

function addIssue(issueData) {
  const issues = loadIssues();
  const newIssue = {
    id: generateIssueId(),
    title: issueData.title,
    description: issueData.description || '',
    status: issueData.status || 'todo',
    priority: issueData.priority || 'medium',
    assignee: issueData.assignee || 'Zeyad Maher',
    dueDate: issueData.dueDate,
    updated: 'just now'
  };
  issues.unshift(newIssue);
  saveIssues(issues);
  return issues;
}

// ============================================
// Calendar Events
// ============================================
async function loadCalendarEventsAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('date', { ascending: true });
      
      if (error) throw error;
      calendarEventsCache = data || [];
      localStorage.setItem(CALENDAR_KEY, JSON.stringify(calendarEventsCache));
      return calendarEventsCache;
    }
  } catch (error) {
    console.error('Supabase error loading calendar events:', error);
  }
  return loadCalendarEventsFromLocalStorage();
}

function loadCalendarEventsFromLocalStorage() {
  try {
    const data = localStorage.getItem(CALENDAR_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load calendar events:', e);
  }
  return [];
}

function loadCalendarEvents() {
  if (calendarEventsCache !== null) return calendarEventsCache;
  calendarEventsCache = loadCalendarEventsFromLocalStorage();
  loadCalendarEventsAsync().then(data => { calendarEventsCache = data; });
  return calendarEventsCache;
}

async function saveCalendarEventsAsync(events) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      for (const event of events) {
        const { error } = await supabase
          .from('calendar_events')
          .upsert({
            id: event.id,
            title: event.title,
            date: event.date,
            time: event.time,
            color: event.color,
            completed: event.completed,
            description: event.description
          }, { onConflict: 'id' });
        if (error) console.error('Error saving calendar event:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving calendar events:', error);
  }
}

function saveCalendarEvents(events) {
  calendarEventsCache = events;
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(events));
  saveCalendarEventsAsync(events);
}

function addCalendarEvent(eventData) {
  const events = loadCalendarEvents();
  const newEvent = {
    id: generateId('EVENT'),
    title: eventData.title,
    date: eventData.date,
    time: eventData.time || null,
    color: eventData.color || 'blue',
    completed: false,
    description: eventData.description || ''
  };
  events.push(newEvent);
  saveCalendarEvents(events);
  return events;
}

function updateCalendarEvent(eventId, updates) {
  const events = loadCalendarEvents();
  const index = events.findIndex(e => e.id === eventId);
  if (index !== -1) {
    events[index] = { ...events[index], ...updates };
    saveCalendarEvents(events);
  }
  return events;
}

async function deleteCalendarEventAsync(eventId) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);
      if (error) console.error('Error deleting calendar event:', error);
    }
  } catch (error) {
    console.error('Supabase error deleting calendar event:', error);
  }
}

function deleteCalendarEvent(eventId) {
  const events = loadCalendarEvents();
  const index = events.findIndex(e => e.id === eventId);
  if (index !== -1) {
    events.splice(index, 1);
    saveCalendarEvents(events);
    deleteCalendarEventAsync(eventId);
  }
  return events;
}

// ============================================
// Documents
// ============================================
async function loadDocsAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      docsCache = data || [];
      localStorage.setItem(DOCS_KEY, JSON.stringify(docsCache));
      return docsCache;
    }
  } catch (error) {
    console.error('Supabase error loading docs:', error);
  }
  return loadDocsFromLocalStorage();
}

function loadDocsFromLocalStorage() {
  try {
    const data = localStorage.getItem(DOCS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load docs:', e);
  }
  return [];
}

function loadDocs() {
  if (docsCache !== null) return docsCache;
  docsCache = loadDocsFromLocalStorage();
  loadDocsAsync().then(data => { docsCache = data; });
  return docsCache;
}

async function saveDocsAsync(docs) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      for (const doc of docs) {
        const { error } = await supabase
          .from('documents')
          .upsert({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            space_id: doc.spaceId,
            project_id: doc.projectId,
            created_at: doc.createdAt,
            updated_at: doc.updatedAt
          }, { onConflict: 'id' });
        if (error) console.error('Error saving doc:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving docs:', error);
  }
}

function saveDocs(docs) {
  docsCache = docs;
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  saveDocsAsync(docs);
}

function addDoc(docData) {
  const docs = loadDocs();
  const newDoc = {
    id: generateId('DOC'),
    title: docData.title || 'Untitled',
    content: docData.content || '',
    spaceId: docData.spaceId || null,
    projectId: docData.projectId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  docs.unshift(newDoc);
  saveDocs(docs);
  return newDoc;
}

function updateDoc(docId, updates) {
  const docs = loadDocs();
  const index = docs.findIndex(d => d.id === docId);
  if (index !== -1) {
    docs[index] = { ...docs[index], ...updates, updatedAt: new Date().toISOString() };
    saveDocs(docs);
  }
  return docs;
}

async function deleteDocAsync(docId) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);
      if (error) console.error('Error deleting doc:', error);
    }
  } catch (error) {
    console.error('Supabase error deleting doc:', error);
  }
}

function deleteDoc(docId) {
  const docs = loadDocs();
  const index = docs.findIndex(d => d.id === docId);
  if (index !== -1) {
    docs.splice(index, 1);
    saveDocs(docs);
    deleteDocAsync(docId);
  }
  return docs;
}

// ============================================
// Excel/Spreadsheets
// ============================================
async function loadExcelsAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('spreadsheets')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      excelsCache = data || [];
      localStorage.setItem(EXCELS_KEY, JSON.stringify(excelsCache));
      return excelsCache;
    }
  } catch (error) {
    console.error('Supabase error loading excels:', error);
  }
  return loadExcelsFromLocalStorage();
}

function loadExcelsFromLocalStorage() {
  try {
    const data = localStorage.getItem(EXCELS_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load excels:', e);
  }
  return [];
}

function loadExcels() {
  if (excelsCache !== null) return excelsCache;
  excelsCache = loadExcelsFromLocalStorage();
  loadExcelsAsync().then(data => { excelsCache = data; });
  return excelsCache;
}

async function saveExcelsAsync(excels) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      for (const excel of excels) {
        const { error } = await supabase
          .from('spreadsheets')
          .upsert({
            id: excel.id,
            title: excel.title,
            data: excel.data,
            space_id: excel.spaceId,
            project_id: excel.projectId,
            created_at: excel.createdAt,
            updated_at: excel.updatedAt
          }, { onConflict: 'id' });
        if (error) console.error('Error saving excel:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving excels:', error);
  }
}

function saveExcels(excels) {
  excelsCache = excels;
  localStorage.setItem(EXCELS_KEY, JSON.stringify(excels));
  saveExcelsAsync(excels);
}

function addExcel(excelData) {
  const excels = loadExcels();
  const newExcel = {
    id: generateId('EXCEL'),
    title: excelData.title || 'Untitled',
    data: excelData.data || [['', '', ''], ['', '', ''], ['', '', '']],
    spaceId: excelData.spaceId || null,
    projectId: excelData.projectId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  excels.unshift(newExcel);
  saveExcels(excels);
  return newExcel;
}

function updateExcel(excelId, updates) {
  const excels = loadExcels();
  const index = excels.findIndex(e => e.id === excelId);
  if (index !== -1) {
    excels[index] = { ...excels[index], ...updates, updatedAt: new Date().toISOString() };
    saveExcels(excels);
  }
  return excels;
}

function deleteExcel(excelId) {
  const excels = loadExcels();
  const index = excels.findIndex(e => e.id === excelId);
  if (index !== -1) {
    excels.splice(index, 1);
    saveExcels(excels);
  }
  return excels;
}

// ============================================
// Spaces
// ============================================
async function loadSpacesAsync() {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      spacesCache = data || [];
      localStorage.setItem(SPACES_KEY, JSON.stringify(spacesCache));
      return spacesCache;
    }
  } catch (error) {
    console.error('Supabase error loading spaces:', error);
  }
  return loadSpacesFromLocalStorage();
}

function loadSpacesFromLocalStorage() {
  try {
    const data = localStorage.getItem(SPACES_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load spaces:', e);
  }
  return [];
}

function loadSpaces() {
  if (spacesCache !== null) return spacesCache;
  spacesCache = loadSpacesFromLocalStorage();
  loadSpacesAsync().then(data => { spacesCache = data; });
  return spacesCache;
}

async function saveSpacesAsync(spaces) {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      for (const space of spaces) {
        const { error } = await supabase
          .from('spaces')
          .upsert({
            id: space.id,
            name: space.name,
            description: space.description,
            color: space.color,
            icon: space.icon,
            created_at: space.createdAt
          }, { onConflict: 'id' });
        if (error) console.error('Error saving space:', error);
      }
    }
  } catch (error) {
    console.error('Supabase error saving spaces:', error);
  }
}

function saveSpaces(spaces) {
  spacesCache = spaces;
  localStorage.setItem(SPACES_KEY, JSON.stringify(spaces));
  saveSpacesAsync(spaces);
}

function addSpace(spaceData) {
  const spaces = loadSpaces();
  const newSpace = {
    id: generateId('SPACE'),
    name: spaceData.name,
    description: spaceData.description || '',
    color: spaceData.color || '#3b82f6',
    icon: spaceData.icon || 'folder',
    createdAt: new Date().toISOString()
  };
  spaces.unshift(newSpace);
  saveSpaces(spaces);
  return newSpace;
}

function updateSpace(spaceId, updates) {
  const spaces = loadSpaces();
  const index = spaces.findIndex(s => s.id === spaceId);
  if (index !== -1) {
    spaces[index] = { ...spaces[index], ...updates };
    saveSpaces(spaces);
  }
  return spaces;
}

function deleteSpace(spaceId) {
  const spaces = loadSpaces();
  const index = spaces.findIndex(s => s.id === spaceId);
  if (index !== -1) {
    spaces.splice(index, 1);
    saveSpaces(spaces);
  }
  return spaces;
}

// ============================================
// Theme
// ============================================
function loadTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

// ============================================
// Activity
// ============================================
function getRecentActivity(projects) {
  const activity = [];

  projects.slice().reverse().forEach(project => {
    activity.push({
      type: 'project',
      message: `Created project "${project.name}"`,
      time: project.startDate || new Date().toISOString(),
    });
  });

  return activity
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 15);
}

// ============================================
// Formatters
// ============================================
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'just now';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'invalid time';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(dateStr);
}

function capitalizeStatus(status) {
  if (!status) return 'Unknown';
  return status
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getProgressColor(percentage) {
  if (percentage >= 90) return 'hsl(142, 71%, 45%)';
  if (percentage >= 60) return 'hsl(217, 91%, 60%)';
  if (percentage >= 30) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 84%, 60%)';
}

function getStatusColor(status) {
  const colors = {
    'todo': 'hsl(215, 16%, 47%)',
    'in-progress': 'hsl(217, 91%, 60%)',
    'review': 'hsl(271, 91%, 65%)',
    'done': 'hsl(142, 71%, 45%)',
    'backlog': 'hsl(215, 14%, 45%)',
  };
  return colors[status?.toLowerCase()] || colors.todo;
}

function getEventColor(colorName) {
  const colors = {
    'blue': 'hsl(217, 91%, 60%)',
    'green': 'hsl(142, 71%, 45%)',
    'purple': 'hsl(271, 91%, 65%)',
    'orange': 'hsl(24, 90%, 60%)',
    'red': 'hsl(0, 84%, 60%)',
  };
  return colors[colorName] || colors.blue;
}

function calculateProgress(columns) {
  let total = 0;
  let completed = 0;

  columns.forEach(col => {
    total += col.tasks.length;
    completed += col.tasks.filter(t => t.done).length;
  });

  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percentage };
}

// ============================================
// Assignments
// ============================================
function loadAssignments() {
  try {
    const data = localStorage.getItem(ASSIGNMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load assignments:', e);
    return [];
  }
}

function saveAssignments(assignments) {
  try {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  } catch (e) {
    console.error('Failed to save assignments:', e);
    alert('Storage full or error saving assignment. Try removing some files.');
  }
}

function addAssignment(assignment) {
  const assignments = loadAssignments();
  assignments.unshift(assignment);
  saveAssignments(assignments);
}

function deleteAssignment(index) {
  const assignments = loadAssignments();
  assignments.splice(index, 1);
  saveAssignments(assignments);
}

function openCreateAssignmentModal() {
  const content = `
    <form id="createAssignmentForm" onsubmit="handleCreateAssignmentSubmit(event)">
      <div class="form-group">
        <label class="form-label">Title <span class="required">*</span></label>
        <input type="text" name="title" class="form-input" required placeholder="e.g. Math Homework Week 5">
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea name="notes" class="form-textarea" rows="6" placeholder="Add your notes, summaries, answers..."></textarea>
      </div>
      
      <div class="form-group">
        <label class="form-label">Attach files (PDFs, docs, images...)</label>
        <input type="file" id="assignmentFiles" multiple accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png">
        <p style="font-size: 13px; color: var(--muted-foreground); margin-top: 8px;">
          Files will be saved locally. Large files may fill up browser storage.
        </p>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Assignment</button>
      </div>
    </form>
  `;
  openModal('Create Assignment', content);
}

async function handleCreateAssignmentSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const title = form.title.value.trim();
  const notes = form.notes.value.trim();

  if (!title) return;

  const fileInput = document.getElementById('assignmentFiles');
  const files = [];

  for (const file of fileInput.files) {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    files.push({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl
    });
  }

  addAssignment({
    id: generateId('ASSIGN'),
    title,
    notes,
    files,
    created: new Date().toISOString()
  });

  closeModal();
  renderCurrentView();
}

// ============================================
// PDF Viewer Functions
// ============================================
let currentPdfData = null;
let currentPdfName = '';

function openPdfViewer(dataUrl, fileName) {
  currentPdfData = dataUrl;
  currentPdfName = fileName || 'document.pdf';
  
  const overlay = document.getElementById('pdfViewerOverlay');
  const frame = document.getElementById('pdfViewerFrame');
  const title = document.getElementById('pdfViewerTitle');
  
  if (overlay && frame) {
    title.textContent = currentPdfName;
    frame.src = dataUrl;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closePdfViewer() {
  const overlay = document.getElementById('pdfViewerOverlay');
  const frame = document.getElementById('pdfViewerFrame');
  
  if (overlay) {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  if (frame) {
    frame.src = '';
  }
  currentPdfData = null;
  currentPdfName = '';
}

function downloadCurrentPdf() {
  if (!currentPdfData) return;
  downloadFile(currentPdfData, currentPdfName);
}

function downloadFile(dataUrl, fileName) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openPdfPreview(dataUrl, fileName) {
  openPdfViewer(dataUrl, fileName || 'document.pdf');
}

function renderFileItem(file, fileIndex, assignmentIndex) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');
  const fileSize = formatFileSize(file.size);
  
  let previewHtml = '';
  let actionsHtml = '';
  
  if (isPdf) {
    previewHtml = `
      <div class="file-icon pdf-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; color: #ef4444;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M10 12h4"/>
          <path d="M10 16h4"/>
        </svg>
      </div>
    `;
    actionsHtml = `
      <button class="btn btn-sm btn-secondary" onclick="openPdfViewer('${file.dataUrl}', '${file.name.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        View
      </button>
      <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.dataUrl}', '${file.name.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </button>
    `;
  } else if (isImage) {
    previewHtml = `
      <div class="file-thumbnail" style="background-image: url('${file.dataUrl}')"></div>
    `;
    actionsHtml = `
      <button class="btn btn-sm btn-secondary" onclick="openImagePreview('${file.dataUrl}', '${file.name.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        View
      </button>
      <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.dataUrl}', '${file.name.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </button>
    `;
  } else {
    previewHtml = `
      <div class="file-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
    `;
    actionsHtml = `
      <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.dataUrl}', '${file.name.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </button>
    `;
  }
  
  return `
    <div class="file-item">
      ${previewHtml}
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${fileSize}</span>
      </div>
      <div class="file-actions">
        ${actionsHtml}
      </div>
    </div>
  `;
}

function openImagePreview(dataUrl, fileName) {
  const content = `
    <div style="text-align: center;">
      <img src="${dataUrl}" alt="${fileName}" style="max-width: 100%; max-height: 70vh; border-radius: 8px;">
      <div style="margin-top: 16px;">
        <button class="btn btn-primary" onclick="downloadFile('${dataUrl}', '${fileName.replace(/'/g, "\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </button>
      </div>
    </div>
  `;
  openModal(fileName, content);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================
// Project Updates (Comments)
// ============================================
function loadProjectUpdates(projectIndex) {
  const projects = loadProjects();
  if (!projects[projectIndex]) return [];
  return projects[projectIndex].updates || [];
}

function addProjectUpdate(projectIndex, message) {
  const projects = loadProjects();
  if (!projects[projectIndex]) return;

  const newUpdate = {
    actor: 'Zeyad Maher',
    message: message.trim(),
    time: new Date().toISOString()
  };

  if (!projects[projectIndex].updates) {
    projects[projectIndex].updates = [];
  }
  projects[projectIndex].updates.unshift(newUpdate);
  saveProjects(projects);
}

function getProjectStatus(projectIndex) {
  const projects = loadProjects();
  return projects[projectIndex]?.status || 'todo';
}

// ============================================
// Initialize data on page load
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Pre-load all data from Supabase
  loadProjectsAsync();
  loadIssuesAsync();
  loadBacklogTasksAsync();
  loadCalendarEventsAsync();
  loadDocsAsync();
  loadExcelsAsync();
  loadSpacesAsync();
});
