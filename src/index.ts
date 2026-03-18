import { createApp } from "./server/app.js";

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "127.0.0.1";

createApp(process.cwd()).listen(port, host, () => {
  console.log(`server listening on http://${host}:${port}`);
});
