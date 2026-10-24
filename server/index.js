import { createCosmosServer } from './app.js';
const app = createCosmosServer();
const portFlag = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portFlag >= 0 ? process.argv[portFlag + 1] : 3000));
app.server.listen(port, '0.0.0.0', () => console.log(`Pocket Cosmos listening on ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });
