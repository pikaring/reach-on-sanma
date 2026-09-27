/*
 * ai.js - CPU の思考ルーチン
 *
 * CPU は「キャラクター（打ち筋）」と「難易度（腕前）」の 2 つで性格が決まる。
 *
 *   キャラクター ... α速度 / β打点 / γ守備 の重みと、副露基準・リーチ方針・オリ移行条件
 *   難易度       ... 場の残り枚数を読むか、どれくらい最善手を外すか
 *
 * 打牌は次の式で評価する。α・β・γ がキャラクターごとの重み。
 *
 *   評価 = -シャンテン数 * (500 + 500 * α)
 *        + 受け入れ枚数 * 8 * α
 *        + 打点期待値 * β
 *        - 危険度 * 2 * γ
 *
 * シャンテン数の重みも α に連動させているので、打点型は手を進めるより
 * ドラや染め手の形を残すことを選び、速攻型は形を崩してでも手を進める。
 */
(function (global) {
  'use strict';

  var MJ = global.MJ;
  var KITA = 30;

  /* --- キャラクター ----------------------------------------------------
   * 猫街三部作（猫街ろまん／猫が消えた街／街と、その白い壁）の 6 人。
   * id は顔アイコン（faces.js）の名前。talk は和了・優勝・放銃などのひとこと。
   * doraW はドラの見積もりへの追加の重み（既定 1）。 */
  var CHARACTERS = [
    {
      id: 'nao', name: 'ナオ', tag: '均',
      speed: 1.0, value: 1.0, defense: 1.0,
      call: 'yaku', riichi: 'always', foldFrom: 1, foldDanger: 2,
      call_ja: '1翻確定以上', riichi_ja: 'ほぼ即リー', fold_ja: '無筋2枚以上でノーテン時',
      desc: '小柄な黒髪メガネ。定石どおりに打ち、速度・打点・守備のどれにも寄らない',
      talk: {
        win: ['計算どおり、ね。', '待ちの枚数、ちゃんと数えてたわ。', '牌効率は裏切らないの。'],
        top: ['わたしの勝ち。…もう 1 半荘、つきあってくれる？', '落ち着いて打てば、結果はついてくるわ。'],
        lose: ['あれ…どこで読み違えたのかしら。', 'その待ち、読めなかったわ。']
      }
    },
    {
      id: 'fumi', name: 'フミ', tag: '攻',
      speed: 1.2, value: 1.1, defense: 0.3,
      call: 'loose', riichi: 'always', foldFrom: 4,
      call_ja: '緩め', riichi_ja: '即リー', fold_ja: 'ほぼしない（テンパイなら全押し）',
      desc: '大柄な茶髪のギャル。リーチが来ても降りない。テンパイなら全部押す',
      talk: {
        win: ['よっしゃー！ 押し勝ち〜！', 'てかウチ、天才じゃね？', 'オリるとか、ウチの辞書にないし！'],
        top: ['優勝〜！ ピースピース！', '全部押したら勝ってたんだけど！'],
        lose: ['え、ちょ、マジ！？', 'くやし〜！ 押しすぎた！？']
      }
    },
    {
      id: 'maki', name: 'マキ', tag: '速',
      speed: 1.8, value: 0.2, defense: 0.8,
      call: 'fast', riichi: 'dama', foldFrom: 1,
      call_ja: '2向聴から鳴く', riichi_ja: 'ダマ多め', fold_ja: 'テンパイ以外は降りる',
      desc: 'ソフトボール部のエース。打点を捨てて、鳴いて鳴いて速さで押し切る',
      talk: {
        win: ['ナイスピッチ！ 先に上がった！', '速攻こそエースの仕事！', '安くても、上がったもん勝ち！'],
        top: ['ゲームセット！ エースの勝ち！', '朝練より疲れた〜。でも勝った！'],
        lose: ['うそ、打たれた！？', '次の回で取り返す！']
      }
    },
    {
      id: 'chika', name: 'チカ', tag: '目',
      speed: 1.1, value: 1.0, defense: 1.2, doraW: 2.5,
      call: 'yaku', riichi: 'always', foldFrom: 2,
      call_ja: '1翻確定以上', riichi_ja: 'ほぼ即リー', fold_ja: '他家リーチで2向聴以上なら降りる',
      desc: '商店街の魚屋の娘。ドラ・赤・北の目利きで手を仕上げ、見込みのない手は早めに降りる',
      talk: {
        win: ['まいどあり〜！ ドラ、のってます！', '魚もドラも、目利きが大事！', 'へへっ、いいとこ仕入れといたんだ。'],
        top: ['やった！ 今日はお店、半額セール！ …うそうそ。', 'チーム魚屋の勝ち〜！'],
        lose: ['えっ、そこ待ち！？', '父ちゃんに笑われちゃうな…。']
      }
    },
    {
      id: 'daiou', name: 'タコ大王', tag: '打',
      speed: 0.4, value: 2.5, defense: 0.9,
      call: 'flush', riichi: 'bigdama', foldFrom: 3,
      call_ja: '染め手のみ', riichi_ja: '打点足りればダマ', fold_ja: '手役崩壊時のみ',
      desc: '魚屋を手伝う大王。安手には目もくれず、8 本の足で染め手と満貫級をかき集める',
      talk: {
        win: ['大物が釣れたダコ！', '8 本の足で、ぜんぶ染めたダコ。', '小物は海に返すダコ。'],
        top: ['わしが大王ダコ！ 魚屋の大王ダコ！', '勝ったら、みんなにタコ焼きをおごるダコ。'],
        lose: ['め、目が回るダコ〜。', 'わしの足が、からまったダコ…。']
      }
    },
    {
      id: 'queen', name: 'イカ女王', tag: '守',
      speed: 0.9, value: 0.6, defense: 2.5,
      call: 'yakuhai', riichi: 'value', foldFrom: 0,
      call_ja: '役牌のみ', riichi_ja: '打点条件付き', fold_ja: '他家リーチで即ベタオリ',
      desc: '海の向こうの女王。危ない牌は白い壁のように止め、リーチが入れば即座に守りを固める',
      talk: {
        win: ['ごきげんよう。わたくしの勝ちですわ。', '守りを固めれば、勝ちは向こうから来ますの。'],
        top: ['ひれ伏しなさい。…なんて、ちょっと言ってみたかっただけですわ。', 'わたくしの城に、ようこそ。'],
        lose: ['な、なんですって！？', 'わたくしの壁が…くずれるなんて。']
      }
    }
  ];

  /* --- 難易度（腕前） -------------------------------------------------- */
  var LEVELS = [
    // useUnseen : 受け入れを残り枚数で数えるか（false なら種類数だけ＝場を読まない）
    // doraAware : ドラの価値をどれだけ正しく見積もれるか
    // riichiMin : 待ちが何枚以上ならリーチを考えるか
    // slip/slipTop: この確率で最善手ではなく 2〜slipTop 番手の打牌を選ぶ
    // ponSlip   : 鳴ける場面を見送ってしまう確率
    { name: 'やさしい', useUnseen: false, doraAware: 0.3, riichiMin: 3, slip: 0.45, slipTop: 3, ponSlip: 0.35 },
    { name: 'ふつう', useUnseen: true, doraAware: 0.7, riichiMin: 2, slip: 0.20, slipTop: 2, ponSlip: 0.15 },
    { name: 'つよい', useUnseen: true, doraAware: 1.0, riichiMin: 1, slip: 0, slipTop: 1, ponSlip: 0 }
  ];

  function levelOf(game, me) {
    var d = me && me.difficulty != null ? me.difficulty : game.difficulty;
    return LEVELS[d == null ? 1 : Math.max(0, Math.min(LEVELS.length - 1, d))];
  }

  function charOf(me) {
    var c = me && me.character != null ? me.character : 0;
    return CHARACTERS[Math.max(0, Math.min(CHARACTERS.length - 1, c))];
  }

  function rand(game) { return (game.rng || Math.random)(); }

  /* --- 場に見えていない牌 ---------------------------------------------- */
  function unseenCounts(game, me) {
    var c = new Array(34);
    for (var i = 0; i < 34; i++) c[i] = MJ.isUsed(i) ? 4 : 0;
    function sub(t) { if (c[t] > 0) c[t]--; }
    me.hand.forEach(function (t) { sub(t.t); });
    game.players.forEach(function (p) {
      p.discards.forEach(function (d) { sub(d.tile.t); });
      p.melds.forEach(function (m) { m.tiles.forEach(function (t) { sub(t.t); }); });
      (p.kita || []).forEach(function (t) { sub(t.t); });
    });
    game.doraIndicators.forEach(sub);
    return c;
  }

  /* --- 打点まわり ------------------------------------------------------ */

  /** 手牌に含まれるドラ（赤・抜き含む）の枚数 */
  function doraValue(game, me, tiles) {
    var doras = game.doraIndicators.map(MJ.doraFromIndicator);
    var n = (me.kita || []).length;
    tiles.forEach(function (t) {
      if (t.red) n++;
      if (doras.indexOf(t.t) >= 0) n++;
    });
    (me.melds || []).forEach(function (m) {
      m.tiles.forEach(function (t) {
        if (t.red) n++;
        if (doras.indexOf(t.t) >= 0) n++;
      });
    });
    return n;
  }

  /** 手役の方向性による加点 */
  function shapeBonus(counts, seatWind, roundWind) {
    var bonus = 0;
    [31, 32, 33, seatWind, roundWind].forEach(function (t) {
      if (counts[t] >= 2) bonus += 6;
      if (counts[t] >= 3) bonus += 8;
    });
    var f = flushRatio(counts);
    if (f >= 0.85) bonus += 20;
    else if (f >= 0.7) bonus += 8;
    else if (f >= 0.55) bonus += 3;
    return bonus;
  }

  /** 一色（字牌込み）に寄っている度合い 0〜1 */
  function flushRatio(counts) {
    var suit = [0, 0, 0], honor = 0, total = 0;
    for (var i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      total += counts[i];
      if (i >= 27) honor += counts[i]; else suit[Math.floor(i / 9)] += counts[i];
    }
    if (total === 0) return 0;
    return (Math.max(suit[0], suit[1], suit[2]) + honor) / total;
  }

  /**
   * テンパイ時に、リーチを打たなかった場合の最高打点を見積もる。
   * 返り値 { han, hasYaku, dora }
   */
  function winEstimate(game, me, counts13, tiles13) {
    var meldDefs = (me.melds || []).map(function (m) { return { type: m.type, tile: m.tile }; });
    var red = 0;
    tiles13.forEach(function (t) { if (t.red) red++; });
    (me.melds || []).forEach(function (m) {
      m.tiles.forEach(function (t) { if (t.red) red++; });
    });

    var best = { han: 0, hasYaku: false, dora: doraValue(game, me, tiles13) };
    var w = MJ.waits(counts13, (me.melds || []).length);
    for (var i = 0; i < w.length; i++) {
      counts13[w[i]]++;
      var r = MJ.evaluate({
        concealed: counts13, melds: meldDefs, winTile: w[i], isTsumo: false,
        seatWind: me.seatWind, roundWind: game.roundWind,
        doraIndicators: game.doraIndicators, redCount: red,
        kitaCount: (me.kita || []).length
      });
      counts13[w[i]]--;
      if (r.valid && r.han > best.han) { best.han = r.han; best.hasYaku = true; }
    }
    return best;
  }

  /* --- 危険度 ---------------------------------------------------------- */
  function danger(game, me, tile) {
    var risk = 0;
    game.players.forEach(function (p) {
      if (p.seat === me.seat || !p.riichi) return;
      if (p.discards.some(function (d) { return d.tile.t === tile.t; })) return; // 現物
      var passed = game.players.some(function (q) {
        return q !== p && q.discards.some(function (d) {
          return d.tile.t === tile.t && d.turn >= p.riichiTurn;
        });
      });
      if (passed) return;
      risk += MJ.isYaochu(tile.t) ? 6 : 10;
      if (MJ.isHonor(tile.t)) risk -= 3;
      var n = MJ.numOf(tile.t);
      if (!MJ.isHonor(tile.t) && n >= 4 && n <= 6) risk += 3;
    });
    return risk;
  }

  /** ベタオリに回るか（キャラクターの「オリ移行」条件） */
  function shouldFold(game, me, shanten) {
    var ch = charOf(me);
    var riichiExists = game.players.some(function (p) {
      return p.seat !== me.seat && p.riichi;
    });
    if (!riichiExists) return false;
    if (me.riichi) return false; // 自分がリーチしていれば降りられない
    if (shanten < ch.foldFrom) return false;
    if (ch.foldDanger) {
      // 無筋（通っていない牌）を何枚抱えているか
      var n = 0;
      me.hand.forEach(function (t) { if (danger(game, me, t) > 0) n++; });
      if (n < ch.foldDanger) return false;
    }
    return true;
  }

  /* --- 打牌 ------------------------------------------------------------ */
  function chooseDiscard(game, me) {
    var lv = levelOf(game, me);
    var ch = charOf(me);
    var meldCount = me.melds.length;
    var unseen = unseenCounts(game, me);
    var counts = MJ.toCounts(me.hand);
    var baseShanten = MJ.shanten(counts, meldCount);
    var defensive = shouldFold(game, me, baseShanten);

    // 打牌候補ごとのシャンテン数を先に求め、最小の候補だけ受け入れを厳密に数える
    var minShanten = 99, cand = [], seen = {};
    for (var i = 0; i < me.hand.length; i++) {
      var key = me.hand[i].t + (me.hand[i].red ? 'r' : '');
      if (seen[key]) continue;
      seen[key] = true;
      counts[me.hand[i].t]--;
      var sh0 = MJ.shanten(counts, meldCount);
      counts[me.hand[i].t]++;
      cand.push({ index: i, shanten: sh0 });
      if (sh0 < minShanten) minShanten = sh0;
    }

    var scored = [];
    for (var ci = 0; ci < cand.length; ci++) {
      var idx = cand[ci].index;
      var tile = me.hand[idx];
      var sh = cand[ci].shanten;

      counts[tile.t]--;
      var accept = 0;
      if (sh === minShanten || defensive) {
        MJ.ukeire(counts, meldCount).forEach(function (t) {
          accept += lv.useUnseen ? unseen[t] : 1;
        });
        if (!lv.useUnseen) accept *= 4;
      }
      var rest = me.hand.filter(function (_, k) { return k !== idx; });
      var value = (doraValue(game, me, rest) * 12 * lv.doraAware * (ch.doraW || 1) +
        shapeBonus(counts, me.seatWind, game.roundWind)) * ch.value;
      counts[tile.t]++;

      var risk = danger(game, me, tile);
      var score;
      if (defensive) {
        score = -risk * 20 * ch.defense + accept * 0.5 - sh * 30;
      } else {
        score = -sh * (500 + 500 * ch.speed) + accept * 8 * ch.speed + value
          - risk * 2 * ch.defense;
        if (tile.red) score -= 40 * ch.value; // 赤は打点キャラほど抱える
      }
      scored.push({ index: idx, score: score });
    }

    if (!scored.length) return me.hand.length - 1;
    scored.sort(function (a, b) { return b.score - a.score; });
    // 腕前が低いほど、ときどき最善手ではなく次善手を選ぶ
    var pick = 0;
    if (lv.slip > 0 && scored.length > 1 && rand(game) < lv.slip) {
      pick = 1 + Math.floor(rand(game) * (Math.min(lv.slipTop, scored.length) - 1));
    }
    return scored[pick].index;
  }

  /* --- リーチ ---------------------------------------------------------- */
  function shouldRiichi(game, me, discardIndex) {
    var lv = levelOf(game, me);
    var ch = charOf(me);
    if (game.wall.length < 4) return false;
    if (me.points != null && me.points < 1000) return false;

    var tiles = me.hand.filter(function (_, i) { return i !== discardIndex; });
    var counts = MJ.toCounts(tiles);
    var w = MJ.waits(counts, me.melds.length);
    if (w.length === 0) return false;

    var unseen = unseenCounts(game, me);
    var live = w.reduce(function (a, t) { return a + unseen[t]; }, 0);
    if (live < lv.riichiMin) return false;
    if (game.wall.length < 8 && live <= 2) return false;

    var est = winEstimate(game, me, counts, tiles);
    switch (ch.riichi) {
      case 'value':                       // イカ女王: 打点が伴うときだけ
        return est.dora >= 1 || est.han >= 1;
      case 'dama':                        // マキ: 役があるならダマに構えがち
        return !(est.hasYaku && rand(game) < 0.7);
      case 'bigdama':                     // タコ大王: 満貫級ならダマで十分
        return !(est.hasYaku && est.han >= 4);
      default:                            // ナオ・フミ・チカ: ほぼ即リー
        return true;
    }
  }

  /* --- 鳴き ------------------------------------------------------------ */
  function shouldPon(game, me, tile) {
    var lv = levelOf(game, me);
    var ch = charOf(me);
    var counts = MJ.toCounts(me.hand);
    if (counts[tile.t] < 2) return false;
    if (me.riichi) return false;

    var before = MJ.shanten(counts, me.melds.length);
    counts[tile.t] -= 2;
    var after = MJ.shanten(counts, me.melds.length + 1);
    if (after > before) return false;
    if (after === before && after > 0) return false;
    if (rand(game) < lv.ponSlip) return false;

    var isYakuhai = MJ.isDragon(tile.t) || tile.t === me.seatWind || tile.t === game.roundWind;

    var all = MJ.toCounts(me.hand);
    all[tile.t] += 1;
    var tanyao = true;
    for (var i = 0; i < 34; i++) if (all[i] > 0 && MJ.isYaochu(i)) { tanyao = false; break; }
    var flush = flushRatio(all) >= 0.8;
    var hasYakuhai = [31, 32, 33, me.seatWind, game.roundWind].some(function (t) {
      return MJ.toCounts(me.hand)[t] >= 2;
    });

    switch (ch.call) {
      case 'yakuhai':                     // イカ女王: 役牌のみ
        return isYakuhai;
      case 'flush':                       // タコ大王: 染め手のみ
        return flush;
      case 'fast':                        // マキ: 2向聴から鳴く
        return after <= 2;
      case 'loose':                       // フミ: 緩め
        return isYakuhai || tanyao || flush || hasYakuhai || after <= 1;
      default:                            // ナオ・チカ: 1翻確定が見込めるときだけ
        if (isYakuhai) return true;
        return (tanyao || flush || hasYakuhai) && after <= 1;
    }
  }

  function shouldMinkan(game, me, tile) {
    if (me.riichi) return false;
    var ch = charOf(me);
    var counts = MJ.toCounts(me.hand);
    if (counts[tile.t] < 3) return false;
    var isYakuhai = MJ.isDragon(tile.t) || tile.t === me.seatWind || tile.t === game.roundWind;
    var before = MJ.shanten(counts, me.melds.length);
    counts[tile.t] -= 3;
    var after = MJ.shanten(counts, me.melds.length + 1);
    if (after > before) return false;
    if (ch.call === 'yakuhai' && !isYakuhai) return false;
    return isYakuhai || after <= 0;
  }

  function shouldKanSelf(game, me, tile, type) {
    if (me.riichi) return false;
    var counts = MJ.toCounts(me.hand);
    var before = MJ.shanten(counts, me.melds.length);
    if (type === 'ankan') {
      if (counts[tile] < 4) return false;
      counts[tile] -= 4;
      return MJ.shanten(counts, me.melds.length + 1) <= before;
    }
    return true;
  }

  /** 北を抜くか。基本は常に抜くが、国士無双が見えているときだけ手牌に残す */
  function shouldKita(game, me) {
    var counts = MJ.toCounts(me.hand);
    if (me.melds.length === 0 && MJ.shantenKokushi(counts) <= 3) return false;
    return true;
  }

  MJ.ai = {
    chooseDiscard: chooseDiscard,
    shouldRiichi: shouldRiichi,
    shouldPon: shouldPon,
    shouldMinkan: shouldMinkan,
    shouldKanSelf: shouldKanSelf,
    shouldKita: shouldKita,
    shouldFold: shouldFold,
    unseenCounts: unseenCounts,
    winEstimate: winEstimate,
    CHARACTERS: CHARACTERS,
    LEVELS: LEVELS,
    levelOf: levelOf,
    charOf: charOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
