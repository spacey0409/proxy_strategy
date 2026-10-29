
/**
 * Quantumult X 定时任务：江苏油价
 * 功能：
 * 1. 获取江苏92/95/98号汽油、0号柴油价格
 * 2. 获取下次调价时间
 * 3. 获取预计调价金额（元/吨）及每升涨跌幅
 * 4. 发送 QX 系统通知
 *
 * 数据来源：
 * https://www.itlaoli.com/zb_users/plugin/oilprice/page.php
 */

var OIL_URL = "https://www.itlaoli.com/zb_users/plugin/oilprice/page.php";
var NOTIFY_TITLE = "江苏油价";

// 解码常见 HTML 实体
function decodeHtml(str) {
  return String(str || "")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) {
      return String.fromCharCode(parseInt(n, 16));
    });
}

// HTML 转纯文本
function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:tr|td|th|li|p|h[1-6]|div|section|article|table|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\u200b/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function cleanCell(html) {
  return htmlToText(html)
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

// 获取江苏油价
// 返回顺序：92号、95号、98号、0号柴油
function getJiangsuPrices(html, text) {
  var rowReg = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  var rowMatch;

  while ((rowMatch = rowReg.exec(html)) !== null) {
    var cellReg = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    var cells = [];
    var cellMatch;

    while ((cellMatch = cellReg.exec(rowMatch[1])) !== null) {
      cells.push(cleanCell(cellMatch[1]));
    }

    if (!cells.length) continue;

    var province = cells[0].replace(/\s/g, "");

    if (
      /^江苏(?:省)?$/.test(province) ||
      (/江苏/.test(province) && province.length <= 6)
    ) {
      var prices = [];

      for (var i = 1; i < cells.length; i++) {
        var p = cells[i].replace(/,/g, "").match(/\d+(?:\.\d+)?/);
        if (p) prices.push(p[0]);
      }

      if (prices.length >= 4) {
        return prices.slice(0, 4);
      }
    }
  }

  // 备用匹配：表格 HTML 结构变化时，从纯文本中获取
  var plain = String(text || "").replace(/[↑↓↕⇅|｜]/g, " ");

  var match = plain.match(
    /江苏(?:省)?\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/
  );

  if (match) {
    return [match[1], match[2], match[3], match[4]];
  }

  return null;
}

// 获取某个标签对应的文本段
function getLabelSection(text, label, stopLabels) {
  var marker = label + "：";
  var index = text.indexOf(marker);
  var markerLength = marker.length;

  if (index < 0) {
    marker = label + ":";
    index = text.indexOf(marker);
    markerLength = marker.length;
  }

  if (index < 0) {
    index = text.indexOf(label);
    markerLength = label.length;
  }

  if (index < 0) return "";

  var start = index + markerLength;
  var end = text.length;

  for (var i = 0; i < stopLabels.length; i++) {
    var stopIndex = text.indexOf(stopLabels[i], start);

    if (stopIndex >= 0 && stopIndex < end) {
      end = stopIndex;
    }
  }

  return text.substring(start, end)
    .replace(/^[\s：:]+/, "")
    .trim();
}

// 获取下次油价调整时间
function getNextAdjustmentTime(text) {
  var section = getLabelSection(text, "下次调整时间", [
    "统计进度",
    "国际油价影响",
    "原油变化率",
    "预计调整幅度",
    "倒计时"
  ]);

  var re = /(20\d{2}\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(24\s*时|(?:[01]?\d|2[0-3])\s*(?:时(?:\s*\d{1,2}\s*分)?|:\s*\d{2}))/;

  var m = section.match(re);

  if (!m) {
    return "未能识别，请查看来源网页";
  }

  var year = m[1] ? m[1].replace(/\s/g, "") : "";
  var date = year + m[2] + "月" + m[3] + "日 " +
    m[4].replace(/\s/g, "");

  var after = section.substring(m.index + m[0].length);
  var weekday = after.match(/^\s*[（(]\s*([^）)]{1,16})\s*[）)]/);

  if (weekday) {
    date += "（" + weekday[1].trim() + "）";
  }

  return date;
}

// 获取预计调价金额和每升涨跌幅
function getAdjustmentSummary(text) {
  var section = getLabelSection(text, "预计调整幅度", [
    "倒计时",
    "预报数据更新于",
    "※",
    "## 加油费用计算器"
  ]);

  if (!section) {
    return "网页暂未提供预计调整幅度";
  }

  var directionMatch = section.match(
    /(?:预计)?\s*(上调|上涨|下调|下跌|上升|下降|搁浅|不作调整)/
  );

  var direction = directionMatch ? directionMatch[1] : "";

  var tonMatch = section.match(
    /([+-]?\s*\d+(?:\.\d+)?)\s*元\s*[/／]\s*吨/
  );

  var literRange = section.match(
    /(上涨|上调|下跌|下调|上升|下降)\s*([0-9]+(?:\.\d+)?)\s*(?:~|～|—|–|-|至)\s*([0-9]+(?:\.\d+)?)\s*元\s*[/／]\s*升/
  );

  var literSingle = section.match(
    /(上涨|上调|下跌|下调|上升|下降)\s*(?:约\s*)?([0-9]+(?:\.\d+)?)\s*元\s*[/／]\s*升/
  );

  var output = [];

  if (tonMatch) {
    var rawTon = parseFloat(tonMatch[1].replace(/\s/g, ""));
    var tonValue = Math.abs(rawTon);
    var tonDirection = direction;

    if (!tonDirection) {
      tonDirection = rawTon < 0 ? "下调" : "上调";
    }

    output.push(tonDirection + "约 " + tonValue + " 元/吨");
  }

  if (literRange) {
    output.push(
      "汽柴油预计" + literRange[1] + " " +
      literRange[2] + "–" + literRange[3] + " 元/升"
    );
  } else if (literSingle) {
    output.push(
      "汽柴油预计" + literSingle[1] + " " +
      literSingle[2] + " 元/升"
    );
  }

  if (!output.length) {
    var fallback = section.replace(/[\s\n]+/g, " ").trim();
    return fallback.length > 160
      ? fallback.substring(0, 157) + "..."
      : fallback;
  }

  return output.join("；");
}

// 主程序
function main() {
  $task.fetch({
    url: OIL_URL,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cache-Control": "no-cache"
    },
    timeout: 10000
  }).then(function (response) {
    if (
      !response ||
      !response.body ||
      (
        response.statusCode &&
        (response.statusCode < 200 || response.statusCode >= 300)
      )
    ) {
      throw new Error(
        "网页请求失败，HTTP 状态码：" +
        (response ? response.statusCode : "无响应")
      );
    }

    var html = response.body;
    var text = htmlToText(html);

    var prices = getJiangsuPrices(html, text);

    if (!prices) {
      throw new Error("未找到江苏油价数据，可能是网页结构已变化");
    }

    var nextTime = getNextAdjustmentTime(text);
    var adjustment = getAdjustmentSummary(text);

    var priceDateMatch = text.match(
      /挂牌价数据日期\s*[:：]\s*(\d{4}-\d{2}-\d{2})/
    );

    var priceDate = priceDateMatch
      ? priceDateMatch[1]
      : "网页未标明";

    var message = [
      "92号汽油：" + prices[0] + " 元/升",
      "95号汽油：" + prices[1] + " 元/升",
      "98号汽油：" + prices[2] + " 元/升",
      "0号柴油：" + prices[3] + " 元/升",
      "下次调整时间：" + nextTime,
      "预计调整幅度：" + adjustment,
      "挂牌价数据日期：" + priceDate,
      "数据来源：itlaoli 油价页面"
    ].join("\n");

    $notify(
      NOTIFY_TITLE,
      "江苏 92号 " + prices[0] + "｜下次调价：" + nextTime,
      message
    );

    $done();
  }).catch(function (error) {
    $notify(
      NOTIFY_TITLE + "获取失败",
      "请检查网络或网页结构",
      String(error)
    );

    $done();
  });
}

main();
