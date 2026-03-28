const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());

const data = JSON.parse(fs.readFileSync("./data.json", "utf-8"));
let users = JSON.parse(fs.readFileSync("./users.json", "utf-8"));
let userUsage = {};

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

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;
      if (!event.source || event.source.type !== "user") continue;

      const userId = event.source.userId;
      const userText = event.message.text;

      // 記錄生辰
      if (userText.includes("生日") || userText.includes("生辰")) {
        users[userId] = { birth: userText };
        fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));

        await axios.post(
          "https://api.line.me/v2/bot/message/push",
          {
            to: userId,
            messages: [{ type: "text", text: "主公生辰已記錄" }]
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
            }
          }
        );
        continue;
      }

      if (!userUsage[userId]) userUsage[userId] = 0;

      if (userUsage[userId] >= 1) {
        await axios.post(
          "https://api.line.me/v2/bot/message/push",
          {
            to: userId,
            messages: [{ type: "text", text: "免費已用完，月費88元開通" }]
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
            }
          }
        );
        continue;
      }

      userUsage[userId]++;

      const knowledge = Object.entries(data)
        .map(([group, items]) =>
          `${group}：\n` +
          Object.entries(items)
            .map(([k, v]) => `- ${k}：${v}`)
            .join("\n")
        )
        .join("\n\n");

      const birth = users[userId]?.birth || "尚未提供";

      const aiRes = await axios.post(
        "https://router.huggingface.co/v1/chat/completions",
        {
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            {
              role: "user",
              content: `你是涵森軍師。

主公，身為你的專屬軍師，我直接說結論。

主公生辰：
${birth}

命理資料：
${knowledge}

請用格式：
【判斷】
【原因】
【建議】

問題：${userText}`
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      const replyText =
        aiRes.data?.choices?.[0]?.message?.content || "系統忙碌";

      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

      const finalText = `${replyText}

【涵森軍師｜護身心法】
${randomQuote}

——涵森軍師`;

      await axios.post(
        "https://api.line.me/v2/bot/message/push",
        {
          to: userId,
          messages: [{ type: "text", text: finalText }]
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
          }
        }
      );

      console.log("AI PUSH OK");
    }
  } catch (err) {
    console.log("AI PUSH ERROR");
    console.log(err.response?.data || err.message);
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});