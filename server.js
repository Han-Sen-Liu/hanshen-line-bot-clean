const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_LIVE_V6");

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
const LINK = "https://vocus.cc/salon/HansenWork";

const redeemCodes = {
  CODE1A: 1
};

function getUser(id) {
  if (!usage[id]) {
    usage[id] = { free: 0, paid: 0, last: 0 };
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

function checkCooldown(id) {
  const u = getUser(id);
  return Date.now() - u.last < COOLDOWN;
}

function useOne(id) {
  const u = getUser(id);

  if (u.paid > 0) {
    u.paid -= 1;
  } else if (u.free < FREE) {
    u.free += 1;
  }

  u.last = Date.now();
  write(USAGE_FILE, usage);
}

function addPaid(id, count) {
  const u = getUser(id);
  u.paid += count;
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
        Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ===== 文案 =====
function pricingText() {
  return `【開通方式】

前往購買：
${LINK}

單次：30元（自動開通）
30次 / 80次：付款後截圖給官方LINE開通`;
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

      if (text === "1") {
        await reply(token, askText(id));
        continue;
      }

      if (text === "2") {
        await reply(token, pricingText());
        continue;
      }

      if (redeemCodes[text]) {
        addPaid(id, redeemCodes[text]);
        await reply(token, `開通成功\n剩餘：${remaining(id)}`);
        continue;
      }

      if (!hasQuota(id)) {
        await reply(token, pricingText());
        continue;
      }

      if (checkCooldown(id)) {
        await reply(token, "請3分鐘後再使用");
        continue;
      }

      useOne(id);

      const aiRes = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是涵森軍師。

【規則】
短句、直接、不可廢話

【格式】

【判斷】
一句結論

【原因】
最多2句

【建議】
一行行動

【吉位】
一個方位

【吉時】
一段時間

【吉顏色】
1-2個

【助力五行】
一種五行+一句說明

【護身心法】
一句短句

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

      let out =
        aiRes.data?.choices?.[0]?.message?.content ||
        "系統錯誤";

      const finalText = `${out}

剩餘次數：${remaining(id)}`;

      await reply(token, finalText);
    }
  } catch (err) {
    console.log(err.message);
  }
});

app.listen(3000, () => {
  console.log("RUNNING_3000");
});
