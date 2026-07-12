# Workflows n8n — Teamovia Phase 1

## Import dans n8n

1. Ouvrir n8n > Workflows > Import
2. Sélectionner le fichier `.json` correspondant
3. Configurer les credentials (voir ci-dessous)
4. Activer le workflow

## Workflows disponibles

### `support-notify-operator.json`
**Déclenché par** : `triggerN8nWebhook('support-notify-operator', payload)` depuis le backend

**Payload attendu** :
```json
{
  "event":            "message_in | escalation",
  "session_id":       "uuid",
  "workspace_id":     "uuid",
  "workspace_name":   "Menuiserie Dubois",
  "user_ref":         "client@example.com",
  "channel":          "chat",
  "message_preview":  "Les 50 premiers caractères du message...",
  "priority":         "normal | high | urgent"
}
```

**Ce qu'il fait** :
1. Vérifie le secret webhook (`x-webhook-secret`)
2. Normalise le payload
3. Route selon le type d'event :
   - `escalation` → email rouge prioritaire
   - autre → email bleu notification standard
4. Répond 200 OK au backend

**Variables d'environnement n8n à configurer** :
```
TEAMOVIA_WEBHOOK_SECRET   → même valeur que N8N_WEBHOOK_SECRET dans .env
OPERATOR_EMAIL            → email de l'opérateur à notifier
```

**Credential SMTP à créer** :
- Nom : `SMTP Teamovia`
- Type : SMTP
- Configurer selon votre provider (SendGrid, Brevo, Gmail SMTP...)

## Tester le webhook en local

```bash
curl -X POST http://localhost:5678/webhook/support-notify-operator \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: votre-secret" \
  -d '{
    "event": "message_in",
    "session_id": "00000000-0000-0000-0000-000000000300",
    "workspace_id": "00000000-0000-0000-0000-000000000001",
    "workspace_name": "Menuiserie Dubois",
    "user_ref": "client@example.com",
    "channel": "chat",
    "message_preview": "Bonjour, j'\''ai une question sur ma commande.",
    "priority": "normal"
  }'
```

Résultat attendu : `{ "status": "ok", "notified": true }`
