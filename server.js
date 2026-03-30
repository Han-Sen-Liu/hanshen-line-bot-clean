const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_LIVE_V5");

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
const FREE = 1;
const LINK = "https://vocus.cc/salon/HansenWork";
const COOLDOWN_MS = 3 * 60 * 1000;

// 你的 LINE 使用者 ID（只允許你自己下管理指令）
// 去 LINE Developers 或 webhook log 找你的 userId，填進 .env
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || "";

// ===== 30元單次自動碼（3分鐘冷卻）=====
const singleCodeMap = {
  CODE1A: 1
};

let singleCodeCooldowns = {};

// ===== 使用者工具 =====
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

// ===== LINE 回覆 =====
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

// ===== 簡轉繁（基礎）=====
function toTraditional(text) {
  const map = {
    "师": "師",
    "费": "費",
    "联": "聯",
    "络": "絡",
    "说": "說",
    "这": "這",
    "个": "個",
    "会": "會",
    "为": "為",
    "开": "開",
    "关": "關",
    "应": "應",
    "对": "對",
    "问": "問",
    "题": "題",
    "时": "時",
    "间": "間",
    "发": "發",
    "现": "現",
    "实": "實",
    "后": "後",
    "来": "來",
    "过": "過",
    "动": "動",
    "点": "點",
    "计": "計",
    "画": "畫",
    "国": "國",
    "长": "長",
    "风": "風",
    "险": "險",
    "机": "機",
    "术": "術",
    "断": "斷",
    "级": "級",
    "换": "換",
    "资": "資",
    "议": "議",
    "单": "單",
    "条": "條"
  };

  return text.replace(/[\u4e00-\u9fa5]/g, c => map[c] || c);
}

// ===== 固定文案 =====
function pricingText() {
  return `【開通方式】

1️⃣ 前往方格子購買
${LINK}

2️⃣ 單次方案
購買後取得代碼，回LINE輸入即可自動開通

3️⃣ 次數方案
付款後請將截圖傳到官方LINE
軍師確認後為你開通

【方案】
單次：30元
30次：88元
80次：168元`;
}

function usageText() {
  return `【使用方式】

1️⃣ 點「軍師判斷」
2️⃣ 輸入你的問題
3️⃣ 可補生辰八字
4️⃣ 系統回覆：
【判斷】
【原因】
【建議】

【免費次數】
1次`;
}

function contactText() {
  return `【聯絡軍師】

合作 / 客製 / 問題回報
請直接留言`;
}

function askText(id) {
  const birth = users[id]?.birth || "未提供";

  return `請先輸入你的問題

（可補生辰八字，例如：1990/01/01 15:30）

目前生辰：${birth}
剩餘次數：${remaining(id)}`;
}

function adminHelpText() {
  return `【管理指令】

開通30次：
ADD30

開通80次：
ADD80`;
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

      console.log("INCOMING:", id, text);

      getUser(id);

      // ===== 記錄生辰 =====
      if (
        text.includes("生辰") ||
        text.includes("生日") ||
        /^\d{4}\/\d{1,2}\/\d{1,2}/.test(text)
      ) {
        users[id] = {
          ...(users[id] || {}),
          birth: text
        };
        write(USERS_FILE, users);
        await reply(token, `生辰已記錄\n\n目前資料：${text}`);
        continue;
      }

      // ===== Rich Menu 功能優先 =====
      if (text === "軍師判斷") {
        await reply(token, askText(id));
        continue;
      }

      if (text === "收費方案" || text === "收費方式") {
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

      // ===== 管理員指令（只有你本人可用）=====
      if (id === ADMIN_USER_ID && text === "ADD30") {
        addPaid(id, 30);
        await reply(token, `已開通30次\n剩餘：${remaining(id)}`);
        continue;
      }

      if (id === ADMIN_USER_ID && text === "ADD80") {
        addPaid(id, 80);
        await reply(token, `已開通80次\n剩餘：${remaining(id)}`);
        continue;
      }

      if (id === ADMIN_USER_ID && text === "管理指令") {
        await reply(token, adminHelpText());
        continue;
      }

      // ===== 30元單次自動碼（3分鐘冷卻）=====
      if (singleCodeMap[text]) {
        const now = Date.now();
        const lastUsed = singleCodeCooldowns[text] || 0;

        if (now - lastUsed < COOLDOWN_MS) {
          const remainSec = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1000);
          await reply(token, `此啟用碼冷卻中，請 ${remainSec} 秒後再試`);
          continue;
        }

        singleCodeCooldowns[text] = now;

        const count = singleCodeMap[text];
        addPaid(id, count);

        await reply(token, `開通成功 +${count}\n剩餘：${remaining(id)}`);
        continue;
      }

      // ===== 真正提問才檢查次數 =====
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
3. 禁止客套話
4. 禁止條列 1. 2. 3.
5. 禁止使用 ** 符號
6. 每段不超過2行
7. 嚴格使用以下格式

【判斷】
一句話結論

【原因】
最多2句

【建議】
一個立即行動

違規就重寫`
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

剩餘次數：${remaining(id)}`;

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
