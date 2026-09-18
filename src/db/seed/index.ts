/**
 * Demo data generator. Deterministic (seeded PRNG) relative to `now`.
 * Used by: PGlite auto-init (seedIfEmpty) and `npm run db:seed`.
 */
import { hashPassword } from "better-auth/crypto";
import { count, sql } from "drizzle-orm";
import { demoAccounts, demoPassword } from "@/config/demo";
import { feeConfig, calcCommission } from "@/config/fees";
import { images } from "@/config/images";
import { shippingPolicy } from "@/config/shipping";
import { addDays, toYmd, fromYmd } from "@/lib/dates";
import { quoteShipment } from "@/lib/shipping";
import type { Database } from "../client";
import * as s from "../schema";
import { farmerReplies, imageUrl, reviewTexts, seedCustomers, seedFarms } from "./data";

const DAY = 86_400_000;

function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function chunkInsert<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>, size = 200) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function seedIfEmpty(db: Database) {
  const [{ n }] = await db.select({ n: count() }).from(s.user);
  if (n > 0) return false;
  await seed(db, new Date());
  return true;
}

export async function resetDatabase(db: Database) {
  await db.execute(sql`
    truncate table job_runs, platform_settings, announcements, notifications, coupons, payouts,
      messages, farm_follows, favorites, reviews, shipment_events, order_items, farm_orders, orders,
      addresses, product_images, product_variants, products, farms, verification, account, session, "user"
    restart identity cascade`);
}

export async function seed(db: Database, now: Date) {
  const rand = prng(20260918);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const uid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  const passwordHash = await hashPassword(demoPassword);
  const t0 = Date.now();

  /* ── users ── */
  type U = typeof s.user.$inferInsert;
  const users: U[] = [];
  const mkUser = (name: string, email: string, role: s.UserRole, createdAt: Date): U => {
    const u: U = { id: uid(), name, email, role, emailVerified: true, createdAt, updatedAt: createdAt };
    users.push(u);
    return u;
  };
  const admin = mkUser(demoAccounts[2].name, demoAccounts[2].email, "admin", new Date(now.getTime() - 400 * DAY));
  const farmerUsers = seedFarms.map((f, i) =>
    mkUser(f.owner.name, f.owner.email, f.status === "active" ? "farmer" : "customer", new Date(now.getTime() - (380 - i * 20) * DAY)),
  );
  const customers = seedCustomers.map((c, i) => ({
    user: mkUser(c.name, c.email, "customer", new Date(now.getTime() - (240 - i * 9) * DAY)),
    ...c,
  }));
  await db.insert(s.user).values(users);
  await db.insert(s.account).values(
    users.map((u) => ({ id: uid(), accountId: u.id!, providerId: "credential", userId: u.id!, password: passwordHash })),
  );

  /* ── addresses ── */
  const addressRows = customers.map((c) => ({
    userId: c.user.id!,
    label: "自宅",
    recipientName: c.name,
    postalCode: c.postal,
    prefecture: c.pref,
    city: c.city,
    line1: c.line1,
    phone: "090-0000-0000",
    isDefault: true,
  }));
  addressRows.push({ ...addressRows[0], label: "実家", prefecture: "兵庫県", city: "神戸市東灘区", line1: "御影本町1-1", postalCode: "6580046", isDefault: false });
  await db.insert(s.addresses).values(addressRows);

  /* ── farms / products ── */
  type FarmCtx = {
    row: typeof s.farms.$inferSelect;
    seed: (typeof seedFarms)[number];
    variants: { id: string; productId: string; label: string; grams: number; price: number; productName: string; image: string }[];
  };
  const farmCtx: FarmCtx[] = [];
  for (const [i, f] of seedFarms.entries()) {
    const [row] = await db
      .insert(s.farms)
      .values({
        ownerId: farmerUsers[i].id!,
        slug: f.slug,
        name: f.name,
        tagline: f.tagline,
        story: f.story,
        representative: f.representative,
        postalCode: f.postalCode,
        city: f.city,
        addressLine: f.addressLine,
        phone: "0799-00-0000",
        heroImage: imageUrl(f.hero),
        avatarImage: imageUrl(f.avatar),
        gallery: f.gallery.map(imageUrl),
        cultivationMethods: f.cultivation,
        establishedYear: f.established,
        status: f.status,
        defaultCarrier: f.carrier,
        leadTimeDays: f.leadTimeDays,
        freeShippingThreshold: f.freeShippingThreshold,
        isFeatured: f.featured ?? false,
        approvedAt: f.status === "active" ? farmerUsers[i].createdAt : null,
        createdAt: farmerUsers[i].createdAt,
      })
      .returning();
    const ctx: FarmCtx = { row, seed: f, variants: [] };
    for (const [pi, p] of f.products.entries()) {
      const [prod] = await db
        .insert(s.products)
        .values({
          farmId: row.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          variety: p.variety,
          summary: p.summary,
          description: p.description,
          highlights: p.highlights,
          cultivation: p.cultivation,
          storageTips: p.category === "processed" ? "直射日光・高温多湿を避けて常温で保存してください。" : "ネットに入れて風通しの良い冷暗所に吊るして保存してください。",
          harvestFrom: p.harvest[0],
          harvestTo: p.harvest[1],
          status: p.status ?? (p.variants.every((v) => v.stock === 0) ? "soldout" : "active"),
          isFeatured: p.featured ?? false,
          sortOrder: pi,
          publishedAt: p.status === "draft" ? null : row.createdAt,
          createdAt: new Date(row.createdAt.getTime() + (pi + 1) * DAY),
        })
        .returning();
      await db.insert(s.productImages).values(p.images.map((k, idx) => ({ productId: prod.id, url: images[k], alt: p.name, sortOrder: idx })));
      const vs = await db
        .insert(s.productVariants)
        .values(
          p.variants.map((v, idx) => ({
            productId: prod.id,
            label: v.label,
            weightGrams: v.grams,
            price: v.price,
            compareAtPrice: v.compareAt ?? null,
            stock: v.stock,
            sku: `${f.slug}-${pi + 1}-${idx + 1}`.toUpperCase(),
            isDefault: idx === 0,
            sortOrder: idx,
          })),
        )
        .returning();
      if (prod.status === "active")
        ctx.variants.push(...vs.map((v) => ({ id: v.id, productId: prod.id, label: v.label, grams: v.weightGrams, price: v.price, productName: prod.name, image: images[p.images[0]] })));
    }
    farmCtx.push(ctx);
  }

  /* ── orders (last 180 days) ── */
  const activeFarms = farmCtx.filter((f) => f.row.status === "active" && f.variants.length);
  const weightedFarms = activeFarms.flatMap((f) => Array(f.seed.weight).fill(f) as FarmCtx[]);
  const orderRows: (typeof s.orders.$inferInsert)[] = [];
  const foRows: (typeof s.farmOrders.$inferInsert)[] = [];
  const itemRows: (typeof s.orderItems.$inferInsert)[] = [];
  const eventRows: (typeof s.shipmentEvents.$inferInsert)[] = [];
  const soldByProduct = new Map<string, number>();
  const deliveredFo: { fo: typeof s.farmOrders.$inferInsert; productId: string; userId: string; farmId: string; at: Date }[] = [];

  let seq = 0;
  for (let daysAgo = 180; daysAgo >= 0; daysAgo--) {
    const day = new Date(now.getTime() - daysAgo * DAY);
    const month = Number(toYmd(day).slice(5, 7));
    const seasonal = month >= 3 && month <= 6 ? 1.8 : month >= 11 ? 1.4 : 1;
    const growth = 1 + (180 - daysAgo) / 180; // business grows over time
    const nOrders = Math.round(rand() * 2.2 * seasonal * growth);
    for (let k = 0; k < nOrders; k++) {
      seq++;
      const cust = daysAgo < 30 && rand() < 0.25 ? customers[0] : pick(customers);
      const placedAt = new Date(day.getTime() - int(0, 12) * 3600_000 - int(0, 59) * 60_000);
      const orderId = crypto.randomUUID();
      const code = `AM-${toYmd(placedAt).slice(2).replaceAll("-", "")}-${seq.toString(36).toUpperCase().padStart(4, "0")}`;
      const farmsInOrder = rand() < 0.18 ? [pick(weightedFarms), pick(weightedFarms)] : [pick(weightedFarms)];
      const uniqueFarms = [...new Map(farmsInOrder.map((f) => [f.row.id, f])).values()];
      const address = { recipientName: cust.name, postalCode: cust.postal, prefecture: cust.pref, city: cust.city, line1: cust.line1, phone: "090-0000-0000" };
      const age = daysAgo;
      const cancelled = rand() < 0.03 && age > 2;
      let subtotal = 0;
      let shippingTotal = 0;
      uniqueFarms.forEach((f, fi) => {
        const foId = crypto.randomUUID();
        const lines = Array.from({ length: rand() < 0.3 ? 2 : 1 }, () => pick(f.variants));
        const uniq = [...new Map(lines.map((l) => [l.id, l])).values()];
        let foSubtotal = 0;
        let grams = 0;
        for (const v of uniq) {
          const qty = rand() < 0.15 ? 2 : 1;
          foSubtotal += v.price * qty;
          grams += v.grams * qty;
          itemRows.push({ farmOrderId: foId, productId: v.productId, variantId: v.id, productName: v.productName, variantLabel: v.label, imageUrl: v.image, unitPrice: v.price, quantity: qty, weightGrams: v.grams, lineTotal: v.price * qty });
          if (!cancelled) soldByProduct.set(v.productId, (soldByProduct.get(v.productId) ?? 0) + qty);
        }
        const q = quoteShipment({ prefecture: cust.pref, carrier: f.row.defaultCarrier, productWeightGrams: grams, subtotal: foSubtotal, freeShippingThreshold: f.row.freeShippingThreshold });
        const rate = f.row.commissionRateBps ?? feeConfig.defaultCommissionRateBps;
        const commission = calcCommission(foSubtotal, rate);
        const placedYmd = toYmd(placedAt);
        const shipBy = addDays(placedYmd, f.row.leadTimeDays);
        const eta = addDays(shipBy, q.transitDays);
        const shippedAt = new Date(fromYmd(shipBy).getTime() + 10 * 3600_000 - (rand() < 0.6 ? DAY : 0));
        const deliveredAt = new Date(fromYmd(eta).getTime() + 14 * 3600_000);
        let status: s.FarmOrderStatus;
        if (cancelled) status = "cancelled";
        else if (deliveredAt.getTime() < now.getTime()) status = "delivered";
        else if (shippedAt.getTime() < now.getTime()) status = "shipped";
        else if (age >= 1 || rand() < 0.4) status = "preparing";
        else status = "paid";
        const shipped = status === "shipped" || status === "delivered";
        const tracking = shipped ? `${f.row.defaultCarrier === "japanpost" ? "" : "4"}${int(10000000000, 99999999999)}` : null;
        foRows.push({
          id: foId, orderId, farmId: f.row.id, code: `${code}-${fi + 1}`, status,
          subtotal: foSubtotal, shippingFee: q.fee, commissionRateBps: rate, commissionAmount: commission,
          payoutAmount: foSubtotal + q.fee - commission, carrier: f.row.defaultCarrier, boxSize: q.boxSize, boxCount: q.boxCount,
          totalWeightGrams: q.totalWeightGrams, trackingNumber: tracking, shipByDate: shipBy, estimatedDeliveryDate: eta,
          shippedAt: shipped ? shippedAt : null, deliveredAt: status === "delivered" ? deliveredAt : null,
          cancelledAt: cancelled ? new Date(placedAt.getTime() + 3600_000) : null,
          labelPrintedAt: shipped ? new Date(shippedAt.getTime() - 3600_000) : null,
          reviewRequestedAt: status === "delivered" && deliveredAt.getTime() + shippingPolicy.reviewRequestAfterDays * DAY < now.getTime() ? new Date(deliveredAt.getTime() + shippingPolicy.reviewRequestAfterDays * DAY) : null,
          createdAt: placedAt, updatedAt: placedAt,
        });
        eventRows.push({ farmOrderId: foId, type: "order_received", message: "ご注文を受け付けました", occurredAt: placedAt });
        if (shipped) {
          eventRows.push({ farmOrderId: foId, type: "label_created", message: "送り状を発行しました", source: "farmer", occurredAt: new Date(shippedAt.getTime() - 3600_000) });
          eventRows.push({ farmOrderId: foId, type: "shipped", message: "南あわじ営業所より発送しました", location: "南あわじ", source: "farmer", occurredAt: shippedAt });
        }
        if (status === "delivered") {
          eventRows.push({ farmOrderId: foId, type: "delivered", message: "お届けが完了しました", location: cust.pref, source: "cron", occurredAt: deliveredAt });
          deliveredFo.push({ fo: foRows.at(-1)!, productId: uniq[0].productId, userId: cust.user.id!, farmId: f.row.id, at: deliveredAt });
        }
        subtotal += foSubtotal;
        shippingTotal += q.fee;
      });
      orderRows.push({
        id: orderId, code, userId: cust.user.id!, status: cancelled ? "cancelled" : "paid", email: cust.email,
        subtotal, shippingTotal, total: subtotal + shippingTotal, shippingAddress: address,
        paymentProvider: "demo", paidAt: placedAt, cancelledAt: cancelled ? new Date(placedAt.getTime() + 3600_000) : null,
        createdAt: placedAt, updatedAt: placedAt,
      });
    }
  }

  /* ── payouts: monthly per farm for closed months ── */
  const payoutRows: (typeof s.payouts.$inferInsert)[] = [];
  const nowYm = toYmd(now).slice(0, 7);
  for (const f of activeFarms) {
    const byMonth = new Map<string, typeof foRows>();
    for (const fo of foRows) {
      if (fo.farmId !== f.row.id || fo.status !== "delivered") continue;
      const ym = toYmd(fo.deliveredAt!).slice(0, 7);
      if (ym >= nowYm) continue;
      (byMonth.get(ym) ?? byMonth.set(ym, []).get(ym)!).push(fo);
    }
    for (const [ym, list] of byMonth) {
      const id = crypto.randomUUID();
      const [y, m] = ym.split("-").map(Number);
      const periodEnd = toYmd(new Date(Date.UTC(y, m, 0, 3)));
      const scheduled = `${toYmd(new Date(Date.UTC(y, m, 1, 3))).slice(0, 8)}${String(feeConfig.payout.payoutDay).padStart(2, "0")}`;
      const gross = list.reduce((a, b) => a + b.subtotal, 0);
      const ship = list.reduce((a, b) => a + b.shippingFee, 0);
      const commission = list.reduce((a, b) => a + b.commissionAmount, 0);
      const isPaid = fromYmd(scheduled).getTime() < now.getTime();
      payoutRows.push({
        id, farmId: f.row.id, periodStart: `${ym}-01`, periodEnd, grossSales: gross, shippingFees: ship, commission,
        amount: gross + ship - commission, orderCount: list.length, status: isPaid ? "paid" : "pending",
        scheduledFor: scheduled, paidAt: isPaid ? fromYmd(scheduled) : null, createdAt: fromYmd(addDays(periodEnd, 1)),
      });
      list.forEach((fo) => (fo.payoutId = id));
    }
  }

  await chunkInsert(orderRows, (b) => db.insert(s.orders).values(b));
  await chunkInsert(payoutRows, (b) => db.insert(s.payouts).values(b));
  await chunkInsert(foRows, (b) => db.insert(s.farmOrders).values(b));
  await chunkInsert(itemRows, (b) => db.insert(s.orderItems).values(b));
  await chunkInsert(eventRows, (b) => db.insert(s.shipmentEvents).values(b));

  /* ── reviews ── */
  const reviewRows: (typeof s.reviews.$inferInsert)[] = [];
  const seenReview = new Set<string>();
  for (const d of deliveredFo) {
    if (rand() > 0.55) continue;
    const key = `${d.userId}:${d.productId}`;
    if (seenReview.has(key)) continue;
    seenReview.add(key);
    const t = pick(reviewTexts);
    const replied = rand() < 0.5;
    const at = new Date(d.at.getTime() + int(1, 5) * DAY);
    if (at > now) continue;
    reviewRows.push({
      productId: d.productId, farmId: d.farmId, userId: d.userId, farmOrderId: d.fo.id!, rating: t.rating, title: t.title, body: t.body,
      reply: replied ? farmerReplies[t.rating >= 4 ? int(0, 1) : 2] : null, repliedAt: replied ? new Date(at.getTime() + DAY) : null, createdAt: at,
    });
  }
  await chunkInsert(reviewRows, (b) => db.insert(s.reviews).values(b));

  // denormalized counters
  await db.execute(sql`
    update products p set
      rating_sum = coalesce(r.sum, 0), rating_count = coalesce(r.cnt, 0)
    from (select product_id, sum(rating)::int sum, count(*)::int cnt from reviews group by product_id) r
    where r.product_id = p.id`);
  await db.execute(sql`
    update farms f set rating_sum = coalesce(r.sum, 0), rating_count = coalesce(r.cnt, 0)
    from (select farm_id, sum(rating)::int sum, count(*)::int cnt from reviews group by farm_id) r
    where r.farm_id = f.id`);
  for (const [productId, qty] of soldByProduct) {
    await db.execute(sql`update products set sold_count = ${qty} where id = ${productId}`);
  }

  /* ── engagement / platform ── */
  const demoCustomer = customers[0].user.id!;
  const awa = farmCtx[0];
  await db.insert(s.favorites).values(
    farmCtx.flatMap((f) => f.variants.slice(0, 1)).slice(0, 4).map((v) => ({ userId: demoCustomer, productId: v.productId })),
  );
  await db.insert(s.farmFollows).values([{ userId: demoCustomer, farmId: awa.row.id }, { userId: demoCustomer, farmId: farmCtx[3].row.id }]);
  await db.insert(s.messages).values([
    { farmId: awa.row.id, customerId: demoCustomer, senderId: demoCustomer, body: "先日のターザン、とても甘くて家族に大好評でした！保存は冷蔵庫でも大丈夫ですか？", createdAt: new Date(now.getTime() - 3 * DAY) },
    { farmId: awa.row.id, customerId: demoCustomer, senderId: awa.row.ownerId, body: "ありがとうございます！冷蔵庫だと湿気で傷みやすいので、ネットに入れて風通しの良い場所に吊るすのがおすすめです。カットしたものは冷蔵でどうぞ。", createdAt: new Date(now.getTime() - 3 * DAY + 5 * 3600_000), readAt: new Date(now.getTime() - 2 * DAY) },
    { farmId: awa.row.id, customerId: demoCustomer, senderId: demoCustomer, body: "なるほど！さっそく吊るしてみます。また注文しますね。", createdAt: new Date(now.getTime() - 2 * DAY) },
  ]);
  await db.insert(s.coupons).values([
    { code: "WELCOME500", description: "はじめてのお買い物で500円OFF（3,000円以上）", type: "fixed", value: 500, minSubtotal: 3000, maxUses: 1000, usedCount: 142 },
    { code: "AWAJI10", description: "淡路島たまねぎフェア 10%OFF", type: "percent", value: 10, minSubtotal: 5000, maxUses: 300, usedCount: 58, endsAt: new Date(now.getTime() + 30 * DAY) },
    { code: "SHINTAMA2026", description: "新玉ねぎ予約特典（終了）", type: "fixed", value: 300, minSubtotal: 2000, isActive: false, endsAt: new Date(now.getTime() - 100 * DAY) },
  ]);
  await db.insert(s.announcements).values([
    { title: "秋冬の貯蔵玉ねぎ、出荷最盛期です", body: "吊り小屋でじっくり熟成させた貯蔵玉ねぎが最もおいしい季節。各農園から続々と入荷中です。", audience: "all", publishedAt: new Date(now.getTime() - 2 * DAY) },
    { title: "【生産者向け】送り状CSVにゆうプリR形式を追加しました", body: "出荷センターから日本郵便ゆうプリR用のCSVを出力できるようになりました。", audience: "farmer", publishedAt: new Date(now.getTime() - 6 * DAY) },
    { title: "年末年始の配送について", body: "12/29〜1/3は出荷をお休みする農園があります。お届け希望日をご確認ください。", audience: "customer", publishedAt: new Date(now.getTime() - 10 * DAY) },
  ]);
  const notif = (userId: string, type: s.NotificationType, title: string, body: string, href: string, hoursAgo: number, read = false) => ({
    userId, type, title, body, href, createdAt: new Date(now.getTime() - hoursAgo * 3600_000), readAt: read ? now : null,
  });
  await db.insert(s.notifications).values([
    notif(demoCustomer, "shipping", "ご注文の商品を発送しました", "阿波ファームから発送されました。追跡番号をご確認ください。", "/mypage/orders", 5),
    notif(demoCustomer, "message", "阿波ファームから返信が届きました", "保存方法についてのご質問にお答えしました。", "/mypage/messages", 70, true),
    notif(demoCustomer, "system", "AWAJI10 クーポン配布中", "5,000円以上のお買い物で10%OFF", "/products", 30),
    notif(awa.row.ownerId, "order", "新しい注文が入りました", "出荷期限を確認して準備を始めましょう。", "/farmer/orders", 2),
    notif(awa.row.ownerId, "review", "新しいレビューが投稿されました", "★5「甘さにびっくり」", "/farmer/reviews", 26),
    notif(admin.id!, "system", "新しい出店申請があります", "神代こだわり農園 から出店申請が届きました。", "/admin/farms", 20),
  ]);
  await db.insert(s.platformSettings).values([
    { key: "commissionRateBps", value: feeConfig.defaultCommissionRateBps },
    { key: "maintenanceMode", value: false },
  ]);
  const jobs = ["cancel-unpaid", "ship-reminders", "sync-tracking", "review-requests", "close-payouts"] as const;
  await db.insert(s.jobRuns).values(
    Array.from({ length: 5 * 6 }, (_, i) => {
      const job = jobs[i % jobs.length];
      const startedAt = new Date(now.getTime() - Math.floor(i / jobs.length) * 4 * 3600_000 - (i % jobs.length) * 60_000);
      return { job, status: "success" as const, trigger: "cron" as const, summary: { processed: int(0, 12) }, startedAt, finishedAt: new Date(startedAt.getTime() + int(200, 2400)) };
    }),
  );

  console.info(`[seed] ${users.length} users, ${farmCtx.length} farms, ${orderRows.length} orders, ${reviewRows.length} reviews in ${Date.now() - t0}ms`);
}
