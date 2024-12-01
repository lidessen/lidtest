import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Browser, chromium } from "playwright";
import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import os from "os";
import { TestStatus } from "./src/constants";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/", (c) => c.text("Pong!"));

app.get(
  "/run",
  upgradeWebSocket(async () => {
    let browser: Browser | null = null;

    return {
      async onOpen(_, ws) {
        ws.send(JSON.stringify({ message: "Hello from server!" }));
      },
      async onMessage(event, ws) {
        let data: any = null;
        console.log(event.data);
        if (typeof event.data === "string") {
          data = JSON.parse(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          data = JSON.parse(new TextDecoder().decode(event.data));
        } else if (event.data instanceof Blob) {
          data = await event.data.text();
        } else {
          throw new Error("Invalid event data");
        }

        if (!browser) {
          browser = await chromium.launch({
            headless: false,
          });
        }

        const page = await browser.newPage();

        const fileName = nanoid();
        const tempDir = path.join(os.tmpdir(), "richest");
        fs.mkdirSync(tempDir, { recursive: true });
        const tempFilePath = path.join(tempDir, `${fileName}.mjs`);
        fs.writeFileSync(tempFilePath, data.code);
        const runTest = await import(tempFilePath).then(
          (m) => m[data.func || "default"]
        );
        try {
          await runTest({ page, expect });
          ws.send(
            JSON.stringify({
              type: "test_result",
              status: TestStatus.Passed,
              testId: data.id,
            })
          );
        } catch (error) {
          console.error(error);
          ws.send(
            JSON.stringify({
              type: "test_result",
              status: TestStatus.Failed,
              testId: data.id,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        } finally {
          await page.close();
          fs.unlinkSync(tempFilePath);
        }
      },
      onClose: () => {
        browser?.close();
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
    console.log(`Server is running on port ${info.port}`);
  }
);
injectWebSocket(server);
