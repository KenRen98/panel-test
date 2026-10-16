import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import Button from '@/components/elements/Button';
import Modal from '@/components/elements/Modal';
import { ServerContext } from '@/state/server';
import {
    getModpacks,
    installModpack,
    installCoreVersion,
    getCoreVersions,
    getCoreBuilds,
    matchGuoChanPackId,
    CORE_SERVER_TYPES,
    Modpack,
} from '@/api/server/modpacks';
import { hasCapability } from '@/api/server/eggCapabilities';
import { useFlashKey } from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

const CORE_KEYS = Object.keys(CORE_SERVER_TYPES);

const CorePanel = styled.div`
    ${tw`mb-7 flex flex-col gap-3 rounded-xl border border-neutral-600 bg-neutral-700 p-4`};
`;

const CoreTitle = styled.h2`
    ${tw`text-base font-semibold text-neutral-100`};
`;

// 与 demo 对齐：三个下拉等宽撑满（field flex:1），按钮固定宽 148px 靠右；
// 移动端（<=640px）field 与按钮各占 100% 换行堆叠。
const CoreRow = styled.div`
    ${tw`flex items-end gap-3`};
    flex-wrap: nowrap;
    @media (max-width: 640px) {
        flex-wrap: wrap;
    }
`;

const CoreField = styled.div`
    ${tw`flex flex-col gap-1.5`};
    flex: 1 1 0;
    min-width: 0;
    @media (max-width: 640px) {
        flex: 1 1 100%;
    }
    & > label {
        ${tw`text-xs text-neutral-400`};
    }
    & > select {
        ${tw`w-full h-[38px] rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm text-neutral-100 outline-none focus:border-primary-500 transition-colors duration-150`};
    }
    & > select.rate-limited {
        border-color: hsl(0, 75%, 60%);
        color: hsl(0, 75%, 72%);
    }
`;

const CoreAction = styled.div`
    ${tw`flex items-end`};
    flex: 0 0 148px;
    & > button {
        ${tw`w-full`};
    }
    & > button.rate-limited {
        background: transparent;
        border-color: hsl(0, 75%, 60%);
        color: hsl(0, 75%, 72%);
    }
    @media (max-width: 640px) {
        flex: 1 1 100%;
    }
`;

// 核心快切模块与下方模组包卡片之间的分隔线（对齐 demo .divider）
const CoreDivider = styled.hr`
    ${tw`border-t border-neutral-700`};
    margin: 0 auto 24px;
`;

// 页面级容器查询：grid 列数断点基于内容区实际宽度（自动扣除侧边栏）
const PageContainer = styled.div`
    container-type: inline-size;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.25rem;
`;

const Card = styled.div`
    ${tw`flex flex-col bg-neutral-700 border border-neutral-600 rounded-xl p-[18px] pb-2 transition-colors duration-150 hover:border-primary-500`};
`;

const CardHead = styled.div`
    ${tw`flex items-center gap-3`};
`;

const Logo = styled.img`
    ${tw`w-14 h-14 rounded-lg object-cover bg-neutral-600 flex-shrink-0`};
`;

const HeadMain = styled.div`
    ${tw`min-w-0 flex-1 flex flex-col`};
`;

const HeadLeft = styled.div`
    ${tw`flex justify-between items-start gap-2`};
`;

const Name = styled.div`
    ${tw`font-semibold text-neutral-100 truncate`};
`;

const Core = styled.div`
    ${tw`flex flex-col items-end gap-0.5 text-[11px] text-neutral-400 leading-tight flex-shrink-0 pt-0.5`};
    & > span {
        ${tw`whitespace-nowrap`};
    }
`;

const Meta = styled.div`
    ${tw`flex justify-between items-center mt-2 text-xs w-full`};
`;

const Badge = styled.span`
    ${tw`bg-neutral-600 rounded-md px-2 py-0.5 text-neutral-400`};
`;

const Desc = styled.div`
    ${tw`mt-3 text-[13px] leading-relaxed text-neutral-400 line-clamp-3`};
`;

const Spec = styled.div`
    ${tw`mt-auto mb-3.5 flex items-center gap-2 text-[13px]`};
    & > .label {
        ${tw`w-[42px] flex-shrink-0 text-neutral-400 font-medium`};
    }
    & > .val {
        ${tw`font-medium text-neutral-100`};
    }
`;

const Actions = styled.div`
    ${tw`flex gap-2.5`};
`;

const ActionBtnWrap = styled.div`
    ${tw`flex-1`};
    & > button {
        ${tw`w-full`};
    }
`;

const ClientBtn = styled.a`
    ${tw`flex-1 inline-flex items-center justify-center py-2 rounded-lg text-sm font-medium text-neutral-100 bg-neutral-600 border border-neutral-500 transition-colors duration-150 hover:bg-neutral-500 cursor-pointer no-underline`};
`;

const Foot = styled.div`
    ${tw`mt-2 pt-1.5 border-t border-neutral-600 flex justify-between text-xs text-neutral-400`};
`;

const StepRow = styled.div`
    ${tw`flex items-center gap-2.5 text-sm text-neutral-300 py-2`};
    & > .num {
        ${tw`w-6 h-6 rounded-full flex items-center justify-center text-[13px] bg-neutral-600 border border-neutral-500 flex-shrink-0`};
    }
`;

const Warn = styled.div`
    ${tw`mt-5 px-3 py-2 rounded-lg border text-xs leading-relaxed`};
    background: rgba(255, 170, 0, 0.08);
    border-color: rgba(255, 170, 0, 0.35);
    color: hsl(40, 90%, 72%);
`;

const WarnLink = styled.a`
    ${tw`underline font-medium`};
    color: hsl(217, 91%, 72%);
    &:hover {
        color: hsl(217, 91%, 85%);
    }
`;

const coreLabel = (pack: Modpack): string => {
    if (!pack.core_type) return '';
    return pack.core_type.charAt(0).toUpperCase() + pack.core_type.slice(1);
};

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('modpack');

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const variables = ServerContext.useStoreState((state) => state.server.data!.variables);

    const [packs, setPacks] = useState<Modpack[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Modpack | null>(null);
    const [installing, setInstalling] = useState(false);
    const [query, setQuery] = useState('');

    const hasModpack = hasCapability(variables, 'modpack');

    useEffect(() => {
        // 非全能 MC egg 不请求模组包列表，避免无效 API 调用。
        if (!hasModpack) {
            return;
        }

        clearFlashes();

        getModpacks()
            .then((data) => setPacks(data.filter((p) => p.is_active)))
            .catch((e) => {
                console.error(e);
                setError(httpErrorToHuman(e));
            });
    }, [hasModpack]);

    // 按名称 + 描述实时筛选。
    const filtered = useMemo(() => {
        if (!packs) return null;
        const q = query.trim().toLowerCase();
        if (!q) return packs;
        return packs.filter((p) => {
            const text = `${p.name} ${p.description}`.toLowerCase();
            return text.includes(q);
        });
    }, [packs, query]);

    const handleInstall = async () => {
        if (!selected) {
            return;
        }

        setInstalling(true);
        clearFlashes();

        try {
            await installModpack(uuid, variables, selected);
            // 安装成功后直接跳转到控制台页面。
            window.location.href = `/server/${match.params.id}`;
        } catch (e) {
            console.error(e);
            clearAndAddHttpError(e as Error);
            setInstalling(false);
        }
    };

    // ---------- 核心快切模块 ----------
    // 设计：核心版本列表前端直连官方 API（无缓存文件、无 MC 对应表，24h localStorage 缓存）。
    // Paper/Forge 有一级+二级版本：核心版本=一级版本（API 列表），具体版本=builds（二级，直连拉取）
    // NeoForge/Fabric 无二级版本：核心版本=全部版本选择，具体版本=所选核心版本本身（唯一）
    const [core, setCore] = useState<string>('');
    const [coreVersions, setCoreVersions] = useState<string[]>([]);
    const [coreVersionsLoading, setCoreVersionsLoading] = useState(false);
    const [coreError, setCoreError] = useState<string | null>(null);
    const [coreRateLimited, setCoreRateLimited] = useState(false);
    const [coreVersion, setCoreVersion] = useState('');
    const [builds, setBuilds] = useState<string[]>([]);
    const [buildsLoading, setBuildsLoading] = useState(false);
    const [buildNumber, setBuildNumber] = useState('');
    const [coreSelected, setCoreSelected] = useState<{ core: string; coreVersion: string; build: string } | null>(null);
    const [coreInstalling, setCoreInstalling] = useState(false);

    // 记录当前生效的 core，用于丢弃切换核心后的过期 API 响应。
    const coreRef = useRef(core);
    useEffect(() => {
        coreRef.current = core;
    }, [core]);

    const showCoreError = (msg: string | null, rateLimited = false) => {
        setCoreError(msg);
        setCoreRateLimited(rateLimited);
    };

    // 拉取具体版本列表（Paper/Forge 有二级版本；NeoForge/Fabric 无二级版本，具体版本=所选核心版本本身）。
    const loadCoreBuilds = async (c: string, cv: string) => {
        if (!c || !cv) {
            return;
        }

        setBuilds([]);
        setBuildNumber('');
        setBuildsLoading(true);
        try {
            const data = await getCoreBuilds(c, cv);
            if (coreRef.current !== c) {
                return; // 已切换核心，丢弃过期结果
            }
            setBuilds(data);
            if (data.length > 0) {
                setBuildNumber(data[0]);
            }
        } catch (e) {
            if (coreRef.current !== c) {
                return;
            }
            console.error(e);
            const rateLimited = (e as Error & { rateLimited?: boolean }).rateLimited;
            showCoreError(
                rateLimited ? '官方 API 请求过于频繁，请稍后再试' : httpErrorToHuman(e),
                !!rateLimited
            );
        } finally {
            if (coreRef.current === c) {
                setBuildsLoading(false);
            }
        }
    };

    // 切换核心时实时拉取一级版本列表（官方 API，24h localStorage 缓存），并重置联动选择。
    useEffect(() => {
        setCoreVersions([]);
        setCoreVersion('');
        setBuilds([]);
        setBuildNumber('');
        showCoreError(null);

        if (!core) {
            return;
        }

        setCoreVersionsLoading(true);
        getCoreVersions(core)
            .then((data) => {
                if (coreRef.current !== core) {
                    return; // 已切换核心，丢弃过期结果
                }
                setCoreVersions(data);
                if (data.length > 0) {
                    const first = data[0];
                    setCoreVersion(first);
                    // 自动选中第一个核心版本后，立即拉取其具体版本列表。
                    return loadCoreBuilds(core, first);
                }
                return undefined;
            })
            .catch((e) => {
                if (coreRef.current !== core) {
                    return;
                }
                console.error(e);
                const rateLimited = (e as Error & { rateLimited?: boolean }).rateLimited;
                showCoreError(
                    rateLimited ? '官方 API 请求过于频繁，请稍后再试' : httpErrorToHuman(e),
                    !!rateLimited
                );
            })
            .finally(() => {
                if (coreRef.current === core) {
                    setCoreVersionsLoading(false);
                }
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core]);

    const handleCoreVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        setCoreVersion(v);
        loadCoreBuilds(core, v);
    };

    const handleCoreInstall = async () => {
        if (!coreSelected) {
            return;
        }

        setCoreInstalling(true);
        clearFlashes();

        try {
            await installCoreVersion(uuid, variables, coreSelected.core, coreSelected.coreVersion, coreSelected.build);
            // 安装成功后直接跳转到控制台页面。
            window.location.href = `/server/${match.params.id}`;
        } catch (e) {
            console.error(e);
            clearAndAddHttpError(e as Error);
            setCoreInstalling(false);
        }
    };

    if (!hasModpack) {
        return (
            <ServerContentBlock title={'一键安装'}>
                <div css={tw`text-sm text-neutral-300`}>
                    当前服务器未使用全能 MC egg，无法使用一键安装功能。
                </div>
            </ServerContentBlock>
        );
    }

    if (error) {
        return (
            <ServerContentBlock title={'一键安装'} showFlashKey={'modpack'}>
                <div css={tw`text-sm text-red-400`}>加载模组包列表失败：{error}</div>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'一键安装'} showFlashKey={'modpack'}>
            <PageContainer>
            <div css={tw`flex items-start mb-7`}>
                <div css={tw`flex items-center gap-3`}>
                    <div
                        css={tw`w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-primary-50 flex-shrink-0`}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                        </svg>
                    </div>
                    <h1 css={tw`text-[30px] font-bold leading-tight`}>一键安装</h1>
                </div>
                {filtered && (
                    <div css={tw`ml-auto flex flex-col items-start gap-1`}>
                        <div css={tw`relative`}>
                            <svg
                                css={tw`absolute left-2 top-0 bottom-0 my-auto w-3.5 h-3.5 text-neutral-400 pointer-events-none`}
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            >
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="搜索"
                                css={tw`w-[132px] py-[3px] pl-6 pr-2 rounded-md border border-neutral-600 bg-neutral-700 text-sm text-neutral-100 placeholder-neutral-400 outline-none focus:border-primary-500 transition-colors duration-150`}
                            />
                        </div>
                        <span css={tw`text-xs text-neutral-400 self-end`}>总数：{filtered.length}</span>
                    </div>
                )}
            </div>

            <CorePanel>
                <CoreTitle>核心快切</CoreTitle>
                <CoreRow>
                    <CoreField>
                        <label>核心选择</label>
                        <select value={core} onChange={(e) => setCore(e.target.value)}>
                            <option value="" disabled>
                                选择核心...
                            </option>
                            {CORE_KEYS.map((key) => (
                                <option key={key} value={key}>
                                    {CORE_SERVER_TYPES[key].split(' ')[0]}
                                </option>
                            ))}
                        </select>
                    </CoreField>
                    <CoreField>
                        <label>核心版本</label>
                        <select
                            className={coreRateLimited ? 'rate-limited' : undefined}
                            value={coreVersion}
                            onChange={handleCoreVersionChange}
                            disabled={!core || coreVersionsLoading || coreVersions.length === 0}
                        >
                            <option value="" disabled>
                                {coreVersionsLoading ? '加载中...' : coreVersions.length === 0 ? '无可选版本' : '选择核心版本...'}
                            </option>
                            {coreVersions.map((v) => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </CoreField>
                    <CoreField>
                        <label>具体版本</label>
                        <select
                            className={coreRateLimited ? 'rate-limited' : undefined}
                            value={buildNumber}
                            onChange={(e) => setBuildNumber(e.target.value)}
                            disabled={!coreVersion || buildsLoading || builds.length === 0}
                        >
                            <option value="" disabled>
                                {buildsLoading
                                    ? '加载中...'
                                    : builds.length === 0
                                    ? '无可选版本'
                                    : '选择具体版本...'}
                            </option>
                            {builds.map((b) => (
                                <option key={b} value={b}>
                                    {b}
                                </option>
                            ))}
                        </select>
                    </CoreField>
                    <CoreAction>
                        <Button
                            className={coreRateLimited ? 'rate-limited' : undefined}
                            size={'small'}
                            color={'primary'}
                            disabled={!core || !coreVersion || !buildNumber || buildsLoading || coreInstalling}
                            onClick={() =>
                                core && coreVersion && buildNumber && setCoreSelected({ core, coreVersion, build: buildNumber })
                            }
                        >
                            一键安装
                        </Button>
                    </CoreAction>
                </CoreRow>
                {coreError && (
                    <div css={tw`text-xs text-red-400`}>核心版本数据加载失败：{coreError}</div>
                )}
            </CorePanel>

            <CoreDivider />

            {!filtered ? (
                <Spinner centered size={Spinner.Size.LARGE} />
            ) : (
                <Grid>
                    {filtered.map((pack) => {
                        const installable = matchGuoChanPackId(variables, pack.id) !== null;
                        return (
                            <Card key={pack.id}>
                                <CardHead>
                                    <Logo src={pack.logo_url} alt={pack.name} loading="lazy" />
                                    <HeadMain>
                                        <HeadLeft>
                                            <Name>{pack.name}</Name>
                                            {pack.core_type && (
                                                <Core>
                                                    <span>{coreLabel(pack)}</span>
                                                    {pack.mc_version && <span>{pack.mc_version}</span>}
                                                </Core>
                                            )}
                                        </HeadLeft>
                                        <Meta>
                                            <Badge>v{pack.version}</Badge>
                                            <Badge>{pack.total_mods} Mods</Badge>
                                        </Meta>
                                    </HeadMain>
                                </CardHead>
                                <Desc>{pack.description}</Desc>
                                {pack.recommend_spec && (
                                    <Spec>
                                        <span className={'label'}>推荐:</span>
                                        <span className={'val'}>{pack.recommend_spec}</span>
                                    </Spec>
                                )}
                                <Actions>
                                    {pack.client_download_url ? (
                                        <ClientBtn href={pack.client_download_url} target="_blank" rel="noopener">
                                            客户端包
                                        </ClientBtn>
                                    ) : (
                                        <ClientBtn as="div" css={tw`cursor-not-allowed opacity-50`}>
                                            客户端包
                                        </ClientBtn>
                                    )}
                                    <ActionBtnWrap>
                                        <Button
                                            size={'small'}
                                            color={installable ? 'primary' : 'grey'}
                                            disabled={!installable}
                                            onClick={() => installable && setSelected(pack)}
                                        >
                                            {installable ? '一键安装' : '未登记'}
                                        </Button>
                                    </ActionBtnWrap>
                                </Actions>
                                <Foot>
                                    <span>☕ Java {pack.java_version}</span>
                                    <span>{pack.release_date}</span>
                                </Foot>
                            </Card>
                        );
                    })}
                </Grid>
            )}

            <Modal visible={!!selected} onDismissed={() => !installing && setSelected(null)} dismissable={!installing}>
                {selected && (
                    <>
                        <div css={tw`text-xl font-semibold leading-snug`}>
                            安装模组包<span css={tw`text-primary-400`}>《{selected.name}》</span>版本 {selected.version}
                        </div>
                        <div css={tw`mt-2`}>
                            <StepRow>
                                <span className={'num'}>1</span>
                                切换服务器类型为国产包
                            </StepRow>
                            <StepRow>
                                <span className={'num'}>2</span>
                                设置模组包为<span css={tw`text-primary-400`}>《{selected.name}》</span>
                            </StepRow>
                            <StepRow>
                                <span className={'num'}>3</span>
                                服务器重装并清空所有数据
                            </StepRow>
                        </div>
                        <Warn>{`警告: 将清空服务器全部数据且无法找回，前往`}<WarnLink href={`/server/${match.params.id}/backups`}>备份数据</WarnLink>{`。`}</Warn>
                        <div css={tw`mt-6 flex justify-end gap-3`}>
                            <Button color={'grey'} isSecondary disabled={installing} onClick={() => setSelected(null)}>
                                取消
                            </Button>
                            <Button color={'primary'} isLoading={installing} onClick={handleInstall}>
                                开始安装
                            </Button>
                        </div>
                    </>
                )}
            </Modal>

            <Modal
                visible={!!coreSelected}
                onDismissed={() => !coreInstalling && setCoreSelected(null)}
                dismissable={!coreInstalling}
            >
                {coreSelected && (
                    <>
                        <div css={tw`text-xl font-semibold leading-snug`}>{`安装 `}<span css={tw`text-primary-400`}>{CORE_SERVER_TYPES[coreSelected.core].split(' ')[0]}</span>{` 服务器端`}</div>
                        <div css={tw`mt-4 flex flex-col gap-2.5 text-[15px] text-neutral-300 leading-relaxed`}>
                            <div>
                                核心版本：<span css={tw`text-primary-400 font-medium`}>{coreSelected.coreVersion}</span>
                            </div>
                            <div>
                                具体版本：<span css={tw`text-primary-400 font-medium`}>{coreSelected.build}</span>
                            </div>
                        </div>
                        <Warn>{`警告：除world文件夹外将被永久删除，前往`}<WarnLink href={`/server/${match.params.id}/backups`}>备份数据</WarnLink>{`。`}</Warn>
                        <div css={tw`mt-6 flex justify-end gap-3`}>
                            <Button color={'grey'} isSecondary disabled={coreInstalling} onClick={() => setCoreSelected(null)}>
                                取消
                            </Button>
                            <Button color={'primary'} isLoading={coreInstalling} onClick={handleCoreInstall}>
                                开始安装
                            </Button>
                        </div>
                    </>
                )}
            </Modal>
            </PageContainer>
        </ServerContentBlock>
    );
};
