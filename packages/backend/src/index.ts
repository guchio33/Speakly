import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = new Hono();

// レート制限の設定 (Gemini無料枠: 15 RPM)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS_PER_WINDOW = 10; // 1分あたり10リクエストまで（余裕を持たせる）
const MAX_MESSAGE_LENGTH = 1000; // 最大1000文字

const requestCounts = new Map<string, { count: number; resetTime: number }>();

const getRateLimitInfo = (ip: string) => {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    return { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }

  return record;
};

const incrementRequestCount = (ip: string) => {
  const info = getRateLimitInfo(ip);
  requestCounts.set(ip, {
    count: info.count + 1,
    resetTime: info.resetTime,
  });
  return info.count + 1;
};

app.use(
  "*",
  cors({
    origin: "http://localhost:5173",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("ERROR: GEMINI_API_KEY is not set");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction:
    "You are a helpful English conversation partner. Help the user practice English conversation. Keep your responses concise and natural. Respond in English.",
});

app.get("/", (c) => {
  return c.json({ message: "Speakly API" });
});

// チャットエンドポイント
app.post("/api/chat", async (c) => {
  try {
    // レート制限チェック
    const ip = c.req.header("x-forwarded-for") || "unknown";
    const currentCount = incrementRequestCount(ip);

    if (currentCount > MAX_REQUESTS_PER_WINDOW) {
      return c.json(
        { error: "Too many requests. Please try again later." },
        429
      );
    }

    const { message } = await c.req.json<{ message: string }>();

    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }

    // 入力長の制限
    if (message.length > MAX_MESSAGE_LENGTH) {
      return c.json(
        {
          error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`,
        },
        400
      );
    }

    const result = await model.generateContent(message);
    const reply = result.response.text();

    return c.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    return c.json({ error: "Failed to process chat" }, 500);
  }
});

const port = 3001;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
