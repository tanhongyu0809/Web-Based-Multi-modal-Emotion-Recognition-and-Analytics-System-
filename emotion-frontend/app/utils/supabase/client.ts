import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Hardcoded with your exact Supabase credentials
  return createBrowserClient(
    "https://cfmxglmbjrwqivsrlnwo.supabase.co", 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbXhnbG1ianJ3cWl2c3JsbndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjM3ODgsImV4cCI6MjA5NzczOTc4OH0.RvKpq6WSCXX6jjHu4bmSQLRTIkKQiw_b7UWWhNoYHn4"
  )
}