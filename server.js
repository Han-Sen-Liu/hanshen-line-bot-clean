const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_VERSION_V5");

// ===== 檔案 =====
const USERS_FILE = "./users.json";
const USAGE_FILE = "./usage.json";
const CODES_FILE = "./codes.json";

function ensure(file, def) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(def, null, 2));
  }
}

ensure(USERS_FILE, {});
ensure(USAGE_FILE, {});
ensure(CODES_FILE, {
  TEST100: 100,
  A1B2C3: 30,
  D4E5F6: 30,
  G7H8I9: 80,
  J1K2L3: 80
});

function read(f) {
  return JSON.parse(fs.readFileSync(f));
}

function write(f, d) {
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
}

let users = read(USERS_FILE);
let usage = read(USAGE_FILE);
let codes = read(CODES_FILE);

// ===== 設定 =====
const FREE = 3;
const LINK = "https://vocus.cc/your-link";

// ===== 工具 =====
function getUser(id) {
  if (!usage[id]) {
    usage[id] = { free: 0, paid: 0 };
    write(USAGE_FILE, usage);
  }
  return usage[id];
}

function remaining(id) {
  const u = getUser(id);
  return Math.max(0, FREE - u.free) + u.paid;
}

function hasQuota(id) {
  return remaining(id) > 0;
}

function useOne(id) {
  const u = getUser(id);
  if (u.paid > 0) u.paid--;
  else u.free++;
  write(USAGE_FILE, usage);
}

function addPaid(id, n) {
  const u = getUser(id);
  u.paid += n;
  write(USAGE_FILE, usage);
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
        Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
      }
    }
  );
}

// ===== 強制繁體 =====
function t(text) {
  const m = {
    "师":"師","费":"費","联":"聯","络":"絡","说":"說","这":"這","个":"個",
    "会":"會","为":"為","开":"開","关":"關","应":"應","对":"對","问":"問",
    "题":"題","时":"時","间":"間","发":"發","现":"現","实":"實","后":"後"
  };
  return text.replace(/[\u4e00-\u9fa5]/g, c => m[c] || c);
}

// ===== 文案 =====
function pricing() {
  return `【收費方案】
30次：88元
80次：168元

購買：
${LINK}

付款後輸入啟用碼開通

（限量測試中）`;
}

function usageText() {
  return `【使用方式】
點「軍師判斷」→ 輸入問題

免費：3次

收費：
30次：88
80次：168

購買：
${LINK}`;
}

function contact() {
  return `【聯絡軍師】
合作 / 客製 / 問題

直接留言`;
}

function ask(id) {
  return `請輸入問題

剩餘：${remaining(id)}`;
}

// ===== Webhook =====
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    for (const e of req.body.events || []) {
      if (e.type !== "message") continue;
      if (e.message.type !== "text") continue;

      const id = e.source.userId;
      const token = e.replyToken;
      const text = e.message.text.trim();

      getUser(id);

      // ===== 1 生辰 =====
      if (text.includes("生辰")) {
        users[id] = { birth: text };
        write(USERS_FILE, users);
        return reply(token, "已記錄");
      }

      // ===== 2 四按鈕 =====
      if (text === "軍師判斷") return reply(token, ask(id));
      if (text === "收費方案") return reply(token, pricing());
      if (text === "使用說明") return reply(token, usageText());
      if (text === "聯絡軍師") return reply(token, contact());

      // ===== 3 啟用碼 =====
      if (codes[text]) {
        const n = codes[text];
        addPaid(id, n);
        delete codes[text];
        write(CODES_FILE, codes);
        return reply(token, `開通成功 +${n}\n剩餘：${remaining(id)}`);
      }

      // ===== 4 才檢查次數（關鍵修正）=====
      if (!hasQuota(id)) {
        return reply(token, pricing());
      }

      // ===== 5 扣次數 =====
      useOne(id);

      // ===== 6 AI =====
      const ai = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是涵森軍師。

規則：
- 繁體中文
- 短句
- 三段

格式：
【判斷】
一句話

【原因】
2點內

【建議】
一個行動`
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

      let out =
        ai.data?.choices?.[0]?.message?.content || "系統忙碌";

      out = t(out);

      return reply(
        token,
        `${out}

剩餘：${remaining(id)}
購買：${LINK}`
      );
    }
  } catch (e) {
    console.log(e.message);
  }
});

app.listen(3000, () => console.log("RUNNING"));
