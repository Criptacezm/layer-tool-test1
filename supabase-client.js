/* ============================================
   Layer - Supabase Client Configuration
   ============================================ */

// Import Supabase client from CDN
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Configuration
const SUPABASE_URL = 'https://uqfnadlyrbprzxgjkvtc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZm5hZGx5cmJwcnp4Z2prdnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzkxNzAsImV4cCI6MjA4Mjk1NTE3MH0.12PfMd0vnsWvCXSNdkc3E02KDn46xi9XTyZ8rXNiVHs';

// Create and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Attach to window for global access
window.supabase = supabase;

console.log('Supabase client initialized successfully');
