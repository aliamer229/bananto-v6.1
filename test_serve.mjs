import { serve } from "srvx/node";
serve({ port: 3000, fetch: () => new Response("OK") });
