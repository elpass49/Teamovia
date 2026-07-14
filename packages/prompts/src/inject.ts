import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function buildSystemPrompt(
  agentName: 'support' | 'sales',
  variables: Record<string, string | undefined>
): string {
  const filePath = join(__dirname, '..', '..', 'prompts', `agent-${agentName}.system.md`)
  const raw = readFileSync(filePath, 'utf-8')

  return raw
    .replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_: string, key: string, ifBlock: string, elseBlock: string) =>
        variables[key] ? ifBlock.trim() : elseBlock.trim()
    )
    .replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_: string, key: string, block: string) =>
        variables[key] ? block.trim() : ''
    )
    .replace(
      /\{\{(\w+)\}\}/g,
      (_: string, key: string) => variables[key] ?? ''
    )
}