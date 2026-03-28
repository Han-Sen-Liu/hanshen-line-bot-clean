const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

// ===== 檔案初始化 =====
const DATA_FILE = "./data.json";
const USERS_FILE = "./users.json";
const USAGE_FILE = "./usage.json";
const CODES_FILE = "./codes.json";

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
}

ensureFile(DATA_FILE, {});
ensureFile(USERS_FILE, {});
ensureFile(USAGE_FILE, {});
ensureFile(CODES_FILE, {
  TEST100: 100,
  A1B2C3: 30,
  D4E5F6: 30,
  G7H8I9: 80,
  J1K2L3: 80
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

const data = readJson(DATA_FILE);
let users = readJson(USERS_FILE);
let userUsage = readJson(USAGE_FILE);
let redeemCodes = readJson(CODES_FILE);

// ===== 基本設定 =====
const FREE_TIMES = 3;
const PURCHASE_LINK = "YOUR_VOCUS_LINK";

const quotes = [
  "局未明，不動就是贏",
  "穩一分，勝過衝三步",
  "看懂局，比拼命更重要",
  "人亂，局就亂",
  "慢，是另一種快",
  "不出錯，就是優勢",
  "撐住現在，才有翻盤",
  "方向錯，努力都白費",
  "能忍的人，走得遠",
  "急，是最大的風險",
  "不確定，就不要下注",
  "看清楚，再出手",
  "局勢比情緒重要",
  "人穩，運就穩",
  "不貪，才走得久",
  "有退路，才敢進攻",
  "先活下來，再談贏",
  "選對，比努力重要",
  "不亂動，就是掌控",
  "時機對，事就成"
];

// ===== 工具函式 =====
function getUserRecord(userId) {
  if (!userUsage[userId]) {
    userUsage[userId] = {
      freeUsed: 0,
      paidRemaining: 0
    };
    writeJson(USAGE_FILE, userUsage);
  }
  return userUsage[userId];
}

function getRemaining(userId) {
  const user = getUserRecord(userId);
  return Math.max(0, (FREE_TIMES - user.freeUsed)) + user.paidRemaining;
}

function hasQuota(userId) {
  return getRemaining(userId) > 0;
}

function useOneQuota(userId) {
  const user = getUserRecord(userId);

  if (user.paidRemaining > 0) {
    user.paidRemaining -= 1;
  } else if (user.freeUsed < FREE_TIMES) {
    user.freeUsed += 1;
  }

  writeJson(USAGE_FILE, userUsage);
}

function addPaidUsage(userId, count) {
  const user = getUserRecord(userId);
  user.paidRemaining += count;
  writeJson(USAGE_FILE, userUsage);
}

async function replyMessage(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [{ type: "text", text }]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: Bearer ${process.env.CHANNEL_ACCESS_TOKEN}
      }
    }
  );
}

function buildKnowledgeText() {
  return Object.entries(data)
    .map(([group, items]) => {
      const body = Object.entries(items)
        .map(([k, v]) => `- ${k}：${v}`)
        .join("\n");
      return `${group}：\n${body}`;
    })
    .join("\n\n");
}

function buildUsageGuide() {
  return `【使用方式】
1. 點「軍師判斷」
2. 輸入你的問題
3. （可選）加上生辰八字
4. 系統回覆：判斷／原因／建議

【免費次數】
新用戶享有 3 次免費

【收費方案】
30次：88元
80次：168元

【購買方式】
1. 點擊購買：
${PURCHASE_LINK}
2. 取得啟用碼
3. 回來輸入啟用碼開通

【注意】
- 每問一次扣1次
- 次數用完需重新購買
- 啟用碼限使用一次`;
}

function buildPricingText() {
  return `【收費方案】
30次：88元
80次：168元

【購買連結】
${PURCHASE_LINK}

【開通方式】
付款後取得啟用碼
回到 LINE 直接輸入啟用碼即可開通`;
}

function buildContactText() {
  return `【聯絡軍師】
合作、客製、問題回報
請直接留言你的需求

若需購買方案：
${PURCHASE_LINK}`;
}

function buildAskPrompt(userId) {
  const birth = users[userId]?.birth || "尚未提供";
  const remaining = getRemaining(userId);

  return `請直接輸入你的問題

你目前生辰資料：
${birth}

剩餘次數：${remaining}`;
}

// ===== Webhook =====
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;
      if (!event.source || event.source.type !== "user") continue;

      const userId = event.source.userId;
      const replyToken = event.replyToken;
      const userText = event.message.text.trim();

      // 建立使用者資料
      getUserRecord(userId);

      // ===== 1. 記錄生辰 =====
      if (userText.includes("生日") || userText.includes("生辰八字") || userText.includes("生辰")) {
        users[userId] = {
          ...(users[userId] || {}),
          birth: userText
        };
        writeJson(USERS_FILE, users);

        await replyMessage(
          replyToken,
          主公生辰已記錄\n\n目前資料：${userText}
        );
        continue;
      }

      // ===== 2. Rich Menu 文字分流 =====
      if (userText === "軍師判斷") {
        await replyMessage(replyToken, buildAskPrompt(userId));
        continue;
      }

      if (userText === "收費方案") {
        await replyMessage(replyToken, buildPricingText());
        continue;
      }

      if (userText === "使用說明") {
        await replyMessage(replyToken, buildUsageGuide());
        continue;
      }

      if (userText === "聯絡軍師") {
        await replyMessage(replyToken, buildContactText());
        continue;
      }

      // ===== 3. 啟用碼兌換 =====
      if (redeemCodes[userText]) {
        const count = redeemCodes[userText];
        addPaidUsage(userId, count);
        delete redeemCodes[userText];
        writeJson(CODES_FILE, redeemCodes);

        await replyMessage(
          replyToken,
          開通成功，已增加 ${count} 次\n\n目前剩餘次數：${getRemaining(userId)}
        );
        continue;
      }

      // ===== 4. 次數不足 =====
      if (!hasQuota(userId)) {
        await replyMessage(
          replyToken,
          `已達使用上限

【收費方案】
30次：88元
80次：168元

【購買連結】
${PURCHASE_LINK}

付款後輸入啟用碼即可開通`
        );
        continue;
      }

      // ===== 5. 扣次數 =====
      useOneQuota(userId);

      // ===== 6. 組 AI Prompt =====
      const knowledge = buildKnowledgeText();
      const birth = users[userId]?.birth || "尚未提供";

      const aiRes = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是涵森軍師。
你的回答規則如下：

1. 一律使用繁體中文
2. 一律短句
3. 一律用以下格式輸出：
【判斷】
一句話直接結論

【原因】
最多3句白話理由

【建議】
給一個立即可做的具體行動

4. 不要安慰
5. 不要模糊
6. 不要長篇解釋
7. 不得省略三段格式`
            },
            {
              role: "user",
              content: `主公生辰：
${birth}

命理資料：
${knowledge}

使用者問題：
${userText}`
            }
          ],
          temperature: 0.7
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      const replyText =
        aiRes.data?.choices?.[0]?.message?.content || "【判斷】\n系統忙碌\n\n【原因】\n目前回應失敗\n\n【建議】\n請再發一次";

      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      const remaining = getRemaining(userId);

      const finalText = `${replyText}

【涵森軍師｜護身心法】
${randomQuote}

剩餘次數：${remaining}
購買連結：${PURCHASE_LINK}

——涵森軍師`;

      await replyMessage(replyToken, finalText);

      console.log("AI REPLY OK");
    }
  } catch (err) {
    console.log("AI REPLY ERROR");
    console.log(err.response?.data || err.message);
  }
});

app.get("/", (req, res) => {
  res.send("Hansen strategist bot is running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
