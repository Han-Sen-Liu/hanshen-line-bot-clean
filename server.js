const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_FINAL_V1");

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

// ===== 基本設定 =====
const FREE = 3;
const LINK = "https://vocus.cc/your-link"; // ← 改成你的方格子連結

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

  if (u.paid > 0) {
    u.paid -= 1;
  } else if (u.free < FREE) {
    u.free += 1;
  }

  write(USAGE_FILE, usage);
}

function addPaid(id, count) {
  const u = getUser(id);
  u.paid += count;
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
        Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ===== 強制繁體（基礎版） =====
function toTraditional(text) {
  const map = {
    "师":"師","费":"費","联":"聯","络":"絡","说":"說","这":"這","个":"個",
    "会":"會","为":"為","开":"開","关":"關","应":"應","对":"對","问":"問",
    "题":"題","时":"時","间":"間","发":"發","现":"現","实":"實","后":"後",
    "来":"來","过":"過","动":"動","点":"點","计":"計","画":"畫","国":"國",
    "长":"長","风":"風","险":"險","机":"機","术":"術","断":"斷","级":"級"
  };

  return text.replace(/[\u4e00-\u9fa5]/g, c => map[c] || c);
}

// ===== 固定文案 =====
function pricingText() {
  return `【收費方案】
30次：88元
80次：168元

【購買連結】
${LINK}

付款後輸入啟用碼即可開通`;
}

function usageText() {
  return `【使用說明】
1. 點「軍師判斷」
2. 輸入你的問題
3. 系統回覆：判斷／原因／建議

【免費次數】
3次

【收費方案】
30次：88元
80次：168元

【購買連結】
${LINK}`;
}

function contactText() {
  return `【聯絡軍師】
合作 / 客製 / 問題回報
請直接留言`;
}

function askText(id) {
  const birth = users[id]?.birth || "尚未提供";

  return `請直接輸入你的問題

生辰資料：${birth}
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
      if (!e.source || !e.source.userId) continue;

      const id = e.source.userId;
      const token = e.replyToken;
      const text = e.message.text.trim();

      console.log("INCOMING:", text);

      getUser(id);

      // ===== 記錄生辰 =====
      if (text.includes("生辰") || text.includes("生日")) {
        users[id] = {
          ...(users[id] || {}),
          birth: text
        };
        write(USERS_FILE, users);
        await reply(token, "已記錄");
        continue;
      }

      // ===== Rich Menu 四按鈕 =====
      if (text === "軍師判斷") {
        await reply(token, askText(id));
        continue;
      }

      if (text === "收費方案") {
        await reply(token, pricingText());
        continue;
      }

      if (text === "使用說明") {
        await reply(token, usageText());
        continue;
      }

      if (text === "聯絡軍師") {
        await reply(token, contactText());
        continue;
      }

      // ===== 寫死啟用碼（先不要讀 codes.json） =====
      if (text === "TEST100") {
        addPaid(id, 100);
        await reply(token, `開通成功 +100\n剩餘：${remaining(id)}`);
        continue;
      }

      if (text === "A1B2C3") {
        addPaid(id, 30);
        await reply(token, `開通成功 +30\n剩餘：${remaining(id)}`);
        continue;
      }

      if (text === "D4E5F6") {
        addPaid(id, 30);
        await reply(token, `開通成功 +30\n剩餘：${remaining(id)}`);
        continue;
      }

      if (text === "G7H8I9") {
        addPaid(id, 80);
        await reply(token, `開通成功 +80\n剩餘：${remaining(id)}`);
        continue;
      }

      if (text === "J1K2L3") {
        addPaid(id, 80);
        await reply(token, `開通成功 +80\n剩餘：${remaining(id)}`);
        continue;
      }

      // ===== 真正提問前，才檢查次數 =====
      if (!hasQuota(id)) {
        await reply(token, pricingText());
        continue;
      }

      // ===== 扣次數 =====
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

規則：
1. 一律使用繁體中文
2. 一律短句
3. 禁止條列 1. 2. 3.
4. 禁止客套話
5. 不得長篇解釋
6. 必須嚴格用以下格式

【判斷】
一句話結論

【原因】
最多2句

【建議】
一個立即行動

違反規則就重新寫`
            },
            {
              role: "user",
              content: text
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

      let out =
        aiRes.data?.choices?.[0]?.message?.content ||
        "【判斷】\n系統忙碌\n\n【原因】\n目前回應失敗\n\n【建議】\n請再發一次";

      out = toTraditional(out);

      const finalText = `${out}

剩餘次數：${remaining(id)}
購買連結：${LINK}`;

      await reply(token, finalText);
    }
  } catch (err) {
    console.log("WEBHOOK_ERROR:", err.response?.data || err.message);
  }
});

app.get("/", (req, res) => {
  res.send("Hansen bot running");
});

app.listen(3000, () => {
  console.log("RUNNING_3000");
});
