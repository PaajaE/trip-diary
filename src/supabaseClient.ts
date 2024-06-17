import { createClient } from '@supabase/supabase-js';
import { Database } from './supabase';

const supabaseUrl = import.meta.env.VITE_APP_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_APP_SUPABASE_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
