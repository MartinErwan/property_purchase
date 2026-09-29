# Supabase — comptes et synchronisation

À venir au jalon 7 (voir `CLAUDE.md`) : migrations SQL (`migrations/`) du schéma qui stocke le
profil de financement et les filtres enregistrés de chaque utilisateur, avec des règles d'accès par
ligne (RLS) : chacun ne lit et n'écrit que ses propres données.

Aucune clé ni identifiant dans ce dossier : ils vont dans les secrets GitHub / Cloudflare.
