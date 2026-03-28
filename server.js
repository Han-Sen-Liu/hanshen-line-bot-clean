const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_VERSION_V3");

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
const PURCHASE_LINK = "https://vocus.cc/salon/HansenWork?utm_source=LINE&utm_medium=social&utm_campaign=share";

// ===== 工具 =====
function getUserRecord(userId) {
  if (!userUsage[userId]) {
    userUsage[userId] = { freeUsed: 0, paidRemaining: 0 };
    writeJson(USAGE_FILE, userUsage);
  }
  return userUsage[userId];
}

function getRemaining(userId) {
  const u = getUserRecord(userId);
  return Math.max(0, FREE_TIMES - u.freeUsed) + u.paidRemaining;
}

function hasQuota(userId) {
  return getRemaining(userId) > 0;
}

function useOne(userId) {
  const u = getUserRecord(userId);
  if (u.paidRemaining > 0) u.paidRemaining--;
  else if (u.freeUsed < FREE_TIMES) u.freeUsed++;
  writeJson(USAGE_FILE, userUsage);
}

function addPaid(userId, count) {
  const u = getUserRecord(userId);
  u.paidRemaining += count;
  writeJson(USAGE_FILE, userUsage);
}

async function reply(token, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: token,
      messages: [{ type: "text", text }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ===== 強制繁體 =====
function toTraditional(text) {
  const map = {
    "师":"師","费":"費","联":"聯","络":"絡","说":"說","这":"這","个":"個",
    "会":"會","为":"為","开":"開","关":"關","应":"應","对":"對","问":"問",
    "题":"題","时":"時","间":"間","发":"發","现":"現","实":"實","后":"後"
  };
  return text.replace(/[\u4e00-\u9fa5]/g, c => map[c] || c);
}

// ===== 回覆模板 =====
function pricing() {
  return `【收費方案】
30次：88元
80次：168元

購買：
${PURCHASE_LINK}

付款後輸入啟用碼開通`;
}

function usage() {
  return `【使用方式】
點「軍師判斷」→ 輸入問題

免費：3次

收費：
30次：88
80次：168

購買：
${PURCHASE_LINK}`;
}

function contact() {
  return `【聯絡軍師】
合作 / 問題 / 客製
直接留言即可

購買：
${PURCHASE_LINK}`;
}

function ask(userId) {
  return `請輸入你的問題

剩餘次數：${getRemaining(userId)}`;
}

// ===== Webhook =====
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const events = req.body.events || [];

    for (const e of events) {
      if (e.type !== "message") continue;
      if (e.message.type !== "text") continue;

      const userId = e.source.userId;
      const token = e.replyToken;
      const text = e.message.text.trim();

      getUserRecord(userId);

      // 生辰
      if (text.includes("生辰")) {
        users[userId] = { birth: text };
        writeJson(USERS_FILE, users);
        await reply(token, "生辰已記錄");
        continue;
      }

      // 四按鈕
      if (text === "軍師判斷") {
        await reply(token, ask(userId));
        continue;
      }
      if (text === "收費方案") {
        await reply(token, pricing());
        continue;
      }
      if (text === "使用說明") {
        await reply(token, usage());
        continue;
      }
      if (text === "聯絡軍師") {
        await reply(token, contact());
        continue;
      }

      // 啟用碼
      if (redeemCodes[text]) {
        const c = redeemCodes[text];
        addPaid(userId, c);
        delete redeemCodes[text];
        writeJson(CODES_FILE, redeemCodes);
        await reply(token, `開通成功 +${c}\n剩餘：${getRemaining(userId)}`);
        continue;
      }

      // 沒次數
      if (!hasQuota(userId)) {
        await reply(token, pricing());
        continue;
      }

      // 扣次數
      useOne(userId);

      // AI
      const ai = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是涵森軍師。
格式固定：
【判斷】
【原因】
【建議】`
            },
            {
              role: "user",
              content: text
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`
          }
        }
      );

      let replyText =
        ai.data?.choices?.[0]?.message?.content || "系統忙碌";

      replyText = toTraditional(replyText);

      const final = `${replyText}

剩餘次數：${getRemaining(userId)}
購買：${PURCHASE_LINK}`;

      await reply(token, final);
    }
  } catch (err) {
    console.log(err.message);
  }
});

app.listen(3000, () => console.log("RUNNING"));
