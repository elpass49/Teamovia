# RLS Policies — Guide de référence

## Principe d'isolation multi-tenant

Toutes les tables métier sont protégées par RLS.
L'isolation repose sur une seule règle : `workspace_id = current_workspace_id()`.

`current_workspace_id()` lit le claim `workspace_id` injecté dans le JWT Supabase
via un hook Auth déclenché à chaque connexion.

## Deux clients Supabase — règle absolue

| Client | Clé | Usage | RLS |
|---|---|---|---|
| `supabase-browser` | `anon key` | Frontend, widget | Appliquée |
| `supabase-server`  | `service role key` | Backend API uniquement | Bypassée |

Le `service role key` ne doit jamais sortir du backend.
Le backend valide lui-même le workspace avant d'utiliser le service role.

## Matrice des permissions par rôle

| Table | owner | admin | viewer |
|---|---|---|---|
| workspaces (update) | ✓ | — | — |
| workspace_users (insert) | ✓ | ✓ | — |
| workspace_users (delete) | ✓ | — | — |
| agents (update) | ✓ | ✓ | — |
| subscriptions (update) | ✓ | — | — |
| Toutes les autres tables | ✓ | ✓ | ✓ (lecture) |

## Tables sans workspace_id direct

`messages` et `lead_messages` n'ont pas de `workspace_id` propre.
Leur RLS passe par une sous-requête sur la table parente :

```sql
-- messages → sessions → workspace_id
USING (
  session_id IN (
    SELECT id FROM sessions WHERE workspace_id = current_workspace_id()
  )
);

-- lead_messages → leads → workspace_id
USING (
  lead_id IN (
    SELECT id FROM leads WHERE workspace_id = current_workspace_id()
  )
);
```

## Tests d'isolation obligatoires

Avant chaque déploiement, vérifier que :

1. Un utilisateur du workspace A ne peut pas lire les sessions du workspace B
2. Un utilisateur avec le rôle `viewer` ne peut pas modifier un agent
3. Le widget (token public) ne peut créer que des sessions, pas lire les leads
4. La fonction `match_knowledge_chunks` filtre bien par `workspace_id`

```sql
-- Test rapide d'isolation (à lancer avec le JWT d'un workspace B)
SELECT count(*) FROM sessions;
-- Doit retourner 0 si aucune session n'appartient au workspace B
```

## Hook Auth — injection du workspace_id dans le JWT

À configurer dans Supabase Dashboard > Auth > Hooks :

```sql
-- Hook déclenché après chaque login
CREATE OR REPLACE FUNCTION auth.custom_claims(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  workspace_id uuid;
BEGIN
  -- Récupère le premier workspace de l'utilisateur (owner en priorité)
  SELECT wu.workspace_id INTO workspace_id
  FROM workspace_users wu
  WHERE wu.user_id = (event->>'user_id')::uuid
  ORDER BY
    CASE wu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF workspace_id IS NOT NULL THEN
    RETURN jsonb_set(event, '{claims,workspace_id}', to_jsonb(workspace_id));
  END IF;

  RETURN event;
END;
$$;
```

Note : si un utilisateur appartient à plusieurs workspaces,
le workspace actif est sélectionné par le frontend au moment du login
et passé comme paramètre au hook.
