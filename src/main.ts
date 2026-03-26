import { createServer } from "./server/createServer.js";

const app = createServer();
const port = Number(process.env.PORT ?? 3010);

app.listen({ host: "127.0.0.1", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
