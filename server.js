const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_LIVE_V7");

// ===== 檔案 =====
const USERS_FILE = "./users.json";
const USAGE_FILE = "./usage.json";

function ensure(file, def) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(def, null, 2), "utf-8");
  }
}

ensure(USERS_FILE, {});
ensure(USAGE_FILE, {});

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

let users = read(USERS_FILE);
let usage = read(USAGE_FILE);

// ===== 設定 =====
const FREE = 1;
const COOLDOWN = 3 * 60 * 1000;
const ADMIN_ID = process.env.ADMIN_USER_ID;

// 單次代碼（自動）
const singleCodes = {
  CODE1A: 1
};

let cooldownMap = {};

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

function useOne(id) {
  const u = getUser(id);
  if (u.paid > 0) u.paid -= 1;
  else if (u.free < FREE) u.free += 1;
  write(USAGE_FILE, usage);
}

function addPaid(id, n) {
  const u = getUser(id);
  u.paid += n;
  write(USAGE_FILE, usage);
}

// ===== 回覆 =====
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

// ===== 收費文案 =====
function pricingText() {
  return `【立即開通】

30次：88元（最熱門）  
80次：168元（高頻使用）  

👉 街口支付（396）  
帳號：903420909  

👉 一鍵轉帳  
https://service.jkopay.com/r/transfer?j=Transfer:903420909  

付款完成後  
截圖傳來  

👉 立即開通使用`;
}

function askText(id) {
  return `請輸入你的問題  
（可補生辰）  

剩餘次數：${remaining(id)}`;
}

// ===== Webhook =====
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const events = req.body.events || [];

    for (const e of events) {
      if (e.type !== "message") continue;
      if (e.message.type !== "text") continue;

      const id = e.source.userId;
      const token = e.replyToken;
      const text = e.message.text.trim();

      getUser(id);

      // ===== 管理員開通 =====
      if (id === ADMIN_ID && text === "ADD30") {
        addPaid(id, 30);
        await reply(token, `已開通30次\n剩餘：${remaining(id)}`);
        continue;
      }

      if (id === ADMIN_ID && text === "ADD80") {
        addPaid(id, 80);
        await reply(token, `已開通80次\n剩餘：${remaining(id)}`);
        continue;
      }

      // ===== 功能 =====
      if (text === "1" || text === "軍師判斷") {
        await reply(token, askText(id));
        continue;
      }

      if (text === "2" || text === "收費") {
        await reply(token, pricingText());
        continue;
      }

      // ===== 單次碼（有冷卻）=====
      if (singleCodes[text]) {
        const now = Date.now();
        const last = cooldownMap[text] || 0;

        if (now - last < COOLDOWN) {
          await reply(token, "此代碼冷卻中，請稍後再試");
          continue;
        }

        cooldownMap[text] = now;
        addPaid(id, 1);

        await reply(token, `開通成功\n剩餘：${remaining(id)}`);
        continue;
      }

      // ===== 沒次數 =====
      if (remaining(id) <= 0) {
        await reply(token, pricingText());
        continue;
      }

      useOne(id);

      // ===== AI =====
      const aiRes = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是涵森軍師。

短句、直接、有決策感。

格式如下：

【判斷】
一句結論

【原因】
最多2句

【建議】
一個行動

【吉位】
一個方位

【吉時】
一個時間

【吉顏色】
1-2個

【助力五行】
一個五行＋一句話

【護身心法】
一句話

最後加：
—涵森軍師`
            },
            { role: "user", content: text }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`
          }
        }
      );

      const out =
        aiRes.data?.choices?.[0]?.message?.content || "系統忙碌";

      await reply(token, `${out}\n\n剩餘次數：${remaining(id)}`);
    }
  } catch (err) {
    console.log(err.message);
  }
});

app.listen(3000);
