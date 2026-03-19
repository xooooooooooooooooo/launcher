import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://szxxwxwityixqzzmarlq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6eHh3eHdpdHlpeHF6em1hcmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTkyNDQsImV4cCI6MjA4NjQzNTI0NH0.5XSYOM1VZrKOeQJSErdI-J2PcvWNo2YLHrCfQ5MNxRs'

export const supabase = createClient(supabaseUrl, supabaseKey)
