-- ============================================================
-- Teamovia — Seed 001 : workspace de démonstration
-- Date     : 2026-07-12
-- Usage    : développement et tests locaux uniquement
--            NE PAS exécuter en production
--
-- Ce seed crée :
--   1. Un workspace "Menuiserie Dubois" (PME artisan — persona cible)
--   2. Deux utilisateurs (owner + viewer)
--   3. Un agent support + un agent ventes
--   4. Des chunks KB réalistes pour l'agent support
--   5. Des sessions et messages de démonstration
--   6. Des leads à différents stades de qualification
--   7. Un handoff support → ventes
--   8. Des logs d'activité
-- ============================================================

BEGIN;

-- ============================================================
-- IDs fixes pour les tests reproductibles
-- ============================================================

DO $$
BEGIN
  -- Workspace
  INSERT INTO workspaces (id, name, slug, plan, escalation_config)
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Menuiserie Dubois',
    'menuiserie-dubois',
    'pro',
    '{"email": "contact@menuiserie-dubois.fr", "team_name": "Équipe Dubois"}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── Utilisateurs ────────────────────────────────────────
  -- Note : auth.users est géré par Supabase Auth.
  -- En dev local, créer les comptes via `supabase auth admin create-user`
  -- puis lancer ce seed. Les UUIDs doivent correspondre.

  INSERT INTO users (id, email, full_name)
  VALUES
    ('00000000-0000-0000-0000-000000000010', 'pierre@menuiserie-dubois.fr', 'Pierre Dubois'),
    ('00000000-0000-0000-0000-000000000011', 'marie@menuiserie-dubois.fr',  'Marie Dubois')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO workspace_users (workspace_id, user_id, role)
  VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'owner'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'viewer')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- ── Subscription ─────────────────────────────────────────
  INSERT INTO subscriptions (
    workspace_id, plan, status,
    quota_messages, quota_leads, quota_members,
    usage_messages, usage_leads,
    current_period_start, current_period_end
  )
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'pro', 'active',
    5000, 500, 10,
    47, 8,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month'
  )
  ON CONFLICT (workspace_id) DO NOTHING;

  -- ── Agents ───────────────────────────────────────────────
  INSERT INTO agents (id, workspace_id, type, name, config)
  VALUES
    (
      '00000000-0000-0000-0000-000000000020',
      '00000000-0000-0000-0000-000000000001',
      'support',
      'Assistant Support Dubois',
      '{
        "escalation_rules": {
          "keywords": ["remboursement", "litige", "avocat", "plainte"],
          "max_turns_before_escalate": 8
        },
        "handoff_rules": {
          "sales_intent_keywords": ["devis", "prix", "commande", "projet", "réaliser"]
        }
      }'::jsonb
    ),
    (
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000001',
      'sales',
      'Assistant Commercial Dubois',
      '{
        "scoring_thresholds": {
          "hot": 75,
          "warm": 50,
          "cold": 25
        },
        "crm_mapping": {
          "provider": "airtable",
          "table": "Leads",
          "fields": {
            "email": "Email",
            "name": "Nom",
            "company": "Entreprise",
            "score": "Score",
            "status": "Statut"
          }
        }
      }'::jsonb
    )
  ON CONFLICT (id) DO NOTHING;

END;
$$;


-- ============================================================
-- BASE DE CONNAISSANCES — Agent Support
-- Chunks réalistes pour une menuiserie artisanale
-- Les embeddings sont null en seed (générés par le backend à l'ingestion)
-- ============================================================

INSERT INTO knowledge_chunks (id, workspace_id, agent_id, content, source, source_ref, metadata)
VALUES

  -- Chunk partagé (agent_id null = accessible aux deux agents)
  (
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'Menuiserie Dubois est une entreprise artisanale fondée en 1987 par Pierre Dubois père. '
    'Nous fabriquons et posons des menuiseries sur mesure : fenêtres, portes, escaliers, '
    'cuisines et dressings. Nos ateliers sont situés à Lyon (69). '
    'Contact général : contact@menuiserie-dubois.fr — 04 72 XX XX XX.',
    'manual',
    'fiche-entreprise',
    '{"category": "presentation", "priority": "high"}'::jsonb
  ),

  -- Chunks propres à l'agent support
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    'Délais de livraison standard : les menuiseries sur mesure sont fabriquées en 4 à 6 semaines '
    'à compter de la validation du bon de commande signé et du versement de l''acompte (30%). '
    'La pose est planifiée dans les 2 semaines suivant la livraison des éléments en atelier.',
    'manual',
    'faq-delais',
    '{"category": "delais", "priority": "high"}'::jsonb
  ),

  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    'Garanties : toutes nos réalisations sont couvertes par une garantie décennale (assurance RCD). '
    'La garantie biennale couvre les équipements dissociables (quincaillerie, joints, vitrages). '
    'En cas de problème, contacter directement notre SAV à sav@menuiserie-dubois.fr ou au 04 72 XX XX XX. '
    'Nous intervenons sous 5 jours ouvrés pour un diagnostic.',
    'manual',
    'faq-garanties',
    '{"category": "garanties", "priority": "high"}'::jsonb
  ),

  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    'Modalités de paiement : acompte de 30% à la commande, 40% à la livraison en atelier, '
    'solde de 30% à la fin de la pose. Nous acceptons les virements bancaires et les chèques. '
    'Aucun paiement en espèces au-delà de 1 000€ (réglementation en vigueur). '
    'Les devis sont gratuits et valables 30 jours.',
    'manual',
    'faq-paiement',
    '{"category": "paiement", "priority": "medium"}'::jsonb
  ),

  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    'Entretien des menuiseries bois : appliquer une lasure ou une peinture adaptée tous les 3 à 5 ans '
    'selon l''exposition. Nettoyer les joints périodiquement avec un produit non abrasif. '
    'Pour les fenêtres à double vitrage, ne jamais percer ou découper le vitrage. '
    'En cas de condensation entre les vitrages, le joint de périmètre est hors garantie mais '
    'nous proposons un remplacement du vitrage à tarif préférentiel.',
    'manual',
    'faq-entretien',
    '{"category": "entretien", "priority": "medium"}'::jsonb
  ),

  (
    '00000000-0000-0000-0000-000000000105',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    'Processus de commande en 5 étapes : '
    '1. Prise de contact et description du projet (téléphone ou formulaire en ligne). '
    '2. Visite technique gratuite sur site pour prise de mesures. '
    '3. Remise du devis détaillé sous 5 jours ouvrés. '
    '4. Signature du bon de commande + versement de l''acompte. '
    '5. Fabrication, livraison et pose par nos équipes.',
    'manual',
    'processus-commande',
    '{"category": "processus", "priority": "high"}'::jsonb
  )

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- MÉMOIRE AGENT — données de démonstration
-- ============================================================

INSERT INTO agent_memory (id, workspace_id, agent_id, user_ref, facts, preferences, last_seen)
VALUES (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  'client@example.com',
  '{
    "name": "Sophie Martin",
    "project": "Remplacement de 3 fenêtres en bois double vitrage",
    "address": "Lyon 3ème",
    "previous_issues": ["délai repoussé une fois en janvier 2026"]
  }'::jsonb,
  '{
    "language": "fr",
    "preferred_channel": "chat",
    "tone_preference": "formal"
  }'::jsonb,
  now() - interval '3 days'
)
ON CONFLICT (workspace_id, agent_id, user_ref) DO NOTHING;


-- ============================================================
-- SESSIONS ET MESSAGES — Agent Support
-- Simulation de deux conversations réalistes
-- ============================================================

-- ── Session 1 : question simple résolue ──────────────────

INSERT INTO sessions (id, workspace_id, agent_id, user_ref, channel, status, session_context)
VALUES (
  '00000000-0000-0000-0000-000000000300',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  'client@example.com',
  'chat',
  'resolved',
  '{"resolved_reason": "question délais répondue"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, session_id, role, content, tokens_used, latency_ms, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000310',
    '00000000-0000-0000-0000-000000000300',
    'user',
    'Bonjour, j''ai passé commande il y a 2 semaines pour 3 fenêtres. Quel est le délai prévu ?',
    NULL, NULL,
    now() - interval '3 days'
  ),
  (
    '00000000-0000-0000-0000-000000000311',
    '00000000-0000-0000-0000-000000000300',
    'assistant',
    'Bonjour, je vous réponds au nom de Menuiserie Dubois. '
    'Nos menuiseries sur mesure sont fabriquées en 4 à 6 semaines à compter de la validation '
    'de votre bon de commande et du versement de l''acompte. '
    'Si votre commande a été confirmée il y a 2 semaines, vous devriez recevoir '
    'une mise à jour de notre équipe dans les prochains jours. '
    'Souhaitez-vous que je signale votre demande à notre atelier pour un point précis ?',
    312, 1840,
    now() - interval '3 days' + interval '5 seconds'
  ),
  (
    '00000000-0000-0000-0000-000000000312',
    '00000000-0000-0000-0000-000000000300',
    'user',
    'Non merci, c''est suffisant. Merci pour la réponse rapide.',
    NULL, NULL,
    now() - interval '3 days' + interval '90 seconds'
  ),
  (
    '00000000-0000-0000-0000-000000000313',
    '00000000-0000-0000-0000-000000000300',
    'assistant',
    'Avec plaisir ! N''hésitez pas à revenir si vous avez d''autres questions. Bonne journée.',
    89, 980,
    now() - interval '3 days' + interval '92 seconds'
  )
ON CONFLICT (id) DO NOTHING;


-- ── Session 2 : détection d'intention commerciale → handoff ─

INSERT INTO sessions (id, workspace_id, agent_id, user_ref, channel, status, shared_context)
VALUES (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  'nouveau@prospect.fr',
  'chat',
  'transferred',
  '{
    "handoff_reason": "sales_intent",
    "summary": "Prospect intéressé par un escalier sur mesure pour une maison en rénovation. Budget non précisé. Projet pour fin 2026.",
    "user_data": {
      "email": "nouveau@prospect.fr",
      "project": "Escalier sur mesure chêne massif",
      "timeline": "fin 2026"
    }
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, session_id, role, content, tokens_used, latency_ms, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000320',
    '00000000-0000-0000-0000-000000000301',
    'user',
    'Bonjour, je cherche à faire réaliser un escalier en chêne massif pour ma maison. '
    'Vous faites ça ?',
    NULL, NULL,
    now() - interval '1 day'
  ),
  (
    '00000000-0000-0000-0000-000000000321',
    '00000000-0000-0000-0000-000000000301',
    'assistant',
    'Bonjour, je vous réponds au nom de Menuiserie Dubois. '
    'Oui, nous réalisons des escaliers sur mesure en bois massif, dont le chêne. '
    'Chaque escalier est fabriqué et posé par nos équipes selon vos plans et contraintes. '
    'Votre demande concerne l''aspect commercial de notre offre — je la transmets '
    'à l''équipe en charge des projets, qui reviendra vers vous rapidement pour '
    'organiser une visite technique et vous établir un devis.',
    445, 2100,
    now() - interval '1 day' + interval '4 seconds'
  )
ON CONFLICT (id) DO NOTHING;


-- ── Ticket d'escalade ─────────────────────────────────────

INSERT INTO support_tickets (id, workspace_id, session_id, status, priority, title)
VALUES (
  '00000000-0000-0000-0000-000000000400',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000300',
  'closed',
  'normal',
  'Question délai commande — client Sophie Martin'
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- HANDOFF support → ventes
-- ============================================================

INSERT INTO handoffs (
  id, workspace_id,
  source_session_id, source_agent_id,
  target_agent, target_agent_id,
  lead_id,
  status, reason, context, completed_at
)
VALUES (
  '00000000-0000-0000-0000-000000000500',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000020',
  'sales',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000601', -- lead créé ci-dessous
  'completed',
  'sales_intent — mot-clé détecté : "réaliser"',
  '{
    "summary": "Prospect intéressé par un escalier chêne massif sur mesure. Projet fin 2026.",
    "intent": "devis_escalier",
    "user_data": {
      "email": "nouveau@prospect.fr",
      "project": "Escalier sur mesure chêne massif",
      "timeline": "fin 2026"
    }
  }'::jsonb,
  now() - interval '23 hours'
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- LEADS — Agent Ventes
-- Trois leads à différents stades
-- ============================================================

INSERT INTO leads (
  id, workspace_id, session_id,
  email, name, company,
  source, status, score, score_data, data,
  assigned_to, qualified_at
)
VALUES

  -- Lead chaud issu du handoff support
  (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000301',
    'nouveau@prospect.fr',
    'Thomas Renard',
    NULL,
    'handoff',
    'qualifying',
    NULL,
    '{}'::jsonb,
    '{
      "project": "Escalier sur mesure chêne massif",
      "timeline": "fin 2026",
      "location": "Lyon"
    }'::jsonb,
    '00000000-0000-0000-0000-000000000010',
    NULL
  ),

  -- Lead qualifié depuis formulaire
  (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'agence@constructionrobert.fr',
    'Laurent Robert',
    'Construction Robert',
    'form',
    'qualified',
    82,
    '{
      "score": 82,
      "confidence": "high",
      "dimensions": {
        "besoin": 22,
        "budget": 20,
        "delai": 20,
        "decisionnaire": 20
      },
      "reasons": [
        "Besoin clairement identifié : 8 fenêtres PVC pour programme immobilier",
        "Budget confirmé : enveloppe de 12 000€",
        "Délai contraint : livraison avant septembre 2026",
        "Décisionnaire : gérant de la société"
      ],
      "disqualifiers": [],
      "recommended_action": "qualify",
      "next_step": "Planifier visite technique sur le chantier"
    }'::jsonb,
    '{
      "project": "8 fenêtres PVC double vitrage pour programme de 4 logements",
      "budget": "12000",
      "timeline": "avant septembre 2026",
      "address": "Villeurbanne 69"
    }'::jsonb,
    '00000000-0000-0000-0000-000000000010',
    now() - interval '2 days'
  ),

  -- Lead froid, projet trop lointain
  (
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'particulier@email.com',
    'Isabelle Morin',
    NULL,
    'form',
    'lost',
    18,
    '{
      "score": 18,
      "confidence": "medium",
      "dimensions": {
        "besoin": 8,
        "budget": 4,
        "delai": 4,
        "decisionnaire": 2
      },
      "reasons": [
        "Besoin vague : remplacement de fenêtres non daté",
        "Budget non défini"
      ],
      "disqualifiers": [
        "Projet exploratoire sans décision prévue avant 2027",
        "Interlocutrice ne prend pas la décision seule (co-propriétaire)"
      ],
      "recommended_action": "disqualify",
      "next_step": "Aucune relance — recontacter si le projet se concrétise"
    }'::jsonb,
    '{
      "project": "Peut-être remplacer une porte d''entrée",
      "timeline": "pas avant 2027"
    }'::jsonb,
    NULL,
    NULL
  )

ON CONFLICT (id) DO NOTHING;


-- ── Messages de qualification du lead chaud ───────────────

INSERT INTO lead_messages (id, lead_id, role, content, tokens_used, latency_ms, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000610',
    '00000000-0000-0000-0000-000000000601',
    'assistant',
    'Bonjour Thomas, votre demande a été transmise à l''équipe en charge des projets. '
    'Je vais vous poser quelques questions pour voir ce qui vous conviendrait le mieux. '
    'Pouvez-vous me décrire le projet d''escalier que vous envisagez ? '
    '(dimensions approximatives, étages, style souhaité)',
    298, 1650,
    now() - interval '23 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000611',
    '00000000-0000-0000-0000-000000000601',
    'user',
    'Oui, c''est pour une maison de 2 étages en cours de rénovation à Lyon. '
    'Je veux un escalier quart tournant en chêne massif avec une rampe en fer forgé. '
    'Le projet est prévu pour fin 2026.',
    NULL, NULL,
    now() - interval '22 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000612',
    '00000000-0000-0000-0000-000000000601',
    'assistant',
    'Merci pour ces précisions. Un escalier quart tournant en chêne massif avec '
    'rampe en fer forgé, c''est tout à fait dans notre domaine. '
    'Avez-vous une idée de l''enveloppe budgétaire que vous souhaitez allouer à ce projet ?',
    187, 1420,
    now() - interval '22 hours' + interval '3 seconds'
  )
ON CONFLICT (id) DO NOTHING;


-- ── CRM sync log ─────────────────────────────────────────

INSERT INTO crm_sync_log (
  id, workspace_id, lead_id, provider,
  crm_id, status,
  request_payload, response_payload
)
VALUES (
  '00000000-0000-0000-0000-000000000700',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000602',
  'airtable',
  'recABC123XYZ',
  'success',
  '{
    "table": "Leads",
    "fields": {
      "Nom": "Laurent Robert",
      "Email": "agence@constructionrobert.fr",
      "Entreprise": "Construction Robert",
      "Score": 82,
      "Statut": "Qualifié"
    }
  }'::jsonb,
  '{"id": "recABC123XYZ", "createdTime": "2026-07-10T08:30:00Z"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- TÂCHES ET APPROBATIONS
-- ============================================================

INSERT INTO tasks (
  id, workspace_id, agent_id, lead_id,
  title, description, status, priority, assignee_id, due_at
)
VALUES (
  '00000000-0000-0000-0000-000000000800',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000601',
  'Planifier visite technique — Thomas Renard',
  'Lead chaud — escalier chêne massif. Contacter pour fixer RDV visite technique.',
  'pending',
  'high',
  '00000000-0000-0000-0000-000000000010',
  now() + interval '2 days'
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- LOGS D'ACTIVITÉ
-- ============================================================

INSERT INTO agent_logs (
  id, workspace_id, agent_id, session_id, lead_id,
  event_type, payload, latency_ms, tokens_used, model_used
)
VALUES
  (
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000300',
    NULL,
    'message_in',
    '{"content_length": 80, "channel": "chat"}'::jsonb,
    NULL, NULL, NULL
  ),
  (
    '00000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000300',
    NULL,
    'message_out',
    '{"kb_chunks_used": 1, "action_triggered": null}'::jsonb,
    1840, 312, 'claude-sonnet-4-6'
  ),
  (
    '00000000-0000-0000-0000-000000000903',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000301',
    NULL,
    'handoff',
    '{"target": "sales", "reason": "sales_intent", "lead_created": true}'::jsonb,
    NULL, NULL, NULL
  ),
  (
    '00000000-0000-0000-0000-000000000904',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000021',
    NULL,
    '00000000-0000-0000-0000-000000000601',
    'message_out',
    '{"kb_chunks_used": 0, "score_updated": false}'::jsonb,
    1650, 298, 'claude-sonnet-4-6'
  ),
  (
    '00000000-0000-0000-0000-000000000905',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000021',
    NULL,
    '00000000-0000-0000-0000-000000000602',
    'crm_sync',
    '{"provider": "airtable", "crm_id": "recABC123XYZ", "status": "success"}'::jsonb,
    320, NULL, NULL
  )
ON CONFLICT (id) DO NOTHING;


COMMIT;

-- Vérification post-seed
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM workspaces)     >= 1, 'workspaces vide';
  ASSERT (SELECT count(*) FROM agents)         >= 2, 'agents manquants';
  ASSERT (SELECT count(*) FROM knowledge_chunks) >= 6, 'chunks KB manquants';
  ASSERT (SELECT count(*) FROM sessions)       >= 2, 'sessions manquantes';
  ASSERT (SELECT count(*) FROM leads)          >= 3, 'leads manquants';
  ASSERT (SELECT count(*) FROM handoffs)       >= 1, 'handoffs manquants';
  RAISE NOTICE '✓ Seed 001 vérifié — workspace Menuiserie Dubois prêt';
END;
$$;
