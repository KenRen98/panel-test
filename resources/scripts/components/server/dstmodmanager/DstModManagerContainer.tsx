import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Button from '@/components/elements/Button';
import { ServerContext } from '@/state/server';
import {
    getSteamModDetails,
    getInstalledModInfo,
    getModSchemas,
    getPendingConfig,
    savePendingConfig,
    markPendingConfig,
    getPendingMarkedIds,
    removeModData,
    saveModsList,
    resolveSteamModMode,
    optimizeSteamPreviewUrl,
    DstModSchema,
    SteamMod,
} from '@/api/server/steamMods';
import { ServerEggVariable } from '@/api/server/types';
import { useFlashKey } from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

// 每页 12 条（与模组安装页一致：3 列 3×4 / 4 列 4×3 正好填满）
const PAGE_SIZE = 12;

const SearchRow = styled.div`
    ${tw`flex items-center gap-2`};
`;

const SearchField = styled.div`
    ${tw`relative flex-1 min-w-0`};
    & > svg {
        ${tw`absolute left-2.5 top-0 bottom-0 my-auto w-3.5 h-3.5 text-neutral-400 pointer-events-none`};
    }
    & > input {
        ${tw`w-full h-[38px] pl-9 pr-4 rounded-lg border border-neutral-600 bg-neutral-700 text-sm text-neutral-100 placeholder-neutral-400 outline-none focus:border-primary-500 transition-colors duration-150`};
    }
`;

// "修改后，需重启服务器。"提示（MODS_LIST 头部）：无未下载 → 常规（橙）；有未下载 → 红色模式（与移除按钮同色）
const RestartHint = styled.div<{ red?: boolean }>`
    ${tw`ml-auto px-2.5 leading-[21px] rounded-lg border text-xs whitespace-nowrap flex items-center gap-1.5`};
    background: ${(props) => (props.red ? 'rgba(248, 81, 73, 0.08)' : 'rgba(255, 170, 0, 0.08)')};
    border-color: ${(props) => (props.red ? 'rgba(248, 81, 73, 0.45)' : 'rgba(255, 170, 0, 0.35)')};
    color: ${(props) => (props.red ? 'hsl(0, 80%, 72%)' : 'hsl(40, 90%, 72%)')};
`;

// ===== MODS_LIST 面板（搜索框与已安装列表之间，与模组安装页一致） =====
const ModsListPanel = styled.div`
    ${tw`mt-5 flex flex-col`};
`;
const ModsListHead = styled.div`
    ${tw`flex items-center gap-2 flex-wrap mb-3`};
`;
const ModsLabel = styled.span`
    ${tw`text-[15px] font-semibold text-neutral-100`};
`;
const VarName = styled.span`
    ${tw`text-[11px] text-primary-400 rounded-md border border-primary-500/30 px-1.5 font-mono`};
    background: rgba(47, 129, 247, 0.1);
    line-height: 16px;
`;
const ModsListRow = styled.div`
    ${tw`flex items-stretch gap-2.5`};
`;
const ModsListValue = styled.div`
    ${tw`flex-1 rounded-lg border border-neutral-600 bg-neutral-700 px-2 py-[1px] text-[10px] leading-[1.2] break-all text-neutral-200`};
`;

const ModsPrefix = styled.span`
    ${tw`text-neutral-500`};
`;
const ClearBtn = styled(Button)`
    ${tw`flex-shrink-0 text-xs px-4 bg-transparent border border-neutral-600 text-neutral-400 hover:text-red-400 hover:border-red-500/60`};
`;

// ===== 已安装列表 =====
const GridTitle = styled.div`
    ${tw`flex items-center gap-2 text-[15px] font-semibold text-neutral-100 mt-5 mb-3`};
    & > .count {
        ${tw`text-[11px] font-normal text-neutral-400 bg-neutral-700 border border-neutral-600 rounded-md px-2 py-0.5 leading-none`};
    }
`;

// 固定列数三档：手机一行 1 个、默认桌面一行 3 个、宽屏(视口≥1280px)一行 4 个
const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
    @media (min-width: 1280px) {
        grid-template-columns: repeat(4, 1fr);
    }
`;

const Card = styled.div`
    ${tw`flex flex-col bg-neutral-700 border border-neutral-600 rounded-xl p-3 h-[240px] overflow-hidden transition-colors duration-150 hover:border-primary-500`};
`;

// ===== 标准加载骨架卡：加载期间替代真实卡片（两页面通用同款设计） =====
// 尺寸/结构与真实卡一致（h-240、logo 56、头部+描述+底部条），shimmer 流动动画
const SkeletonCard = styled.div`
    ${tw`flex flex-col bg-neutral-700/60 border border-neutral-700 rounded-xl p-3 h-[240px] overflow-hidden`};
    gap: 12px;
`;

const Sk = styled.div`
    border-radius: 6px;
    background: linear-gradient(90deg, rgba(148, 163, 184, 0.08) 25%, rgba(148, 163, 184, 0.18) 50%, rgba(148, 163, 184, 0.08) 75%);
    background-size: 200% 100%;
    animation: sk-shimmer 1.2s ease-in-out infinite;
    @keyframes sk-shimmer {
        0% {
            background-position: 200% 0;
        }
        100% {
            background-position: -200% 0;
        }
    }
`;

// 渲染一张骨架卡（内部固定结构）
const SkeletonCardView = () => (
    <SkeletonCard>
        <div css={tw`flex items-center gap-3`}>
            <Sk css={tw`w-14 h-14 rounded-lg flex-shrink-0`} />
            <div css={tw`flex-1 flex flex-col gap-2`}>
                <Sk css={tw`h-3.5 w-3/4`} />
                <Sk css={tw`h-2.5 w-1/2`} />
            </div>
        </div>
        <Sk css={tw`h-2.5 w-full`} />
        <Sk css={tw`h-2.5 w-5/6`} />
        <div css={tw`mt-auto flex items-center justify-between`}>
            <Sk css={tw`h-3 w-16`} />
            <Sk css={tw`h-6 w-14 rounded-md`} />
        </div>
    </SkeletonCard>
);

const CardHead = styled.div`
    ${tw`flex items-start gap-2.5 min-h-[56px]`};
`;

const Logo = styled.img`
    ${tw`w-14 h-14 rounded-lg object-cover bg-neutral-700 flex-shrink-0`};
`;

// 无图时的占位色块（首字母）
const LogoFallback = styled.div`
    ${tw`w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center text-lg font-bold`};
    background: hsl(221, 28%, 38%);
    color: #fff;
`;

const HeadMain = styled.div`
    ${tw`min-w-0 flex-1 flex flex-col`};
`;

const Name = styled.div`
    ${tw`text-sm font-semibold text-neutral-100 line-clamp-2`};
`;

const Corner = styled.div`
    ${tw`flex flex-col items-end gap-1 flex-shrink-0`};
`;

// 未下载徽章（橙黄色，与"修改后，需重启服务器"提示同色系）
const BadgeUndownloaded = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(40, 90%, 72%);
    border: 1px solid rgba(255, 170, 0, 0.35);
    background: rgba(255, 170, 0, 0.08);
`;

// 无设置项徽章（中性灰绿：模组有配置但为空 / 无需配置）
const BadgeNoOptions = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(160, 25%, 62%);
    border: 1px solid rgba(110, 180, 150, 0.35);
    background: rgba(110, 180, 150, 0.08);
`;

// 可编辑徽章（绿色：schema 已生成且有配置项）
const BadgeEditable = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(150, 60%, 70%);
    border: 1px solid rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.08);
`;

// 需重启徽章（灰色：已下载但 schema 未生成——开服脚本还没跑 Phase 7）
const BadgePending = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(220, 10%, 62%);
    border: 1px solid rgba(156, 163, 175, 0.35);
    background: rgba(156, 163, 175, 0.08);
`;

// 待生效徽章（蓝色：有已保存的修改，但还没被开服脚本合并进 modoverrides.lua——需重启生效）
const BadgePendingApply = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(210, 90%, 75%);
    border: 1px solid rgba(96, 165, 250, 0.4);
    background: rgba(96, 165, 250, 0.1);
`;

// 有更新徽章（橙红：本地 acf 记录的下载时间早于 Steam API 的更新时间）
const BadgeUpdated = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(15, 85%, 72%);
    border: 1px solid rgba(251, 113, 75, 0.4);
    background: rgba(251, 113, 75, 0.1);
`;

const Desc = styled.div`
    ${tw`mt-2 text-[11px] leading-relaxed text-neutral-400 break-words flex-1 min-h-0 overflow-hidden`};
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 62%, transparent 100%);
    mask-image: linear-gradient(to bottom, #000 0%, #000 62%, transparent 100%);
`;

const Actions = styled.div`
    ${tw`flex justify-between items-end mt-auto pt-2`};
`;

const CardFoot = styled.div`
    ${tw`flex flex-col gap-0.5 min-w-0`};
`;

const ModId = styled.div`
    ${tw`text-[11px] font-mono text-neutral-400 leading-none`};
`;

const CardDate = styled.div`
    ${tw`text-[11px] text-neutral-400 leading-none`};
`;

const RemoveBtn = styled(Button)`
    ${tw`text-xs px-3.5 py-1.5 inline-flex items-center justify-center bg-transparent border border-red-500 text-red-400 hover:bg-red-500/10`};
`;

// 管理按钮（蓝色边框，仅 schema 可编辑的 mod 显示）
const ManageBtn = styled(Button)`
    ${tw`text-xs px-3.5 py-1.5 inline-flex items-center justify-center bg-transparent border border-primary-500 text-primary-400 hover:bg-primary-500/10`};
`;

const ActionBtns = styled.div`
    ${tw`flex items-center gap-2 flex-shrink-0`};
`;

// ===== 设置抽屉（自定义居中抽屉，照 demo .drawer：head/body/foot 三段，body 内滚动） =====
const DrawerMask = styled.div`
    ${tw`fixed inset-0 z-50 flex items-center justify-center`};
    background: rgba(10, 16, 28, 0.55);
`;

const DrawerPanel = styled.div`
    ${tw`flex flex-col w-full overflow-hidden`};
    width: 560px;
    max-width: 92vw;
    max-height: 84vh;
    background: ${theme`colors.neutral.800`.toString()};
    border: 1px solid ${theme`colors.neutral.600`.toString()};
    border-radius: 12px;
    @media (max-width: 700px) {
        max-width: 94vw;
        max-height: 88vh;
    }
`;

// 抽屉顶部局部加载条：加载实际配置值期间显示。
// 对应请求带 X-Doubao-Skip-Progress（跳过全局顶部进度条），加载态落在弹窗内。
const DrawerProgress = styled.div`
    ${tw`relative flex-shrink-0 overflow-hidden`};
    height: 2px;
    &::after {
        content: '';
        position: absolute;
        top: 0;
        left: -40%;
        height: 100%;
        width: 40%;
        background: ${theme`colors.cyan.400`.toString()};
        box-shadow: 0 -2px 10px 2px hsl(178, 78%, 57%);
        animation: drawer-progress-slide 1.1s ease-in-out infinite;
    }
    @keyframes drawer-progress-slide {
        0% {
            left: -40%;
        }
        100% {
            left: 100%;
        }
    }
`;

const DrawerHead = styled.div`
    ${tw`flex items-start gap-2.5 px-4 pt-4 pb-3 flex-shrink-0`};
    border-bottom: 1px solid ${theme`colors.neutral.700`.toString()};
`;

const DrawerTitleWrap = styled.div`
    ${tw`min-w-0`};
`;

const DrawerTitle = styled.h3`
    ${tw`text-base font-bold text-neutral-100 leading-snug`};
`;

const DrawerId = styled.div`
    ${tw`text-[11px] text-neutral-400 font-mono mt-1 leading-none`};
`;

const DrawerClose = styled.button`
    ${tw`ml-auto w-7 h-7 rounded-md border bg-transparent text-neutral-400 flex items-center justify-center flex-shrink-0 transition-colors duration-150`};
    border-color: ${theme`colors.neutral.600`.toString()};
    &:hover {
        color: hsl(0, 80%, 72%);
        border-color: rgba(248, 81, 73, 0.45);
    }
`;

const DrawerBody = styled.div`
    ${tw`flex-1 min-h-0 overflow-y-auto px-4 py-3`};
`;

const DrawerFoot = styled.div`
    ${tw`flex items-center gap-2.5 px-4 py-3 flex-shrink-0`};
    border-top: 1px solid ${theme`colors.neutral.700`.toString()};
`;

const FootNote = styled.span`
    ${tw`text-[11px] text-neutral-400 flex-1 leading-relaxed`};
`;

// 配置行（行式：label+key 左，控件右，照 demo .opt-row）
const OptRow = styled.div`
    ${tw`flex items-center gap-2.5 py-2`};
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
`;

const OptLabel = styled.div`
    ${tw`flex-1 min-w-0`};
`;

const OptName = styled.div`
    ${tw`text-[13px] text-neutral-100 leading-snug`};
`;

const OptKey = styled.div`
    ${tw`text-[10px] text-neutral-500 font-mono mt-0.5 leading-none`};
`;

const OptControl = styled.div`
    ${tw`flex-shrink-0 flex items-center gap-1.5`};
`;

// 滑动开关（照 demo .toggle）
const ToggleWrap = styled.label`
    ${tw`relative w-[38px] h-5 flex-shrink-0 cursor-pointer`};
    & > input {
        ${tw`opacity-0 w-0 h-0 absolute`};
    }
    & > span {
        ${tw`absolute inset-0 rounded-full border transition-all duration-150`};
        background: ${theme`colors.neutral.700`.toString()};
        border-color: ${theme`colors.neutral.600`.toString()};
        &::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 14px;
            height: 14px;
            background: ${theme`colors.neutral.400`.toString()};
            border-radius: 50%;
            transition: all 0.15s;
        }
    }
    & > input:checked + span {
        background: ${theme`colors.primary.500`.toString()};
        border-color: ${theme`colors.primary.500`.toString()};
        &::after {
            left: 20px;
            background: #fff;
        }
    }
`;

const OptSelect = styled.select`
    ${tw`rounded-md border text-xs px-2 py-1.5 outline-none cursor-pointer max-w-[220px]`};
    background: ${theme`colors.neutral.700`.toString()};
    border-color: ${theme`colors.neutral.600`.toString()};
    color: ${theme`colors.neutral.100`.toString()};
    &:focus {
        border-color: ${theme`colors.primary.500`.toString()};
    }
`;

const OptInput = styled.input`
    ${tw`rounded-md border text-xs px-2 py-1.5 outline-none w-[130px]`};
    background: ${theme`colors.neutral.700`.toString()};
    border-color: ${theme`colors.neutral.600`.toString()};
    color: ${theme`colors.neutral.100`.toString()};
    &:focus {
        border-color: ${theme`colors.primary.500`.toString()};
    }
`;

// ===== 确认弹窗（照 demo .modal） =====
const ConfirmMask = styled.div`
    ${tw`fixed inset-0 z-[60] flex items-center justify-center p-5`};
    background: rgba(10, 16, 28, 0.55);
`;

const ConfirmBox = styled.div`
    ${tw`w-[380px] max-w-full p-4 rounded-xl border`};
    background: ${theme`colors.neutral.800`.toString()};
    border-color: ${theme`colors.neutral.600`.toString()};
`;

const ConfirmTitle = styled.div`
    ${tw`text-[15px] font-bold text-neutral-100 mb-2`};
`;

const ConfirmText = styled.div`
    ${tw`text-[13px] text-neutral-400 leading-relaxed mb-4 break-all whitespace-pre-line`};
`;

const ConfirmActions = styled.div`
    ${tw`flex justify-end gap-2.5`};
`;

const Pager = styled.div`
    ${tw`flex items-center justify-center gap-4 mt-4 pt-3.5 border-t border-neutral-700`};
`;

const PgBtn = styled(Button)`
    ${tw`text-xs px-4 py-1.5 whitespace-nowrap`};
`;

const PgInfo = styled.div`
    ${tw`text-xs text-neutral-400 flex items-center justify-center gap-1`};
    & > b {
        ${tw`text-neutral-200 font-semibold`};
    }
    & > i {
        font-style: normal;
    }
    @media (max-width: 700px) {
        flex-direction: column;
        gap: 2px;
        & > i {
            display: none;
        }
    }
`;

const Unsupported = styled.div`
    ${tw`mt-5 px-3 py-2 rounded-lg border text-xs leading-relaxed`};
    background: rgba(248, 81, 73, 0.08);
    border-color: rgba(248, 81, 73, 0.45);
    color: hsl(0, 80%, 72%);
`;

const Empty = styled.div`
    ${tw`text-sm text-neutral-500 py-10 text-center`};
`;

const fmtDate = (ts: number): string => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDesc = (d: string): string =>
    d.replace(/https?:\/\/[^\s<>]+/g, (u) => {
        try {
            const p = new URL(u);
            let s = p.hostname.replace(/^www\./, '');
            const path = p.pathname.replace(/\/+$/, '');
            s += path.length > 24 ? `${path.slice(0, 24)}…` : path;
            return s.length > 48 ? `${s.slice(0, 48)}…` : s;
        } catch {
            return u;
        }
    });

const logoText = (title: string): string => {
    const s = (title || '?').trim();
    const zh = s.match(/[\u4e00-\u9fa5]/);
    if (zh) return zh[0];
    return (s[0] || '?').toUpperCase();
};

const logoColor = (id: string): string => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `hsl(${h}, 30%, 38%)`;
};

export default () => {
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('dstmodmanager');

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const variables = ServerContext.useStoreState((state) => state.server.data!.variables);
    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);

    const mode = resolveSteamModMode(variables);

    // MODS_LIST 初始值（serverValue 优先，回退 defaultValue）
    const initialIds = useMemo(() => {
        const varDef = variables.find((v) => v.envVariable === 'MODS_LIST');
        const raw = varDef?.serverValue || varDef?.defaultValue || '';
        return raw
            .split(',')
            .map((s) => s.trim().replace(/^workshop-/i, ''))
            .filter((s) => /^\d{5,}$/.test(s));
    }, [variables]);

    const [ids, setIds] = useState<string[]>(initialIds);
    const [mods, setMods] = useState<SteamMod[]>([]);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // 已下载 mod 的设置 schema（id → schema；null = 未生成/需重启）
    const [schemas, setSchemas] = useState<Record<string, DstModSchema | null>>({});
    // 设置抽屉状态
    const [manageId, setManageId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});
    const [savingConfig, setSavingConfig] = useState(false);
    const [loadingDraft, setLoadingDraft] = useState(false);
    // 待生效标记集合（pending_config/*.pending）：有已保存但未重启生效的修改
    const [pendingMarked, setPendingMarked] = useState<Set<string>>(new Set());
    // 确认弹窗（移除 / 清空）
    const [confirm, setConfirm] = useState<{ title: string; text: string; onOk: () => void } | null>(null);

    // Escape 关闭：确认弹窗优先，其次设置抽屉（保存中不可关）
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (confirm) {
                setConfirm(null);
            } else if (manageId && !savingConfig) {
                setManageId(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [confirm, manageId, savingConfig]);

    // 加载已安装模组详情（GetDetails 一次取全部）+ 服务器本地已下载集合（读 acf，
    // 含每个 mod 的本地下载时间用于"有更新"判断）+ 待生效标记（pending_config/*.pending）
    // + 已下载 mod 的设置 schema（读 dump_schema.lua 生成的 JSON）
    // 四段全部就绪后才一次性渲染（避免先出卡片再逐个补徽章/设置的两段式闪烁）
    const load = useCallback(
        (idList: string[]) => {
            if (!mode) return;
            setLoading(true);
            setError(null);
            Promise.all([getSteamModDetails(mode, idList), getInstalledModInfo(uuid), getPendingMarkedIds(uuid)])
                .then(async ([details, installedInfo, pendingMarked]) => {
                    const withDl = details.map((m) => ({
                        ...m,
                        downloaded: installedInfo.has(m.id),
                        localUpdated: installedInfo.get(m.id) ?? 0,
                    }));
                    // 批量读 schema（一次请求替代逐 mod 读取；命中 5min 缓存自动跳过）
                    const downloaded = withDl.filter((m) => m.downloaded !== false);
                    const schemas = await getModSchemas(
                        uuid,
                        downloaded.map((m) => m.id)
                    );
                    setMods(withDl);
                    setSchemas(schemas);
                    setPendingMarked(pendingMarked);
                })
                .catch((e) => {
                    console.error(e);
                    setError(httpErrorToHuman(e));
                })
                .finally(() => setLoading(false));
        },
        [mode, uuid]
    );

    useEffect(() => {
        if (!mode) return;
        load(ids);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // 本地过滤（已安装数据已全量在内存）
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return mods;
        return mods.filter(
            (m) =>
                (m.title || '').toLowerCase().includes(q) ||
                (m.id || '').toLowerCase().includes(q) ||
                (m.short_description || '').toLowerCase().includes(q)
        );
    }, [mods, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // 保存成功后同步 store 中的 MODS_LIST 变量
    const syncVariable = (updated: ServerEggVariable) => {
        setServerFromState((s) => ({
            ...s,
            variables: s.variables.map((v) => (v.envVariable === 'MODS_LIST' ? updated : v)),
        }));
    };

    // 移除 mod（先确认；同步 MODS_LIST；乐观更新，失败回滚；顺带清理 schema/pending 辅助文件）
    const removeMod = async (id: string) => {
        if (saving) return;
        const next = ids.filter((x) => x !== id);
        setIds(next); // 乐观
        setSaving(true);
        clearFlashes();
        try {
            const updated = await saveModsList(uuid, variables, next);
            syncVariable(updated);
            setMods((prev) => prev.filter((m) => m.id !== id));
            removeModData(uuid, id); // 后台清理，失败忽略
        } catch (e) {
            console.error(e);
            setIds(ids); // 回滚
            clearAndAddHttpError(e as Error);
        } finally {
            setSaving(false);
        }
    };

    const confirmRemove = (id: string, title: string) => {
        setConfirm({
            title: '移除模组',
            text: `确定移除「${title}」（${id}）？\n将同步从 MODS_LIST 中删除该 id，并清理其设置数据。`,
            onOk: () => {
                setConfirm(null);
                removeMod(id);
            },
        });
    };

    const clearAll = async () => {
        if (saving) return;
        setSaving(true);
        clearFlashes();
        try {
            const updated = await saveModsList(uuid, variables, []);
            setIds([]);
            setMods([]);
            syncVariable(updated);
            ids.forEach((id) => removeModData(uuid, id)); // 后台清理，失败忽略
        } catch (e) {
            console.error(e);
            clearAndAddHttpError(e as Error);
        } finally {
            setSaving(false);
        }
    };

    const confirmClear = () => {
        setConfirm({
            title: '清空模组列表',
            text: `确定清空全部 ${ids.length} 个模组？MODS_LIST 将同步清空，已安装模组与设置数据一并移除。`,
            onOk: () => {
                setConfirm(null);
                clearAll();
            },
        });
    };

    // 打开设置抽屉：读 schema + pending（用户已保存值），初始值 = pending ?? default
    const openManage = async (id: string) => {
        const schema = schemas[id];
        if (!schema || schema.items.length === 0) return;
        setManageId(id);
        setSavingConfig(false);
        setDraft({});
        setLoadingDraft(true); // 值加载期间：抽屉顶部显示局部加载条（该请求跳过全局进度条）
        const pending = await getPendingConfig(uuid, id).catch(() => null);
        const init: Record<string, string | number | boolean> = {};
        for (const item of schema.items) {
            const hasPending = pending && pending[item.name] !== undefined;
            if (hasPending) {
                init[item.name] = pending![item.name];
            } else if (item.default !== undefined) {
                init[item.name] = item.default;
            } else if (item.type === 'toggle') {
                init[item.name] = false;
            } else if (item.type === 'enum' && item.options && item.options.length > 0) {
                init[item.name] = item.options[0].data;
            } else if (item.type === 'slider') {
                init[item.name] = item.min ?? 0;
            } else {
                init[item.name] = '';
            }
        }
        setDraft(init);
        setLoadingDraft(false); // 值就绪，隐藏加载条
    };

    // 保存设置 → 写 pending JSON（配置值）+ <id>.pending 标记（待生效），
    // 下次开服脚本合并进 modoverrides.lua 后删除标记
    const saveConfig = async () => {
        if (!manageId || savingConfig) return;
        setSavingConfig(true);
        clearFlashes();
        try {
            await savePendingConfig(uuid, manageId, draft);
            await markPendingConfig(uuid, manageId);
            // 本地同步标记，卡片立即显示"待生效"（无需等刷新）
            setPendingMarked((prev) => new Set(prev).add(manageId));
            setManageId(null);
        } catch (e) {
            console.error(e);
            clearAndAddHttpError(e as Error);
        } finally {
            setSavingConfig(false);
        }
    };

    const activeSchema = manageId ? schemas[manageId] : null;

    if (!mode) {
        return (
            <ServerContentBlock title={'模组管理'}>
                <Unsupported>当前服务器的 EGG 不支持模组管理（未侦测到 dst_mod_manager 能力）。</Unsupported>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'模组管理'} showFlashKey={'dstmodmanager'}>
            <div css={tw`flex items-start mb-7`}>
                <div css={tw`flex items-center gap-3`}>
                    <div css={tw`w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-primary-50 flex-shrink-0`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.6 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v5.6" />
                            <path d="m14.305 19.53.923-.382" />
                            <path d="M15 3v7.6" />
                            <path d="m15.229 16.852-.924-.383" />
                            <path d="m16.852 15.228-.383-.923" />
                            <path d="m16.852 20.772-.383.924" />
                            <path d="m19.148 15.228.383-.923" />
                            <path d="m19.53 21.696-.382-.924" />
                            <path d="m20.773 16.852.922-.383" />
                            <path d="m20.773 19.148.922.383" />
                            <path d="M9 3v18" />
                            <circle cx="18" cy="18" r="3" />
                        </svg>
                    </div>
                    <h1 css={tw`text-[30px] font-bold leading-tight`}>模组管理</h1>
                </div>
            </div>

            <SearchRow>
                <SearchField>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        value={query}
                        placeholder={'搜索已安装模组（支持标题 / id）...'}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setPage(1);
                        }}
                    />
                </SearchField>
            </SearchRow>

            {/* MODS_LIST 面板：搜索框与已安装列表之间 */}
            <ModsListPanel>
                <ModsListHead>
                    <ModsLabel>模组列表</ModsLabel>
                    <VarName>MODS_LIST</VarName>
                    <RestartHint red={mods.some((m) => m.downloaded === false)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                        <span>{mods.some((m) => m.downloaded === false) ? '有未下载模组，请重启下载。' : '修改后，需重启服务器。'}</span>
                    </RestartHint>
                </ModsListHead>
                <ModsListRow>
                    <ModsListValue>
                        <ModsPrefix>当前内容：</ModsPrefix>
                        {ids.length ? ids.join(',') : <ModsPrefix>（空）</ModsPrefix>}
                    </ModsListValue>
                    <ClearBtn onClick={confirmClear} disabled={saving || ids.length === 0}>
                        清空
                    </ClearBtn>
                </ModsListRow>
            </ModsListPanel>

            <GridTitle>
                已安装模组 <span className="count">{filtered.length}</span>
            </GridTitle>

            {loading ? (
                // 加载中：标准骨架卡，数量 = min(ids, PAGE_SIZE=12) 与实际分页结果一致
                //（12 可整除 3 列/4 列布局，加载前后数量完全吻合，杜绝"多出卡片"错觉）
                <Grid>
                    {Array.from({ length: Math.max(1, Math.min(ids.length, PAGE_SIZE)) }).map((_, i) => (
                        <SkeletonCardView key={i} />
                    ))}
                </Grid>
            ) : error ? (
                <div css={tw`text-sm text-red-400`}>加载失败：{error}</div>
            ) : slice.length === 0 ? (
                <Empty>{query ? '没有匹配的模组' : '暂无已安装模组，请先在模组安装页添加'}</Empty>
            ) : (
                <Grid>
                    {slice.map((m) => {
                        const schema = schemas[m.id];
                        const editable = m.downloaded !== false && !!schema && schema.items.length > 0;
                        const hasUpdate = m.downloaded !== false && m.localUpdated > 0 && m.time_updated > m.localUpdated;
                        const pendingApply = m.downloaded !== false && pendingMarked.has(m.id);
                        return (
                            <Card key={m.id}>
                                <CardHead>
                                    {m.preview_url ? (
                                        <Logo src={optimizeSteamPreviewUrl(m.preview_url)} alt="" loading="lazy" />
                                    ) : (
                                        <LogoFallback style={{ background: logoColor(m.id) }}>{logoText(m.title)}</LogoFallback>
                                    )}
                                    <HeadMain>
                                        <Name title={m.title}>{m.title || m.id}</Name>
                                    </HeadMain>
                                    <Corner>
                                        {m.downloaded === false ? (
                                            <BadgeUndownloaded>未下载</BadgeUndownloaded>
                                        ) : hasUpdate ? (
                                            <BadgeUpdated>有更新</BadgeUpdated>
                                        ) : schema ? (
                                            schema.items.length === 0 ? (
                                                <BadgeNoOptions>无设置项</BadgeNoOptions>
                                            ) : pendingApply ? (
                                                <BadgePendingApply>待生效</BadgePendingApply>
                                            ) : (
                                                <BadgeEditable>可编辑</BadgeEditable>
                                            )
                                        ) : (
                                            <BadgePending>需重启</BadgePending>
                                        )}
                                    </Corner>
                                </CardHead>
                                <Desc>{fmtDesc(m.short_description || '（无描述）')}</Desc>
                                <Actions>
                                    <CardFoot>
                                        <ModId>{m.id}</ModId>
                                        <CardDate>{fmtDate(m.time_updated) ? `更新于 ${fmtDate(m.time_updated)}` : ''}</CardDate>
                                    </CardFoot>
                                    <ActionBtns>
                                        {editable && (
                                            <ManageBtn onClick={() => openManage(m.id)} disabled={saving}>
                                                管理
                                            </ManageBtn>
                                        )}
                                        <RemoveBtn onClick={() => confirmRemove(m.id, m.title || m.id)} disabled={saving}>
                                            移除
                                        </RemoveBtn>
                                    </ActionBtns>
                                </Actions>
                            </Card>
                        );
                    })}
                </Grid>
            )}

            {filtered.length > PAGE_SIZE && (
                <Pager>
                    <PgBtn onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
                        ‹ 上一页
                    </PgBtn>
                    <PgInfo>
                        <b>共 {filtered.length} 个模组</b>
                        <i>·</i>
                        第 {safePage} / {totalPages} 页
                    </PgInfo>
                    <PgBtn onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}>
                        下一页 ›
                    </PgBtn>
                </Pager>
            )}

            {/* 设置抽屉：自定义居中抽屉（照 demo），body 内滚动，头尾固定；保存写 pending JSON */}
            {manageId && activeSchema && (
                <DrawerMask
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget && !savingConfig) setManageId(null);
                    }}
                >
                    <DrawerPanel role="dialog" aria-modal="true">
                        {loadingDraft && <DrawerProgress />}
                        <DrawerHead>
                            <DrawerTitleWrap>
                                <DrawerTitle>{mods.find((m) => m.id === manageId)?.title || manageId}</DrawerTitle>
                                <DrawerId>{manageId}</DrawerId>
                            </DrawerTitleWrap>
                            <DrawerClose type="button" onClick={() => setManageId(null)} disabled={savingConfig} aria-label="关闭">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </DrawerClose>
                        </DrawerHead>
                        <DrawerBody>
                            {activeSchema.items.map((item) => (
                                <OptRow key={item.name}>
                                    <OptLabel>
                                        <OptName title={item.hover || undefined}>{item.label || item.name}</OptName>
                                        <OptKey>{item.name}</OptKey>
                                    </OptLabel>
                                    <OptControl>
                                        {item.type === 'toggle' && (
                                            <ToggleWrap>
                                                <input
                                                    type="checkbox"
                                                    checked={!!draft[item.name]}
                                                    onChange={(e) => {
                                                    const v = e.target.checked;
                                                    setDraft((d) => ({ ...d, [item.name]: v }));
                                                }}
                                                />
                                                <span />
                                            </ToggleWrap>
                                        )}
                                        {item.type === 'enum' && (
                                            <OptSelect
                                                value={JSON.stringify(draft[item.name])}
                                                onChange={(e) => {
                                                    const v = JSON.parse(e.target.value);
                                                    setDraft((d) => ({ ...d, [item.name]: v }));
                                                }}
                                            >
                                                {(item.options || []).map((o) => (
                                                    <option key={JSON.stringify(o.data)} value={JSON.stringify(o.data)}>
                                                        {o.label || String(o.data)}
                                                    </option>
                                                ))}
                                            </OptSelect>
                                        )}
                                        {item.type === 'slider' && (
                                            <OptInput
                                                type="number"
                                                min={item.min}
                                                max={item.max}
                                                step={1}
                                                value={String(draft[item.name] ?? '')}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value);
                                                    setDraft((d) => ({ ...d, [item.name]: v }));
                                                }}
                                            />
                                        )}
                                        {item.type === 'text' && (
                                            <OptInput
                                                type="text"
                                                value={String(draft[item.name] ?? '')}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setDraft((d) => ({ ...d, [item.name]: v }));
                                                }}
                                            />
                                        )}
                                    </OptControl>
                                </OptRow>
                            ))}
                        </DrawerBody>
                        <DrawerFoot>
                            <FootNote>重启服务器后生效</FootNote>
                            <Button size={'small'} color={'grey'} isSecondary onClick={() => setManageId(null)} disabled={savingConfig}>
                                取消
                            </Button>
                            <Button size={'small'} color={'primary'} onClick={saveConfig} disabled={savingConfig}>
                                {savingConfig ? '保存中…' : '保存修改'}
                            </Button>
                        </DrawerFoot>
                    </DrawerPanel>
                </DrawerMask>
            )}

            {/* 确认弹窗（移除 / 清空） */}
            {confirm && (
                <ConfirmMask
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setConfirm(null);
                    }}
                >
                    <ConfirmBox role="dialog" aria-modal="true">
                        <ConfirmTitle>{confirm.title}</ConfirmTitle>
                        <ConfirmText>{confirm.text}</ConfirmText>
                        <ConfirmActions>
                            <Button size={'small'} color={'grey'} isSecondary onClick={() => setConfirm(null)}>
                                取消
                            </Button>
                            <Button size={'small'} color={'primary'} onClick={confirm.onOk}>
                                确认
                            </Button>
                        </ConfirmActions>
                    </ConfirmBox>
                </ConfirmMask>
            )}
        </ServerContentBlock>
    );
};
