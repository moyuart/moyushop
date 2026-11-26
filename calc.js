/* ============================================================
   优惠计算引擎（纯函数，无 DOM 依赖，可被单元测试 require）
   核心原则：全部用「分」做整数运算，避免浮点误差。
   ============================================================ */
(function (root) {
  'use strict';

  /** 元(可能是小数) -> 分(整数)，四舍五入 */
  function yuanToFen(yuan) {
    return Math.round(Number(yuan) * 100);
  }

  /** 分 -> 展示整数元（四舍五入到整数，符合店铺"价格取整"规则） */
  function fenToYuanInt(fen) {
    return Math.round(fen / 100);
  }

  /**
   * 满件折扣：取所有已启用、且件数达标规则中「折扣最低(优惠最大)」的一条。
   * 返回 { off, label, min } 或 null
   */
  function pickQtyDiscount(qty, rules) {
    if (!Array.isArray(rules) || qty <= 0) return null;
    let best = null;
    for (const r of rules) {
      if (!r.enabled) continue;
      const min = Number(r.min) || 0;
      const off = Number(r.off);
      if (qty >= min && off > 0 && off < 1) {
        if (!best || off < best.off || (off === best.off && min > best.min)) {
          best = { off, label: r.label || ('满' + min + '件' + Math.round(off * 10) + '折'), min };
        }
      }
    }
    return best;
  }

  /**
   * 计算订单
   * @param items [{price: 元, qty: 件数}]  已选商品（每个规格算 1 件，qty 通常为 1）
   * @param promo {qtyDiscounts:[...], gift:{enabled,threshold,pool:[...]}}
   * @param giftId 买家选中的赠品 id（可空）
   * @returns {
   *   qty, subtotalFen, subtotalYuan, discountFen, discountYuan,
   *   payableFen, payableYuan, appliedDiscount, giftEligible, gift
   * }
   */
  function calcOrder(items, promo, giftId) {
    promo = promo || {};
    items = Array.isArray(items) ? items : [];

    // 1) 商品小计（分）
    let subtotalFen = 0;
    let qty = 0;
    for (const it of items) {
      const q = Math.max(0, parseInt(it.qty, 10) || 1);
      subtotalFen += yuanToFen(it.price) * q;
      qty += q;
    }

    // 2) 满件折扣
    const applied = pickQtyDiscount(qty, promo.qtyDiscounts);
    let discountFen = 0;
    if (applied) {
      // 折后 = 小计 * off；优惠额 = 小计 - 折后，四舍五入到分
      discountFen = subtotalFen - Math.round(subtotalFen * applied.off);
    }
    let payableFen = Math.max(0, subtotalFen - discountFen);

    // 3) 满赠判定（按折后金额判断门槛，整数元比较）
    const giftCfg = promo.gift || {};
    const payableYuan = fenToYuanInt(payableFen);
    const giftEligible = !!(giftCfg.enabled && payableYuan >= Number(giftCfg.threshold || 0));
    let gift = null;
    if (giftEligible && giftId) {
      const found = (giftCfg.pool || []).find(g => String(g.id) === String(giftId) && Number(g.qty) > 0);
      if (found) gift = { id: found.id, name: found.name, img: found.img, qty: found.qty };
    }

    return {
      qty,
      subtotalFen,
      subtotalYuan: fenToYuanInt(subtotalFen),
      discountFen,
      discountYuan: fenToYuanInt(discountFen),
      payableFen,
      payableYuan,
      appliedDiscount: applied,
      giftEligible,
      gift
    };
  }

  const api = { yuanToFen, fenToYuanInt, pickQtyDiscount, calcOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
