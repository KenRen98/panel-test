import React, { useEffect, useMemo, useState } from 'react';
import { useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import Button from '@/components/elements/Button';
import Modal from '@/components/elements/Modal';
import { ServerContext } from '@/state/server';
import { getModpacks, installModpack, matchGuoChanPackId, Modpack } from '@/api/server/modpacks';
import { hasCapability } from '@/api/server/eggCapabilities';
import { useFlashKey } from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.25rem;
`;

const Card = styled.div`
    ${tw`flex flex-col bg-neutral-800 border border-neutral-700 rounded-xl p-[18px] pb-2 transition-colors duration-150 hover:border-primary-500`};
`;

const CardHead = styled.div`
    ${tw`flex items-center gap-3`};
`;

const Logo = styled.img`
    ${tw`w-14 h-14 rounded-lg object-cover bg-neutral-700 flex-shrink-0`};
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
    ${tw`bg-neutral-700 rounded-md px-2 py-0.5 text-neutral-400`};
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
    ${tw`mt-2 pt-1.5 border-t border-neutral-700 flex justify-between text-xs text-neutral-400`};
`;

const StepRow = styled.div`
    ${tw`flex items-center gap-2.5 text-sm text-neutral-300 py-2`};
    & > .num {
        ${tw`w-6 h-6 rounded-full flex items-center justify-center text-[13px] bg-neutral-700 border border-neutral-600 flex-shrink-0`};
    }
`;

const Warn = styled.div`
    ${tw`mt-5 px-3 py-2 rounded-lg border text-xs leading-relaxed`};
    background: rgba(255, 170, 0, 0.08);
    border-color: rgba(255, 170, 0, 0.35);
    color: hsl(40, 90%, 72%);
`;

const WarnLink = styled.a`
    ${tw`underline font-medium ml-1`};
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
            clearAndAddHttpError(e);
            setInstalling(false);
        }
    };

    if (!hasModpack) {
        return (
            <ServerContentBlock title={'国产模组包'}>
                <div css={tw`text-sm text-neutral-300`}>
                    当前服务器未使用全能 MC egg，无法使用一键安装功能。
                </div>
            </ServerContentBlock>
        );
    }

    if (error) {
        return (
            <ServerContentBlock title={'国产模组包'} showFlashKey={'modpack'}>
                <div css={tw`text-sm text-red-400`}>加载模组包列表失败：{error}</div>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'国产模组包'} showFlashKey={'modpack'}>
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
                    <h1 css={tw`text-[30px] font-bold leading-tight`}>国产模组包</h1>
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

            {!filtered ? (
                <Spinner centered size={Spinner.Size.LARGE} />
            ) : (
                <Grid>
                    {filtered.map((pack) => {
                        const installable = matchGuoChanPackId(variables, pack.id) !== null;
                        return (
                            <Card key={pack.id}>
                                <CardHead>
                                    <Logo src={pack.logo_url} alt={pack.name} />
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
                        <Warn>
                            警告: 将清空服务器全部数据且无法找回，请前往
                            <WarnLink href={`/server/${match.params.id}/backups`}>备份数据</WarnLink>
                            。
                        </Warn>
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
        </ServerContentBlock>
    );
};
