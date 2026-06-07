import { createServer } from './server';
const port = Number(process.env.PORT ?? 0);
const app = createServer();
const server = app.listen(port, () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') console.log(`PORT=${addr.port}`);
});
