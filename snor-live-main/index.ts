import { config } from 'dotenv';
import { streamText } from 'ai';

config({ path: '.env.local' });

const apiKey = process.env.AI_GATEWAY_API_KEY;

if (!apiKey) {
  throw new Error('Missing AI_GATEWAY_API_KEY in .env.local');
}

const result = streamText({
  model: 'openai/gpt-5.4',
  prompt: 'Reply with a short confirmation that the Vercel AI Gateway is working.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

const usage = await result.usage;
console.log('\n\nToken usage:');
console.log(JSON.stringify(usage, null, 2));
