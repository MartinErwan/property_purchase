-- Annonces enregistrées depuis les sites d'annonces : liste [{ "id", "url", "site", "titre", "prix", "surface",
-- "pieces", "image" (adresse de la photo sur le site d'origine, non copiée), "note", "iris", "ajoute", "modifie" }].
-- À exécuter après les migrations précédentes (SQL Editor → coller → Run). Idempotent.
-- Protégée par les mêmes règles d'accès (RLS) que le reste de la ligne : chacun ne lit et n'écrit que la sienne.
alter table public.preferences add column if not exists annonces jsonb not null default '[]'::jsonb;

comment on column public.preferences.annonces is
  'Annonces enregistrées par l''utilisateur (lien, prix, surface, note, quartier) ; aucune copie de page ni de photo';

-- Rafraîchit le cache de schéma de l'API (sinon la nouvelle colonne peut rester invisible un moment).
notify pgrst, 'reload schema';
