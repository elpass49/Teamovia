export async function triggerN8nWebhook(
  workflowName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const baseUrl = process.env.N8N_BASE_URL
  const secret  = process.env.N8N_WEBHOOK_SECRET

  if (!baseUrl) {
    console.warn(`[n8n] N8N_BASE_URL non configuré — webhook '${workflowName}' ignoré`)
    return
  }

  try {
    const res = await fetch(`${baseUrl}/webhook/${workflowName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret ?? '',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn(`[n8n] Webhook '${workflowName}' failed: ${res.status}`)
    }
  } catch (err) {
    console.warn(`[n8n] Webhook '${workflowName}' exception:`, err)
  }
}
