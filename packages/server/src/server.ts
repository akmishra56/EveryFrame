import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
