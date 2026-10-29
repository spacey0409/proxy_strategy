/**

* 今日油价 + 下次油价预测
* 兼容：Quantumult X / Surge / Loon / Egern
* 当前油价来源：iamwawa.cn
* 预测数据来源：itlaoli.com
* 注意：
* 1.	预测网页结构变化可能导致数据解析失败。
* 2.	预测数据仅供参考，最终以国家发展改革委公布为准。
        */

// ==================== 用户配置 ====================

const AREA = “江苏”;

// 当前油价 API
const OIL_API =
“https://www.iamwawa.cn/oilprice/api?area=” +
encodeURIComponent(AREA);

// 油价预测网页
const FORECAST_URL =
“https://www.itlaoli.com/zb_users/plugin/oilprice/page.php”;

// ==================== 通用请求 ====================

function httpGet(url, headers) {
const options = {
url: url,
headers: headers || {},
timeout: 15000
};

// Quantumult X / Egern
if (typeof $task !== “undefined”) {
return $task.fetch(options).then(function (response) {
if (
response.statusCode &&
(response.statusCode < 200 || response.statusCode >= 400)
) {
throw new Error(“HTTP “ + response.statusCode);
}

  return response.body;
});

}

// Surge / Loon
if (typeof $httpClient !== “undefined”) {
return new Promise(function (resolve, reject) {
$httpClient.get(options, function (error, response, body) {
if (error) {
reject(error);
return;
}

    if (
      response &&
      response.status &&
      (response.status < 200 || response.status >= 400)
    ) {
      reject(new Error("HTTP " + response.status));
      return;
    }
    resolve(body);
  });
});

}

return Promise.reject(new Error(“当前运行环境不受支持”));
}

// ==================== 当前油价解析 ====================

function parseOil(body) {
const json = JSON.parse(body);

if (!json || String(json.status) !== “1” || !json.data) {
throw new Error(“油价接口返回数据异常”);
}

const data = json.data;

return {
date: data.date || “未知”,
nextUpdateTime: data.next_update_time || “”,
p92: data.p92,
p95: data.p95,
p98: data.p98,
p0: data.p0
};
}

// ==================== HTML 转文本 ====================

function htmlToText(html) {
return String(html || “”)
.replace(/<script\b[^>]>[\s\S]?</script>/gi, “ “)
.replace(/<style\b[^>]>[\s\S]?</style>/gi, “ “)
.replace(/<[^>]+>/g, “ “)
.replace(/ | /gi, “ “)
.replace(/&/gi, “&”)
.replace(/</gi, “<”)
.replace(/>/gi, “>”)
.replace(/"/gi, ‘”’)
.replace(/'|'/gi, “’”)
.replace(/\s+/g, “ “)
.trim();
}

// ==================== 油价预测解析 ====================

function parseForecast(html) {
const text = htmlToText(html);

const result = {
nextDate: “”,
direction: “”,
amount: “”,
perLiter: “”,
changeRate: “”,
updatedAt: “”
};

let match;

// 下次调价时间
match = text.match(
/下次调整时间[：:]?\s*[^。]{0,100}?(\d{1,2}月\d{1,2}日)\s24\s时/
);

if (match) {
result.nextDate = match[1] + “ 24:00”;
}

// 原油变化率
match = text.match(
/原油变化率[：:]?\s*([+-]?\d+(?:.\d+)?\s*%)/
);

if (match) {
result.changeRate = match[1].replace(/\s+/g, “”);
}

// 预计调整金额，单位：元/吨
match = text.match(
/预计\s*(上调|下调|搁浅)[^。]{0,100}?(\d+(?:.\d+)?)\s*元/吨/
);

if (match) {
result.direction = match[1];

if (result.direction !== "搁浅") {
  result.amount = match[2] + " 元/吨";
} else {
  result.amount = "预计不调整";
}

}

// 预计每升调整金额，支持单值和区间
match = text.match(
/(?:预计|将)?[^。]{0,60}?(上调|下调|上涨|下跌)\s*(\d+(?:.\d+)?)\s*(?:~|～|至|-)\s*(\d+(?:.\d+)?)\s*元/升/
);

if (match) {
const isDown =
match[1] === “下调” || match[1] === “下跌”;

const sign = isDown ? "-" : "+";
result.perLiter =
  sign + match[2] + " 至 " +
  sign + match[3] + " 元/升";
if (!result.direction) {
  result.direction = isDown ? "下调" : "上调";
}

} else {
// 兼容只给出一个每升预测值的页面
match = text.match(
/(?:预计|将)?[^。]{0,60}?(上调|下调|上涨|下跌)\s*(\d+(?:.\d+)?)\s*元/升/
);

if (match) {
  const isDown =
    match[1] === "下调" || match[1] === "下跌";
  result.perLiter =
    (isDown ? "-" : "+") +
    match[2] + " 元/升";
  if (!result.direction) {
    result.direction = isDown ? "下调" : "上调";
  }
}

}

// 预测更新时间
match = text.match(
/预报数据更新于\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:+08:00)?)/
);

if (match) {
result.updatedAt = match[1];
}

return result;
}

// ==================== 格式化油价 ====================

function price(value) {
if (value === undefined || value === null || value === “”) {
return “暂无数据”;
}

return String(value) + “ 元/升”;
}

// ==================== 通知 ====================

function notify(title, subtitle, message) {
if (typeof $notify !== “undefined”) {
$notify(title, subtitle, message);
} else {
console.log(title + “\n” + subtitle + “\n” + message);
}
}

// ==================== 主程序 ====================

async function main() {
const results = await Promise.allSettled([
httpGet(OIL_API, {
“User-Agent”: “iamwawa-open-api”,
“Accept”: “application/json”
}),

httpGet(FORECAST_URL, {
  "User-Agent": "Mozilla/5.0",
  "Accept": "text/html,application/xhtml+xml"
})

]);

let oil = null;
let forecast = null;

const errors = [];

// 解析当前油价
if (results[0].status === “fulfilled”) {
try {
oil = parseOil(results[0].value);
} catch (error) {
errors.push(“当前油价解析失败：” + error.message);
}
} else {
errors.push(“当前油价请求失败”);
}

// 解析预测数据
if (results[1].status === “fulfilled”) {
try {
forecast = parseForecast(results[1].value);
} catch (error) {
errors.push(“预测数据解析失败：” + error.message);
}
} else {
errors.push(“预测网页请求失败”);
}

// ==================== 生成通知 ====================

let message = “⛽ “ + AREA + “ 今日油价\n”;

if (oil) {
message +=
“数据日期：” + oil.date + “\n” +
“━━━━━━━━━━━━━━\n” +
“92号汽油：” + price(oil.p92) + “\n” +
“95号汽油：” + price(oil.p95) + “\n” +
“98号汽油：” + price(oil.p98) + “\n” +
“0号柴油：” + price(oil.p0) + “\n”;
} else {
message += “当前油价暂时无法获取\n”;
}

message += “━━━━━━━━━━━━━━\n”;
message += “📈 下次调价预测\n”;

if (forecast) {
const nextDate =
forecast.nextDate ||
(oil && oil.nextUpdateTime) ||
“暂未获取”;

message += "调价时间：" + nextDate + "\n";
message +=
  "预测方向：" +
  (forecast.direction || "暂无可靠预测") + "\n";
if (forecast.amount) {
  message += "预计幅度：" + forecast.amount + "\n";
}
if (forecast.perLiter) {
  message += "每升预测：" + forecast.perLiter + "\n";
}
if (forecast.changeRate) {
  message += "原油变化率：" + forecast.changeRate + "\n";
}
if (forecast.updatedAt) {
  message += "预测更新：" + forecast.updatedAt + "\n";
}
if (
  !forecast.direction &&
  !forecast.amount &&
  !forecast.perLiter &&
  !forecast.changeRate
) {
  message += "预测网页未提供可识别的涨跌数据\n";
}

} else {
message += “预测数据暂时无法获取\n”;

if (oil && oil.nextUpdateTime) {
  message +=
    "下次调价时间：" + oil.nextUpdateTime + "\n";
}

}

if (errors.length > 0) {
message += “━━━━━━━━━━━━━━\n”;
message += “⚠️ “ + errors.join(”；”) + “\n”;
}

message += “━━━━━━━━━━━━━━\n”;
message += “预测仅供参考，以官方公布为准。”;

notify(“今日油价及下次调价预测”, AREA, message);

console.log(message);
}

// ==================== 执行入口 ====================

main()
.catch(function (error) {
notify(“油价查询失败”, AREA, String(error));
console.log(String(error));
})
.finally(function () {
if (typeof $done !== “undefined”) {
$done();
}
});
