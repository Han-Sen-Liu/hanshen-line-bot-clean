const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

console.log("SERVER_CASH_V1");

// ===== 檔案 =====
const USERS_FILE = "./users.json";
const USAGE_FILE = "./usage.json";
const USED_CODES_FILE = "./used_codes.json";

function ensure(file, def) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(def, null, 2), "utf-8");
  }
}

ensure(USERS_FILE, {});
ensure(USAGE_FILE, {});
ensure(USED_CODES_FILE, {});

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

let users = read(USERS_FILE);
let usage = read(USAGE_FILE);
let usedCodes = read(USED_CODES_FILE);

// ===== 基本設定 =====
const FREE = 1;
const SINGLE_CODE_COOLDOWN_MS = 3 * 60 * 1000;

// 付款資訊
const JKOPAY_CODE = "396";
const JKOPAY_ACCOUNT = "903420909";
const JKOPAY_LINK =
  "https://service.jkopay.com/r/transfer?j=Transfer:903420909";

// ===== 單次碼（30元）=====
// 同一組代碼可重複用，但 3 分鐘冷卻
const singleCodes = {
  CODE1A: 1
};

let singleCodeCooldowns = {};

// ===== 一次性代碼（88 / 168）=====
const redeemCodes = {
  // ===== 88元：30次（50組）=====
  CODE30A01: 30,
  CODE30A02: 30,
  CODE30A03: 30,
  CODE30A04: 30,
  CODE30A05: 30,
  CODE30A06: 30,
  CODE30A07: 30,
  CODE30A08: 30,
  CODE30A09: 30,
  CODE30A10: 30,
  CODE30A11: 30,
  CODE30A12: 30,
  CODE30A13: 30,
  CODE30A14: 30,
  CODE30A15: 30,
  CODE30A16: 30,
  CODE30A17: 30,
  CODE30A18: 30,
  CODE30A19: 30,
  CODE30A20: 30,
  CODE30A21: 30,
  CODE30A22: 30,
  CODE30A23: 30,
  CODE30A24: 30,
  CODE30A25: 30,
  CODE30A26: 30,
  CODE30A27: 30,
  CODE30A28: 30,
  CODE30A29: 30,
  CODE30A30: 30,
  CODE30A31: 30,
  CODE30A32: 30,
  CODE30A33: 30,
  CODE30A34: 30,
  CODE30A35: 30,
  CODE30A36: 30,
  CODE30A37: 30,
  CODE30A38: 30,
  CODE30A39: 30,
  CODE30A40: 30,
  CODE30A41: 30,
  CODE30A42: 30,
  CODE30A43: 30,
  CODE30A44: 30,
  CODE30A45: 30,
  CODE30A46: 30,
  CODE30A47: 30,
  CODE30A48: 30,
  CODE30A49: 30,
  CODE30A50: 30,

  // ===== 168元：80次（50組）=====
  CODE80A01: 80,
  CODE80A02: 80,
  CODE80A03: 80,
  CODE80A04: 80,
  CODE80A05: 80,
  CODE80A06: 80,
  CODE80A07: 80,
  CODE80A08: 80,
  CODE80A09: 80,
  CODE80A10: 80,
  CODE80A11: 80,
  CODE80A12: 80,
  CODE80A13: 80,
  CODE80A14: 80,
  CODE80A15: 80,
  CODE80A16: 80,
  CODE80A17: 80,
  CODE80A18: 80,
  CODE80A19: 80,
  CODE80A20: 80,
  CODE80A21: 80,
  CODE80A22: 80,
  CODE80A23: 80,
  CODE80A24: 80,
  CODE80A25: 80,
  CODE80A26: 80,
  CODE80A27: 80,
  CODE80A28: 80,
  CODE80A29: 80,
  CODE80A30: 80,
  CODE80A31: 80,
  CODE80A32: 80,
  CODE80A33: 80,
  CODE80A34: 80,
  CODE80A35: 80,
  CODE80A36: 80,
  CODE80A37: 80,
  CODE80A38: 80,
  CODE80A39: 80,
  CODE80A40: 80,
  CODE80A41: 80,
  CODE80A42: 80,
  CODE80A43: 80,
  CODE80A44: 80,
  CODE80A45: 80,
  CODE80A46: 80,
  CODE80A47: 80,
  CODE80A48: 80,
  CODE80A49: 80,
  CODE80A50: 80
};

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
    "条": "條",
    "颜": "顏",
    "龙": "龍",
    "运": "運",
    "势": "勢"
  };

  return text.replace(/[\u4e00-\u9fa5]/g, c => map[c] || c);
}

// ===== 文案 =====
function pricingText() {
  return `【立即開通】

單次：30元
30次：88元（最熱門）
80次：168元（高頻使用）

👉 街口支付（${JKOPAY_CODE}）
帳號：${JKOPAY_ACCOUNT}

👉 一鍵轉帳
${JKOPAY_LINK}

【付款後】

單次30元：
付款後我會給你單次啟用碼

30次 / 80次：
付款後我會給你專屬開通代碼

請把付款成功截圖傳到本LINE
我收到後就回你代碼`;
}

function usageText(id) {
  return `【使用方式】

1. 點「軍師判斷」
2. 輸入你的問題
3. 可補生辰八字
4. 系統回覆：
【判斷】
【原因】
【建議】
【吉位】
【吉時】
【吉顏色】
【助力五行】
【護身心法】

剩餘次數：${remaining(id)}`;
}

function askText(id) {
  const birth = users[id]?.birth || "未提供";

  return `請直接輸入你的問題

（可補生辰八字，例如：1990/01/01 15:30）

目前生辰：${birth}
剩餘次數：${remaining(id)}`;
}

function contactText() {
  return `【聯絡軍師】

合作 / 客製 / 問題回報
請直接留言`;
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

      // ===== 功能選單 =====
      if (text === "軍師判斷" || text === "1") {
        await reply(token, askText(id));
        continue;
      }

      if (
        text === "收費方案" ||
        text === "收費方式" ||
        text === "收費" ||
        text === "2"
      ) {
        await reply(token, pricingText());
        continue;
      }

      if (text === "使用說明" || text === "3") {
        await reply(token, usageText(id));
        continue;
      }

      if (text === "聯絡軍師" || text === "4") {
        await reply(token, contactText());
        continue;
      }

      // ===== 單次：冷卻碼 =====
      if (singleCodes[text]) {
        const now = Date.now();
        const last = singleCodeCooldowns[text] || 0;

        if (now - last < SINGLE_CODE_COOLDOWN_MS) {
          const remainSec = Math.ceil(
            (SINGLE_CODE_COOLDOWN_MS - (now - last)) / 1000
          );
          await reply(token, `此代碼冷卻中，請 ${remainSec} 秒後再試`);
          continue;
        }

        singleCodeCooldowns[text] = now;

        addPaid(id, 1);
        await reply(token, `開通成功 +1\n剩餘：${remaining(id)}`);
        continue;
      }

      // ===== 30 / 80：一次性代碼 =====
      if (redeemCodes[text]) {
        if (usedCodes[text]) {
          await reply(token, "此代碼已使用");
          continue;
        }

        const count = redeemCodes[text];
        addPaid(id, count);

        usedCodes[text] = {
          usedBy: id,
          usedAt: new Date().toISOString(),
          value: count
        };
        write(USED_CODES_FILE, usedCodes);

        await reply(token, `開通成功 +${count}\n剩餘：${remaining(id)}`);
        continue;
      }

      // ===== 沒次數 =====
      if (!hasQuota(id)) {
        await reply(token, pricingText());
        continue;
      }

      // ===== 扣次數 =====
      useOne(id);

      // ===== AI 回覆 =====
      const aiRes = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "system",
              content: `你是涵森軍師。

【定位】
你不是聊天機器人，你是決策軍師。

【風格】
冷靜、精準、短句、直接給方向。

【強制規則】
1. 一律使用繁體中文
2. 一律短句
3. 不安慰、不模糊
4. 不長篇說理
5. 每段不超過2行
6. 若資料不足，也要給保守判斷
7. 不可省略欄位

【輸出格式】

【判斷】
一句話直接結論（可行 / 不可行 / 觀望 / 可動但需條件）

【原因】
最多2句，只講核心原因

【建議】
一個立即可做的具體行動

【吉位】
直接給一個方位

【吉時】
直接給一個時段

【吉顏色】
直接給1到2個顏色

【助力五行】
直接給一種五行，並用一句話說明助力方向

【護身心法】
一句短句，有力量、有記憶點

最後一定加：
—涵森軍師`
            },
            {
              role: "user",
              content: `使用者問題：${text}

使用者生辰資料：${users[id]?.birth || "未提供"}`
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
        "【判斷】\n系統忙碌\n\n【原因】\n目前回應失敗\n\n【建議】\n請再發一次\n\n【吉位】\n正東\n\n【吉時】\n上午9點到11點\n\n【吉顏色】\n綠色\n\n【助力五行】\n木。先求穩定，再求突破。\n\n【護身心法】\n局勢未明，先守不攻。\n\n—涵森軍師";

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
