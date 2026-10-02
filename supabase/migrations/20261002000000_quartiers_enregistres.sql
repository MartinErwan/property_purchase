-- Quartiers enregistrés (« Mes quartiers ») : liste [{ "id": code IRIS, "ajoute": date ISO }, …].
-- À exécuter après la première migration (SQL Editor → coller → Run). Idempotent.
alter table public.preferences add column if not exists quartiers jsonb not null default '[]'::jsonb;

comment on column public.preferences.quartiers is
  'Quartiers enregistrés par l''utilisateur : [{"id": code IRIS, "ajoute": date ISO}]';

-- Rafraîchit le cache de schéma de l'API (sinon la nouvelle colonne peut rester invisible un moment).
notify pgrst, 'reload schema';
