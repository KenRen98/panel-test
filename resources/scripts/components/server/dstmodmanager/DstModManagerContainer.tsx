import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Button from '@/components/elements/Button';
import { ServerContext } from '@/state/server';
import { getSteamModDetails, saveModsList, resolveSteamModMode, SteamMod } from '@/api/server/steamMods';
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

const Status = styled.div`
    ${tw`text-xs text-neutral-400 mt-2`};
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

const BadgeSubs = styled.span`
    ${tw`text-[10px] text-neutral-200 bg-neutral-700 rounded px-1.5 py-0.5 whitespace-nowrap`};
`;

// 未下载徽章（橙黄色，与"修改后，需重启服务器"提示同色系）
const BadgeUndownloaded = styled.span`
    ${tw`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap`};
    color: hsl(40, 90%, 72%);
    border: 1px solid rgba(255, 170, 0, 0.35);
    background: rgba(255, 170, 0, 0.08);
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

const fmtSubs = (n: number): string => {
    if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

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

    // 加载已安装模组详情（GetDetails 一次取全部）+ 服务器本地已下载集合（读 acf）
    const load = useCallback(
        (idList: string[]) => {
            if (!mode) return;
            setLoading(true);
            setError(null);
            Promise.all([getSteamModDetails(mode, idList), getInstalledModIds(uuid)])
                .then(([details, installedIds]) => {
                    setMods(details.map((m) => ({ ...m, downloaded: installedIds.has(m.id) })));
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

    // 移除 mod（同步 MODS_LIST；乐观更新，失败回滚）
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
        } catch (e) {
            console.error(e);
            setIds(ids); // 回滚
            clearAndAddHttpError(e as Error);
        } finally {
            setSaving(false);
        }
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
        } catch (e) {
            console.error(e);
            clearAndAddHttpError(e as Error);
        } finally {
            setSaving(false);
        }
    };

    if (!mode) {
        return (
            <ServerContentBlock title={'模组管理'}>
                <Unsupported>当前服务器的 EGG 不支持模组管理（未侦测到 dst_mod_manager 能力）。</Unsupported>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'模组管理'} showFlashKey={'dstmodmanager'}>
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
            <Status>{loading ? '正在获取模组信息…' : error ? error : null}</Status>

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
                    <ModsListValue>{ids.length ? ids.join(',') : '（空）'}</ModsListValue>
                    <ClearBtn onClick={clearAll} disabled={saving || ids.length === 0}>
                        清空
                    </ClearBtn>
                </ModsListRow>
            </ModsListPanel>

            <GridTitle>
                已安装模组 <span className="count">{filtered.length}</span>
            </GridTitle>

            {slice.length === 0 ? (
                <Empty>{query ? '没有匹配的模组' : '暂无已安装模组，请先在模组安装页添加'}</Empty>
            ) : (
                <Grid>
                    {slice.map((m) => (
                        <Card key={m.id}>
                            <CardHead>
                                {m.preview_url ? (
                                    <Logo src={m.preview_url} alt="" loading="lazy" />
                                ) : (
                                    <LogoFallback style={{ background: logoColor(m.id) }}>{logoText(m.title)}</LogoFallback>
                                )}
                                <HeadMain>
                                    <Name title={m.title}>{m.title || m.id}</Name>
                                </HeadMain>
                                <Corner>
                                    {m.downloaded === false ? (
                                        <BadgeUndownloaded>未下载</BadgeUndownloaded>
                                    ) : (
                                        <BadgeSubs>⬇ {fmtSubs(m.subscriptions)}</BadgeSubs>
                                    )}
                                </Corner>
                            </CardHead>
                            <Desc>{fmtDesc(m.short_description || '（无描述）')}</Desc>
                            <Actions>
                                <CardFoot>
                                    <ModId>{m.id}</ModId>
                                    <CardDate>{fmtDate(m.time_updated) ? `更新于 ${fmtDate(m.time_updated)}` : ''}</CardDate>
                                </CardFoot>
                                <RemoveBtn onClick={() => removeMod(m.id)} disabled={saving}>
                                    移除
                                </RemoveBtn>
                            </Actions>
                        </Card>
                    ))}
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
        </ServerContentBlock>
    );
};
