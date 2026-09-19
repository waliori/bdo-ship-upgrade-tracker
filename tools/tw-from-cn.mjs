// 繁體中文 out of 中文: js/lang/cn.json into js/lang/tw.json.
//
// Taiwan and the mainland differ in two ways at once, so a character table
// on its own is not enough: 制作 is 製作 but 制动 is 制動, 计划 is 計劃 but
// 划艇 is still 划艇, and a 文件 is a 檔案. So three passes, in order.
//
//   1. KEEP parks the phrases whose ambiguous characters must be left alone
//      -- 公里, the names 達里奧 and 阿格里斯, 划艇 -- behind a private-use
//      marker, with their traditional form given outright.
//   2. WORDS both disambiguates (製作/繪製/複製, 恢復/重複/答覆, 儘早/耗盡)
//      and swaps in Taiwan vocabulary (檔案, 螢幕, 資料, 連結, 視窗, 欄位).
//   3. CHAR converts what is left, one character at a time.
//
// A character the map should have converted and did not is a miss, and the
// script says so rather than writing the file.
//
//   node tools/tw-from-cn.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG = path.join(ROOT, 'js', 'lang');

/** Phrases parked whole: their traditional form is given outright. */
const KEEP = [
	['公里', '公里'], ['西里尔', '西里爾'], ['达里奥', '達里奧'], ['卡里奥', '卡里奧'],
	['克里欧', '克里歐'], ['库里欧', '庫里歐'], ['普里科', '普里科'], ['阿格里斯', '阿格里斯'],
	['里克萨', '里克薩'], ['划艇', '划艇'],
];

/** Disambiguation first, then Taiwan vocabulary. Applied in this order. */
const WORDS = [["干什么","幹什麼"],
	["干珍珠贝","乾珍珠貝"],
	["干贝类","乾貝類"],
	["船只","船隻"],
	["联系","聯絡"],
	["制作","製作"],
	["绘制","繪製"],
	["复制","複製"],
	["制图","製圖"],
	["特制","特製"],
	["尽早","儘早"],
	["尽管","儘管"],
	["耗尽","耗盡"],
	["恢复","恢復"],
	["重复","重複"],
	["答复","答覆"],
	["修复","修復"],
	["青云","青雲"],
	["直冲","直衝"],
	["咸水鳄","鹹水鱷"],
	["触摸屏","觸控螢幕"],
	["全屏","全螢幕"],
	["整屏","全螢幕"],
	["一屏","一個畫面"],
	["四屏","四個畫面"],
	["屏幕","螢幕"],
	["鼠标指针","滑鼠指標"],
	["鼠标","滑鼠"],
	["指针","指標"],
	["文件夹","資料夾"],
	["文件","檔案"],
	["数据库","資料庫"],
	["数据","資料"],
	["重新加载","重新載入"],
	["加载","載入"],
	["标签页","分頁"],
	["标签","標籤"],
	["可撤销","可復原"],
	["撤销","復原"],
	["上的项目","上的專案"],
	["视图","檢視"],
	["信息","資訊"],
	["设置","設定"],
	["默认","預設"],
	["网络","網路"],
	["视频","影片"],
	["缓存","快取"],
	["服务器","伺服器"],
	["打印","列印"],
	["粘贴","貼上"],
	["保存","儲存"],
	["登录","登入"],
	["图标","圖示"],
	["队列","佇列"],
	["链接","連結"],
	["分辨率","解析度"],
	["字体","字型"],
	["账号","帳號"],
	["优先级","優先順序"],
	["导出","匯出"],
	["导入","匯入"],
	["搜索","搜尋"],
	["剪贴板","剪貼簿"],
	["拖动","拖曳"],
	["界面","介面"],
	["字符","字元"],
	["构建","建置"],
	["配置档","設定檔"],
	["内置","內建"],
	["软件","軟體"],
	["支持","支援"],
	["算法","演算法"],
	["程序","程式"],
	["合并","合併"],
	["书签","書籤"],
	["窗口","視窗"],
	["字段","欄位"],
	["发布","發佈"],
	["公布","公佈"],
	["字节","位元組"],
	["时间戳","時間戳記"],
	["游戏","遊戲"]];

const S = "万与专东丝两个为丽么义乐乔习书买争于亏云亚产亿仅从仓们价优会传伤伦体佣侧倾储儿兑兰关内册写农冲决况净减凑几凭凯击划则刚创删别剂剑剧办务动励劳势勋区华单卖卫历压厨参双发变叠号后吗听启员响唤团围图圆场坏块坞声壳处复够头夹奖奥娅学宁宝实宠宽对寻导寿将尔尝尽层屉属屿岛峡币师帜带帧帮并广库应开弃张弯弹强归当录径怀态总悬愿懒戏战户执扩扫抢护报担拟拥拦拧择挂挡损换据掷搁携摄摊数断无旧时显晒晕暂术机杀杂权杠条来构标栏树栖样档检槛横欧残气汇汉汤没泪浅测浏涂渔渗湾湿滚满滥潜灯灵炉点炼烂烦热状独猎猪献獭玛环现画盐盖盗盘睁码础确碍礼离秃种积称穷窍窝竖竞笔筛签简类紧纠红约级纯纳线练组细终绍经结绕绘给络绝统继绪续维绿缓编缘缩职联胜胶脉腾舰舱节范荐药莱获营萨蓝虚虽补装见观规视览触计订认讨让训议记讲许论设访证评识诉词试诚话询该详语误说请诺读谁调谚谜谢谱贝负贡责败账货购贯贴贸费资赋赖赚赛赢赶跃踪轨转轮软轴轻载较辑输辞边达迁过迈运还这进远连迹适选递逻遗遥释鉴针钉钓钟钥钮钱铁铃铜银铺链销锁锈错锚锭键镜长门闪闭问闲间闹闻阅阔队阴阵阶际陆陨险随隐难雾静韩页顶项顺须顾顿预领频颗题颜额风飞饥饿馆馈马驰驶验骤鱼鲁鲨鳄鳞鸟鸣麸黄齐龙着里咸准备网罗罚却余占";
const T = "萬與專東絲兩個為麗麼義樂喬習書買爭於虧雲亞產億僅從倉們價優會傳傷倫體傭側傾儲兒兌蘭關內冊寫農衝決況淨減湊幾憑凱擊劃則剛創刪別劑劍劇辦務動勵勞勢勳區華單賣衛歷壓廚參雙發變疊號後嗎聽啟員響喚團圍圖圓場壞塊塢聲殼處複夠頭夾獎奧婭學寧寶實寵寬對尋導壽將爾嘗盡層屜屬嶼島峽幣師幟帶幀幫並廣庫應開棄張彎彈強歸當錄徑懷態總懸願懶戲戰戶執擴掃搶護報擔擬擁攔擰擇掛擋損換據擲擱攜攝攤數斷無舊時顯曬暈暫術機殺雜權槓條來構標欄樹棲樣檔檢檻橫歐殘氣匯漢湯沒淚淺測瀏塗漁滲灣濕滾滿濫潛燈靈爐點煉爛煩熱狀獨獵豬獻獺瑪環現畫鹽蓋盜盤睜碼礎確礙禮離禿種積稱窮竅窩豎競筆篩簽簡類緊糾紅約級純納線練組細終紹經結繞繪給絡絕統繼緒續維綠緩編緣縮職聯勝膠脈騰艦艙節範薦藥萊獲營薩藍虛雖補裝見觀規視覽觸計訂認討讓訓議記講許論設訪證評識訴詞試誠話詢該詳語誤說請諾讀誰調諺謎謝譜貝負貢責敗帳貨購貫貼貿費資賦賴賺賽贏趕躍蹤軌轉輪軟軸輕載較輯輸辭邊達遷過邁運還這進遠連跡適選遞邏遺遙釋鑑針釘釣鐘鑰鈕錢鐵鈴銅銀鋪鏈銷鎖鏽錯錨錠鍵鏡長門閃閉問閒間鬧聞閱闊隊陰陣階際陸隕險隨隱難霧靜韓頁頂項順須顧頓預領頻顆題顏額風飛飢餓館饋馬馳駛驗驟魚魯鯊鱷鱗鳥鳴麩黃齊龍著裡鹹準備網羅罰卻餘佔";

if (S.length !== T.length) {
	console.error(`character map lengths differ: ${S.length} against ${T.length}`);
	process.exit(1);
}
const CHAR = new Map([...S].map((c, i) => [c, T[i]]));

const MARK = i => String.fromCharCode(0xe100 + i);

/** Converted, with the parked phrases still behind their markers. */
function marked(s) {
	let out = s;
	KEEP.forEach(([from], i) => { out = out.split(from).join(MARK(i)); });
	for (const [from, to] of WORDS) out = out.split(from).join(to);
	// 隻 is the classifier, 只 the adverb: 五只宠物 against 只有一个.
	out = out.replace(/([一二三四五六七八九十百千两0-9])只/g, '$1隻');
	return [...out].map(c => CHAR.get(c) || c).join('');
}

function restore(s) {
	let out = s;
	KEEP.forEach(([, to], i) => { out = out.split(MARK(i)).join(to); });
	return out;
}

const cn = JSON.parse(fs.readFileSync(path.join(LANG, 'cn.json'), 'utf8'));
const tw = {};
const left = new Map();
for (const [k, v] of Object.entries(cn)) {
	const m = marked(v);
	// Counted before the parked phrases come back, since those carry 里 and
	// 划 on purpose.
	for (const c of m) if (CHAR.has(c)) left.set(c, (left.get(c) || 0) + 1);
	tw[k] = restore(m);
}

if (left.size) {
	console.error('left unconverted: ' + [...left.entries()].map(([c, n]) => c + n).join(' '));
	process.exit(1);
}

fs.writeFileSync(path.join(LANG, 'tw.json'), JSON.stringify(tw, null, '\t') + '\n');
console.log(`tw.json: ${Object.keys(tw).length} sentences`);
