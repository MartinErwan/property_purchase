-- Comptes et synchronisation (jalon 7).
-- À exécuter une fois dans Supabase : SQL Editor → coller ce fichier → Run.
-- Idempotent : peut être relancé sans erreur.

-- ---------------------------------------------------------------------------
-- 1. Préférences de chaque utilisateur : profil de financement et dernière vue.
--    Une seule ligne par utilisateur, supprimée avec son compte.
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- Profil de financement (personnes, RFR, revenus, apport, taux…) : données personnelles.
  profil      jsonb,
  -- Dernière vue de la carte : paramètres de l'URL (filtres, destination, horizon), sans le profil.
  vue         text,
  modifie_le  timestamptz not null default now()
);

comment on table public.preferences is
  'Profil de financement et dernière vue de chaque utilisateur (lecture/écriture par le seul propriétaire).';

-- Sécurité ligne par ligne : sans politique, personne (hors service_role) n'accède à rien.
alter table public.preferences enable row level security;

drop policy if exists "lecture de ses préférences" on public.preferences;
create policy "lecture de ses préférences" on public.preferences
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "création de ses préférences" on public.preferences;
create policy "création de ses préférences" on public.preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "modification de ses préférences" on public.preferences;
create policy "modification de ses préférences" on public.preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "suppression de ses préférences" on public.preferences;
create policy "suppression de ses préférences" on public.preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Horodatage mis à jour à chaque modification (arbitrage entre appareils : la plus récente gagne).
create or replace function public.preferences_horodater() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.modifie_le := now();
  return new;
end $$;

drop trigger if exists preferences_horodater on public.preferences;
create trigger preferences_horodater before update on public.preferences
  for each row execute function public.preferences_horodater();

-- ---------------------------------------------------------------------------
-- 2. Données privées : ventes DVF individuelles, lisibles seulement par un
--    utilisateur connecté. Écriture réservée au pipeline (clé service_role,
--    qui contourne ces règles) : aucune politique d'écriture ici.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('prive', 'prive', false)
on conflict (id) do update set public = false;

drop policy if exists "lecture des données privées par les connectés" on storage.objects;
create policy "lecture des données privées par les connectés" on storage.objects
  for select to authenticated using (bucket_id = 'prive');
