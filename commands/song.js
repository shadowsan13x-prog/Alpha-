"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_SECONDS = 25 * 60;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_TRACKED_MESSAGES = 60;

function rememberBotMessage(botSentMessages, threadID, info) {
  const messageID = info && (info.messageID || info.message_id);
  if (!messageID || !botSentMessages || typeof botSentMessages !== "object") return;

  if (!Array.isArray(botSentMessages[threadID])) {
    botSentMessages[threadID] = [];
  }

  const list = botSentMessages[threadID];
  const id = String(messageID);
  if (!list.some(item => String(item) === id)) list.push(messageID);
  if (list.length > MAX_TRACKED_MESSAGES) {
    list.splice(0, list.length - MAX_TRACKED_MESSAGES);
  }
}

function forgetBotMessage(botSentMessages, threadID, messageID) {
  const list = botSentMessages && botSentMessages[threadID];
  if (!Array.isArray(list)) return;
  const id = String(messageID);
  botSentMessages[threadID] = list.filter(item => String(item) !== id);
}

module.exports = async function songCommand(
  api,
  event,
  args,
  startTime,
  loadData,
  saveData,
  automicTimers,
  config,
  hostingInfo,
  botSentMessages,
  BOT_ID,
  builtInCommandNames,
  customCommandNames,
  commands,
  access = {}
) {
  const threadID = String(event && event.threadID || "");
  const messageID = event && event.messageID != null
    ? String(event.messageID)
    : undefined;

  if (!api || !threadID || typeof api.sendMessage !== "function") return;

  async function send(payload, replyToMessageID = messageID) {
    const result = await api.sendMessage(
      payload,
      threadID,
      replyToMessageID == null ? undefined : String(replyToMessageID)
    );
    rememberBotMessage(botSentMessages, threadID, result);
    return result || null;
  }

  const query = typeof args?.rawText === "string"
    ? args.rawText.trim()
    : Array.isArray(args)
      ? args.slice(1).map(value => String(value)).join(" ").trim()
      : "";

  if (!query) {
    return send("🎵 اكتب اسم الأغنية.\nمثال: !song فيروز كيفك أنت");
  }

  let ytSearch;
  let ytdl;
  let audioQuality;
  let ffmpeg;

  try {
    ytSearch = require("yt-search");
    const ytdlModule = require("@distube/ytdl-core");
    if (typeof ytdlModule.Ytdl !== "function") {
      throw new Error("واجهة Ytdl غير متوفرة في المكتبة المثبتة.");
    }
    ytdl = new ytdlModule.Ytdl();
    audioQuality = ytdlModule.Quality.HighestAudio;
    ffmpeg = require("fluent-ffmpeg");

    const staticFfmpegPath = require("ffmpeg-static");
    let ffmpegPath =
      staticFfmpegPath && fs.existsSync(staticFfmpegPath)
        ? staticFfmpegPath
        : null;

    if (!ffmpegPath) {
      const { execFileSync } = require("child_process");
      try {
        ffmpegPath = execFileSync(
          "sh",
          ["-c", "command -v ffmpeg"],
          { encoding: "utf8" }
        ).trim();
      } catch (_) {
        ffmpegPath = null;
      }
    }

    if (!ffmpegPath) {
      throw new Error("FFmpeg غير مثبت أو غير متاح في بيئة التشغيل.");
    }

    ffmpeg.setFfmpegPath(ffmpegPath);
  } catch (error) {
    return send(
      "❌ مكتبات أمر الأغاني غير مثبتة. نفّذ داخل مجلد ALPHA:\n" +
      "npm install yt-search @distube/ytdl-core fluent-ffmpeg ffmpeg-static"
    );
  }

  let waiting = null;
  let file = null;

  async function clearWaiting() {
    const waitingID = waiting && waiting.messageID;
    if (!waitingID) return;

    try {
      if (typeof api.unsendMessage === "function") {
        await api.unsendMessage(String(waitingID));
      }
    } catch (_) {}

    forgetBotMessage(botSentMessages, threadID, waitingID);
    waiting = null;
  }

  try {
    waiting = await send("🔎 جاري البحث عن: " + query);

    const results = await ytSearch(query);
    const videos = Array.isArray(results && results.videos) ? results.videos : [];
    const video = videos.find(item => item && item.url && Number(item.seconds) > 0)
      || videos.find(item => item && item.url);

    if (!video) {
      await clearWaiting();
      return send("❌ لم أعثر على نتائج مناسبة.");
    }

    const duration = Number(video.seconds) || 0;
    if (MAX_SECONDS > 0 && duration > MAX_SECONDS) {
      await clearWaiting();
      return send(`⚠️ مدة المقطع ${video.timestamp || "غير معروفة"} وتتجاوز الحد (25 دقيقة). جرّب اسماً أدق.`);
    }

    file = path.join(
      os.tmpdir(),
      `alpha_song_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp3`
    );

    await new Promise((resolve, reject) => {
      let settled = false;
      let stream;

      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      try {
        stream = ytdl.download(video.url, {
          quality: audioQuality,
          filter: { hasAudio: true, hasVideo: false },
          highWaterMark: 1 << 20
        });

        stream.once("error", finish);

        ffmpeg(stream)
          .noVideo()
          .audioCodec("libmp3lame")
          .audioBitrate(128)
          .format("mp3")
          .once("error", finish)
          .once("end", () => finish())
          .save(file);
      } catch (error) {
        if (stream && typeof stream.destroy === "function") stream.destroy();
        finish(error);
      }
    });

    const stats = await fs.promises.stat(file);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error("ملف الصوت الناتج فارغ.");
    }

    if (stats.size > MAX_BYTES) {
      await clearWaiting();
      return send("⚠️ حجم الأغنية أكبر من الحد الآمن للإرسال (24MB). جرّب مقطعاً أقصر.");
    }

    await clearWaiting();

    const attachment = fs.createReadStream(file);
    try {
      await send({
        body:
          `🎵 ${video.title || "بدون عنوان"}\n` +
          `👤 ${(video.author && video.author.name) || "غير معروف"}\n` +
          `⏱ ${video.timestamp || "غير معروفة"}`,
        attachment
      });
    } catch (error) {
      attachment.destroy();
      throw error;
    }
  } catch (error) {
    await clearWaiting();
    const detail = String(error && error.message ? error.message : error).slice(0, 350);
    try {
      await send("❌ تعذّر تحميل الأغنية أو إرسالها.\n" + detail);
    } catch (sendError) {
      console.log("[ALPHA SONG] Failed to send error message:", sendError?.message || sendError);
    }
  } finally {
    if (file) {
      await fs.promises.unlink(file).catch(() => {});
    }
  }
};

module.exports.aliases = ["اغنية", "أغنية", "song", "play"];
