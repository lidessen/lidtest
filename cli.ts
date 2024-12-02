import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Browser, chromium, Page } from "playwright";
import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import os from "os";
import { TestStatus } from "./src/constants";
import pc from "picocolors";
import { WSContext } from "hono/ws";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/", (c) => c.text("Pong!"));

app.get(
  "/run",
  upgradeWebSocket(async () => {
    const store = new WeakMap<
      WSContext<unknown>,
      {
        browser: Browser | null;
        page: Page | null;
        pages: {
          [key: string]: Page;
        };
      }
    >();

    return {
      async onOpen(_, ws) {
        ws.send(JSON.stringify({ message: "Hello from server!" }));
        store.set(ws, {
          browser: null,
          page: null,
          pages: {},
        });
      },
      async onMessage(event, ws) {
        let data: any = null;
        if (typeof event.data === "string") {
          data = JSON.parse(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          data = JSON.parse(new TextDecoder().decode(event.data));
        } else if (event.data instanceof Blob) {
          data = await event.data.text();
        } else {
          throw new Error("Invalid event data");
        }

        const context = store.get(ws)!;

        if (!context) {
          throw new Error("No context found");
        }

        if (!context.browser) {
          context.browser = await chromium.launch({
            headless: false,
          });
        }

        if (!context.page) {
          context.page = await context.browser.newPage();
          context.pages.default = context.page;
        }

        const fileName = nanoid();
        const tempDir = path.join(os.tmpdir(), "richest");
        fs.mkdirSync(tempDir, { recursive: true });
        const tempFilePath = path.join(tempDir, `${fileName}.mjs`);
        fs.writeFileSync(tempFilePath, data.code);
        const runTest = await import(tempFilePath).then(
          (m) => m[data.func || "default"]
        );
        try {
          await runTest({ ...context, expect });
          console.log(pc.green(`✓ Test ${data.id} passed`));
          ws.send(
            JSON.stringify({
              type: "test_result",
              status: TestStatus.Passed,
              testId: data.id,
            })
          );
        } catch (error) {
          console.error(
            pc.red(`✗ Test ${data.id} failed:`),
            pc.red(String(error))
          );
          ws.send(
            JSON.stringify({
              type: "test_result",
              status: TestStatus.Failed,
              testId: data.id,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        } finally {
          fs.unlinkSync(tempFilePath);
        }
      },
      onClose: (_, ws) => {
        const context = store.get(ws)!;
        context.browser?.close();
      },
    };
  })
);

const port = process.env.PORT ? parseInt(process.env.PORT) : 5003;

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(pc.cyan(`🚀 Server is running on port ${pc.bold(info.port)}`));
  }
);
injectWebSocket(server);
