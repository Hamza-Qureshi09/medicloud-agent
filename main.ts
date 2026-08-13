
import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { MachineManager } from "@mediCloud/sdk/manager";
import { onSigInt, onSigTerm } from "./helpers.ts";


const HTTP_ENABLED = Deno.env.get("MEDICLOUD_MACHINES_HTTP_ENABLED") === "true"

const HTTP_HOST = Deno.env.get("MEDICLOUD_MACHINES_HTTP_HOST") ?? "0.0.0.0";

const HTTP_PORT = Number(
  Deno.env.get("MEDICLOUD_MACHINES_HTTP_PORT") ?? 5001,
);

const DB_PATH = Deno.env.get("MEDICLOUD_MACHINES_DB_PATH");

const manager = new MachineManager({
  // http: {
  //   enabled: Boolean(HTTP_ENABLED),
  //   host: HTTP_HOST,
  //   port: Number(HTTP_PORT),
  // },
  dbPath: DB_PATH,
});
const handler = await manager.getHandler();

// // 1st way using deno 
// Deno.serve(
//   {
//     hostname: HTTP_HOST,
//     port: HTTP_PORT,
//     onListen: ({ hostname, port }) => {
//       console.info(
//         `HTTP server listening on http://${hostname}:${port}`,
//       );
//     },
//   },
//   handler,
// );


// 2nd way using hono
const app = new Hono();

// console.log(await Deno.stat("./dashboard/dist/index.html"));
app.get("/healthy", (c) => {
  return c.json({
    status: "ok",
  });
});

// Serve files under frontend/build (React dashboard)
app.use(
  "/dashboard/*",
  serveStatic({
    root: "./frontend/build",
    rewriteRequestPath: (path) =>
      path.replace(/^\/dashboard/, ""),
  }),
);

// React SPA fallback
app.get("/dashboard", (c, next) =>
  serveStatic({
    path: "./frontend/build/index.html",
  })(c, next)
);

// React Router fallback for nested dashboard URLs.
app.get("/dashboard/*", (c, next) =>
  serveStatic({
    path: "./frontend/build/index.html",
  })(c, next)
);


// Machine SDK
app.all("*", async (c) => {
  return await handler(c.req.raw);
});

Deno.serve(
  {
    hostname: HTTP_HOST,
    port: HTTP_PORT,
    onListen: ({ hostname, port }) => {
      console.info(
        `HTTP server listening on http://${hostname}:${port}`,
      );
    },
  },
  app.fetch,
);


async function gracefulShutdown(signal: "SIGINT" | "SIGTERM") {
  try {
    await manager.shutdown();

    if (signal === "SIGINT") {
      onSigInt();
    } else {
      onSigTerm();
    }

    Deno.exit(0);
  } catch (err) {
    console.error("Shutdown failed:", err);
    Deno.exit(1);
  }
}

Deno.addSignalListener("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
}
