import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Projet Supabase (région UE). La clé « anon » est publique par conception : elle est envoyée à tous les
// navigateurs ; ce sont les règles RLS (supabase/migrations/) qui protègent les données. La clé
// « service_role » ne doit JAMAIS apparaître ici (secret GitHub, pipeline uniquement).
// Surchargeables au build (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) pour pointer vers un autre projet.
const URL_SUPABASE: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://derqhgkevjibgkxnyypx.supabase.co'
const CLE_ANON: string = import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcnFoZ2tldmppYmdreG55eXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDI2MDAsImV4cCI6MjEwNjM3ODYwMH0.rw5ripDxBOBA515OhNP3dc19GeA6BscXxgg5qg55dMo'

/** Client unique, créé au chargement du module : il lit le code de retour de connexion (?code=…) dans
 * l'URL avant que l'application ne réécrive celle-ci. null si le build désactive les comptes (URL vide). */
export const supabase: SupabaseClient | null = URL_SUPABASE
  ? createClient(URL_SUPABASE, CLE_ANON, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const BUCKET_PRIVE = 'prive'
