/***********************
 * 用户可配置区域
 ***********************/
const AREA = "江苏";   // ← 这里改成你要的地区，如：北京 / 上海 / 浙江 / 广东

/***********************
 * API 配置（无需 key）
 ***********************/
const url = "https://www.iamwawa.cn/oilprice/api?area=" + encodeURIComponent(AREA);
const headers = {
  "User-Agent": "iamwawa-open-api"
};

const request = {
  url: url,
  headers: headers,
  timeout: 10000
};

function formatResult(data) {
  if (!data || data.status != 1 || !data.data) return null;
  const d = data.data;
  return {
    date: d.date || "",
    p92: d.p92 || "N/A",
    p95: d.p95 || "N/A",
    p98: d.p98 || "N/A",
    p0: d.p0 || "N/A"
  };
}

/***********************
 * 兼容 QX / Surge / Loon / Egern
 ***********************/
function notify(title, subtitle, body) {
  if (typeof $notify !== "undefined") {
    $notify(title, subtitle, body);
  }
}

function done() {
  if (typeof $done !== "undefined") $done();
}

if (typeof $task !== "undefined") {
  // Quantumult X / Egern
  $task.fetch(request).then(
    resp => handleResponse(resp.body),
    err => {
      notify("油价查询失败", AREA, "网络错误");
      done();
    }
  );
} else if (typeof $httpClient !== "undefined") {
  // Surge / Loon
  $httpClient.get(request, (err, resp, body) => {
    if (err) {
      notify("油价查询失败", AREA, "网络错误");
      return done();
    }
    handleResponse(body);
  });
} else {
  console.log("Unsupported runtime");
}

function handleResponse(body) {
  try {
    const obj = JSON.parse(body);
    const oil = formatResult(obj);

    if (!oil) {
      notify("油价查询失败", AREA, "返回数据异常");
    } else {
      const msg =
        `⛽ ${AREA} 今日油价 (${oil.date})\n` +
        `92号: ${oil.p92} 元/升\n` +
        `95号: ${oil.p95} 元/升\n` +
        `98号: ${oil.p98} 元/升\n` +
        `0号柴油: ${oil.p0} 元/升`;

      notify("今日油价", AREA, msg);
      console.log(msg);
    }
  } catch (e) {
    notify("油价查询失败", AREA, "JSON 解析错误");
  }
  done();
}
