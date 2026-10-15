import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import Button from '@/components/elements/Button';
import { ServerContext } from '@/state/server';
import { searchSteamMods, saveModsList, resolveSteamModMode, SteamMod } from '@/api/server/steamMods';
import { useFlashKey } from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

const MODE_META = {
    pal: { name: '幻兽帕鲁', installScript: 'pal_auto_mods.sh' },
    dst: { name: '饥荒联机版', installScript: 'dst_auto_mods.sh' },
} as const;

const PAGE_SIZE = 9; // 一行三个 × 三行正好填满（与后端一致）
const DEBOUNCE_MS = 3000; // 防抖 3s：期间显示波浪加载点，让用户感知"正在加载"

const SearchPanel = styled.div`
    ${tw`flex flex-col gap-2`};
`;

const SearchField = styled.div`
    ${tw`relative`};
    & > svg {
        ${tw`absolute left-2.5 top-0 bottom-0 my-auto w-3.5 h-3.5 text-neutral-400 pointer-events-none`};
    }
    & > input {
        ${tw`w-full h-[38px] pl-9 pr-9 rounded-lg border border-neutral-600 bg-neutral-700 text-sm text-neutral-100 placeholder-neutral-400 outline-none focus:border-primary-500 transition-colors duration-150`};
    }
`;

// 搜索框右侧波浪加载点：防抖/请求期间一个接一个高亮
const LoadingDots = styled.div`
    ${tw`absolute right-3 top-0 bottom-0 my-auto h-3.5 flex items-center gap-1 pointer-events-none`};
    & > span {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #8f8f8f;
        animation: steammod-wave 0.9s ease-in-out infinite;
    }
    & > span:nth-child(2) {
        animation-delay: 0.15s;
    }
    & > span:nth-child(3) {
        animation-delay: 0.3s;
    }
    @keyframes steammod-wave {
        0%,
        100% {
            opacity: 0.25;
            transform: scale(1);
        }
        40% {
            opacity: 1;
            transform: scale(1.7);
        }
    }
`;

const SearchStatus = styled.div`
    ${tw`text-xs text-neutral-400`};
    & > b {
        ${tw`text-neutral-200 font-semibold`};
    }
`;

const GridTitle = styled.div`
    ${tw`flex items-center gap-2 text-[15px] font-semibold text-neutral-100 mt-5 mb-3`};
    & > .count {
        ${tw`text-[11px] font-normal text-neutral-400 bg-neutral-800 border border-neutral-700 rounded-full px-2 py-0.5 leading-none`};
    }
`;

// 固定一行三个；移动端一行一个（不设 2 列中间态）
const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
`;

// 卡片高度固定统一；描述在卡内尽量展开，超出裁剪（无省略号），底部淡出提示未尽
const Card = styled.div`
    ${tw`flex flex-col bg-neutral-800 border border-neutral-700 rounded-xl p-3 h-[240px] overflow-hidden transition-colors duration-150 hover:border-primary-500`};
`;

const CardHead = styled.div`
    ${tw`flex items-start gap-2.5 min-h-[56px]`};
`;

const Logo = styled.img`
    ${tw`w-14 h-14 rounded-lg object-cover bg-neutral-700 flex-shrink-0`};
`;

const HeadMain = styled.div`
    ${tw`min-w-0 flex-1 flex flex-col`};
`;

const Name = styled.div`
    ${tw`text-sm font-semibold text-neutral-100 line-clamp-2`};
`;

// 右上角：订阅数 + 已添加标签（与 logo 顶部对齐，标题换行不挤压）
const Corner = styled.div`
    ${tw`flex flex-col items-end gap-1 flex-shrink-0`};
`;

const Badge = styled.span`
    ${tw`text-[10px] text-neutral-400 bg-neutral-700 rounded px-1.5 py-0.5 whitespace-nowrap`};
`;

const BadgeSubs = styled(Badge)`
    ${tw`text-neutral-200`};
`;

const BadgeAdded = styled(Badge)`
    ${tw`text-green-400 border border-green-500/40`};
`;

// 描述按内容展开，超出卡片区域裁剪 + 底部淡出
const Desc = styled.div`
    ${tw`mt-2 text-[11px] leading-relaxed text-neutral-400 break-words flex-1 min-h-0 overflow-hidden`};
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 62%, transparent 100%);
    mask-image: linear-gradient(to bottom, #000 0%, #000 62%, transparent 100%);
`;

const Actions = styled.div`
    ${tw`flex justify-between items-end mt-auto pt-2`};
`;

const CardDate = styled.div`
    ${tw`text-[13px] text-neutral-400 whitespace-nowrap font-medium`};
`;

const AddBtn = styled(Button)`
    ${tw`text-xs px-3.5 py-1.5 inline-flex items-center justify-center`};
`;

const RemoveBtn = styled(Button)`
    ${tw`text-xs px-3.5 py-1.5 inline-flex items-center justify-center bg-transparent border border-red-500 text-red-400 hover:bg-red-500/10`};
`;

const Pager = styled.div`
    ${tw`flex items-center justify-center gap-4 mt-4 pt-3.5 border-t border-neutral-700`};
`;

const PgBtn = styled(Button)`
    ${tw`text-xs px-4 py-1.5`};
`;

const PgInfo = styled.div`
    ${tw`text-xs text-neutral-400`};
    & > b {
        ${tw`text-neutral-200 font-semibold`};
    }
`;

// 提示条：并入"模组列表"头部行右侧，高度与标题文字一致（21px），橙色闪电框样式保留
const Warn = styled.div`
    ${tw`ml-auto px-2.5 leading-[21px] rounded-lg border text-xs whitespace-nowrap flex items-center gap-1.5`};
    background: rgba(255, 170, 0, 0.08);
    border-color: rgba(255, 170, 0, 0.35);
    color: hsl(40, 90%, 72%);
`;

// ===== 模组列表区（二级元素，与搜索框/搜索结果统一 20px 间距） =====
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
    ${tw`text-xs text-primary-400 rounded-md border border-primary-500/30 px-2 font-mono`};
    background: rgba(47, 129, 247, 0.1);
    line-height: 21px;
`;
const ModsListRow = styled.div`
    ${tw`flex items-stretch gap-2.5`};
`;
// 值框：始终满宽、高度随内容动态（无 min-height），内容换行时自动撑开
const ModsListValue = styled.div`
    ${tw`flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] leading-[1.25] break-all text-neutral-200`};
`;
const ModsPrefix = styled.span`
    ${tw`text-neutral-500`};
`;
const ClearBtn = styled(Button)`
    ${tw`flex-shrink-0 text-xs px-4 bg-transparent border border-neutral-600 text-neutral-400 hover:text-red-400 hover:border-red-500/60`};
`;

const Unsupported = styled.div`
    ${tw`mt-5 px-3 py-2 rounded-lg border text-xs leading-relaxed`};
    background: rgba(248, 81, 73, 0.08);
    border-color: rgba(248, 81, 73, 0.45);
    color: hsl(0, 80%, 72%);
`;

const fmtSubs = (n: number): string => {
    if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const fmtDate = (ts: number): string => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 描述里的长 URL 压缩为短文本（域名 + 截断路径），避免碎片折行 + 省略号插在 URL 中间
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

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('steammod');

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const variables = ServerContext.useStoreState((state) => state.server.data!.variables);

    const mode = resolveSteamModMode(variables);

    // MODS_LIST 初始值（serverValue 优先，回退 defaultValue）
    const initialIds = useMemo(() => {
        const varDef = variables.find((v) => v.envVariable === 'MODS_LIST');
        const raw = varDef?.serverValue || varDef?.defaultValue || '';
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }, [variables]);

    const [ids, setIds] = useState<string[]>(initialIds);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<SteamMod[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // 防抖 + 过期请求丢弃：seq 变化时旧结果作废
    const seqRef = useRef(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const idSet = useMemo(() => new Set(ids), [ids]);

    // 切换模式/挂载后：搜索框清空，拉第一页
    useEffect(() => {
        if (!mode) {
            return;
        }
        setQuery('');
        setPage(1);
        const seq = ++seqRef.current;
        setLoading(true);
        setError(null);
        searchSteamMods(mode, '', 1)
            .then((r) => {
                if (seq !== seqRef.current) return;
                setItems(r.items);
                setTotal(r.total);
                setPages(r.pages);
            })
            .catch((e) => {
                if (seq !== seqRef.current) return;
                console.error(e);
                setError(httpErrorToHuman(e));
            })
            .finally(() => {
                if (seq === seqRef.current) setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // 搜索输入：500ms 防抖
    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setQuery(q);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const seq = ++seqRef.current;
        setLoading(true);
        setError(null);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            searchSteamMods(mode!, q.trim(), 1)
                .then((r) => {
                    if (seq !== seqRef.current) return;
                    setItems(r.items);
                    setTotal(r.total);
                    setPages(r.pages);
                })
                .catch((e) => {
                    if (seq !== seqRef.current) return;
                    console.error(e);
                    setError(httpErrorToHuman(e));
                })
                .finally(() => {
                    if (seq === seqRef.current) setLoading(false);
                });
        }, DEBOUNCE_MS);
    };

    // 翻页
    const handlePage = (delta: number) => {
        const next = Math.min(Math.max(1, page + delta), Math.max(1, pages));
        if (next === page) return;
        setPage(next);
        const seq = ++seqRef.current;
        setLoading(true);
        setError(null);
        searchSteamMods(mode!, query.trim(), next)
            .then((r) => {
                if (seq !== seqRef.current) return;
                setItems(r.items);
                setTotal(r.total);
                setPages(r.pages);
            })
            .catch((e) => {
                if (seq !== seqRef.current) return;
                console.error(e);
                setError(httpErrorToHuman(e));
            })
            .finally(() => {
                if (seq === seqRef.current) setLoading(false);
            });
    };

    // 添加/移除并写回 MODS_LIST
    const toggleMod = async (id: string, add: boolean) => {
        if (saving) return;
        const next = add ? [...ids, id] : ids.filter((x) => x !== id);
        setIds(next); // 乐观更新
        setSaving(true);
        clearFlashes();
        try {
            await saveModsList(uuid, variables, next);
        } catch (e) {
            console.error(e);
            setIds(ids); // 失败回滚
            clearAndAddHttpError(e as Error);
        } finally {
            setSaving(false);
        }
    };

    // 清空 MODS_LIST（一键清除所有模组）
    const clearAll = async () => {
        if (saving) return;
        const next: string[] = [];
        setIds(next); // 乐观更新
        setSaving(true);
        clearFlashes();
        try {
            await saveModsList(uuid, variables, next);
        } catch (e) {
            console.error(e);
            setIds(ids); // 失败回滚
            clearAndAddHttpError(e as Error);
        } finally {
            setSaving(false);
        }
    };

    if (!mode) {
        return (
            <ServerContentBlock title={'模组安装'}>
                <Unsupported>当前服务器的 EGG 不支持模组安装（未侦测到帕鲁 / 饥荒模组能力）。</Unsupported>
            </ServerContentBlock>
        );
    }

    const meta = MODE_META[mode];

    return (
        <ServerContentBlock title={'模组安装'} showFlashKey={'steammod'}>
            <div css={tw`flex items-start mb-7`}>
                <div css={tw`flex items-center gap-3`}>
                    <div css={tw`w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-primary-50 flex-shrink-0`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        </svg>
                    </div>
                    <h1 css={tw`text-[30px] font-bold leading-tight`}>模组安装</h1>
                </div>
                <div css={tw`ml-auto flex flex-col items-end gap-1`}>
                    <div css={tw`text-xs text-neutral-400`}>
                        当前游戏：<b css={tw`text-neutral-100 font-semibold`}>{meta.name}</b>
                    </div>
                    <div css={tw`text-[11px] text-neutral-500`}>重启后由 {meta.installScript} 执行安装</div>
                </div>
            </div>

            <SearchPanel>
                <SearchField>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        value={query}
                        onChange={handleQueryChange}
                        placeholder="搜索创意工坊模组（支持标题 / id）..."
                        autoComplete="off"
                    />
                    {loading && (
                        <LoadingDots>
                            <span />
                            <span />
                            <span />
                        </LoadingDots>
                    )}
                </SearchField>
                <SearchStatus>
                    {loading ? (
                        '搜索中...'
                    ) : error ? (
                        <span css={tw`text-red-400`}>{error}</span>
                    ) : (
                        <>
                            共 <b>{total}</b> 个模组 · 第 <b>{page}</b> / {Math.max(1, pages)} 页
                        </>
                    )}
                </SearchStatus>
            </SearchPanel>

            {/* ===== 模组列表 + 提示（与 demo 定稿一致） ===== */}
            <ModsListPanel>
                <ModsListHead>
                    <ModsLabel>模组列表</ModsLabel>
                    <VarName>MODS_LIST</VarName>
                    <Warn>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                        <span>修改保存后，需重启服务器安装所有模组。</span>
                    </Warn>
                </ModsListHead>
                <ModsListRow>
                    <ModsListValue>
                        <ModsPrefix>当前内容：</ModsPrefix>
                        {ids.length ? ids.join(',') : <ModsPrefix>（空）</ModsPrefix>}
                    </ModsListValue>
                    <ClearBtn
                        size={'small'}
                        color={'grey'}
                        isSecondary
                        disabled={saving || ids.length === 0}
                        onClick={clearAll}
                    >
                        清空
                    </ClearBtn>
                </ModsListRow>
            </ModsListPanel>

            <GridTitle>
                搜索结果 <span className={'count'}>{total}</span>
            </GridTitle>

            {loading && items.length === 0 ? (
                <Spinner centered size={Spinner.Size.LARGE} />
            ) : error && items.length === 0 ? (
                <div css={tw`text-sm text-red-400`}>加载失败：{error}</div>
            ) : items.length === 0 ? (
                <div css={tw`text-sm text-neutral-400 text-center py-10`}>
                    {query.trim() ? '未找到匹配的模组（支持按标题或 id 搜索）' : '暂无数据'}
                </div>
            ) : (
                <Grid>
                    {items.map((m) => {
                        const added = idSet.has(m.id);
                        return (
                            <Card key={m.id}>
                                <CardHead>
                                    <Logo src={m.preview_url} alt={m.title} loading="lazy" />
                                    <HeadMain>
                                        <Name>{m.title}</Name>
                                    </HeadMain>
                                    <Corner>
                                        <BadgeSubs>⬇ {fmtSubs(m.subscriptions)}</BadgeSubs>
                                        {added && <BadgeAdded>已添加</BadgeAdded>}
                                    </Corner>
                                </CardHead>
                                <Desc>{fmtDesc(m.short_description)}</Desc>
                                <Actions>
                                    <CardDate>{fmtDate(m.time_updated)}</CardDate>
                                    {added ? (
                                        <RemoveBtn
                                            size={'small'}
                                            color={'grey'}
                                            isSecondary
                                            disabled={saving}
                                            onClick={() => toggleMod(m.id, false)}
                                        >
                                            － 移除
                                        </RemoveBtn>
                                    ) : (
                                        <AddBtn size={'small'} color={'primary'} disabled={saving} onClick={() => toggleMod(m.id, true)}>
                                            ＋ 添加
                                        </AddBtn>
                                    )}
                                </Actions>
                            </Card>
                        );
                    })}
                </Grid>
            )}

            {pages > 1 && (
                <Pager>
                    <PgBtn size={'small'} color={'grey'} isSecondary disabled={page <= 1} onClick={() => handlePage(-1)}>
                        ‹ 上一页
                    </PgBtn>
                    <PgInfo>
                        共 <b>{total}</b> 个模组 · 第 <b>{page}</b> / {pages} 页
                    </PgInfo>
                    <PgBtn size={'small'} color={'grey'} isSecondary disabled={page >= pages} onClick={() => handlePage(1)}>
                        下一页 ›
                    </PgBtn>
                </Pager>
            )}
        </ServerContentBlock>
    );
};
