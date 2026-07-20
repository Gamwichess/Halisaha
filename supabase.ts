import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';


const supabaseUrl = 'https://jvkanwkhlzwyahbspjks.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2a2Fud2tobHp3eWFoYnNwamtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjkxNjYsImV4cCI6MjA5NTQwNTE2Nn0.8Sddih45xPz5vKQlHvt63lJw0z_epu2OFfMnzBIJRZ0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});