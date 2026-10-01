# Supabase — comptes et synchronisation

Projet : `https://derqhgkevjibgkxnyypx.supabase.co` (région UE). La clé « anon » est dans
`app/src/compte/client.ts` : elle est publique par conception, ce sont les règles RLS ci-dessous qui
protègent les données. La clé `service_role` ne va **que** dans les secrets GitHub (`SUPABASE_SERVICE_ROLE_KEY`).

## Ce que contient le schéma (`migrations/`)

| Objet | Rôle | Accès |
|---|---|---|
| table `preferences` | profil de financement (`profil`, jsonb), dernière vue de la carte (`vue`, paramètres d'URL) et quartiers enregistrés (`quartiers`, jsonb) | chaque utilisateur connecté lit / écrit / supprime **sa** ligne ; supprimée avec le compte |
| bucket `prive` | ventes DVF individuelles (`ventes_24m.<empreinte>.json`) | lecture : utilisateurs connectés ; écriture : pipeline (clé `service_role`) |

## Mise en place (une fois)

1. **SQL Editor** → exécuter, dans l'ordre, chaque fichier de `migrations/` (coller → Run) :
   `20260930000000_preferences_et_donnees_privees.sql` puis `20261002000000_quartiers_enregistres.sql`.
   Les scripts sont idempotents : les relancer ne casse rien.
2. **Authentication → Providers** :
   - *Email* : activé (confirmation de l'adresse conseillée) ;
   - *Google* : activé, avec l'ID client et le secret du client OAuth « Application Web » (Google Cloud Console,
     URI de redirection autorisée : `https://derqhgkevjibgkxnyypx.supabase.co/auth/v1/callback`).
3. **Authentication → URL Configuration** :
   - *Site URL* : `https://ou-acheter-2qp.pages.dev` (adresse de production attribuée par Cloudflare, le nom
     `ou-acheter` étant déjà pris) ;
   - *Redirect URLs* : `https://ou-acheter-2qp.pages.dev/**`, `https://*.ou-acheter-2qp.pages.dev/**`
     (préversions), `http://localhost:5173/**`, `http://localhost:4173/**`.
4. Une fois ton compte créé, si l'outil reste personnel : **Authentication → Sign In / Providers** → désactiver
   *Allow new users to sign up* (plus aucune inscription possible).
5. **GitHub → Settings → Secrets and variables → Actions** : `SUPABASE_SERVICE_ROLE_KEY` = la clé `service_role`
   (Project Settings → API) ; le workflow de déploiement y envoie les ventes.

## Choix

- Quartiers enregistrés : à la connexion, union de la liste de l'appareil et de celle du compte (date d'ajout la
  plus ancienne conservée), puis renvoi de la liste fusionnée.
- Synchronisation : à la connexion, le profil du compte remplace celui de l'appareil (sinon celui de l'appareil
  est envoyé) ; ensuite chaque modification est enregistrée après 1,5 s. La dernière vue n'est restaurée que si la
  page a été ouverte sans paramètres (un lien partagé garde la priorité).
- Connexion Google en flux PKCE, retour sur la page d'origine (la vue en cours est mémorisée avant de partir).
- À vérifier : le retour de connexion Google dans une PWA installée sur iPhone (stockage séparé de Safari) ;
  la connexion e-mail + mot de passe n'a pas ce problème.
