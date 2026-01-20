/* ============================================
   Layer - Supabase Database API (Browser Client)
   ============================================ */

// Supabase Configuration - Your personal project
const SUPABASE_URL = 'https://uqfnadlyrbprzxgjkvtc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZm5hZGx5cmJwcnp4Z2prdnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzkxNzAsImV4cCI6MjA4Mjk1NTE3MH0.12PfMd0vnsWvCXSNdkc3E02KDn46xi9XTyZ8rXNiVHs';

// Initialize Supabase client
let supabase = null;
let currentUser = null;
let currentSession = null;

function initSupabase() {
  if (typeof window !== 'undefined' && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase initialized successfully');
    return supabase;
  }
  console.warn('Supabase library not loaded');
  return null;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  setupAuthListener();
});

// Setup auth state listener
function setupAuthListener() {
  if (!supabase) {
    setTimeout(setupAuthListener, 100);
    return;
  }
  
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    currentSession = session;
    currentUser = session?.user ?? null;
    
    // Update UI based on auth state
    updateAuthUI();
    
    if (event === 'SIGNED_IN') {
      closeModal();
      if (typeof renderCurrentView === 'function') {
        renderCurrentView();
      }
    } else if (event === 'SIGNED_OUT') {
      if (typeof renderCurrentView === 'function') {
        renderCurrentView();
      }
    }
  });
  
  // Check for existing session
  supabase.auth.getSession().then(({ data: { session } }) => {
    currentSession = session;
    currentUser = session?.user ?? null;
    updateAuthUI();
  });
}

// Update UI based on auth state
function updateAuthUI() {
  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    if (currentUser) {
      signInBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Sign Out</span>
      `;
      signInBtn.onclick = handleSignOut;
    } else {
      signInBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        <span>Sign In</span>
      `;
      signInBtn.onclick = openAuthModal;
    }
  }
}

// Get current user (sync - returns cached value)
function getCurrentUser() {
  return currentUser;
}

// Get current session (sync - returns cached value)
function getSession() {
  return currentSession;
}

// Check if user is authenticated
function isAuthenticated() {
  return !!currentUser;
}

// ============================================
// Authentication UI
// ============================================
function openAuthModal() {
  const content = `
    <div class="auth-container">
      <div class="auth-tabs">
        <button class="auth-tab active" onclick="switchAuthTab('login')">Sign In</button>
        <button class="auth-tab" onclick="switchAuthTab('signup')">Sign Up</button>
      </div>
      
      <form id="authForm" onsubmit="handleAuthSubmit(event)">
        <div id="authError" class="auth-error" style="display: none;"></div>
        
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" name="email" class="form-input" required placeholder="you@example.com" autocomplete="email">
        </div>
        
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" required placeholder="••••••••" minlength="6" autocomplete="current-password">
        </div>
        
        <input type="hidden" name="authMode" id="authMode" value="login">
        
        <div class="form-actions" style="margin-top: 24px;">
          <button type="submit" class="btn btn-primary" id="authSubmitBtn" style="width: 100%;">
            Sign In
          </button>
        </div>
      </form>
      
      <p class="auth-footer" style="text-align: center; margin-top: 16px; color: var(--muted-foreground); font-size: 13px;">
        Your data will be saved to your personal account.
      </p>
    </div>
  `;
  openModal('Welcome to Layer', content);
}

function switchAuthTab(mode) {
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(tab => tab.classList.remove('active'));
  
  if (mode === 'login') {
    tabs[0].classList.add('active');
    document.getElementById('authMode').value = 'login';
    document.getElementById('authSubmitBtn').textContent = 'Sign In';
  } else {
    tabs[1].classList.add('active');
    document.getElementById('authMode').value = 'signup';
    document.getElementById('authSubmitBtn').textContent = 'Create Account';
  }
  
  // Clear error
  document.getElementById('authError').style.display = 'none';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const mode = form.authMode.value;
  const submitBtn = document.getElementById('authSubmitBtn');
  const errorDiv = document.getElementById('authError');
  
  // Basic validation
  if (!email || !password) {
    showAuthError('Please fill in all fields');
    return;
  }
  
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters');
    return;
  }
  
  // Show loading state
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Please wait...';
  errorDiv.style.display = 'none';
  
  try {
    if (!supabase) initSupabase();
    
    let result;
    if (mode === 'signup') {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + '/layer.html'
        }
      });
    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password
      });
    }
    
    if (result.error) {
      throw result.error;
    }
    
    if (mode === 'signup' && result.data?.user && !result.data.session) {
      // Email confirmation required
      showAuthSuccess('Check your email for a confirmation link!');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
    // Success - auth listener will handle the rest
    
  } catch (error) {
    console.error('Auth error:', error);
    let message = error.message || 'Authentication failed';
    
    // Friendly error messages
    if (message.includes('Invalid login credentials')) {
      message = 'Invalid email or password';
    } else if (message.includes('User already registered')) {
      message = 'This email is already registered. Try signing in.';
    } else if (message.includes('Email not confirmed')) {
      message = 'Please check your email to confirm your account.';
    }
    
    showAuthError(message);
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  }
}

function showAuthError(message) {
  const errorDiv = document.getElementById('authError');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.style.color = '#ef4444';
    errorDiv.style.background = 'rgba(239, 68, 68, 0.1)';
    errorDiv.style.padding = '12px';
    errorDiv.style.borderRadius = '8px';
    errorDiv.style.marginBottom = '16px';
  }
}

function showAuthSuccess(message) {
  const errorDiv = document.getElementById('authError');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.style.color = '#22c55e';
    errorDiv.style.background = 'rgba(34, 197, 94, 0.1)';
    errorDiv.style.padding = '12px';
    errorDiv.style.borderRadius = '8px';
    errorDiv.style.marginBottom = '16px';
  }
}

async function handleSignOut() {
  if (!supabase) initSupabase();
  
  try {
    await supabase.auth.signOut();
    currentUser = null;
    currentSession = null;
    updateAuthUI();
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

// ============================================
// Database Operations (with localStorage fallback)
// ============================================

// Helper to check if we should use Supabase
function useSupabase() {
  return supabase && currentUser;
}

// ============================================
// Projects CRUD
// ============================================
async function dbLoadProjects() {
  if (!useSupabase()) {
    // Fallback to localStorage
    return loadProjectsLocal();
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(project => ({
      id: project.id,
      name: project.name,
      description: project.description || '',
      status: project.status || 'todo',
      startDate: project.start_date,
      targetDate: project.target_date,
      flowchart: project.flowchart || { nodes: [], edges: [] },
      columns: project.columns || [
        { title: 'To Do', tasks: [] },
        { title: 'In Progress', tasks: [] },
        { title: 'Done', tasks: [] },
      ],
      updates: project.updates || [],
      createdAt: project.created_at
    }));
  } catch (error) {
    console.error('Error loading projects:', error);
    return loadProjectsLocal();
  }
}

async function dbAddProject(projectData) {
  if (!useSupabase()) {
    return addProjectLocal(projectData);
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: currentUser.id,
        name: projectData.name,
        description: projectData.description || '',
        status: projectData.status || 'todo',
        start_date: projectData.startDate || new Date().toISOString().split('T')[0],
        target_date: projectData.targetDate || null,
        flowchart: projectData.flowchart || { nodes: [], edges: [] },
        columns: projectData.columns || [
          { title: 'To Do', tasks: [] },
          { title: 'In Progress', tasks: [] },
          { title: 'Done', tasks: [] },
        ],
        updates: [{ actor: 'You', action: 'Project created', time: 'just now' }]
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding project:', error);
    return addProjectLocal(projectData);
  }
}

async function dbUpdateProject(projectId, updates) {
  if (!useSupabase()) {
    return updateProjectLocal(projectId, updates);
  }

  try {
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.targetDate !== undefined) dbUpdates.target_date = updates.targetDate;
    if (updates.flowchart !== undefined) dbUpdates.flowchart = updates.flowchart;
    if (updates.columns !== undefined) dbUpdates.columns = updates.columns;
    if (updates.updates !== undefined) dbUpdates.updates = updates.updates;

    const { data, error } = await supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', projectId)
      .eq('user_id', currentUser.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating project:', error);
    return null;
  }
}

async function dbDeleteProject(projectId) {
  if (!useSupabase()) {
    return deleteProjectLocal(projectId);
  }

  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', currentUser.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting project:', error);
    return false;
  }
}

// ============================================
// Backlog Tasks CRUD
// ============================================
async function dbLoadBacklogTasks() {
  if (!useSupabase()) {
    return loadBacklogTasksLocal();
  }

  try {
    const { data, error } = await supabase
      .from('backlog_tasks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error loading backlog tasks:', error);
    return loadBacklogTasksLocal();
  }
}

async function dbAddBacklogTask(title) {
  if (!useSupabase()) {
    return addBacklogTaskLocal(title);
  }

  try {
    const { data, error } = await supabase
      .from('backlog_tasks')
      .insert({
        user_id: currentUser.id,
        title: title,
        done: false
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding backlog task:', error);
    return addBacklogTaskLocal(title);
  }
}

async function dbToggleBacklogTask(taskId, done) {
  if (!useSupabase()) {
    return toggleBacklogTaskLocal(taskId);
  }

  try {
    const { data, error } = await supabase
      .from('backlog_tasks')
      .update({ done })
      .eq('id', taskId)
      .eq('user_id', currentUser.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error toggling backlog task:', error);
    return null;
  }
}

async function dbDeleteBacklogTask(taskId) {
  if (!useSupabase()) {
    return deleteBacklogTaskLocal(taskId);
  }

  try {
    const { error } = await supabase
      .from('backlog_tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', currentUser.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting backlog task:', error);
    return false;
  }
}

// ============================================
// Issues CRUD
// ============================================
async function dbLoadIssues() {
  if (!useSupabase()) {
    return loadIssuesLocal();
  }

  try {
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error loading issues:', error);
    return loadIssuesLocal();
  }
}

async function dbAddIssue(issueData) {
  if (!useSupabase()) {
    return addIssueLocal(issueData);
  }

  try {
    const { data, error } = await supabase
      .from('issues')
      .insert({
        user_id: currentUser.id,
        title: issueData.title,
        description: issueData.description || '',
        status: issueData.status || 'todo',
        priority: issueData.priority || 'medium',
        assignee: issueData.assignee || '',
        due_date: issueData.dueDate || null
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding issue:', error);
    return addIssueLocal(issueData);
  }
}

// ============================================
// Assignments CRUD
// ============================================
async function dbLoadAssignments() {
  if (!useSupabase()) {
    return loadAssignmentsLocal();
  }

  try {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error loading assignments:', error);
    return loadAssignmentsLocal();
  }
}

async function dbAddAssignment(assignmentData) {
  if (!useSupabase()) {
    return addAssignmentLocal(assignmentData);
  }

  try {
    const { data, error } = await supabase
      .from('assignments')
      .insert({
        user_id: currentUser.id,
        title: assignmentData.title,
        notes: assignmentData.notes || '',
        files: assignmentData.files || []
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding assignment:', error);
    return addAssignmentLocal(assignmentData);
  }
}

async function dbDeleteAssignment(assignmentId) {
  if (!useSupabase()) {
    return deleteAssignmentLocal(assignmentId);
  }

  try {
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('user_id', currentUser.id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting assignment:', error);
    return false;
  }
}

// ============================================
// Local Storage Functions (Fallback)
// ============================================
function loadProjectsLocal() {
  try {
    const data = localStorage.getItem('layerProjectsData');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function addProjectLocal(projectData) {
  const projects = loadProjectsLocal();
  const newProject = {
    id: 'PROJ-' + Date.now(),
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
    updates: [{ actor: 'You', action: 'Project created', time: 'just now' }]
  };
  projects.push(newProject);
  localStorage.setItem('layerProjectsData', JSON.stringify(projects));
  return newProject;
}

function updateProjectLocal(index, updates) {
  const projects = loadProjectsLocal();
  if (projects[index]) {
    projects[index] = { ...projects[index], ...updates };
    localStorage.setItem('layerProjectsData', JSON.stringify(projects));
  }
  return projects;
}

function deleteProjectLocal(index) {
  const projects = loadProjectsLocal();
  projects.splice(index, 1);
  localStorage.setItem('layerProjectsData', JSON.stringify(projects));
  return projects;
}

function loadBacklogTasksLocal() {
  try {
    const data = localStorage.getItem('layerBacklogTasks');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function addBacklogTaskLocal(title) {
  const tasks = loadBacklogTasksLocal();
  const newTask = {
    id: 'BACKLOG-' + Date.now(),
    title: title,
    done: false,
    createdAt: new Date().toISOString()
  };
  tasks.push(newTask);
  localStorage.setItem('layerBacklogTasks', JSON.stringify(tasks));
  return newTask;
}

function toggleBacklogTaskLocal(index) {
  const tasks = loadBacklogTasksLocal();
  if (tasks[index]) {
    tasks[index].done = !tasks[index].done;
    localStorage.setItem('layerBacklogTasks', JSON.stringify(tasks));
  }
  return tasks;
}

function deleteBacklogTaskLocal(index) {
  const tasks = loadBacklogTasksLocal();
  tasks.splice(index, 1);
  localStorage.setItem('layerBacklogTasks', JSON.stringify(tasks));
  return tasks;
}

function loadIssuesLocal() {
  try {
    const data = localStorage.getItem('layerMyIssues');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function addIssueLocal(issueData) {
  const issues = loadIssuesLocal();
  const newIssue = {
    id: 'LAYER-' + Math.floor(1000 + Math.random() * 9000),
    title: issueData.title,
    description: issueData.description || '',
    status: issueData.status || 'todo',
    priority: issueData.priority || 'medium',
    assignee: issueData.assignee || '',
    dueDate: issueData.dueDate,
    updated: 'just now'
  };
  issues.unshift(newIssue);
  localStorage.setItem('layerMyIssues', JSON.stringify(issues));
  return issues;
}

function loadAssignmentsLocal() {
  try {
    const data = localStorage.getItem('layerAssignments');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function addAssignmentLocal(assignmentData) {
  const assignments = loadAssignmentsLocal();
  const newAssignment = {
    id: 'ASSIGN-' + Date.now(),
    ...assignmentData,
    created: new Date().toISOString()
  };
  assignments.unshift(newAssignment);
  localStorage.setItem('layerAssignments', JSON.stringify(assignments));
  return newAssignment;
}

function deleteAssignmentLocal(index) {
  const assignments = loadAssignmentsLocal();
  assignments.splice(index, 1);
  localStorage.setItem('layerAssignments', JSON.stringify(assignments));
  return assignments;
}

// ============================================
// Export for global use
// ============================================
if (typeof window !== 'undefined') {
  window.LayerDB = {
    initSupabase,
    getCurrentUser,
    getSession,
    isAuthenticated,
    openAuthModal,
    handleSignOut,
    // Database operations
    loadProjects: dbLoadProjects,
    addProject: dbAddProject,
    updateProject: dbUpdateProject,
    deleteProject: dbDeleteProject,
    loadBacklogTasks: dbLoadBacklogTasks,
    addBacklogTask: dbAddBacklogTask,
    toggleBacklogTask: dbToggleBacklogTask,
    deleteBacklogTask: dbDeleteBacklogTask,
    loadIssues: dbLoadIssues,
    addIssue: dbAddIssue,
    loadAssignments: dbLoadAssignments,
    addAssignment: dbAddAssignment,
    deleteAssignment: dbDeleteAssignment
  };
}
