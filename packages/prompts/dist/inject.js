import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
export function buildSystemPrompt(agentName, variables) {
    const filePath = join(__dirname, '..', '..', 'prompts', `agent-${agentName}.system.md`);
    const raw = readFileSync(filePath, 'utf-8');
    return raw
        .replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, ifBlock, elseBlock) => variables[key] ? ifBlock.trim() : elseBlock.trim())
        .replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => variables[key] ? block.trim() : '')
        .replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}
//# sourceMappingURL=inject.js.map