/***********************

* 用户可配置区域
    ***********************/
    const AREA = “江苏”;

/***********************

* API 配置
    ***********************/
    const url = “https://www.iamwawa.cn/oilprice/api?area=” + encodeURIComponent(AREA);

const headers = {
“User-Agent”: “iamwawa-open-api”
};

const request = {
url: url,
headers: headers,
timeout: 10000
};

/***********************

* 格式化返回数据
    ***********************/
    function formatResult(data) {
    if (!data || data.status != 1 || !data.data) {
    return null;
    }

const d = data.data;

return {
date: d.date || “未知”,
nextUpdateTime: d.next_update_time || “未知”,
p92: d.p92 || “N/A”,
p95: d.p95 || “N/A”,
p98: d.p98 || “N/A”,
p0: d.p0 || “N/A”
};
}

/***********************

* 通知
    ***********************/
    function notify(title, subtitle, body) {
    if (typeof $notify !== “undefined”) {
    $notify(title, subtitle, body);
    }
    }

function done() {
if (typeof $done !== “undefined”) {
$done();
}
}

/***********************

* 兼容 Quantumult X / Egern
    ***********************/
    if (typeof $task !== “undefined”) {
    $task.fetch(request).then(
    resp => handleResponse(resp.body),
    err => {
    notify(“油价查询失败”, AREA, “网络请求失败”);
    done();
    }
    );
    }

/***********************

* 兼容 Surge / Loon
    ***********************/
    else if (typeof $httpClient !== “undefined”) {
    $httpClient.get(request, (err, resp, body) => {
    if (err) {
    notify(“油价查询失败”, AREA, “网络请求失败”);
    return done();
    }
    handleResponse(body);
    });
    } else {
    console.log(“Unsupported runtime”);
    }

/***********************

* 处理响应
    ***********************/
    function handleResponse(body) {
    try {
    const obj = JSON.parse(body);
    const oil = formatResult(obj);
    if (!oil) {
    notify(“油价查询失败”, AREA, “返回数据异常”);
    return done();
    }
    const msg =
    ⛽ ${AREA} 今日油价\n +
    数据日期：${oil.date}\n +
    ━━━━━━━━━━━━━━\n +
    92号汽油：${oil.p92} 元/升\n +
    95号汽油：${oil.p95} 元/升\n +
    98号汽油：${oil.p98} 元/升\n +
    0号柴油：${oil.p0} 元/升\n +
    ━━━━━━━━━━━━━━\n +
    📅 下次预计调价：${oil.nextUpdateTime};
    notify(“今日油价及下次调价”, AREA, msg);
    console.log(msg);

} catch (e) {
notify(“油价查询失败”, AREA, “JSON 解析错误”);
}

done();
}
