import type { FarmMemberAccess } from "@/db/schema";

/**
 * 農園のスタッフ（#24）。オーナーの決定（Issue #24 のコメント, 2026-09-26）:
 * - 招待はオーナーだけ・メールで・1農園5人まで。1人1農園まで。ロールは変えない（購入者のまま買い物もできる）
 * - 権限は2種類。振込先口座と精算（売上・振込額）はオーナーだけ（「すべて」のスタッフにも見せない）
 * - お客さまへのメッセージは農園名で届き、誰が送ったかは生産者側の画面にだけ出る
 */

/** 生産者画面でできること。ページ・Action・Route Handler はどれか1つを requireFarm / assertFarm に渡す */
export type FarmCapability =
  /** 注文を見る・準備中にする・発送する・追跡番号・送り状・出荷センター */
  | "ship"
  /** お客さまとのメッセージ */
  | "messages"
  /** 注文のキャンセル（返金を伴う） */
  | "cancel"
  /** 商品・在庫・レビューへの返信 */
  | "catalog"
  /** ショップページ・出荷と配送の設定・受付のお休み */
  | "shop"
  /** 概要（売上）・売上と精算・振込先口座・Stripe の登録・売上明細 CSV */
  | "money"
  /** スタッフの招待・権限の変更・外す */
  | "staff";

/** オーナー（farms.ownerId）かスタッフの権限か */
export type FarmAccess = "owner" | FarmMemberAccess;

const grants: Record<FarmAccess, readonly FarmCapability[]> = {
  owner: ["ship", "messages", "cancel", "catalog", "shop", "money", "staff"],
  all: ["ship", "messages", "cancel", "catalog", "shop"],
  shipping: ["ship", "messages"],
};

export const canFarm = (access: FarmAccess, capability: FarmCapability) => grants[access].includes(capability);

export const farmAccessMeta: Record<FarmAccess, { label: string; description: string }> = {
  owner: { label: "オーナー", description: "すべての操作ができます。" },
  all: {
    label: "すべて",
    description: "注文・発送・メッセージ・商品・レビュー・ショップ設定。売上と精算・振込先口座・スタッフの管理はオーナーだけです。",
  },
  shipping: { label: "出荷担当", description: "注文の確認・発送・追跡番号・送り状と、お客さまとのメッセージだけです。" },
};

export const farmStaffPolicy = {
  /** 1農園のスタッフの上限（招待中を含む） */
  maxMembers: 5,
  /** 招待リンクの有効期間 */
  inviteTtlDays: 7,
} as const;

export const farmStaffCopy = {
  errors: {
    notOwner: "スタッフの管理はオーナーだけができます",
    limit: `スタッフは${farmStaffPolicy.maxMembers}人までです（招待中を含む）`,
    duplicate: "このメールアドレスはすでに招待しています",
    self: "ご自身は招待できません",
    notFound: "招待が見つかりません",
    invalidInvite: "この招待リンクは使えません。オーナーにもう一度招待してもらってください",
    expired: "この招待リンクは有効期限が切れています。オーナーにもう一度招待してもらってください",
    wrongAccount: "招待されたメールアドレスのアカウントでログインしてください",
    alreadyMember: "すでに別の農園のスタッフです。1つの農園にだけ参加できます",
    notCustomerAccount: "生産者・運営のアカウントではスタッフとして参加できません。購入者のアカウントで参加してください",
    noPermission: "この操作を行う権限がありません",
    hasApplication: "出店申請中のアカウントではスタッフとして参加できません",
    ownerCannotLeave: "オーナーは抜けられません",
  },
} as const;
